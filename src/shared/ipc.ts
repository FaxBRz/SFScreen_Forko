/**
 * The renderer reports only presentation state to the main process. It never
 * controls a Tray instance directly.
 */
export type TrayMicrophoneState = 'inactive' | 'active' | 'muted';

export interface TrayStateUpdate {
  microphone: TrayMicrophoneState;
  inCall: boolean;
  inRoom: boolean;
  roomName?: string;
  roomMemberCount?: number;
  callMemberCount?: number;
}

export type TrayAction = 'leave-call' | 'leave-room' | 'quit';

export interface StartupSettings {
  /** Whether this installation can safely register a Windows startup item. */
  supported: boolean;
  enabled: boolean;
  /** SFScreen deliberately opens its window when Windows starts it. */
  opensVisible: true;
}

export interface RuntimeWindowApi {
  getAppVersion: () => Promise<string>;
  getStartupSettings: () => Promise<StartupSettings>;
  setWindowsStartup: (enabled: boolean) => Promise<StartupSettings>;
  setTrayState: (state: TrayStateUpdate) => Promise<boolean>;
  onTrayAction: (listener: (action: TrayAction) => void) => () => void;
  onGracefulShutdownRequested: (listener: () => void) => () => void;
  completeGracefulShutdown: () => Promise<void>;
}

const isCount = (value: unknown): value is number => typeof value === 'number'
  && Number.isSafeInteger(value)
  && value >= 0
  && value <= 4;

/** Reject malformed renderer input before it can affect native menu labels. */
export const isTrayStateUpdate = (value: unknown): value is TrayStateUpdate => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<TrayStateUpdate>;
  if (!['inactive', 'active', 'muted'].includes(String(candidate.microphone))) return false;
  if (typeof candidate.inCall !== 'boolean' || typeof candidate.inRoom !== 'boolean') return false;
  if (candidate.inCall && !candidate.inRoom) return false;
  if (candidate.microphone !== 'inactive' && !candidate.inCall) return false;
  if (candidate.roomName !== undefined && (typeof candidate.roomName !== 'string' || candidate.roomName.trim().length === 0 || candidate.roomName.length > 64)) return false;
  if (candidate.roomMemberCount !== undefined && !isCount(candidate.roomMemberCount)) return false;
  if (candidate.callMemberCount !== undefined && !isCount(candidate.callMemberCount)) return false;
  if (candidate.roomMemberCount !== undefined && candidate.inRoom && candidate.roomMemberCount < 1) return false;
  if (candidate.callMemberCount !== undefined && candidate.inCall && candidate.callMemberCount < 1) return false;
  return true;
};

export const ipcChannels = {
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
  setRemoteControlHostConfig: 'remote-input:set-config',
  setRemoteInputLock: 'remote-input:set-viewer-lock',
  capturedRemoteInput: 'remote-input:captured-key',
  remoteInputLockReleased: 'remote-input:viewer-lock-released',
  executeRemoteInput: 'remote-input:execute',
  resumeRemoteControlOverride: 'remote-input:resume-override',
  remoteControlStatusChanged: 'remote-input:status-changed',
} as const;

