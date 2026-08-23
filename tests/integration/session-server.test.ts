import { afterEach, describe, expect, it } from 'vitest';
import { SessionServer } from '../../src/main/tailscale/session-server';
import { roomConfigSchemaVersion, roomInviteLifetimeMs, roomMaxCapacity, sessionProtocolVersion, type LocalRoomConfig, type SessionDescription, type TailscaleStatus } from '../../src/shared/session/types';

const loopbackStatus: TailscaleStatus = { state: 'ready', selfIp: '127.0.0.1', peers: [{ id: 'viewer', name: 'viewer', ip: '127.0.0.1', online: true, route: 'direct' }] };
const noPeersStatus: TailscaleStatus = { state: 'no-peers', selfIp: '127.0.0.1', peers: [], message: 'Nenhum outro computador da tailnet está online.' };
const offer: SessionDescription = { protocolVersion: sessionProtocolVersion, type: 'offer', sdp: 'v=0\r\na=fingerprint:sha-256 AA:BB\r\n', candidates: [{ candidate: 'candidate:1 1 udp 1 100.90.1.2 43920 typ host', sdpMid: '0', sdpMLineIndex: 0 }], fingerprint: 'AA:BB', sessionId: 'c29b3549-31d6-48c7-9e2f-c50989b21a15', nonce: '1983ac11-44ad-4b5e-9cc5-7c31a5b3f84c', expiresAt: '2030-08-21T12:00:00.000Z' };
const answer: SessionDescription = { ...offer, type: 'answer', sdp: 'v=0\r\na=fingerprint:sha-256 CC:DD\r\n', fingerprint: 'CC:DD' };
const room: LocalRoomConfig = {
  schemaVersion: roomConfigSchemaVersion,
  id: 'a'.repeat(32),
  name: 'Sala Privada',
  createdAt: '2026-08-23T12:00:00.000Z',
  capacity: roomMaxCapacity,
  hasPassword: true,
  needsPassword: false,
};

