export const ipcChannels = {
  listScreenSources: 'screen:list-sources',
  selectScreenSource: 'screen:select-source',
  clearScreenSource: 'screen:clear-source',
  getTailscaleStatus: 'tailscale:get-status',
  hostSession: 'session:host',
  findSession: 'session:find',
  submitAnswer: 'session:submit-answer',
  stopHostedSession: 'session:stop-hosted',
  sessionAnswer: 'session:answer',
} as const;
