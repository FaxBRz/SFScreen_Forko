import { app, BrowserWindow, ipcMain, session } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { ipcChannels } from '../shared/ipc';
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

let mainWindow: BrowserWindow | null = null;
const tailscale = new TailscaleService();
const sessionServer = new SessionServer(() => tailscale.getStatus(true));
const stunServer = new TailscaleStunServer(() => tailscale.getStatus());
const screenCapture = new ScreenCaptureService();
const diagnostics = new DiagnosticsService();
const audioCapture = new DiscordAudioCaptureService();
const remoteInput = new RemoteInputService();

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

if (process.env.SFSCREEN_DISABLE_GPU === '1') app.disableHardwareAcceleration();

// The app signals only the Tailscale host candidate. Chromium otherwise hides it behind mDNS,
// preventing the allowlist below from identifying the Tailscale adapter at all.
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');

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

app.whenReady().then(() => {
  const isAuthorizedWebContents = (webContents: Electron.WebContents | null): boolean => mainWindow !== null
    && !mainWindow.isDestroyed()
    && webContents === mainWindow.webContents;

  const canRequestDisplayCapture = (webContents: Electron.WebContents | null): boolean => isAuthorizedWebContents(webContents)
    && screenCapture.hasSelection(webContents.id);

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(isAuthorizedWebContents(webContents));
      return;
    }
    if (permission === 'display-capture') {
      callback(canRequestDisplayCapture(webContents));
      return;
    }
    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media') {
      return isAuthorizedWebContents(webContents);
    }
    if (permission === 'display-capture') {
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
    roomConfig: new RoomConfigService(path.join(app.getPath('userData'), 'rooms')),
    isAuthorizedSender,
  });
  registerRuntimeIpc({ ipcMain, audioCapture, remoteInput, isAuthorizedSender });
  createWindow();
});

app.on('before-quit', () => {
  audioCapture.stop();
  void Promise.all([sessionServer.stop(), stunServer.stop()]);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
