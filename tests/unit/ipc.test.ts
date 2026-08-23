import { describe, expect, it } from 'vitest';
import { ipcChannels } from '../../src/shared/ipc';

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
      discoverRooms: 'room:discover',
      findRoom: 'room:find',
      submitRoomAnswer: 'room:submit-answer',
      findSession: 'session:find',
      submitAnswer: 'session:submit-answer',
      stopHostedSession: 'session:stop-hosted',
      sessionAnswer: 'session:answer',
      getLocalRoom: 'room:get-local',
      createLocalRoom: 'room:create-local',
      updateLocalRoomPassword: 'room:update-password',
      removeLocalRoomPassword: 'room:remove-password',
      toggleFullscreen: 'window:toggle-fullscreen',
      setFullscreen: 'window:set-fullscreen',
      winKeyPressed: 'window:win-key-pressed',
      minimizeWindow: 'window:minimize',
      maximizeWindow: 'window:maximize',
      closeWindow: 'window:close',
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
});


