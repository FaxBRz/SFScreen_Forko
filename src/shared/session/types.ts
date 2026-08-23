export const signalingPort = 43917;
export const embeddedStunPort = 43920;
export const webrtcUdpPortRange = { min: 43921, max: 44019 } as const;
export const sessionLifetimeMs = 10 * 60 * 1000;
/** A room invite is reusable while it is valid, unlike the old one-shot session code. */
export const roomInviteLifetimeMs = sessionLifetimeMs;
export const maxSignalBytes = 256 * 1024;
export const sessionProtocolVersion = 6 as const;
export const roomConfigSchemaVersion = 2 as const;
export const roomMaxCapacity = 4 as const;

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
  /** Maximum number of people in the session, including its host. */
  capacity?: number;
  /** Available guest admissions at the instant the invite was created. */
  remainingSlots?: number;
}

/**
 * Kept permissive for callers compiled against protocol V5. New room data is
 * always returned as RoomConfigV2 by RoomConfigService.
 */
export interface LocalRoomConfig {
  id: string;
  name: string;
  hasPassword: boolean;
  schemaVersion?: typeof roomConfigSchemaVersion;
  createdAt?: string;
  capacity?: typeof roomMaxCapacity;
  /** A migrated legacy room that must receive a new password before hosting. */
  needsPassword?: boolean;
}

export interface RoomConfigV2 extends LocalRoomConfig {
  schemaVersion: typeof roomConfigSchemaVersion;
  createdAt: string;
  capacity: typeof roomMaxCapacity;
  needsPassword: boolean;
}

export interface RoomSummary extends LocalRoomConfig {
  hostIp: string;
  hostName: string;
  memberCount?: number;
  status?: 'open' | 'waiting-network' | 'full';
  /** Presence means this room requires the participant-indexed V6 mesh path. */
  topology?: 'mesh';
}

export interface HostedRoom {
  room: LocalRoomConfig;
  expiresAt: string;
  /** Reusable seven-character code. It expires independently of the room. */
  code?: string;
  memberCount?: number;
}

export interface DiscoveredSession {
  hostIp: string;
  offer: SessionDescription;
  /** Discovery only for a mesh room; do not apply this legacy offer. */
  topology?: 'mesh';
}

/** Result of code-based room entry; the code itself is the temporary credential. */
export interface DiscoveredRoomSession extends DiscoveredSession {
  room: RoomSummary;
}

export interface SessionAnswerEvent {
  answer: SessionDescription;
  peerIp: string;
  /** Present for V6 room admissions so hosts can correlate duplicate answers. */
  admissionId?: string;
}

export type ParticipantPresenceState = 'connected' | 'reconnecting' | 'left';
export type CallState = 'outside-call' | 'in-call';
export type MediaSlot = 'screen-video' | 'camera-video' | 'voice-audio' | 'screen-audio';
export type ScreenSubscriptionTier = 'focused' | 'grid' | 'thumbnail' | 'paused';

/** Authoritative member state distributed by the room coordinator. */
export interface ParticipantState {
  id: string;
  displayName: string;
  joinedAt: string;
  presence: ParticipantPresenceState;
  callState: CallState;
  reconnectDeadlineAt?: string;
}

export interface RoomMembershipSnapshot {
  roomId: string;
  revision: number;
  participants: ParticipantState[];
}

/**
 * A WebRTC description exchanged between two room members. The coordinator
 * temporarily carries this signaling data only; media always flows directly
 * between `fromParticipantId` and `toParticipantId`.
 */
export interface RoomMeshSignal {
  /** Client-generated id so retries cannot create duplicate negotiations. */
  id: string;
  roomId: string;
  /** The authoritative membership revision used to select this peer pair. */
  membershipRevision: number;
  fromParticipantId: string;
  toParticipantId: string;
  kind: 'offer' | 'answer';
  description: SessionDescription;
}

export interface RoomMeshQueuedSignal extends RoomMeshSignal {
  /** Assigned by the coordinator; monotonically ordered per room. */
  sequence: number;
  createdAt: string;
}

/** A coordinator event delivered to a host IPC listener or guest poll. */
export type RoomMeshEvent =
  | {
    sequence: number;
    type: 'membership';
    snapshot: RoomMembershipSnapshot;
  }
  | {
    sequence: number;
    type: 'signal';
    signal: RoomMeshQueuedSignal;
  };

