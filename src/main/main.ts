import { app, autoUpdater, BrowserWindow, ipcMain, Menu, nativeImage, session, Tray } from 'electron';
import squirrelStartup from 'electron-squirrel-startup';
import fs from 'node:fs';
import path from 'node:path';
import {
  ipcChannels,
  type StartupSettings,
  type TrayAction,
  type TrayMicrophoneState,
  type TrayStateUpdate,
} from '../shared/ipc';
import { webrtcUdpPortRange } from '../shared/session/types';
import { DiscordAudioCaptureService } from './audio/discord-audio-capture-service';
import { ScreenCaptureService } from './capture/screen-capture-service';
import { DiagnosticsService } from './diagnostics-service';
import { registerRuntimeIpc } from './runtime-ipc';
import { registerSessionIpc } from './session-ipc';
import { SessionServer } from './tailscale/session-server';
import { TailscaleStunServer } from './tailscale/stun-server';
import { TailscaleService } from './tailscale/tailscale-service';
import { RemoteInputService } from './input/remote-input-service';
import { RoomConfigService } from './rooms/room-config-service';
import { startWindowsAutoUpdates } from './update/update-service';

const windowsAppUserModelId = 'com.squirrel.SFScreen.SFScreen';
if (process.platform === 'win32') app.setAppUserModelId(windowsAppUserModelId);

const ownsSingleInstanceLock = !squirrelStartup && app.requestSingleInstanceLock();
if (!ownsSingleInstanceLock) app.quit();

let mainWindow: BrowserWindow | null = null;
const tailscale = new TailscaleService();
let roomConfig: RoomConfigService | undefined;
const sessionServer = new SessionServer(() => tailscale.getStatus(true), {
  getRoom: () => roomConfig?.get() ?? Promise.resolve(undefined),
  verifyRoomPassword: (password) => roomConfig?.verifyPassword(password) ?? Promise.resolve(false),
});
const stunServer = new TailscaleStunServer(() => tailscale.getStatus());
const screenCapture = new ScreenCaptureService();
const diagnostics = new DiagnosticsService();
const audioCapture = new DiscordAudioCaptureService();
const remoteInput = new RemoteInputService();
let stopAutoUpdates = (): void => undefined;
let appTray: Tray | undefined;
let isShuttingDown = false;
let isQuitRequested = false;
let gracefulQuitTimer: NodeJS.Timeout | undefined;

const defaultTrayState: TrayStateUpdate = {
  microphone: 'inactive',
  inCall: false,
  inRoom: false,
};
let trayState: TrayStateUpdate = defaultTrayState;

