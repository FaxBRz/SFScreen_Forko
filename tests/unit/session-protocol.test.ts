import { describe, expect, it } from 'vitest';
import { isChatItem, isParticipantState, isRoomConfigV2, isRoomSystemEvent, isSessionDescription } from '../../src/shared/session/protocol';
import { roomConfigSchemaVersion, roomMaxCapacity, sessionProtocolVersion, type SessionDescription } from '../../src/shared/session/types';

const description: SessionDescription = {
  protocolVersion: sessionProtocolVersion,
  type: 'offer',
  sdp: 'v=0\r\na=fingerprint:sha-256 AA:BB\r\n',
  candidates: [{ candidate: 'candidate:1 1 udp 1 100.90.1.2 43920 typ host', sdpMid: '0', sdpMLineIndex: 0 }],
  fingerprint: 'AA:BB',
  sessionId: 'c29b3549-31d6-48c7-9e2f-c50989b21a15',
  nonce: '1983ac11-44ad-4b5e-9cc5-7c31a5b3f84c',
  expiresAt: '2026-08-21T12:00:00.000Z',
};

describe('session protocol', () => {
  it('accepts the current version and rejects the experimental wire shape', () => {
    expect(isSessionDescription(description, 'offer')).toBe(true);
    expect(isSessionDescription({ ...description, protocolVersion: 0 })).toBe(false);
  });

  it('rejects oversized or malformed candidates', () => {
    expect(isSessionDescription({ ...description, candidates: [{ ...description.candidates[0], candidate: 'x'.repeat(2_049) }] })).toBe(false);
  });

  it('validates the V2 room shape and canonical member/chat events', () => {
    const room = {
      schemaVersion: roomConfigSchemaVersion,
      id: 'a'.repeat(32),
      name: 'Sala de teste',
      createdAt: '2026-08-23T12:00:00.000Z',
      capacity: roomMaxCapacity,
      hasPassword: true,
      needsPassword: false,
    };
    const participant = {
      id: 'b'.repeat(32),
      displayName: 'Rafael',
      joinedAt: '2026-08-23T12:00:00.000Z',
      presence: 'connected' as const,
      callState: 'in-call' as const,
    };
    const event = {
      id: 'c'.repeat(32),
      sequence: 4,
      kind: 'participant-joined' as const,
      timestamp: '2026-08-23T12:00:01.000Z',
      participantId: participant.id,
      participantName: participant.displayName,
    };

    expect(isRoomConfigV2(room)).toBe(true);
    expect(isParticipantState(participant)).toBe(true);
    expect(isRoomSystemEvent(event)).toBe(true);
    expect(isChatItem({
      id: 'd'.repeat(32),
      sequence: 5,
      type: 'system-event',
      timestamp: event.timestamp,
      event,
    })).toBe(true);
    expect(isChatItem({
      id: 'e'.repeat(32),
      sequence: 6,
      type: 'user-message',
      timestamp: event.timestamp,
      senderId: participant.id,
      senderName: participant.displayName,
      text: 'Olá!',
    })).toBe(true);
    expect(isRoomConfigV2({ ...room, capacity: 5 })).toBe(false);
    expect(isParticipantState({ ...participant, callState: 'ringing' })).toBe(false);
  });
});
