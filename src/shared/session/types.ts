export const signalingPort = 43917;
export const webrtcUdpPortRange = { min: 43920, max: 44019 } as const;
export const sessionLifetimeMs = 10 * 60 * 1000;
export const maxSignalBytes = 256 * 1024;

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

export interface SFScreenApi {
  getTailscaleStatus: () => Promise<TailscaleStatus>;
  hostSession: (offer: SessionDescription) => Promise<HostedSession>;
  findSession: (code: string) => Promise<DiscoveredSession>;
  submitAnswer: (hostIp: string, code: string, answer: SessionDescription) => Promise<void>;
  stopHostedSession: () => Promise<void>;
  onSessionAnswer: (listener: (event: SessionAnswerEvent) => void) => () => void;
}
