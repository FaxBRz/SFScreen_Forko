import { describe, expect, it, vi } from 'vitest';
import { ipcChannels, type StartupSettings, type TrayStateUpdate } from '../../src/shared/ipc';
import type { DiscordAudioCaptureService } from '../../src/main/audio/discord-audio-capture-service';
import type { RemoteInputService } from '../../src/main/input/remote-input-service';

const electron = vi.hoisted(() => ({
  fromWebContents: vi.fn(),
  getAllWindows: vi.fn(() => []),
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: electron.fromWebContents,
    getAllWindows: electron.getAllWindows,
  },
}));

import { registerRuntimeIpc } from '../../src/main/runtime-ipc';

type RegisteredHandler = (event: { sender: { isDestroyed: () => boolean } }, ...args: unknown[]) => unknown;

const startupSettings: StartupSettings = { supported: true, enabled: false, opensVisible: true };
const validTrayState: TrayStateUpdate = {
  microphone: 'active',
  inCall: true,
  inRoom: true,
  roomName: 'Sala de teste',
  roomMemberCount: 2,
  callMemberCount: 2,
};

describe('runtime IPC', () => {
  it('exposes version, Windows startup and tray state only to the authorized renderer', () => {
    const handlers = new Map<string, RegisteredHandler>();
    const setWindowsStartup = vi.fn((enabled: boolean): StartupSettings => ({ ...startupSettings, enabled }));
    const setTrayState = vi.fn();
    const completeGracefulShutdown = vi.fn();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: RegisteredHandler) => handlers.set(channel, handler)),
    };
    const remoteInput = {
      onStatus: vi.fn(),
      onCapturedInput: vi.fn(),
      onViewerUnlockRequested: vi.fn(),
    } as unknown as RemoteInputService;

    registerRuntimeIpc({
      ipcMain: ipcMain as never,
      audioCapture: {} as DiscordAudioCaptureService,
      remoteInput,
      isAuthorizedSender: () => true,
      getAppVersion: () => '0.2.0',
      getStartupSettings: () => startupSettings,
      setWindowsStartup,
      setTrayState,
      completeGracefulShutdown,
    });

    const event = { sender: { isDestroyed: () => false } };
    expect(handlers.get(ipcChannels.getAppVersion)?.(event)).toBe('0.2.0');
    expect(handlers.get(ipcChannels.getStartupSettings)?.(event)).toEqual(startupSettings);
    expect(handlers.get(ipcChannels.setWindowsStartup)?.(event, true)).toEqual({ ...startupSettings, enabled: true });
    expect(setWindowsStartup).toHaveBeenCalledWith(true);
    expect(handlers.get(ipcChannels.setTrayState)?.(event, validTrayState)).toBe(true);
    expect(setTrayState).toHaveBeenCalledWith(validTrayState);
    expect(handlers.get(ipcChannels.setTrayState)?.(event, { microphone: 'active', inCall: false, inRoom: true })).toBe(false);
    expect(handlers.get(ipcChannels.completeGracefulShutdown)?.(event)).toBeUndefined();
    expect(completeGracefulShutdown).toHaveBeenCalledOnce();
  });
});
