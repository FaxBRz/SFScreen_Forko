import { afterEach, describe, expect, it } from 'vitest';
import { SessionServer } from '../../src/main/tailscale/session-server';
import { sessionProtocolVersion, type SessionDescription, type TailscaleStatus } from '../../src/shared/session/types';

const loopbackStatus: TailscaleStatus = { state: 'ready', selfIp: '127.0.0.1', peers: [{ id: 'viewer', name: 'viewer', ip: '127.0.0.1', online: true, route: 'direct' }] };
const offer: SessionDescription = { protocolVersion: sessionProtocolVersion, type: 'offer', sdp: 'v=0\r\na=fingerprint:sha-256 AA:BB\r\n', candidates: [{ candidate: 'candidate:1 1 udp 1 100.90.1.2 43920 typ host', sdpMid: '0', sdpMLineIndex: 0 }], fingerprint: 'AA:BB', sessionId: 'c29b3549-31d6-48c7-9e2f-c50989b21a15', nonce: '1983ac11-44ad-4b5e-9cc5-7c31a5b3f84c', expiresAt: '2030-08-21T12:00:00.000Z' };
const answer: SessionDescription = { ...offer, type: 'answer', sdp: 'v=0\r\na=fingerprint:sha-256 CC:DD\r\n', fingerprint: 'CC:DD' };

describe('session server integration', () => {
  const servers: SessionServer[] = [];
  afterEach(async () => { await Promise.all(servers.splice(0).map((server) => server.stop())); });

  it('discovers, answers and closes a one-time loopback session', async () => {
    let received: SessionDescription | undefined;
    const server = new SessionServer(async () => loopbackStatus, { port: 0, random: () => new Uint8Array(7), isAllowedIp: (ip) => ip === '127.0.0.1' });
    servers.push(server);
    const hosted = await server.host(offer, loopbackStatus, (event) => { received = event.answer; });
    expect(hosted.code).toBe('222-222-2');
    const found = await server.find(hosted.code, loopbackStatus);
    expect(found.offer.sessionId).toBe(offer.sessionId);
    await server.submitAnswer(found.hostIp, hosted.code, answer);
    expect(received?.fingerprint).toBe('CC:DD');
    await expect(server.find(hosted.code, loopbackStatus)).rejects.toMatchObject({ sessionError: { code: 'session-not-found' } });
  });

  it('rejects an expired offer before opening a listener', async () => {
    const server = new SessionServer(async () => loopbackStatus, { port: 0, isAllowedIp: (ip) => ip === '127.0.0.1' });
    servers.push(server);
    await expect(server.host({ ...offer, expiresAt: '2020-01-01T00:00:00.000Z' }, loopbackStatus, () => undefined)).rejects.toMatchObject({ sessionError: { code: 'session-expired' } });
  });

  it('discovers and authenticates a password room over the tailnet transport', async () => {
    let received: SessionDescription | undefined;
    const room = { id: 'room-123', name: 'Sala Privada', hasPassword: true };
    const server = new SessionServer(async () => loopbackStatus, {
      port: 0,
      isAllowedIp: (ip) => ip === '127.0.0.1',
      getRoom: async () => room,
      verifyRoomPassword: async (password) => password === 'segredo',
    });
    servers.push(server);
    await server.hostRoom(offer, loopbackStatus, (event) => { received = event.answer; });
    expect(await server.discoverRooms(loopbackStatus)).toEqual([{ ...room, hostIp: '127.0.0.1', hostName: 'viewer' }]);
    await expect(server.findRoom(room.id, 'incorreta', loopbackStatus)).rejects.toMatchObject({ sessionError: { message: 'Senha incorreta.' } });
    const found = await server.findRoom(room.id, 'segredo', loopbackStatus);
    await server.submitRoomAnswer(found.hostIp, room.id, 'segredo', answer);
    expect(received?.fingerprint).toBe('CC:DD');
  });

  it('reports an incompatible protocol version clearly', async () => {
    const server = new SessionServer(async () => loopbackStatus, { fetch: async () => new Response(undefined, { status: 426 }), isAllowedIp: () => true });
    servers.push(server);
    await expect(server.find('222-222-2', loopbackStatus)).rejects.toMatchObject({ sessionError: { code: 'invalid-response' } });
  });

  it('uses protocol V2 for both signaling envelopes', async () => {
    const bodies: Record<string, unknown>[] = [];
    const server = new SessionServer(async () => loopbackStatus, {
      fetch: async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(undefined, { status: bodies.length === 1 ? 404 : 204 });
      },
      isAllowedIp: () => true,
    });
    servers.push(server);
    await expect(server.find('222-222-2', loopbackStatus)).rejects.toMatchObject({ sessionError: { code: 'session-not-found' } });
    await server.submitAnswer('127.0.0.1', '222-222-2', answer);
    expect(bodies).toHaveLength(2);
    expect(bodies.every((body) => body.protocolVersion === sessionProtocolVersion)).toBe(true);
  });
});
