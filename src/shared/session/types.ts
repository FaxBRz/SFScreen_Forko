export const signalingPort = 43917;
export const embeddedStunPort = 43920;
export const webrtcUdpPortRange = { min: 43921, max: 44019 } as const;
export const sessionLifetimeMs = 10 * 60 * 1000;
export const maxSignalBytes = 256 * 1024;
export const sessionProtocolVersion = 3 as const;

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

export interface DiscoveredSession {
  hostIp: string;
  offer: SessionDescription;
}

export interface SessionAnswerEvent {
  answer: SessionDescription;
  peerIp: string;
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
  findSession: (code: string) => Promise<SessionResult<DiscoveredSession>>;
  submitAnswer: (hostIp: string, code: string, answer: SessionDescription) => Promise<SessionResult<void>>;
  stopHostedSession: () => Promise<SessionResult<void>>;
  onSessionAnswer: (listener: (event: SessionAnswerEvent) => void) => () => void;
}
