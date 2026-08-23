import { describe, expect, it, vi } from 'vitest';
import type { ParticipantState, RoomMembershipSnapshot, RoomMeshEvent, RoomMeshSignal, SessionDescription } from '../../src/shared/session/types';

const sessions = vi.hoisted((): Array<{
  createOffer: ReturnType<typeof vi.fn>;
  createAnswer: ReturnType<typeof vi.fn>;
  applyAnswer: ReturnType<typeof vi.fn>;
  sendRoomCallState: ReturnType<typeof vi.fn>;
  sendCameraState: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}> => []);

vi.mock('../../src/renderer/session/webrtc-session', () => ({
  WebRtcSession: class {
    readonly createOffer = vi.fn(async (): Promise<SessionDescription> => description('offer'));
    readonly createAnswer = vi.fn(async (): Promise<{ answer: SessionDescription; securityCode: string }> => ({ answer: description('answer'), securityCode: '000000' }));
    readonly applyAnswer = vi.fn(async (): Promise<string> => '000000');
    readonly sendRoomCallState = vi.fn();
    readonly sendCameraState = vi.fn();
    readonly replaceVideoTrack = vi.fn(async () => undefined);
    readonly removeVideoTrack = vi.fn(async () => undefined);
    readonly replaceCameraTrack = vi.fn(async () => undefined);
    readonly removeCameraTrack = vi.fn(async () => undefined);
    readonly replaceVoiceTrack = vi.fn(async () => undefined);
    readonly removeVoiceTrack = vi.fn(async () => undefined);
    readonly replaceSystemAudioTrack = vi.fn(async () => undefined);
    readonly removeSystemAudioTrack = vi.fn(async () => undefined);
    readonly close = vi.fn();
    constructor() {
      sessions.push(this);
    }
  },
}));

import { RoomMeshClient } from '../../src/renderer/session/room-mesh-client';

const description = (type: 'offer' | 'answer'): SessionDescription => ({
  protocolVersion: 6,
  type,
  sdp: 'v=0\r\na=fingerprint:sha-256 AA:BB\r\n',
  candidates: [],
  fingerprint: 'fingerprint-test',
  sessionId: 'session-id-123456',
  nonce: 'nonce-id-12345678',
  expiresAt: '2026-08-23T12:10:00.000Z',
});

const participant = (id: string): ParticipantState => ({
  id,
  displayName: id,
  joinedAt: '2026-08-23T12:00:00.000Z',
  presence: 'connected',
  callState: 'outside-call',
});

const membership = (revision: number, participants: ParticipantState[]): RoomMembershipSnapshot => ({
  roomId: 'room-v6-12345678',
  revision,
  participants,
});

const success = <T>(value: T) => ({ ok: true as const, value });

describe('RoomMeshClient', () => {
  it('uses deterministic offers through the host coordinator and accepts the correlated answer', async () => {
    sessions.length = 0;
    let hostEvent: ((event: RoomMeshEvent) => void) | undefined;
    const api = {
      onRoomMeshEvent: vi.fn((listener: (event: RoomMeshEvent) => void) => {
        hostEvent = listener;
        return () => undefined;
      }),
      sendHostedRoomMeshSignal: vi.fn(async () => success(undefined)),
      joinRoomMesh: vi.fn(),
      pollRoomMesh: vi.fn(),
      sendRoomMeshSignal: vi.fn(),
      leaveRoomMesh: vi.fn(),
    };
    const host = participant('aaaaaaaaaaaaaaaa');
    const peer = participant('zzzzzzzzzzzzzzzz');
    const client = new RoomMeshClient({
      api,
      localParticipant: host,
      selfIps: ['100.64.0.1'],
      stunServerIp: '100.64.0.1',
      isHost: true,
    });

    client.startHosted(membership(1, [host]));
    hostEvent?.({ sequence: 1, type: 'membership', snapshot: membership(2, [host, peer]) });

    await vi.waitFor(() => expect(api.sendHostedRoomMeshSignal).toHaveBeenCalledOnce());
    const sent = (api.sendHostedRoomMeshSignal.mock.calls as unknown as RoomMeshSignal[][])[0]?.[0];
    if (!sent) throw new Error('A oferta da malha não foi encaminhada.');
    expect(sent).toMatchObject({ fromParticipantId: host.id, toParticipantId: peer.id, kind: 'offer', membershipRevision: 2 });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.createOffer).toHaveBeenCalledOnce();
    client.sendRoomCallState('joined');
    client.sendCameraState('active');
    expect(sessions[0]?.sendRoomCallState).toHaveBeenCalledWith('joined');
    expect(sessions[0]?.sendCameraState).toHaveBeenCalledWith('active');

    hostEvent?.({
      sequence: 2,
      type: 'signal',
      signal: { ...sent, id: 'answer-id-123456', fromParticipantId: peer.id, toParticipantId: host.id, kind: 'answer', description: description('answer'), sequence: 2, createdAt: '2026-08-23T12:00:01.000Z' },
    });
    await vi.waitFor(() => expect(sessions[0]?.applyAnswer).toHaveBeenCalledWith(expect.objectContaining({ type: 'answer' })));
    client.dispose();
  });

  it('answers a lower-id peer offer through the guest credential without exposing its token', async () => {
    sessions.length = 0;
    const host = participant('aaaaaaaaaaaaaaaa');
    const guest = participant('zzzzzzzzzzzzzzzz');
    const snapshot = membership(2, [host, guest]);
    const offerEvent: RoomMeshEvent = {
      sequence: 1,
      type: 'signal',
      signal: {
        id: 'offer-id-1234567',
        roomId: snapshot.roomId,
        membershipRevision: snapshot.revision,
        fromParticipantId: host.id,
        toParticipantId: guest.id,
        kind: 'offer',
        description: description('offer'),
        sequence: 1,
        createdAt: '2026-08-23T12:00:01.000Z',
      },
    };
    const api = {
      onRoomMeshEvent: vi.fn(),
      sendHostedRoomMeshSignal: vi.fn(),
      joinRoomMesh: vi.fn(async () => success({ membership: snapshot, resumeToken: 'memory-only-resume-token', reconnected: false })),
      pollRoomMesh: vi.fn(async () => success({ membership: snapshot, events: [offerEvent] })),
      sendRoomMeshSignal: vi.fn(async () => success(undefined)),
      leaveRoomMesh: vi.fn(),
    };
    const client = new RoomMeshClient({
      api,
      localParticipant: guest,
      selfIps: ['100.64.0.2'],
      stunServerIp: '100.64.0.2',
      isHost: false,
      hostIp: '100.64.0.1',
      pollIntervalMs: 60_000,
    });

    await client.join({ roomId: snapshot.roomId, inviteCode: 'ABC-123-4' });
    await vi.waitFor(() => expect(api.sendRoomMeshSignal).toHaveBeenCalledOnce());
    const signal = (api.sendRoomMeshSignal.mock.calls as unknown as RoomMeshSignal[][])[0]?.[2];
    expect(signal).toMatchObject({ fromParticipantId: guest.id, toParticipantId: host.id, kind: 'answer', membershipRevision: 2 });
    expect(sessions[0]?.createAnswer).toHaveBeenCalledWith(expect.objectContaining({ type: 'offer' }), ['100.64.0.2'], '100.64.0.2');
    expect(signal).not.toHaveProperty('resumeToken');
    client.dispose();
  });
});
