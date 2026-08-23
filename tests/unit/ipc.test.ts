import { describe, expect, it } from 'vitest';
import { ipcChannels, isTrayStateUpdate } from '../../src/shared/ipc';

describe('IPC channels', () => {
  it('keeps the privileged surface narrow and stable', () => {
    expect(ipcChannels).toEqual({
      listScreenSources: 'screen:list-sources',
      selectScreenSource: 'screen:select-source',
      clearScreenSource: 'screen:clear-source',
      getCaptureAuthorizationState: 'screen:get-authorization-state',
      exportDiagnostics: 'diagnostics:export',
      getTailscaleStatus: 'tailscale:get-status',
      hostSession: 'session:host',
      hostRoomSession: 'room:host',
      hostMeshRoomSession: 'room:host-mesh',
      discoverRooms: 'room:discover',
      findRoom: 'room:find',
      findRoomByCode: 'room:find-by-code',
      submitRoomAnswer: 'room:submit-answer',
      joinRoomMesh: 'room:mesh-join',
      pollRoomMesh: 'room:mesh-poll',
      sendRoomMeshSignal: 'room:mesh-signal',
      leaveRoomMesh: 'room:mesh-leave',
      sendHostedRoomMeshSignal: 'room:mesh-host-signal',
      roomMeshEvent: 'room:mesh-event',
      findSession: 'session:find',
      submitAnswer: 'session:submit-answer',
      stopHostedSession: 'session:stop-hosted',
      sessionAnswer: 'session:answer',
      getLocalRoom: 'room:get-local',
      createLocalRoom: 'room:create-local',
      updateLocalRoomPassword: 'room:update-password',
      removeLocalRoomPassword: 'room:remove-password',
      deleteLocalRoom: 'room:delete-local',
      toggleFullscreen: 'window:toggle-fullscreen',
      setFullscreen: 'window:set-fullscreen',
      winKeyPressed: 'window:win-key-pressed',
      minimizeWindow: 'window:minimize',
      maximizeWindow: 'window:maximize',
      closeWindow: 'window:close',
      getAppVersion: 'runtime:get-app-version',
      getStartupSettings: 'runtime:get-startup-settings',
      setWindowsStartup: 'runtime:set-windows-startup',
      setTrayState: 'runtime:set-tray-state',
      trayAction: 'runtime:tray-action',
      gracefulShutdownRequested: 'runtime:graceful-shutdown-requested',
      completeGracefulShutdown: 'runtime:complete-graceful-shutdown',
      startFilteredSystemAudio: 'audio:start-filtered-system',
      stopFilteredSystemAudio: 'audio:stop-filtered-system',
      filteredAudioChunk: 'audio:filtered-chunk',
      listAudioApplications: 'audio:list-applications',
      executeRemoteInput: 'remote-input:execute',
      setRemoteControlHostConfig: 'remote-input:set-config',
      setRemoteInputLock: 'remote-input:set-viewer-lock',
      capturedRemoteInput: 'remote-input:captured-key',
      remoteInputLockReleased: 'remote-input:viewer-lock-released',
      resumeRemoteControlOverride: 'remote-input:resume-override',
      remoteControlStatusChanged: 'remote-input:status-changed',
    });
  });

  it('accepts only safe tray presentation state from the renderer', () => {
    expect(isTrayStateUpdate({
      microphone: 'active',
      inCall: true,
      inRoom: true,
      roomName: 'Minha sala',
      roomMemberCount: 4,
      callMemberCount: 3,
    })).toBe(true);
    expect(isTrayStateUpdate({ microphone: 'active', inCall: false, inRoom: true })).toBe(false);
    expect(isTrayStateUpdate({ microphone: 'inactive', inCall: true, inRoom: false })).toBe(false);
    expect(isTrayStateUpdate({ microphone: 'muted', inCall: true, inRoom: true, roomMemberCount: 5 })).toBe(false);
    expect(isTrayStateUpdate({ microphone: 'inactive', inCall: false, inRoom: false, roomName: ' '.repeat(65) })).toBe(false);
  });
});


