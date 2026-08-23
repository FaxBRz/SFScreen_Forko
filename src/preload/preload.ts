import { contextBridge, ipcRenderer } from 'electron';
import { ipcChannels } from '../shared/ipc';
import type { SFScreenApi } from '../shared/session/types';

const api: SFScreenApi = {
  getTailscaleStatus: () => ipcRenderer.invoke(ipcChannels.getTailscaleStatus),
  listScreenSources: () => ipcRenderer.invoke(ipcChannels.listScreenSources),
  selectScreenSource: (selection) => ipcRenderer.invoke(ipcChannels.selectScreenSource, selection),
  clearScreenSource: () => ipcRenderer.invoke(ipcChannels.clearScreenSource),
  getCaptureAuthorizationState: () => ipcRenderer.invoke(ipcChannels.getCaptureAuthorizationState),
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
  toggleFullscreen: () => ipcRenderer.invoke(ipcChannels.toggleFullscreen),
  setFullscreen: (flag) => ipcRenderer.invoke(ipcChannels.setFullscreen, flag),
  onWinKeyPressed: (listener) => {
    const callback = (_event: Electron.IpcRendererEvent, action: 'keyDown' | 'keyUp'): void => listener(action);
    ipcRenderer.on(ipcChannels.winKeyPressed, callback);
    return () => ipcRenderer.removeListener(ipcChannels.winKeyPressed, callback);
  },
  minimizeWindow: () => ipcRenderer.invoke(ipcChannels.minimizeWindow),
  maximizeWindow: () => ipcRenderer.invoke(ipcChannels.maximizeWindow),
  closeWindow: () => ipcRenderer.invoke(ipcChannels.closeWindow),
  startFilteredSystemAudio: () => ipcRenderer.invoke(ipcChannels.startFilteredSystemAudio),

  stopFilteredSystemAudio: (captureId) => ipcRenderer.invoke(ipcChannels.stopFilteredSystemAudio, captureId),
  onFilteredAudioChunk: (listener) => {
    const callback = (_event: Electron.IpcRendererEvent, chunk: Uint8Array): void => {
      const copy = Uint8Array.from(chunk);
      listener(copy.buffer);
    };
    ipcRenderer.on(ipcChannels.filteredAudioChunk, callback);
    return () => ipcRenderer.removeListener(ipcChannels.filteredAudioChunk, callback);
  },
  setRemoteControlHostConfig: (config) => ipcRenderer.invoke(ipcChannels.setRemoteControlHostConfig, config),
  executeRemoteInput: (input, sourceId) => ipcRenderer.invoke(ipcChannels.executeRemoteInput, input, sourceId),
  resumeRemoteControlOverride: () => ipcRenderer.invoke(ipcChannels.resumeRemoteControlOverride),
  onRemoteControlStatusChanged: (listener) => {
    const callback = (_event: Electron.IpcRendererEvent, status: Parameters<typeof listener>[0]): void => listener(status);
    ipcRenderer.on(ipcChannels.remoteControlStatusChanged, callback);
    return () => ipcRenderer.removeListener(ipcChannels.remoteControlStatusChanged, callback);
  },
};

contextBridge.exposeInMainWorld('sfscreen', api);
