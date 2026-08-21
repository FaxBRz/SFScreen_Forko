import { contextBridge, ipcRenderer } from 'electron';
import { ipcChannels } from '../shared/ipc';
import type { SFScreenApi } from '../shared/session/types';

const api: SFScreenApi = {
  getTailscaleStatus: () => ipcRenderer.invoke(ipcChannels.getTailscaleStatus),
  listScreenSources: () => ipcRenderer.invoke(ipcChannels.listScreenSources),
  selectScreenSource: (selection) => ipcRenderer.invoke(ipcChannels.selectScreenSource, selection),
  clearScreenSource: () => ipcRenderer.invoke(ipcChannels.clearScreenSource),
  exportDiagnostics: (report) => ipcRenderer.invoke(ipcChannels.exportDiagnostics, report),
  hostSession: (offer) => ipcRenderer.invoke(ipcChannels.hostSession, offer),
  findSession: (code) => ipcRenderer.invoke(ipcChannels.findSession, code),
  submitAnswer: (hostIp, code, answer) => ipcRenderer.invoke(ipcChannels.submitAnswer, hostIp, code, answer),
  stopHostedSession: () => ipcRenderer.invoke(ipcChannels.stopHostedSession),
  onSessionAnswer: (listener) => {
    const callback = (_event: Electron.IpcRendererEvent, event: Parameters<typeof listener>[0]): void => listener(event);
    ipcRenderer.on(ipcChannels.sessionAnswer, callback);
    return () => ipcRenderer.removeListener(ipcChannels.sessionAnswer, callback);
  },
};

contextBridge.exposeInMainWorld('sfscreen', api);
