import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'node:path';
import { webrtcUdpPortRange } from '../shared/session/types';
import { ScreenCaptureService } from './capture/screen-capture-service';
import { DiagnosticsService } from './diagnostics-service';
import { registerSessionIpc } from './session-ipc';
import { SessionServer } from './tailscale/session-server';
import { TailscaleStunServer } from './tailscale/stun-server';
import { TailscaleService } from './tailscale/tailscale-service';

let mainWindow: BrowserWindow | null = null;
const tailscale = new TailscaleService();
const sessionServer = new SessionServer(() => tailscale.getStatus(true));
const stunServer = new TailscaleStunServer(() => tailscale.getStatus());
const screenCapture = new ScreenCaptureService();
const diagnostics = new DiagnosticsService();

// The app signals only the Tailscale host candidate. Chromium otherwise hides it behind mDNS,
// preventing the allowlist below from identifying the Tailscale adapter at all.
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 880,
    minHeight: 600,
    show: false,
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
  createdWindow.on('closed', () => {
    screenCapture.clearSource(createdWebContentsId);
    if (mainWindow === createdWindow) mainWindow = null;
  });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  else void mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
};

app.whenReady().then(() => {
  const canRequestDisplayCapture = (webContents: Electron.WebContents | null): boolean => mainWindow !== null
    && !mainWindow.isDestroyed()
    && webContents === mainWindow.webContents
    && screenCapture.hasSelection(webContents.id);
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback((permission === 'display-capture' || permission === 'media') && canRequestDisplayCapture(webContents));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => permission === 'media' && canRequestDisplayCapture(webContents));
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    void screenCapture.handleDisplayRequest(request, callback, mainWindow?.webContents.mainFrame, mainWindow?.webContents.id).catch(() => undefined);
  });
  registerSessionIpc({
    ipcMain,
    tailscale,
    sessionServer,
    stunServer,
    screenCapture,
    diagnostics,
    isAuthorizedSender: (sender) => mainWindow !== null && !mainWindow.isDestroyed() && sender === mainWindow.webContents,
  });
  createWindow();
});

app.on('before-quit', () => { void Promise.all([sessionServer.stop(), stunServer.stop()]); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
