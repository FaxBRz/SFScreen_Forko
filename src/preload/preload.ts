import { contextBridge, ipcRenderer } from 'electron';
import { ipcChannels, type RuntimeWindowApi } from '../shared/ipc';
import type { SFScreenApi } from '../shared/session/types';

const api: SFScreenApi & RuntimeWindowApi = {
  getTailscaleStatus: () => ipcRenderer.invoke(ipcChannels.getTailscaleStatus),
  listScreenSources: () => ipcRenderer.invoke(ipcChannels.listScreenSources),
  selectScreenSource: (selection) => ipcRenderer.invoke(ipcChannels.selectScreenSource, selection),
  clearScreenSource: () => ipcRenderer.invoke(ipcChannels.clearScreenSource),
  getCaptureAuthorizationState: () => ipcRenderer.invoke(ipcChannels.getCaptureAuthorizationState),
  exportDiagnostics: (report) => ipcRenderer.invoke(ipcChannels.exportDiagnostics, report),
  hostSession: (offer) => ipcRenderer.invoke(ipcChannels.hostSession, offer),
  hostRoomSession: (offer) => ipcRenderer.invoke(ipcChannels.hostRoomSession, offer),
  discoverRooms: () => ipcRenderer.invoke(ipcChannels.discoverRooms),
  findRoom: (roomId, password) => ipcRenderer.invoke(ipcChannels.findRoom, roomId, password),
  findRoomByCode: (code, password) => ipcRenderer.invoke(ipcChannels.findRoomByCode, code, password),
  submitRoomAnswer: (hostIp, roomId, password, answer, inviteCode) => ipcRenderer.invoke(ipcChannels.submitRoomAnswer, hostIp, roomId, password, answer, inviteCode),
  hostMeshRoomSession: (offer, host) => ipcRenderer.invoke(ipcChannels.hostMeshRoomSession, offer, host),
  joinRoomMesh: (hostIp, request) => ipcRenderer.invoke(ipcChannels.joinRoomMesh, hostIp, request),
  pollRoomMesh: (hostIp, auth, afterSequence) => ipcRenderer.invoke(ipcChannels.pollRoomMesh, hostIp, auth, afterSequence),
  sendRoomMeshSignal: (hostIp, auth, signal) => ipcRenderer.invoke(ipcChannels.sendRoomMeshSignal, hostIp, auth, signal),
  leaveRoomMesh: (hostIp, auth) => ipcRenderer.invoke(ipcChannels.leaveRoomMesh, hostIp, auth),
  sendHostedRoomMeshSignal: (signal) => ipcRenderer.invoke(ipcChannels.sendHostedRoomMeshSignal, signal),
  onRoomMeshEvent: (listener) => {
    const callback = (_event: Electron.IpcRendererEvent, event: Parameters<typeof listener>[0]): void => listener(event);
    ipcRenderer.on(ipcChannels.roomMeshEvent, callback);
    return () => ipcRenderer.removeListener(ipcChannels.roomMeshEvent, callback);
  },
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
  getAppVersion: () => ipcRenderer.invoke(ipcChannels.getAppVersion),
  getStartupSettings: () => ipcRenderer.invoke(ipcChannels.getStartupSettings),
  setWindowsStartup: (enabled) => ipcRenderer.invoke(ipcChannels.setWindowsStartup, enabled),
  setTrayState: (state) => ipcRenderer.invoke(ipcChannels.setTrayState, state),
  onTrayAction: (listener) => {
    const callback = (_event: Electron.IpcRendererEvent, action: Parameters<typeof listener>[0]): void => listener(action);
    ipcRenderer.on(ipcChannels.trayAction, callback);
    return () => ipcRenderer.removeListener(ipcChannels.trayAction, callback);
  },
  onGracefulShutdownRequested: (listener) => {
    const callback = (): void => listener();
    ipcRenderer.on(ipcChannels.gracefulShutdownRequested, callback);
    return () => ipcRenderer.removeListener(ipcChannels.gracefulShutdownRequested, callback);
  },
  completeGracefulShutdown: () => ipcRenderer.invoke(ipcChannels.completeGracefulShutdown),
  startFilteredSystemAudio: (excludedExecutables) => ipcRenderer.invoke(ipcChannels.startFilteredSystemAudio, excludedExecutables),

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
  setRemoteInputLock: (enabled) => ipcRenderer.invoke(ipcChannels.setRemoteInputLock, enabled),
  onCapturedRemoteInput: (listener) => {
    const callback = (_event: Electron.IpcRendererEvent, input: Parameters<typeof listener>[0]): void => listener(input);
    ipcRenderer.on(ipcChannels.capturedRemoteInput, callback);
    return () => ipcRenderer.removeListener(ipcChannels.capturedRemoteInput, callback);
  },
  listAudioApplications: () => ipcRenderer.invoke(ipcChannels.listAudioApplications),
  getLocalRoom: () => ipcRenderer.invoke(ipcChannels.getLocalRoom),
  createLocalRoom: (name, password) => ipcRenderer.invoke(ipcChannels.createLocalRoom, name, password),
  updateLocalRoomPassword: (password) => ipcRenderer.invoke(ipcChannels.updateLocalRoomPassword, password),
  removeLocalRoomPassword: () => ipcRenderer.invoke(ipcChannels.removeLocalRoomPassword),
  deleteLocalRoom: () => ipcRenderer.invoke(ipcChannels.deleteLocalRoom),
  onRemoteInputLockReleased: (listener) => {
    const callback = (): void => listener();
    ipcRenderer.on(ipcChannels.remoteInputLockReleased, callback);
    return () => ipcRenderer.removeListener(ipcChannels.remoteInputLockReleased, callback);
  },
  executeRemoteInput: (input, sourceId) => ipcRenderer.invoke(ipcChannels.executeRemoteInput, input, sourceId),
  resumeRemoteControlOverride: () => ipcRenderer.invoke(ipcChannels.resumeRemoteControlOverride),
  onRemoteControlStatusChanged: (listener) => {
    const callback = (_event: Electron.IpcRendererEvent, status: Parameters<typeof listener>[0]): void => listener(status);
    ipcRenderer.on(ipcChannels.remoteControlStatusChanged, callback);
    return () => ipcRenderer.removeListener(ipcChannels.remoteControlStatusChanged, callback);
  },
};

contextBridge.exposeInMainWorld('sfscreen', api);
