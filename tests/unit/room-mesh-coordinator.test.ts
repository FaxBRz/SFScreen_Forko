import { describe, expect, it, vi } from 'vitest';
import { RoomMeshCoordinator } from '../../src/main/tailscale/room-mesh-coordinator';
import { sessionProtocolVersion, type ParticipantState, type RoomMeshSignal, type SessionDescription } from '../../src/shared/session/types';

const participant = (id: string): ParticipantState => ({
  id: id.repeat(16).slice(0, 32),
  displayName: id,
  joinedAt: '2026-08-23T12:00:00.000Z',
  presence: 'connected',
  callState: 'outside-call',
});

const description = (type: SessionDescription['type'], suffix: string): SessionDescription => ({
  protocolVersion: sessionProtocolVersion,
  type,
  sdp: `v=0\r\na=fingerprint:sha-256 ${suffix}\r\n`,
  candidates: [{ candidate: 'candidate:1 1 udp 1 100.90.1.2 43920 typ host', sdpMid: '0', sdpMLineIndex: 0 }],
  fingerprint: suffix.repeat(8),
  sessionId: `session-${suffix}`.padEnd(16, suffix),
  nonce: `nonce-${suffix}`.padEnd(16, suffix),
  expiresAt: '2030-08-23T12:00:00.000Z',
});

describe('RoomMeshCoordinator', () => {
  it('serializes membership up to four people and returns an authoritative revision', () => {
    const host = participant('host');
    const coordinator = new RoomMeshCoordinator({ roomId: 'r'.repeat(32), host });
    const alpha = participant('alpha');
    const bravo = participant('bravo');
    const charlie = participant('charlie');
    const delta = participant('delta');

    const first = coordinator.admit(alpha);
    const second = coordinator.admit(bravo);
    const third = coordinator.admit(charlie);

    expect(first).toMatchObject({ accepted: true, result: { membership: { revision: 2, participants: expect.arrayContaining([expect.objectContaining({ id: alpha.id })]) } } });
    expect(second).toMatchObject({ accepted: true, result: { membership: { revision: 3 } } });
    expect(third).toMatchObject({ accepted: true, result: { membership: { revision: 4 } } });
    if (!third.accepted) throw new Error('third admission should succeed');
    expect(third.result.membership.participants).toHaveLength(4);
    expect(coordinator.admit(delta)).toEqual({ accepted: false, reason: 'room-full' });
    expect(coordinator.snapshot()).toMatchObject({ revision: 4 });
    expect(coordinator.snapshot().participants).toHaveLength(4);
  });

  it('routes only signaling envelopes to the intended peer, deduplicates retries, and emits host events', () => {
    const hostEvents = vi.fn();
    const host = participant('host');
    const coordinator = new RoomMeshCoordinator({ roomId: 'r'.repeat(32), host, onHostEvent: hostEvents });
    const alpha = participant('alpha');
    const bravo = participant('bravo');
    const alphaAdmission = coordinator.admit(alpha);
    const bravoAdmission = coordinator.admit(bravo);
    if (!alphaAdmission.accepted || !bravoAdmission.accepted) throw new Error('admissions should succeed');

    const membershipRevision = coordinator.membershipRevision;
    const offer: RoomMeshSignal = {
      id: 'offer-identifier-0001',
      roomId: 'r'.repeat(32),
      membershipRevision,
      fromParticipantId: alpha.id,
      toParticipantId: bravo.id,
      kind: 'offer',
      description: description('offer', 'A'),
    };
    const alphaAuth = { roomId: 'r'.repeat(32), participantId: alpha.id, resumeToken: alphaAdmission.result.resumeToken };
    const bravoAuth = { roomId: 'r'.repeat(32), participantId: bravo.id, resumeToken: bravoAdmission.result.resumeToken };

    expect(coordinator.deliverFromMember(alphaAuth, offer)).toEqual({ accepted: true, duplicate: false });
    expect(coordinator.deliverFromMember(alphaAuth, offer)).toEqual({ accepted: true, duplicate: true });
    const bravoEvents = coordinator.poll(bravoAuth)?.events.filter((event) => event.type === 'signal');
    expect(bravoEvents).toHaveLength(1);
    expect(bravoEvents?.[0]).toMatchObject({ type: 'signal', signal: { fromParticipantId: alpha.id, toParticipantId: bravo.id, kind: 'offer' } });

    const answer: RoomMeshSignal = {
      ...offer,
      id: 'answer-identifier-001',
      fromParticipantId: host.id,
      toParticipantId: alpha.id,
      kind: 'answer',
      description: description('answer', 'B'),
    };
    expect(coordinator.deliverFromHost(answer)).toEqual({ accepted: true, duplicate: false });
    expect(coordinator.poll(alphaAuth)?.events.some((event) => event.type === 'signal' && event.signal.kind === 'answer')).toBe(true);
    expect(hostEvents).toHaveBeenCalled();

    expect(coordinator.deliverFromMember(alphaAuth, { ...offer, id: 'stale-identifier-001', membershipRevision: membershipRevision - 1 })).toEqual({ accepted: false, reason: 'stale-membership' });
  });

  it('removes a guest with its opaque token and broadcasts a newer snapshot', () => {
    const host = participant('host');
    const coordinator = new RoomMeshCoordinator({ roomId: 'r'.repeat(32), host });
    const guest = participant('guest');
    const admission = coordinator.admit(guest);
    if (!admission.accepted) throw new Error('admission should succeed');
    const auth = { roomId: 'r'.repeat(32), participantId: guest.id, resumeToken: admission.result.resumeToken };

    expect(coordinator.leave(auth)).toBe(true);
    expect(coordinator.snapshot()).toMatchObject({ revision: 3, participants: [expect.objectContaining({ id: host.id })] });
    expect(coordinator.poll(auth)).toBeUndefined();
  });
});
