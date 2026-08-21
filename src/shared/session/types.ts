export const signalingPort = 43917;
export const embeddedStunPort = 43920;
export const webrtcUdpPortRange = { min: 43921, max: 44019 } as const;
export const sessionLifetimeMs = 10 * 60 * 1000;
export const maxSignalBytes = 256 * 1024;
export const sessionProtocolVersion = 4 as const;

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

export type SessionErrorCode =
  | 'tailscale-not-ready'
  | 'peer-not-found'
  | 'invalid-code'
  | 'expired-session'
  | 'session-used'
  | 'protocol-mismatch'
  | 'invalid-payload'
  | 'source-unavailable'
  | 'capture-failed'
  | 'network-failed'
  | 'internal-error';

export interface SessionError {
  code: SessionErrorCode;
  message: string;
  retryable: boolean;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: SessionError };
