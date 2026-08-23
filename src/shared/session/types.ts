export const signalingPort = 43917;
export const embeddedStunPort = 43920;
export const webrtcUdpPortRange = { min: 43921, max: 44019 } as const;
export const sessionLifetimeMs = 10 * 60 * 1000;
export const maxSignalBytes = 256 * 1024;
export const sessionProtocolVersion = 5 as const;

export type TailscaleState = 'not-installed' | 'not-authenticated' | 'offline' | 'no-peers' | 'ready' | 'policy-blocked';
export type TailscaleRoute = 'direct' | 'relay' | 'peer-relay' | 'unknown';

export interface TailscalePeer {
  id: string;
  name: string;
  ip: string;
  online: boolean;
  route: TailscaleRoute;
}

export interface TailscaleStatus {
  state: TailscaleState;
  selfIp?: string;
  selfIps?: string[];
  peers: TailscalePeer[];
  message?: string;
}

export interface CandidateData {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment?: string | null;
}

export interface SessionDescription {
  protocolVersion: typeof sessionProtocolVersion;
  type: 'offer' | 'answer';
  sdp: string;
  candidates: CandidateData[];
  fingerprint: string;
  sessionId: string;
  nonce: string;
  expiresAt: string;
}

export interface HostedSession {
  code: string;
  expiresAt: string;
}

export interface LocalRoomConfig {
  id: string;
  name: string;
  hasPassword: boolean;
}

export interface RoomSummary extends LocalRoomConfig {
  hostIp: string;
  hostName: string;
}

export interface HostedRoom {
  room: LocalRoomConfig;
  expiresAt: string;
}

export interface DiscoveredSession {
  hostIp: string;
  offer: SessionDescription;
}

export interface SessionAnswerEvent {
  answer: SessionDescription;
  peerIp: string;
}

export interface FilteredAudioStart {
  mode: 'filtered' | 'not-needed';
  sampleRate: 48000;
  channels: 2;
  captureId?: string;
}

export interface AudioApplication {
  processId: number;
  executable: string;
  label: string;
}

export type SessionErrorCode =
  | 'tailscale-unavailable'
  | 'policy-blocked'
  | 'session-not-found'
  | 'session-expired'
  | 'invalid-request'
  | 'invalid-response'
  | 'timeout'
  | 'webrtc-failed'
  | 'capture-not-authorized'
  | 'source-unavailable'
  | 'capture-failed'
  | 'session-busy'
  | 'unknown';

export interface SessionError {
  code: SessionErrorCode;
  message: string;
  retryable: boolean;
}

export type SessionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SessionError };

export interface SFScreenApi {
  getTailscaleStatus: () => Promise<TailscaleStatus>;
  listScreenSources: () => Promise<SessionResult<import('../screen-source').ScreenSource[]>>;
  selectScreenSource: (selection: import('../screen-source').ScreenSelection) => Promise<SessionResult<void>>;
  clearScreenSource: () => Promise<SessionResult<void>>;
  getCaptureAuthorizationState: () => Promise<import('../screen-source').CaptureAuthorizationState>;
  exportDiagnostics: (report: import('../diagnostics').DiagnosticsReport) => Promise<SessionResult<boolean>>;
  hostSession: (offer: SessionDescription) => Promise<SessionResult<HostedSession>>;
  hostRoomSession: (offer: SessionDescription) => Promise<SessionResult<HostedRoom>>;
  discoverRooms: () => Promise<SessionResult<RoomSummary[]>>;
  findRoom: (roomId: string, password: string) => Promise<SessionResult<DiscoveredSession>>;
  submitRoomAnswer: (hostIp: string, roomId: string, password: string, answer: SessionDescription) => Promise<SessionResult<void>>;
  findSession: (code: string) => Promise<SessionResult<DiscoveredSession>>;
  submitAnswer: (hostIp: string, code: string, answer: SessionDescription) => Promise<SessionResult<void>>;
  stopHostedSession: () => Promise<SessionResult<void>>;
  onSessionAnswer: (listener: (event: SessionAnswerEvent) => void) => () => void;
  getLocalRoom: () => Promise<SessionResult<LocalRoomConfig | undefined>>;
  createLocalRoom: (name: string, password: string) => Promise<SessionResult<LocalRoomConfig>>;
  updateLocalRoomPassword: (password: string) => Promise<SessionResult<LocalRoomConfig>>;
  removeLocalRoomPassword: () => Promise<SessionResult<LocalRoomConfig>>;
  toggleFullscreen: () => Promise<boolean>;
  setFullscreen: (flag: boolean) => Promise<boolean>;
  onWinKeyPressed: (listener: (action: 'keyDown' | 'keyUp') => void) => () => void;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<boolean>;
  closeWindow: () => Promise<void>;
  startFilteredSystemAudio: (excludedExecutables?: string[]) => Promise<SessionResult<FilteredAudioStart>>;
  stopFilteredSystemAudio: (captureId?: string) => Promise<SessionResult<void>>;
  onFilteredAudioChunk: (listener: (chunk: ArrayBuffer) => void) => () => void;
  listAudioApplications: () => Promise<SessionResult<AudioApplication[]>>;
  setRemoteControlHostConfig: (config: import('./media-control').RemoteControlConfig) => Promise<SessionResult<void>>;
  setRemoteInputLock: (enabled: boolean) => Promise<boolean>;
  onCapturedRemoteInput: (listener: (input: import('./media-control').RemoteInputPayload) => void) => () => void;
  onRemoteInputLockReleased: (listener: () => void) => () => void;
  executeRemoteInput: (input: import('./media-control').RemoteInputPayload, sourceId?: string) => Promise<SessionResult<boolean>>;
  resumeRemoteControlOverride: () => Promise<SessionResult<void>>;
  onRemoteControlStatusChanged: (listener: (status: { state: import('./media-control').RemoteControlStatus; timeoutMs?: number }) => void) => () => void;
}