/** Credentials used only for the first room-mesh admission. */
export interface RoomMeshJoinRequest {
  roomId: string;
  participant: ParticipantState;
  password?: string;
  inviteCode?: string;
  /** Memory-only token returned from a previous admission. */
  resumeToken?: string;
}

export interface RoomMeshJoinResult {
  membership: RoomMembershipSnapshot;
  /** Never included in membership events or diagnostics. */
  resumeToken: string;
  reconnected: boolean;
}

export interface RoomMeshClientAuth {
  roomId: string;
  participantId: string;
  resumeToken: string;
}

export interface RoomMeshPollResult {
  membership: RoomMembershipSnapshot;
  events: RoomMeshEvent[];
}

/** Result returned only to the local room owner when it starts V6 mesh mode. */
export interface HostedMeshRoom extends HostedRoom {
  membership: RoomMembershipSnapshot;
}

export type RoomSystemEventKind = 'participant-joined' | 'participant-left' | 'participant-left-call' | 'room-deleted';

export interface RoomSystemEvent {
  id: string;
  sequence: number;
  kind: RoomSystemEventKind;
  timestamp: string;
  participantId?: string;
  participantName?: string;
}

export interface UserChatItem {
  id: string;
  sequence: number;
  type: 'user-message';
  timestamp: string;
  senderId: string;
  senderName: string;
  text: string;
  /** Room chat retains the existing image-only message capability. */
  imageData?: string;
  imageName?: string;
}

export interface SystemChatItem {
  id: string;
  sequence: number;
  type: 'system-event';
  timestamp: string;
  event: RoomSystemEvent;
}

export type ChatItem = UserChatItem | SystemChatItem;

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
  | 'room-full'
  | 'update-required'
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
  /** V6 full-mesh entry point; the legacy room host remains available during migration. */
  hostMeshRoomSession: (offer: SessionDescription, host: ParticipantState) => Promise<SessionResult<HostedMeshRoom>>;
  discoverRooms: () => Promise<SessionResult<RoomSummary[]>>;
  findRoom: (roomId: string, password: string) => Promise<SessionResult<DiscoveredSession>>;
  findRoomByCode: (code: string, password?: string) => Promise<SessionResult<DiscoveredRoomSession>>;
  submitRoomAnswer: (hostIp: string, roomId: string, password: string | undefined, answer: SessionDescription, inviteCode?: string) => Promise<SessionResult<void>>;
  joinRoomMesh: (hostIp: string, request: RoomMeshJoinRequest) => Promise<SessionResult<RoomMeshJoinResult>>;
  pollRoomMesh: (hostIp: string, auth: RoomMeshClientAuth, afterSequence?: number) => Promise<SessionResult<RoomMeshPollResult>>;
  sendRoomMeshSignal: (hostIp: string, auth: RoomMeshClientAuth, signal: RoomMeshSignal) => Promise<SessionResult<void>>;
  leaveRoomMesh: (hostIp: string, auth: RoomMeshClientAuth) => Promise<SessionResult<void>>;
  /** Host-only: routes signaling to a guest without exposing a host token. */
  sendHostedRoomMeshSignal: (signal: RoomMeshSignal) => Promise<SessionResult<void>>;
  onRoomMeshEvent: (listener: (event: RoomMeshEvent) => void) => () => void;
  findSession: (code: string) => Promise<SessionResult<DiscoveredSession>>;
  submitAnswer: (hostIp: string, code: string, answer: SessionDescription) => Promise<SessionResult<void>>;
  stopHostedSession: () => Promise<SessionResult<void>>;
  onSessionAnswer: (listener: (event: SessionAnswerEvent) => void) => () => void;
  getLocalRoom: () => Promise<SessionResult<LocalRoomConfig | undefined>>;
  createLocalRoom: (name: string, password: string) => Promise<SessionResult<LocalRoomConfig>>;
  updateLocalRoomPassword: (password: string) => Promise<SessionResult<LocalRoomConfig>>;
  removeLocalRoomPassword: () => Promise<SessionResult<LocalRoomConfig>>;
  deleteLocalRoom: () => Promise<SessionResult<void>>;
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