const getAppIconPath = (): string => {
  const possiblePaths = [
    path.join(process.cwd(), 'assets', 'icon.ico'),
    path.join(process.cwd(), 'assets', 'icon.png'),
    path.join(__dirname, '..', '..', 'assets', 'icon.ico'),
    path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    path.join(app.getAppPath(), 'assets', 'icon.ico'),
    path.join(app.getAppPath(), 'assets', 'icon.png'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return '';
};

const unsupportedStartupSettings = (): StartupSettings => ({ supported: false, enabled: false, opensVisible: true });

/**
 * Electron/Squirrel starts from Update.exe so Windows always resolves the most
 * recently installed app-* directory. Development builds deliberately do not
 * touch the user's startup registry entry.
 */
const getSquirrelStartupOptions = (): Electron.LoginItemSettingsOptions => ({
  path: path.resolve(path.dirname(process.execPath), '..', 'Update.exe'),
  args: ['--processStart', `"${path.basename(process.execPath)}"`],
});

const canConfigureWindowsStartup = (): boolean => process.platform === 'win32' && app.isPackaged;

const getWindowsStartupSettings = (): StartupSettings => {
  if (!canConfigureWindowsStartup()) return unsupportedStartupSettings();
  try {
    return {
      supported: true,
      enabled: app.getLoginItemSettings(getSquirrelStartupOptions()).openAtLogin,
      opensVisible: true,
    };
  } catch {
    return unsupportedStartupSettings();
  }
};

const setWindowsStartup = (enabled: boolean): StartupSettings => {
  if (!canConfigureWindowsStartup()) return unsupportedStartupSettings();
  try {
    app.setLoginItemSettings({ ...getSquirrelStartupOptions(), openAtLogin: enabled });
    return getWindowsStartupSettings();
  } catch {
    return getWindowsStartupSettings();
  }
};

const createFallbackTrayImage = (): Electron.NativeImage => {
  const size = 32;
  const bitmap = Buffer.alloc(size * size * 4);
  for (let y = 4; y < 28; y += 1) {
    for (let x = 4; x < 28; x += 1) {
      const offset = (y * size + x) * 4;
      bitmap[offset] = 38;
      bitmap[offset + 1] = 163;
      bitmap[offset + 2] = 109;
      bitmap[offset + 3] = 255;
    }
  }
  return nativeImage.createFromBitmap(bitmap, { width: size, height: size, scaleFactor: 1 });
};

const createTrayIcon = (microphone: TrayMicrophoneState): Electron.NativeImage => {
  const iconPath = getAppIconPath();
  const source = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  const icon = source.isEmpty() ? createFallbackTrayImage() : source.resize({ width: 32, height: 32 });
  const { width, height } = icon.getSize();
  const bitmap = Buffer.from(icon.toBitmap());
  const color = microphone === 'active'
    ? [60, 196, 109]
    : microphone === 'muted'
      ? [225, 77, 77]
      : [126, 133, 145];
  const radius = Math.max(3, Math.round(Math.min(width, height) * 0.18));
  const centerX = width - radius - 2;
  const centerY = height - radius - 2;

  for (let y = Math.max(0, centerY - radius - 1); y <= Math.min(height - 1, centerY + radius + 1); y += 1) {
    for (let x = Math.max(0, centerX - radius - 1); x <= Math.min(width - 1, centerX + radius + 1); x += 1) {
      const distance = Math.hypot(x - centerX, y - centerY);
      if (distance > radius + 1) continue;
      const offset = (y * width + x) * 4;
      if (distance > radius) {
        bitmap[offset] = 255;
        bitmap[offset + 1] = 255;
        bitmap[offset + 2] = 255;
      } else {
        bitmap[offset] = color[2];
        bitmap[offset + 1] = color[1];
        bitmap[offset + 2] = color[0];
      }
      bitmap[offset + 3] = 255;
    }
  }

  return nativeImage.createFromBitmap(bitmap, { width, height, scaleFactor: 1 });
};

const microphoneStatusLabel = (microphone: TrayMicrophoneState): string => {
  if (microphone === 'active') return 'Microfone ativo';
  if (microphone === 'muted') return 'Microfone mutado';
  return 'Microfone desligado';
};

const trayTooltip = (state: TrayStateUpdate): string => {
  if (!state.inRoom) return `SFScreen · ${microphoneStatusLabel(state.microphone)}`;
  const roomLabel = state.roomName?.trim() || 'Sala privada';
  const roomCount = state.roomMemberCount ?? 1;
  const callCount = state.inCall ? (state.callMemberCount ?? 1) : 0;
  return `SFScreen · ${roomLabel} · Sala: ${roomCount}/4 · Chamada: ${callCount}/4 · ${microphoneStatusLabel(state.microphone)}`;
};

if (process.env.SFSCREEN_DISABLE_GPU === '1') app.disableHardwareAcceleration();

// The app signals only the Tailscale host candidate. Chromium otherwise hides it behind mDNS,
// preventing the allowlist below from identifying the Tailscale adapter at all.
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');

const shutdown = (): void => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  if (gracefulQuitTimer) {
    clearTimeout(gracefulQuitTimer);
    gracefulQuitTimer = undefined;
  }
  stopAutoUpdates();
  audioCapture.stop();
  appTray?.destroy();
  appTray = undefined;
  void Promise.all([sessionServer.stop(), stunServer.stop()]);
};

const createWindow = (): void => {
  const appIcon = getAppIconPath();

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 880,
    minHeight: 600,
    show: false,
    frame: false,
    icon: appIcon || undefined,
    titleBarStyle: 'hidden',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false },
  });


  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWebRTCIPHandlingPolicy('default');
  mainWindow.webContents.setWebRTCUDPPortRange(webrtcUdpPortRange);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  const createdWindow = mainWindow;
  const createdWebContentsId = createdWindow.webContents.id;

  createdWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
      createdWindow.webContents.toggleDevTools();
      return;
    }
    if (input.code === 'MetaLeft' || input.code === 'MetaRight' || input.key === 'Meta' || input.key === 'OS') {
      event.preventDefault();
      if (!createdWindow.isDestroyed()) {
        createdWindow.webContents.send(ipcChannels.winKeyPressed, input.type);
      }
    }
  });
  createdWindow.on('close', (event) => {
    if (isQuitRequested) return;
    event.preventDefault();
    createdWindow.hide();
  });
  createdWindow.on('closed', () => {
    audioCapture.stop();
    screenCapture.clearSource(createdWebContentsId);
    if (mainWindow === createdWindow) mainWindow = null;
  });

  const localIndexPath = path.join(__dirname, '../renderer/main_window/index.html');
  if (fs.existsSync(localIndexPath)) {
    void mainWindow.loadFile(localIndexPath);
  } else {
    const devServerUrl = typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined' ? MAIN_WINDOW_VITE_DEV_SERVER_URL : 'http://localhost:5173';
    void mainWindow.loadURL(devServerUrl);
  }
};

