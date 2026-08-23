import { isValidSessionCode } from './code';
import {
  roomConfigSchemaVersion,
  roomMaxCapacity,
  sessionProtocolVersion,
  type CallState,
  type CandidateData,
  type ChatItem,
  type ParticipantPresenceState,
  type ParticipantState,
  type RoomConfigV2,
  type RoomMembershipSnapshot,
  type RoomMeshClientAuth,
  type RoomMeshEvent,
  type RoomMeshJoinResult,
  type RoomMeshJoinRequest,
  type RoomMeshPollResult,
  type RoomMeshQueuedSignal,
  type RoomMeshSignal,
  type RoomSystemEvent,
  type SessionDescription,
} from './types';

const maxCandidates = 64;
const maxSdpLength = 256 * 1024;
const maxCandidateLength = 2_048;
const maxIdentifierLength = 128;
const maxDisplayNameLength = 64;
const maxChatLength = 4_096;

export const protocolUpdateMessage = 'Esta sala usa uma versão mais nova do SFScreen. Atualize o aplicativo e tente novamente.';

const isIsoTimestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const isBoundedIdentifier = (value: unknown, min = 1, max = maxIdentifierLength): value is string => typeof value === 'string' && value.length >= min && value.length <= max;

const isCandidateData = (value: unknown): value is CandidateData => {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.candidate === 'string'
    && candidate.candidate.length > 0
    && candidate.candidate.length <= maxCandidateLength
    && (typeof candidate.sdpMid === 'string' || candidate.sdpMid === null)
    && (typeof candidate.sdpMLineIndex === 'number' || candidate.sdpMLineIndex === null)
    && (candidate.usernameFragment === undefined || typeof candidate.usernameFragment === 'string' || candidate.usernameFragment === null);
};

export const isSessionDescription = (value: unknown, expectedType?: 'offer' | 'answer'): value is SessionDescription => {
  if (typeof value !== 'object' || value === null) return false;
  const description = value as Record<string, unknown>;
  return description.protocolVersion === sessionProtocolVersion
    && (description.type === 'offer' || description.type === 'answer')
    && (expectedType === undefined || description.type === expectedType)
    && typeof description.sdp === 'string'
    && description.sdp.length > 0
    && description.sdp.length <= maxSdpLength
    && Array.isArray(description.candidates)
    && description.candidates.length <= maxCandidates
    && description.candidates.every(isCandidateData)
    && typeof description.fingerprint === 'string'
    && description.fingerprint.length > 0
    && description.fingerprint.length <= maxIdentifierLength
    && typeof description.sessionId === 'string'
    && description.sessionId.length >= 16
    && description.sessionId.length <= maxIdentifierLength
    && typeof description.nonce === 'string'
    && description.nonce.length >= 16
    && description.nonce.length <= maxIdentifierLength
    && typeof description.expiresAt === 'string'
    && Number.isFinite(Date.parse(description.expiresAt));
};

export const isSessionCode = (value: unknown): value is string => typeof value === 'string' && isValidSessionCode(value);

export const isRoomConfigV2 = (value: unknown): value is RoomConfigV2 => {
  if (typeof value !== 'object' || value === null) return false;
  const room = value as Record<string, unknown>;
  return room.schemaVersion === roomConfigSchemaVersion
    && isBoundedIdentifier(room.id, 16)
    && typeof room.name === 'string'
    && room.name.trim().length > 0
    && room.name.length <= 48
    && isIsoTimestamp(room.createdAt)
    && room.capacity === roomMaxCapacity
    && typeof room.hasPassword === 'boolean'
    && typeof room.needsPassword === 'boolean';
};

const isParticipantPresence = (value: unknown): value is ParticipantPresenceState => value === 'connected' || value === 'reconnecting' || value === 'left';
const isCallState = (value: unknown): value is CallState => value === 'outside-call' || value === 'in-call';

export const isParticipantState = (value: unknown): value is ParticipantState => {
  if (typeof value !== 'object' || value === null) return false;
  const participant = value as Record<string, unknown>;
  return isBoundedIdentifier(participant.id, 16)
    && typeof participant.displayName === 'string'
    && participant.displayName.trim().length > 0
    && participant.displayName.length <= maxDisplayNameLength
    && isIsoTimestamp(participant.joinedAt)
    && isParticipantPresence(participant.presence)
    && isCallState(participant.callState)
    && (participant.reconnectDeadlineAt === undefined || isIsoTimestamp(participant.reconnectDeadlineAt));
};

export const isRoomMembershipSnapshot = (value: unknown): value is RoomMembershipSnapshot => {
  if (typeof value !== 'object' || value === null) return false;
  const snapshot = value as Record<string, unknown>;
  if (!isBoundedIdentifier(snapshot.roomId, 16)
    || typeof snapshot.revision !== 'number'
    || !Number.isSafeInteger(snapshot.revision)
    || snapshot.revision < 1
    || !Array.isArray(snapshot.participants)
    || snapshot.participants.length < 1
    || snapshot.participants.length > roomMaxCapacity
    || !snapshot.participants.every(isParticipantState)) return false;
  const ids = new Set(snapshot.participants.map((participant) => participant.id));
  return ids.size === snapshot.participants.length;
};

