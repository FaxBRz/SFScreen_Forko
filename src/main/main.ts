import { app, BrowserWindow, desktopCapturer, ipcMain, session } from 'electron';
import path from 'node:path';
import { ipcChannels } from '../shared/ipc';
import { webrtcUdpPortRange, type SessionDescription } from '../shared/session/types';
import type { ScreenSource } from '../shared/screen-source';
import { SessionServer } from './tailscale/session-server';
import { TailscaleService } from './tailscale/tailscale-service';

let mainWindow: BrowserWindow | null = null;
const tailscale = new TailscaleService();
const sessionServer = new SessionServer();

const getScreenSources = async (): Promise<ScreenSource[]> => {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 320, height: 180 } });
  return sources.map((source) => ({ id: source.id, name: source.name, thumbnailDataUrl: source.thumbnail.toDataURL() }));
};

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
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  else void mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
};

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  ipcMain.handle(ipcChannels.listScreenSources, getScreenSources);
  ipcMain.handle(ipcChannels.getTailscaleStatus, () => tailscale.getStatus());
  ipcMain.handle(ipcChannels.hostSession, async (event, offer: SessionDescription) => {
    const status = await tailscale.getStatus();
    return sessionServer.host(offer, status, (answer) => event.sender.send(ipcChannels.sessionAnswer, answer));
  });
  ipcMain.handle(ipcChannels.findSession, async (_event, code: string) => sessionServer.find(code, await tailscale.getStatus()));
  ipcMain.handle(ipcChannels.submitAnswer, (_event, hostIp: string, code: string, answer: SessionDescription) => sessionServer.submitAnswer(hostIp, code, answer));
  ipcMain.handle(ipcChannels.stopHostedSession, () => sessionServer.stop());
  createWindow();
});

app.on('before-quit', () => { void sessionServer.stop(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
