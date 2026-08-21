import { BrowserWindow, type IpcMain, type WebContents } from 'electron';
import { ipcChannels } from '../shared/ipc';
import { failure, toSessionResult } from '../shared/session/errors';
import { DiscordAudioCaptureService } from './audio/discord-audio-capture-service';

interface RuntimeIpcDependencies {
  ipcMain: IpcMain;
  audioCapture: DiscordAudioCaptureService;
  isAuthorizedSender: (sender: WebContents) => boolean;
}

export const registerRuntimeIpc = ({ ipcMain, audioCapture, isAuthorizedSender }: RuntimeIpcDependencies): void => {
  const authorized = (sender: WebContents): boolean => !sender.isDestroyed() && isAuthorizedSender(sender);

  ipcMain.handle(ipcChannels.toggleFullscreen, (event): boolean => {
    if (!authorized(event.sender)) return false;
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) return false;
    window.setFullScreen(!window.isFullScreen());
    return window.isFullScreen();
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
};
