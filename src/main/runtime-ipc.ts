import { BrowserWindow, type IpcMain, type WebContents } from 'electron';
import { ipcChannels } from '../shared/ipc';
import { failure, toSessionResult } from '../shared/session/errors';
import { DiscordAudioCaptureService } from './audio/discord-audio-capture-service';
import type { RemoteInputService } from './input/remote-input-service';
import type { RemoteControlConfig, RemoteInputPayload } from '../shared/session/media-control';

interface RuntimeIpcDependencies {
  ipcMain: IpcMain;
  audioCapture: DiscordAudioCaptureService;
  remoteInput: RemoteInputService;
  isAuthorizedSender: (sender: WebContents) => boolean;
}

export const registerRuntimeIpc = ({ ipcMain, audioCapture, remoteInput, isAuthorizedSender }: RuntimeIpcDependencies): void => {
  const authorized = (sender: WebContents): boolean => !sender.isDestroyed() && isAuthorizedSender(sender);

  ipcMain.handle(ipcChannels.toggleFullscreen, (event): boolean => {
    if (!authorized(event.sender)) return false;
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) return false;
    window.setFullScreen(!window.isFullScreen());
    return window.isFullScreen();
  });

  ipcMain.handle(ipcChannels.minimizeWindow, (event): void => {
    if (!authorized(event.sender)) return;
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) return;
    window.minimize();
  });

  ipcMain.handle(ipcChannels.maximizeWindow, (event): boolean => {
    if (!authorized(event.sender)) return false;
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) return false;
    if (window.isMaximized()) {
      window.unmaximize();
      return false;
    }
    window.maximize();
    return true;
  });

  ipcMain.handle(ipcChannels.closeWindow, (event): void => {
    if (!authorized(event.sender)) return;
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) return;
    window.close();
  });

  ipcMain.handle(ipcChannels.startFilteredSystemAudio, (event) => {
    if (!authorized(event.sender)) return failure('invalid-request', 'A origem desta solicitação não é autorizada.');
    return toSessionResult(() => audioCapture.start((chunk) => {
      if (!event.sender.isDestroyed()) event.sender.send(ipcChannels.filteredAudioChunk, chunk);
    }));
  });

  ipcMain.handle(ipcChannels.stopFilteredSystemAudio, (event, captureId: unknown) => {
    if (!authorized(event.sender)) return failure('invalid-request', 'A origem desta solicitação não é autorizada.');
    if (captureId !== undefined && typeof captureId !== 'string') return failure('invalid-request', 'O identificador da captura de áudio é inválido.');
    return toSessionResult(async () => {
      audioCapture.stop(captureId);
      return undefined;
    });
  });

  ipcMain.handle(ipcChannels.setRemoteControlHostConfig, (event, config: unknown) => {
    if (!authorized(event.sender)) return failure('invalid-request', 'A origem desta solicitação não é autorizada.');
    return toSessionResult(async () => {
      remoteInput.setConfig(config as RemoteControlConfig);
      return undefined;
    });
  });

  ipcMain.handle(ipcChannels.executeRemoteInput, (event, input: unknown, sourceId: unknown) => {
    if (!authorized(event.sender)) return failure('invalid-request', 'A origem desta solicitação não é autorizada.');
    return toSessionResult(async () => {
      return remoteInput.executeInput(input as RemoteInputPayload, typeof sourceId === 'string' ? sourceId : undefined);
    });
  });

  ipcMain.handle(ipcChannels.resumeRemoteControlOverride, (event) => {
    if (!authorized(event.sender)) return failure('invalid-request', 'A origem desta solicitação não é autorizada.');
    return toSessionResult(async () => {
      remoteInput.resumeHostOverride();
      return undefined;
    });
  });

  remoteInput.onStatus((status) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(ipcChannels.remoteControlStatusChanged, status);
      }
    });
  });
};
