import { BrowserWindow, type IpcMain, type WebContents } from 'electron';
import { ipcChannels, isTrayStateUpdate, type StartupSettings, type TrayStateUpdate } from '../shared/ipc';
import { failure, toSessionResult } from '../shared/session/errors';
import type { DiscordAudioCaptureService } from './audio/discord-audio-capture-service';
import type { RemoteInputService } from './input/remote-input-service';
import type { RemoteControlConfig, RemoteInputPayload } from '../shared/session/media-control';

interface RuntimeIpcDependencies {
  ipcMain: IpcMain;
  audioCapture: DiscordAudioCaptureService;
  remoteInput: RemoteInputService;
  isAuthorizedSender: (sender: WebContents) => boolean;
  getAppVersion?: () => string;
  getStartupSettings?: () => StartupSettings;
  setWindowsStartup?: (enabled: boolean) => StartupSettings;
  setTrayState?: (state: TrayStateUpdate) => void;
  completeGracefulShutdown?: () => void;
}

const unsupportedStartupSettings = (): StartupSettings => ({ supported: false, enabled: false, opensVisible: true });

export const registerRuntimeIpc = ({
  ipcMain,
  audioCapture,
  remoteInput,
  isAuthorizedSender,
  getAppVersion = () => '',
  getStartupSettings = unsupportedStartupSettings,
  setWindowsStartup,
  setTrayState,
  completeGracefulShutdown,
}: RuntimeIpcDependencies): void => {
  const authorized = (sender: WebContents): boolean => !sender.isDestroyed() && isAuthorizedSender(sender);

  ipcMain.handle(ipcChannels.toggleFullscreen, (event): boolean => {
    if (!authorized(event.sender)) return false;
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) return false;
    window.setFullScreen(!window.isFullScreen());
    return window.isFullScreen();
  });

  ipcMain.handle(ipcChannels.setFullscreen, (event, flag: unknown): boolean => {
    if (!authorized(event.sender)) return false;
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) return false;
    window.setFullScreen(Boolean(flag));
    return window.isFullScreen();
  });

  ipcMain.handle(ipcChannels.setRemoteInputLock, (event, enabled: unknown): boolean => {
    if (!authorized(event.sender) || typeof enabled !== 'boolean') return false;
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) return false;

    remoteInput.setViewerInputLock(enabled);
    window.setKiosk(enabled);
    window.setAlwaysOnTop(enabled, enabled ? 'screen-saver' : 'normal');
    if (enabled) {
      window.show();
      window.focus();
    }
    return window.isKiosk();
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

  ipcMain.handle(ipcChannels.getAppVersion, (event): string => authorized(event.sender) ? getAppVersion() : '');

  ipcMain.handle(ipcChannels.getStartupSettings, (event): StartupSettings => {
    if (!authorized(event.sender)) return unsupportedStartupSettings();
    return getStartupSettings();
  });

  ipcMain.handle(ipcChannels.setWindowsStartup, (event, enabled: unknown): StartupSettings => {
    if (!authorized(event.sender)) return unsupportedStartupSettings();
    if (typeof enabled !== 'boolean' || !setWindowsStartup) return getStartupSettings();
    return setWindowsStartup(enabled);
  });

  ipcMain.handle(ipcChannels.setTrayState, (event, state: unknown): boolean => {
    if (!authorized(event.sender) || !isTrayStateUpdate(state) || !setTrayState) return false;
    setTrayState(state);
    return true;
  });

  ipcMain.handle(ipcChannels.completeGracefulShutdown, (event): void => {
    if (!authorized(event.sender)) return;
    completeGracefulShutdown?.();
  });

  ipcMain.handle(ipcChannels.startFilteredSystemAudio, (event, excludedExecutables: unknown) => {
    if (!authorized(event.sender)) return failure('invalid-request', 'A origem desta solicitação não é autorizada.');
    if (excludedExecutables !== undefined && (!Array.isArray(excludedExecutables) || excludedExecutables.some((item) => typeof item !== 'string') || excludedExecutables.length > 32)) {
      return failure('invalid-request', 'A lista de aplicativos excluídos é inválida.');
    }
    return toSessionResult(() => audioCapture.start((chunk) => {
      if (!event.sender.isDestroyed()) event.sender.send(ipcChannels.filteredAudioChunk, chunk);
    }, excludedExecutables as string[] | undefined));
  });

  ipcMain.handle(ipcChannels.listAudioApplications, (event) => {
    if (!authorized(event.sender)) return failure('invalid-request', 'A origem desta solicitação não é autorizada.');
    return toSessionResult(() => audioCapture.listApplications());
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

  remoteInput.onCapturedInput((input) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) win.webContents.send(ipcChannels.capturedRemoteInput, input);
    });
  });

  remoteInput.onViewerUnlockRequested(() => {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) win.webContents.send(ipcChannels.remoteInputLockReleased);
    });
  });
};