const showMainWindow = (): void => {
  if (!app.isReady()) {
    void app.whenReady().then(showMainWindow);
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
};

const sendTrayAction = (action: Exclude<TrayAction, 'quit'>): void => {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send(ipcChannels.trayAction, action);
};

const finishGracefulShutdown = (): void => {
  if (!isQuitRequested) return;
  if (gracefulQuitTimer) {
    clearTimeout(gracefulQuitTimer);
    gracefulQuitTimer = undefined;
  }
  app.quit();
};

const requestGracefulQuit = (): void => {
  if (isQuitRequested) return;
  isQuitRequested = true;
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    app.quit();
    return;
  }
  mainWindow.webContents.send(ipcChannels.gracefulShutdownRequested);
  gracefulQuitTimer = setTimeout(finishGracefulShutdown, 1_500);
  gracefulQuitTimer.unref();
};

const refreshTray = (): void => {
  if (!appTray) return;
  appTray.setImage(createTrayIcon(trayState.microphone));
  appTray.setToolTip(trayTooltip(trayState));
  const menu: Electron.MenuItemConstructorOptions[] = [
    { label: 'Abrir SFScreen', click: showMainWindow },
    { type: 'separator' },
    { label: microphoneStatusLabel(trayState.microphone), enabled: false },
  ];
  if (trayState.inCall) menu.push({ label: 'Sair da chamada', click: () => sendTrayAction('leave-call') });
  if (trayState.inRoom) menu.push({ label: 'Sair da sala', click: () => sendTrayAction('leave-room') });
  menu.push(
    { type: 'separator' },
    { label: 'Encerrar SFScreen', click: requestGracefulQuit },
  );
  appTray.setContextMenu(Menu.buildFromTemplate(menu));
};

const setTrayState = (state: TrayStateUpdate): void => {
  trayState = {
    ...state,
    roomName: state.roomName?.trim() || undefined,
  };
  refreshTray();
};

const createTray = (): void => {
  if (process.platform !== 'win32') return;
  appTray = new Tray(createTrayIcon(trayState.microphone));
  appTray.on('click', showMainWindow);
  appTray.on('double-click', showMainWindow);
  refreshTray();
};

if (ownsSingleInstanceLock) void app.whenReady().then(() => {
  roomConfig = new RoomConfigService(path.join(app.getPath('userData'), 'rooms'));
  const isAuthorizedWebContents = (webContents: Electron.WebContents | null): boolean => mainWindow !== null
    && !mainWindow.isDestroyed()
    && webContents === mainWindow.webContents;

  const canRequestDisplayCapture = (webContents: Electron.WebContents | null): boolean => webContents !== null
    && isAuthorizedWebContents(webContents)
    && screenCapture.hasSelection(webContents.id);

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'speaker-selection') {
      callback(isAuthorizedWebContents(webContents));
      return;
    }
    if ((permission as string) === 'display-capture') {
      callback(canRequestDisplayCapture(webContents));
      return;
    }
    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media' || (permission as string) === 'speaker-selection') {
      return isAuthorizedWebContents(webContents);
    }
    if ((permission as string) === 'display-capture') {
      return canRequestDisplayCapture(webContents);
    }
    return false;
  });
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    void screenCapture.handleDisplayRequest(request, callback, mainWindow?.webContents.mainFrame, mainWindow?.webContents.id).catch(() => undefined);
  });
  const isAuthorizedSender = (sender: Electron.WebContents): boolean => mainWindow !== null && !mainWindow.isDestroyed() && sender === mainWindow.webContents;
  registerSessionIpc({
    ipcMain,
    tailscale,
    sessionServer,
    stunServer,
    screenCapture,
    diagnostics,
    roomConfig,
    isAuthorizedSender,
  });
  registerRuntimeIpc({
    ipcMain,
    audioCapture,
    remoteInput,
    isAuthorizedSender,
    getAppVersion: () => app.getVersion(),
    getStartupSettings: getWindowsStartupSettings,
    setWindowsStartup,
    setTrayState,
    completeGracefulShutdown: finishGracefulShutdown,
  });
  createTray();
  createWindow();
  stopAutoUpdates = startWindowsAutoUpdates(() => mainWindow);
});

app.on('second-instance', () => {
  showMainWindow();
});

app.on('activate', showMainWindow);
app.on('before-quit', () => {
  isQuitRequested = true;
  shutdown();
});
autoUpdater.on('before-quit-for-update', () => {
  isQuitRequested = true;
  shutdown();
});
// Closing the last BrowserWindow must not terminate an active room: the tray is
// the process lifetime owner on Windows.
app.on('window-all-closed', () => undefined);
