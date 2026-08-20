import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, session } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ipcChannels } from '../shared/ipc';
import type { ScreenSource } from '../shared/screen-source';

let mainWindow: BrowserWindow | null = null;

const getScreenSources = async (): Promise<ScreenSource[]> => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 320, height: 180 },
  });

  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    thumbnailDataUrl: source.thumbnail.toDataURL(),
  }));
};

const exportSignalFile = async (_event: Electron.IpcMainInvokeEvent, kind: 'invite' | 'answer', contents: string): Promise<boolean> => {
  if ((kind !== 'invite' && kind !== 'answer') || typeof contents !== 'string' || Buffer.byteLength(contents, 'utf8') > 256 * 1024) {
    throw new Error('Pedido de exportação inválido.');
  }

  const result = await dialog.showSaveDialog(mainWindow!, {
    title: kind === 'invite' ? 'Salvar convite SFScreen' : 'Salvar resposta SFScreen',
    defaultPath: kind === 'invite' ? 'convite.sfsinvite' : 'resposta.sfsanswer',
    filters: [{ name: 'Sinalização SFScreen', extensions: [kind === 'invite' ? 'sfsinvite' : 'sfsanswer'] }],
  });
  if (result.canceled || !result.filePath) return false;
  await writeFile(result.filePath, contents, { encoding: 'utf8', mode: 0o600 });
  return true;
};

const importSignalFile = async (): Promise<string | null> => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Importar convite ou resposta SFScreen',
    properties: ['openFile'],
    filters: [{ name: 'Sinalização SFScreen', extensions: ['sfsinvite', 'sfsanswer'] }],
  });
  if (result.canceled || result.filePaths.length !== 1) return null;
  const contents = await readFile(result.filePaths[0]!, 'utf8');
  if (Buffer.byteLength(contents, 'utf8') > 256 * 1024) throw new Error('O arquivo excede o tamanho máximo permitido.');
  return contents;
};

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 880,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  ipcMain.handle(ipcChannels.listScreenSources, getScreenSources);
  ipcMain.handle(ipcChannels.exportSignalFile, exportSignalFile);
  ipcMain.handle(ipcChannels.importSignalFile, importSignalFile);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
