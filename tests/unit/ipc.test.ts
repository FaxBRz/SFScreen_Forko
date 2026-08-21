import { describe, expect, it } from 'vitest';
import { ipcChannels } from '../../src/shared/ipc';

describe('IPC channels', () => {
  it('keeps the privileged surface narrow and stable', () => {
    expect(ipcChannels).toEqual({
      listScreenSources: 'screen:list-sources',
      getTailscaleStatus: 'tailscale:get-status',
      hostSession: 'session:host',
      findSession: 'session:find',
      submitAnswer: 'session:submit-answer',
      stopHostedSession: 'session:stop-hosted',
      sessionAnswer: 'session:answer',
    });
  });
});