describe('session server integration', () => {
  const servers: SessionServer[] = [];
  afterEach(async () => { await Promise.all(servers.splice(0).map((server) => server.stop())); });

  it('keeps a reusable code open for three guest admissions and rejects the fifth participant', async () => {
    const received: SessionDescription[] = [];
    const server = new SessionServer(async () => loopbackStatus, { port: 0, random: () => new Uint8Array(7), isAllowedIp: (ip) => ip === '127.0.0.1' });
    servers.push(server);
    const hosted = await server.host(offer, loopbackStatus, (event) => { received.push(event.answer); });
    expect(hosted).toMatchObject({ code: '222-222-2', capacity: roomMaxCapacity, remainingSlots: 3 });

    for (let index = 0; index < 3; index += 1) {
      const found = await server.find(hosted.code, loopbackStatus);
      await server.submitAnswer(found.hostIp, hosted.code, { ...answer, fingerprint: `CC:${index}`, nonce: `guest-answer-nonce-${index}` });
    }
    expect(received).toHaveLength(3);
    await expect(server.find(hosted.code, loopbackStatus)).rejects.toMatchObject({ sessionError: { code: 'room-full' } });
  });

  it('accepts a room host while no peer is online and keeps its listener after an answer', async () => {
    let received: SessionDescription | undefined;
    const server = new SessionServer(async () => loopbackStatus, {
      port: 0,
      random: () => new Uint8Array(7),
      isAllowedIp: (ip) => ip === '127.0.0.1',
      getRoom: async () => room,
      verifyRoomPassword: async (password) => password === 'segredo',
    });
    servers.push(server);

    const hosted = await server.hostRoom(offer, noPeersStatus, (event) => { received = event.answer; });
    expect(hosted).toMatchObject({ room, code: '222-222-2', memberCount: 1 });
    expect(await server.discoverRooms(loopbackStatus)).toEqual([{ ...room, hostIp: '127.0.0.1', hostName: 'viewer', memberCount: 1, status: 'open' }]);

    const found = await server.findRoom(room.id, 'segredo', loopbackStatus);
    await server.submitRoomAnswer(found.hostIp, room.id, 'segredo', answer);
    expect(received?.fingerprint).toBe('CC:DD');
    await expect(server.discoverRooms(loopbackStatus)).resolves.toEqual([{ ...room, hostIp: '127.0.0.1', hostName: 'viewer', memberCount: 2, status: 'open' }]);
  });

  it('supports direct room entry by temporary code without a bilateral confirmation', async () => {
    let received: SessionDescription | undefined;
    const server = new SessionServer(async () => loopbackStatus, {
      port: 0,
      random: () => new Uint8Array(7),
      isAllowedIp: (ip) => ip === '127.0.0.1',
      getRoom: async () => room,
      verifyRoomPassword: async (password) => password === 'segredo',
    });
    servers.push(server);
    const hosted = await server.hostRoom(offer, loopbackStatus, (event) => { received = event.answer; });

    const found = await server.findRoomByCode(hosted.code ?? '', undefined, loopbackStatus);
    expect(found).toMatchObject({ hostIp: '127.0.0.1', offer: { sessionId: offer.sessionId }, room: { id: room.id, memberCount: 1 } });
    await server.submitRoomAnswer(found.hostIp, found.room.id, undefined, answer, hosted.code);
    expect(received?.fingerprint).toBe('CC:DD');
    await expect(server.findRoomByCode(hosted.code ?? '', 'incorreta', loopbackStatus)).rejects.toMatchObject({ sessionError: { message: 'Senha incorreta.' } });
  });

  it('keeps room discovery open after the temporary code expires', async () => {
    let now = Date.parse('2026-08-23T12:00:00.000Z');
    const futureOffer = { ...offer, expiresAt: '2026-08-24T12:00:00.000Z' };
    const server = new SessionServer(async () => loopbackStatus, {
      port: 0,
      now: () => now,
      random: () => new Uint8Array(7),
      isAllowedIp: (ip) => ip === '127.0.0.1',
      getRoom: async () => room,
      verifyRoomPassword: async () => true,
    });
    servers.push(server);
    const hosted = await server.hostRoom(futureOffer, loopbackStatus, () => undefined);
    now += roomInviteLifetimeMs + 1;

    await expect(server.findRoomByCode(hosted.code ?? '', undefined, loopbackStatus)).rejects.toMatchObject({ sessionError: { code: 'session-not-found' } });
    await expect(server.discoverRooms(loopbackStatus)).resolves.toHaveLength(1);
  });

  it('rejects an expired offer before opening a listener', async () => {
    const server = new SessionServer(async () => loopbackStatus, { port: 0, isAllowedIp: (ip) => ip === '127.0.0.1' });
    servers.push(server);
    await expect(server.host({ ...offer, expiresAt: '2020-01-01T00:00:00.000Z' }, loopbackStatus, () => undefined)).rejects.toMatchObject({ sessionError: { code: 'session-expired' } });
  });

  it('reports an incompatible protocol version as a required update', async () => {
    const server = new SessionServer(async () => loopbackStatus, { fetch: async () => new Response(undefined, { status: 426 }), isAllowedIp: () => true });
    servers.push(server);
    await expect(server.find('222-222-2', loopbackStatus)).rejects.toMatchObject({ sessionError: { code: 'update-required' } });
  });

  it('uses protocol V6 for signaling and room-code envelopes', async () => {
    const bodies: Record<string, unknown>[] = [];
    const server = new SessionServer(async () => loopbackStatus, {
      fetch: async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(undefined, { status: bodies.length === 3 ? 204 : 404 });
      },
      isAllowedIp: () => true,
    });
    servers.push(server);
    await expect(server.find('222-222-2', loopbackStatus)).rejects.toMatchObject({ sessionError: { code: 'session-not-found' } });
    await expect(server.findRoomByCode('222-222-2', undefined, loopbackStatus)).rejects.toMatchObject({ sessionError: { code: 'session-not-found' } });
    await server.submitAnswer('127.0.0.1', '222-222-2', answer);
    expect(bodies).toHaveLength(3);
    expect(bodies.every((body) => body.protocolVersion === sessionProtocolVersion)).toBe(true);
  });
});
