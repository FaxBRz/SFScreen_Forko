import { contextBridge, ipcRenderer } from 'electron';
import { ipcChannels } from '../shared/ipc';
import type { SFScreenApi, ScreenSource } from '../shared/screen-source';

const api: SFScreenApi = {
  listScreenSources: (): Promise<ScreenSource[]> => ipcRenderer.invoke(ipcChannels.listScreenSources),
  exportSignalFile: (kind, contents): Promise<boolean> => ipcRenderer.invoke(ipcChannels.exportSignalFile, kind, contents),
  importSignalFile: (): Promise<string | null> => ipcRenderer.invoke(ipcChannels.importSignalFile),
};

contextBridge.exposeInMainWorld('sfscreen', api);
