export const ipcChannels = {
  listScreenSources: 'screen:list-sources',
  getTailscaleStatus: 'tailscale:get-status',
  hostSession: 'session:host',
  findSession: 'session:find',
  submitAnswer: 'session:submit-answer',
  stopHostedSession: 'session:stop-hosted',
  sessionAnswer: 'session:answer',
} as const;
