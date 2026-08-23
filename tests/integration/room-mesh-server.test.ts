import { afterEach, describe, expect, it } from 'vitest';
import { SessionServer } from '../../src/main/tailscale/session-server';
import { roomConfigSchemaVersion, roomMaxCapacity, sessionProtocolVersion, type LocalRoomConfig, type ParticipantState, type RoomMeshSignal, type SessionDescription, type TailscaleStatus } from '../../src/shared/session/types';

const status: TailscaleStatus = {
  state: 'ready',
  selfIp: '127.0.0.1',
  peers: [{ id: 'peer', name: 'peer', ip: '127.0.0.1', online: true, route: 'direct' }],
};

const room: LocalRoomConfig = {
  schemaVersion: roomConfigSchemaVersion,
  id: 'r'.repeat(32),
  name: 'Sala mesh',
  createdAt: '2026-08-23T12:00:00.000Z',
  capacity: roomMaxCapacity,
  hasPassword: true,
  needsPassword: false,
};

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

const participant = (label: string): ParticipantState => ({
  id: label.repeat(16).slice(0, 32),
  displayName: label,
  joinedAt: '2026-08-23T12:00:00.000Z',
  presence: 'connected',
  callState: 'outside-call',
});

describe('room mesh signaling server', () => {
  const servers: SessionServer[] = [];
  afterEach(async () => { await Promise.all(servers.splice(0).map((server) => server.stop())); });

  it('serializes three concurrent admissions, rejects a fifth member, and routes SDP only to the target peer', async () => {
    const hostEvents: unknown[] = [];
    const server = new SessionServer(async () => status, {
      port: 0,
      isAllowedIp: (ip) => ip === '127.0.0.1',
      getRoom: async () => room,
      verifyRoomPassword: async (password) => password === 'segredo',
    });
    servers.push(server);
    const host = participant('host');
    const hosted = await server.hostMeshRoom(description('offer', 'H'), status, host, (event) => hostEvents.push(event));
    expect(hosted.membership).toMatchObject({ roomId: room.id, revision: 1, participants: [expect.objectContaining({ id: host.id })] });
    const discovered = await server.findRoomByCode(hosted.code ?? '', undefined, status);
    expect(discovered).toMatchObject({
      offer: { sessionId: expect.any(String) },
      topology: 'mesh',
      room: { id: room.id, topology: 'mesh' },
    });

    const alpha = participant('alpha');
    const bravo = participant('bravo');
    const charlie = participant('charlie');
    const [alphaJoin, bravoJoin, charlieJoin] = await Promise.all([alpha, bravo, charlie].map((candidate) => server.joinRoomMesh('127.0.0.1', {
      roomId: room.id,
      participant: candidate,
      password: 'segredo',
    })));

    const hostPollSnapshot = await server.pollRoomMesh('127.0.0.1', {
      roomId: room.id,
      participantId: alpha.id,
      resumeToken: alphaJoin.resumeToken,
    });
    expect(hostPollSnapshot.membership).toMatchObject({ revision: 4 });
    expect(hostPollSnapshot.membership.participants).toHaveLength(4);
    await expect(server.joinRoomMesh('127.0.0.1', { roomId: room.id, participant: participant('delta'), password: 'segredo' }))
      .rejects.toMatchObject({ sessionError: { code: 'room-full' } });

    const alphaAuth = { roomId: room.id, participantId: alpha.id, resumeToken: alphaJoin.resumeToken };
    const bravoAuth = { roomId: room.id, participantId: bravo.id, resumeToken: bravoJoin.resumeToken };
    const signal: RoomMeshSignal = {
      id: 'alpha-offer-000001',
      roomId: room.id,
      membershipRevision: hostPollSnapshot.membership.revision,
      fromParticipantId: alpha.id,
      toParticipantId: bravo.id,
      kind: 'offer',
      description: description('offer', 'A'),
    };
    await server.sendRoomMeshSignal('127.0.0.1', alphaAuth, signal);
    await server.sendRoomMeshSignal('127.0.0.1', alphaAuth, signal);
    const bravoPoll = await server.pollRoomMesh('127.0.0.1', bravoAuth);
    expect(bravoPoll.events.filter((event) => event.type === 'signal')).toEqual([
      expect.objectContaining({ type: 'signal', signal: expect.objectContaining({ fromParticipantId: alpha.id, toParticipantId: bravo.id }) }),
    ]);
    expect(hostEvents.some((event) => typeof event === 'object' && event !== null && 'type' in event && event.type === 'membership')).toBe(true);

    await server.leaveRoomMesh('127.0.0.1', bravoAuth);
    const renewed = await server.pollRoomMesh('127.0.0.1', alphaAuth);
    expect(renewed.membership).toMatchObject({ revision: 5 });
    expect(renewed.membership.participants).toHaveLength(3);
    expect(charlieJoin.membership.revision).toBeGreaterThanOrEqual(2);
  });

  it('allows a member to resume with its opaque token without consuming another slot', async () => {
    const server = new SessionServer(async () => status, {
      port: 0,
      isAllowedIp: (ip) => ip === '127.0.0.1',
      getRoom: async () => room,
      verifyRoomPassword: async () => true,
    });
    servers.push(server);
    await server.hostMeshRoom(description('offer', 'H'), status, participant('host'), () => undefined);
    const guest = participant('guest');
    const first = await server.joinRoomMesh('127.0.0.1', { roomId: room.id, participant: guest, password: 'segredo' });
    const resumed = await server.joinRoomMesh('127.0.0.1', { roomId: room.id, participant: guest, resumeToken: first.resumeToken });

    expect(resumed).toMatchObject({ reconnected: false, resumeToken: first.resumeToken, membership: { revision: 2 } });
    expect(resumed.membership.participants).toHaveLength(2);
  });

  it('keeps a disconnected admission for 30 seconds, then requires credentials again after expiry', async () => {
    let now = Date.parse('2026-08-23T12:00:00.000Z');
    const server = new SessionServer(async () => status, {
      port: 0,
      now: () => now,
      isAllowedIp: (ip) => ip === '127.0.0.1',
      getRoom: async () => room,
      verifyRoomPassword: async (password) => password === 'segredo',
    });
    servers.push(server);
    await server.hostMeshRoom({ ...description('offer', 'H'), expiresAt: '2030-08-23T12:00:00.000Z' }, status, participant('host'), () => undefined);
    const guest = participant('guest');
    const first = await server.joinRoomMesh('127.0.0.1', { roomId: room.id, participant: guest, password: 'segredo' });

    now += 29_999;
    const withinGrace = await server.joinRoomMesh('127.0.0.1', { roomId: room.id, participant: guest, resumeToken: first.resumeToken });
    expect(withinGrace.membership).toMatchObject({ revision: 2 });

    now += 30_001;
    await expect(server.joinRoomMesh('127.0.0.1', { roomId: room.id, participant: guest, resumeToken: first.resumeToken }))
      .rejects.toMatchObject({ sessionError: { code: 'invalid-request' } });
    const rejoined = await server.joinRoomMesh('127.0.0.1', { roomId: room.id, participant: guest, password: 'segredo' });
    expect(rejoined.membership).toMatchObject({ revision: 4, participants: expect.any(Array) });
    expect(rejoined.membership.participants).toHaveLength(2);
  });
});