const isMeshSignalBase = (value: unknown): value is RoomMeshSignal => {
  if (typeof value !== 'object' || value === null) return false;
  const signal = value as Record<string, unknown>;
  return isBoundedIdentifier(signal.id, 16)
    && isBoundedIdentifier(signal.roomId, 16)
    && typeof signal.membershipRevision === 'number'
    && Number.isSafeInteger(signal.membershipRevision)
    && signal.membershipRevision >= 1
    && isBoundedIdentifier(signal.fromParticipantId, 16)
    && isBoundedIdentifier(signal.toParticipantId, 16)
    && signal.fromParticipantId !== signal.toParticipantId
    && (signal.kind === 'offer' || signal.kind === 'answer')
    && isSessionDescription(signal.description, signal.kind);
};

export const isRoomMeshSignal = (value: unknown): value is RoomMeshSignal => isMeshSignalBase(value);

export const isRoomMeshQueuedSignal = (value: unknown): value is RoomMeshQueuedSignal => {
  if (!isMeshSignalBase(value)) return false;
  const signal = value as unknown as Record<string, unknown>;
  return typeof signal.sequence === 'number'
    && Number.isSafeInteger(signal.sequence)
    && signal.sequence >= 1
    && isIsoTimestamp(signal.createdAt);
};

export const isRoomMeshEvent = (value: unknown): value is RoomMeshEvent => {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  if (typeof event.sequence !== 'number' || !Number.isSafeInteger(event.sequence) || event.sequence < 1) return false;
  if (event.type === 'membership') return isRoomMembershipSnapshot(event.snapshot);
  return event.type === 'signal' && isRoomMeshQueuedSignal(event.signal);
};

const isMeshCredential = (value: unknown): value is string => typeof value === 'string'
  && value.length >= 1
  && value.length <= 256;

export const isRoomMeshJoinRequest = (value: unknown): value is RoomMeshJoinRequest => {
  if (typeof value !== 'object' || value === null) return false;
  const request = value as Record<string, unknown>;
  const hasPassword = request.password !== undefined;
  const hasCode = request.inviteCode !== undefined;
  const hasToken = request.resumeToken !== undefined;
  return isBoundedIdentifier(request.roomId, 16)
    && isParticipantState(request.participant)
    && (!hasPassword || isMeshCredential(request.password))
    && (!hasCode || isSessionCode(request.inviteCode))
    && (!hasToken || isBoundedIdentifier(request.resumeToken, 16, 256))
    && (hasPassword || hasCode || hasToken);
};

export const isRoomMeshClientAuth = (value: unknown): value is RoomMeshClientAuth => {
  if (typeof value !== 'object' || value === null) return false;
  const auth = value as Record<string, unknown>;
  return isBoundedIdentifier(auth.roomId, 16)
    && isBoundedIdentifier(auth.participantId, 16)
    && isBoundedIdentifier(auth.resumeToken, 16, 256);
};

export const isRoomMeshJoinResult = (value: unknown): value is RoomMeshJoinResult => {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as Record<string, unknown>;
  return isRoomMembershipSnapshot(result.membership)
    && isBoundedIdentifier(result.resumeToken, 16, 256)
    && typeof result.reconnected === 'boolean';
};

export const isRoomMeshPollResult = (value: unknown): value is RoomMeshPollResult => {
  if (typeof value !== 'object' || value === null) return false;
  const result = value as Record<string, unknown>;
  return isRoomMembershipSnapshot(result.membership)
    && Array.isArray(result.events)
    && result.events.length <= 64
    && result.events.every(isRoomMeshEvent);
};

const isRoomSystemEventKind = (value: unknown): value is RoomSystemEvent['kind'] => value === 'participant-joined'
  || value === 'participant-left'
  || value === 'participant-left-call'
  || value === 'room-deleted';

export const isRoomSystemEvent = (value: unknown): value is RoomSystemEvent => {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  return isBoundedIdentifier(event.id, 16)
    && typeof event.sequence === 'number'
    && Number.isSafeInteger(event.sequence)
    && event.sequence >= 0
    && isRoomSystemEventKind(event.kind)
    && isIsoTimestamp(event.timestamp)
    && (event.participantId === undefined || isBoundedIdentifier(event.participantId, 16))
    && (event.participantName === undefined || (typeof event.participantName === 'string' && event.participantName.trim().length > 0 && event.participantName.length <= maxDisplayNameLength));
};

export const isChatItem = (value: unknown): value is ChatItem => {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  const base = isBoundedIdentifier(item.id, 16)
    && typeof item.sequence === 'number'
    && Number.isSafeInteger(item.sequence)
    && item.sequence >= 0
    && isIsoTimestamp(item.timestamp);
  if (!base) return false;
  if (item.type === 'user-message') {
    const hasImage = typeof item.imageData === 'string'
      && item.imageData.startsWith('data:image/')
      && item.imageData.length <= 1_500_000;
    return isBoundedIdentifier(item.senderId, 16)
      && typeof item.senderName === 'string'
      && item.senderName.trim().length > 0
      && item.senderName.length <= maxDisplayNameLength
      && typeof item.text === 'string'
      && item.text.length <= maxChatLength
      && (item.text.trim().length > 0 || hasImage)
      && (item.imageData === undefined || hasImage)
      && (item.imageName === undefined || (typeof item.imageName === 'string' && item.imageName.length <= 128));
  }
  return item.type === 'system-event' && isRoomSystemEvent(item.event);
};
