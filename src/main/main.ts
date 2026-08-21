import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'node:path';
import { webrtcUdpPortRange } from '../shared/session/types';
import { ScreenCaptureService } from './capture/screen-capture-service';
import { DiagnosticsService } from './diagnostics-service';
import { registerSessionIpc } from './session-ipc';
import { SessionServer } from './tailscale/session-server';
import { TailscaleService } from './tailscale/tailscale-service';

let mainWindow: BrowserWindow | null = null;
const tailscale = new TailscaleService();
const sessionServer = new SessionServer(() => tailscale.getStatus(true));
const screenCapture = new ScreenCaptureService();
const diagnostics = new DiagnosticsService();

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
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    void screenCapture.handleDisplayRequest(request, callback, mainWindow?.webContents.mainFrame, mainWindow?.webContents.id);
  });
  registerSessionIpc({
    ipcMain,
    tailscale,
    sessionServer,
    screenCapture,
    diagnostics,
    isAuthorizedSender: (sender) => mainWindow !== null && !mainWindow.isDestroyed() && sender === mainWindow.webContents,
  });
  createWindow();
});

app.on('before-quit', () => { void sessionServer.stop(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
