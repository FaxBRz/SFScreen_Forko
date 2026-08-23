import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fault } from '../../shared/session/errors';
import { formatGeneratedSessionCode, normalizeSessionCode } from '../../shared/session/code';
import {
  isParticipantState,
  isRoomConfigV2,
  isRoomMeshClientAuth,
  isRoomMeshJoinRequest,
  isRoomMeshJoinResult,
  isRoomMeshPollResult,
  isRoomMeshSignal,
  isSessionCode,
  isSessionDescription,
  protocolUpdateMessage,
} from '../../shared/session/protocol';
import { isTailscaleIp, tailscaleHttpUrl } from '../../shared/session/network';
import {
  maxSignalBytes,
  roomInviteLifetimeMs,
  roomMaxCapacity,
  sessionProtocolVersion,
  signalingPort,
  type DiscoveredRoomSession,
  type DiscoveredSession,
  type HostedMeshRoom,
  type HostedRoom,
  type HostedSession,
  type LocalRoomConfig,
  type ParticipantState,
  type RoomMeshClientAuth,
  type RoomMeshEvent,
  type RoomMeshJoinRequest,
  type RoomMeshJoinResult,
  type RoomMeshPollResult,
  type RoomMeshSignal,
  type RoomSummary,
  type SessionAnswerEvent,
  type SessionDescription,
  type TailscaleStatus,
} from '../../shared/session/types';
import { RateLimiter } from './rate-limiter';
import { RoomMeshCoordinator, type MeshAdmissionRejection, type MeshSignalRejection } from './room-mesh-coordinator';

interface ActiveSession {
  code: string;
  offer: SessionDescription;
  /** Only the reusable code expires. A hosted room stays discoverable. */
  expiresAt: number;
  server: Server;
  rateLimiter: RateLimiter;
  expirationTimer?: NodeJS.Timeout;
  meshExpiryTimer?: NodeJS.Timeout;
  onAnswer: (event: SessionAnswerEvent) => void;
  room?: LocalRoomConfig;
  /** Keys are memory-only and are used solely to de-duplicate admissions. */
  admissions: Set<string>;
  /** Present only for the new, coordinator-backed V6 room mesh. */
  mesh?: RoomMeshCoordinator;
}

interface SessionServerDependencies {
  port?: number;
  now?: () => number;
  random?: (size: number) => Uint8Array;
  fetch?: typeof fetch;
  isAllowedIp?: (ip: string) => boolean;
  getRoom?: () => Promise<LocalRoomConfig | undefined>;
  verifyRoomPassword?: (password: string) => Promise<boolean>;
}

const response = (target: ServerResponse, status: number, body?: unknown): void => {
  target.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  target.end(body === undefined ? undefined : JSON.stringify(body));
};

const protocolMismatch = (target: ServerResponse): void => response(target, 426, {
  error: 'Protocol version mismatch',
  requiredProtocolVersion: sessionProtocolVersion,
  message: protocolUpdateMessage,
});

const remoteIp = (request: IncomingMessage): string | undefined => request.socket.remoteAddress?.replace(/^::ffff:/, '');

const readJson = async (request: IncomingMessage): Promise<unknown> => new Promise((resolve, reject) => {
  let size = 0;
  const chunks: Buffer[] = [];
  request.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > maxSignalBytes) {
      reject(fault('invalid-request', 'A solicitação excede o tamanho permitido.'));
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', () => {
    try {
      resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch {
      reject(fault('invalid-request', 'A solicitação não é JSON válido.'));
    }
  });
  request.on('error', reject);
});

const sameCode = (left: string, right: string): boolean => {
  const first = Buffer.from(normalizeSessionCode(left));
  const second = Buffer.from(normalizeSessionCode(right));
  return first.length === 7 && second.length === 7 && timingSafeEqual(first, second);
};

const envelope = (value: unknown): Record<string, unknown> | undefined => typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined;
const validAnswer = (body: Record<string, unknown>, offer: SessionDescription, now: number): body is Record<string, unknown> & { answer: SessionDescription } => body.sessionId === offer.sessionId
  && isSessionDescription(body.answer, 'answer')
  && Date.parse(body.answer.expiresAt) > now;
const hostableState = (status: TailscaleStatus): boolean => (status.state === 'ready' || status.state === 'no-peers') && Boolean(status.selfIp);
const isRoomStatus = (value: unknown): value is NonNullable<RoomSummary['status']> => value === 'open' || value === 'waiting-network' || value === 'full';

export class SessionServer {
  private active?: ActiveSession;
  private port: number;
  private readonly now: () => number;
  private readonly random: (size: number) => Uint8Array;
  private readonly request: typeof fetch;
  private readonly allowedIp: (ip: string) => boolean;
  private readonly getRoomConfig: () => Promise<LocalRoomConfig | undefined>;
  private readonly verifyRoomPassword: (password: string) => Promise<boolean>;
  /** Serializes membership mutations even when password checks complete concurrently. */
  private meshMutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly getTailscaleStatus: () => Promise<TailscaleStatus>,
    dependencies: SessionServerDependencies = {},
  ) {
    this.port = dependencies.port ?? signalingPort;
    this.now = dependencies.now ?? Date.now;
    this.random = dependencies.random ?? randomBytes;
    this.request = dependencies.fetch ?? fetch;
    this.allowedIp = dependencies.isAllowedIp ?? isTailscaleIp;
    this.getRoomConfig = dependencies.getRoom ?? (() => Promise.resolve(undefined));
    this.verifyRoomPassword = dependencies.verifyRoomPassword ?? (() => Promise.resolve(false));
  }

  private capacityFor(room?: LocalRoomConfig): number {
    return room?.capacity === roomMaxCapacity ? room.capacity : roomMaxCapacity;
  }

  private memberCount(active: ActiveSession, room?: LocalRoomConfig): number {
    if (active.mesh && (!room || room.id === active.room?.id)) return active.mesh.snapshot().participants.length;
    return Math.min(this.capacityFor(room ?? active.room), active.admissions.size + 1);
  }

  private isFull(active: ActiveSession, room?: LocalRoomConfig): boolean {
    return this.memberCount(active, room) >= this.capacityFor(room ?? active.room);
  }

  private roomSummary(active: ActiveSession, room: LocalRoomConfig): Omit<RoomSummary, 'hostIp' | 'hostName'> {
    const memberCount = this.memberCount(active, room);
    return {
      id: room.id,
      name: room.name,
      hasPassword: room.hasPassword,
      schemaVersion: room.schemaVersion,
      createdAt: room.createdAt,
      capacity: this.capacityFor(room) as typeof roomMaxCapacity,
      needsPassword: room.needsPassword,
      memberCount,
      status: memberCount >= this.capacityFor(room) ? 'full' : 'open',
      ...(active.mesh ? { topology: 'mesh' as const } : {}),
    };
  }

  private async currentRoom(active: ActiveSession): Promise<LocalRoomConfig | undefined> {
    if (!active.room) return undefined;
    const room = await this.getRoomConfig();
    if (!room || room.id !== active.room.id || !room.hasPassword || room.needsPassword) return undefined;
    return room;
  }

  async host(offer: SessionDescription, status: TailscaleStatus, onAnswer: (event: SessionAnswerEvent) => void, room?: LocalRoomConfig): Promise<HostedSession> {
    if (!hostableState(status) || !status.selfIp) throw fault('tailscale-unavailable', status.message ?? 'Tailscale indisponível.', true);
    if (!isSessionDescription(offer, 'offer')) throw fault('invalid-request', 'A oferta WebRTC é incompatível com esta versão do SFScreen. Atualize os dois computadores.');
    if (Date.parse(offer.expiresAt) <= this.now()) throw fault('session-expired', 'A oferta WebRTC já expirou.');
    if (room && (!room.hasPassword || room.needsPassword)) throw fault('invalid-request', 'Defina uma senha para abrir a sala.');
    await this.stop();

    const code = formatGeneratedSessionCode(this.random(7));
    const expiresAt = this.now() + roomInviteLifetimeMs;
    const server = createServer((request, target) => void this.handle(request, target));
    const active: ActiveSession = {
      code,
      offer,
      expiresAt,
      server,
      // A guest legitimately performs lookup + answer, and may retry after a
      // short reconnect. Keep this small enough to resist code guessing while
      // allowing the four-member room capacity on one tailnet address.
      rateLimiter: new RateLimiter(this.now, 60_000, 12, 30),
      onAnswer,
      room,
      admissions: new Set(),
    };
    // A simple session is removed at expiry. A room listener deliberately stays
    // up so it can remain visible while no peer is online; only its code ends.
    if (!room) {
      active.expirationTimer = setTimeout(() => { void this.stop(); }, roomInviteLifetimeMs);
      active.expirationTimer.unref();
    }
    this.active = active;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(this.port, status.selfIp, () => {
          server.off('error', reject);
          const address = server.address();
          if (address && typeof address !== 'string') this.port = address.port;
          resolve();
        });
      });
    } catch (caught) {
      if (this.active === active) this.active = undefined;
      clearTimeout(active.expirationTimer);
      const codeName = typeof caught === 'object' && caught !== null && 'code' in caught ? String((caught as { code?: unknown }).code) : '';
      throw fault(codeName === 'EACCES' ? 'policy-blocked' : 'tailscale-unavailable', 'Não foi possível abrir a porta de sessão no adaptador Tailscale.', true);
    }
    return {
      code,
      expiresAt: new Date(expiresAt).toISOString(),
      capacity: this.capacityFor(room),
      remainingSlots: this.capacityFor(room) - 1,
    };
  }

  async hostRoom(offer: SessionDescription, status: TailscaleStatus, onAnswer: (event: SessionAnswerEvent) => void): Promise<HostedRoom> {
    const room = await this.getRoomConfig();
    if (!room) throw fault('invalid-request', 'Crie uma sala antes de hospedá-la.');
    if (!room.hasPassword || room.needsPassword) throw fault('invalid-request', 'Defina uma senha para abrir a sala.');
    const hosted = await this.host(offer, status, onAnswer, room);
    return {
      room,
      code: hosted.code,
      expiresAt: hosted.expiresAt,
      memberCount: 1,
    };
  }

  /**
   * Starts the V6 coordinator for a room. The listener still only carries
   * signaling envelopes; no media track, stream or RTP is ever handled here.
   * The older `hostRoom` API is intentionally left unchanged while renderer
   * callers migrate one connection at a time.
   */
  async hostMeshRoom(
    offer: SessionDescription,
    status: TailscaleStatus,
    host: ParticipantState,
    onMeshEvent: (event: RoomMeshEvent) => void,
  ): Promise<HostedMeshRoom> {
    if (!isParticipantState(host)) throw fault('invalid-request', 'O participante anfitrião da sala é inválido.');
    const hosted = await this.hostRoom(offer, status, () => undefined);
    const active = this.active;
    if (!active?.room) throw fault('unknown', 'A sala não permaneceu ativa após iniciar o coordenador.');
    active.mesh = new RoomMeshCoordinator({
      roomId: active.room.id,
      host,
      random: this.random,
      now: this.now,
      onHostEvent: onMeshEvent,
    });
    active.meshExpiryTimer = setInterval(() => {
      if (this.active !== active) return;
      active.mesh?.expireInactive();
    }, 1_000);
    active.meshExpiryTimer.unref();
    return { ...hosted, membership: active.mesh.snapshot() };
  }

  /** Sends a direct-peer signaling envelope from the local host renderer. */
  sendHostedRoomMeshSignal(signal: RoomMeshSignal): void {
    const active = this.active;
    if (!active?.mesh || !isRoomMeshSignal(signal)) throw fault('invalid-request', 'O sinal da malha da sala é inválido.');
    const delivered = active.mesh.deliverFromHost(signal);
    if (delivered.accepted) return;
    throw fault(this.meshSignalErrorCode(delivered.reason), this.meshSignalErrorMessage(delivered.reason), delivered.reason === 'stale-membership');
  }

  private async withMeshMutation<T>(operation: () => Promise<T> | T): Promise<T> {
    const previous = this.meshMutationQueue;
    let release: (() => void) | undefined;
    this.meshMutationQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release?.();
    }
  }

  private async meshCredentialState(active: ActiveSession, request: Pick<RoomMeshJoinRequest, 'password' | 'inviteCode'>): Promise<'valid' | 'expired' | 'invalid'> {
    const passwordValid = typeof request.password === 'string' && await this.verifyRoomPassword(request.password);
    const codeValid = isSessionCode(request.inviteCode) && sameCode(request.inviteCode, active.code) && !this.codeExpired(active);
    if (passwordValid || codeValid) return 'valid';
    if (isSessionCode(request.inviteCode) && sameCode(request.inviteCode, active.code) && this.codeExpired(active)) return 'expired';
    return 'invalid';
  }

  private meshAdmissionErrorMessage(reason: MeshAdmissionRejection): string {
    switch (reason) {
      case 'room-full': return 'A sala já possui quatro participantes.';
      case 'invalid-resume-token': return 'A retomada da sala não é válida neste computador.';
      case 'already-member': return 'Este participante já está na sala.';
    }
  }

  private meshSignalErrorCode(reason: MeshSignalRejection): 'invalid-request' | 'session-busy' {
    return reason === 'stale-membership' ? 'session-busy' : 'invalid-request';
  }

  private meshSignalErrorMessage(reason: MeshSignalRejection): string {
    switch (reason) {
      case 'stale-membership': return 'A lista de participantes mudou. Atualize a sala antes de negociar novamente.';
      case 'unknown-target': return 'O participante de destino não está mais na sala.';
      case 'not-host': return 'Somente o anfitrião pode enviar este sinal local.';
      case 'not-member': return 'A credencial temporária da sala não é válida.';
      case 'duplicate-signal': return 'O sinal da sala já foi processado.';
    }
  }

  async stop(): Promise<void> {
    const active = this.active;
    this.active = undefined;
    if (!active) return;
    clearTimeout(active.expirationTimer);
    clearInterval(active.meshExpiryTimer);
    if (!active.server.listening) return;
    await new Promise<void>((resolve) => active.server.close(() => resolve()));
  }

  private async isAllowedPeer(ip: string): Promise<boolean> {
    const status = await this.getTailscaleStatus();
    return status.state === 'ready' && status.peers.some((peer) => peer.online && peer.ip === ip);
  }

  private admissionKey(ip: string, answer: SessionDescription): string {
    return `${ip}\u0000${answer.fingerprint}\u0000${answer.nonce}`;
  }

  private acceptAdmission(active: ActiveSession, ip: string, answer: SessionDescription, room?: LocalRoomConfig): 'accepted' | 'duplicate' | 'full' {
    const key = this.admissionKey(ip, answer);
    if (active.admissions.has(key)) return 'duplicate';
    if (this.isFull(active, room)) return 'full';
    active.admissions.add(key);
    active.onAnswer({ answer, peerIp: ip });
    return 'accepted';
  }

  private handleAdmission(active: ActiveSession, target: ServerResponse, ip: string, answer: SessionDescription, room?: LocalRoomConfig): void {
    const state = this.acceptAdmission(active, ip, answer, room);
    if (state === 'full') return response(target, 409, { error: 'Room full' });
    response(target, 204);
  }

  private codeExpired(active: ActiveSession): boolean {
    return this.now() >= active.expiresAt;
  }

  private async handleMeshRequest(active: ActiveSession, url: string, target: ServerResponse, _ip: string, body: Record<string, unknown>): Promise<void> {
    const mesh = active.mesh;
    const room = await this.currentRoom(active);
    if (!mesh || !room) return response(target, 404, { error: 'Not found' });

    if (url === '/v1/room/mesh/join') {
      if (!isRoomMeshJoinRequest(body) || body.roomId !== room.id) return response(target, 400, { error: 'Invalid request' });
      const joined = await this.withMeshMutation(async () => {
        if (this.active !== active || active.mesh !== mesh) return { state: 'stopped' as const };
        mesh.expireInactive();
        // A known member can resume exclusively with its opaque in-memory
        // token. A first admission always needs either room password or code.
        const isResume = typeof body.resumeToken === 'string' && mesh.hasParticipant(body.participant.id);
        if (!isResume) {
          const credential = await this.meshCredentialState(active, body);
          if (credential !== 'valid') return { state: credential };
        }
        const admission = mesh.admit(body.participant, body.resumeToken);
        return admission.accepted ? { state: 'accepted' as const, result: admission.result } : { state: admission.reason };
      });
      if (joined.state === 'accepted') return response(target, 200, joined.result);
      if (joined.state === 'room-full') return response(target, 409, { error: 'Room full' });
      if (joined.state === 'expired') return response(target, 404, { error: 'Invite expired' });
      if (joined.state === 'already-member') return response(target, 409, { error: 'Participant already joined' });
      if (joined.state === 'invalid-resume-token' || joined.state === 'invalid') return response(target, 403, { error: 'Invalid room credential' });
      return response(target, 404, { error: 'Not found' });
    }

    if (url === '/v1/room/mesh/poll') {
      const auth = body.auth;
      const afterSequence = body.afterSequence;
      if (!isRoomMeshClientAuth(auth) || (afterSequence !== undefined && (!Number.isSafeInteger(afterSequence) || typeof afterSequence !== 'number' || afterSequence < 0))) return response(target, 400, { error: 'Invalid request' });
      const polled = mesh.poll(auth, typeof afterSequence === 'number' ? afterSequence : 0);
      if (!polled) return response(target, 403, { error: 'Invalid room credential' });
      return response(target, 200, polled);
    }

    if (url === '/v1/room/mesh/signal') {
      const auth = body.auth;
      const signal = body.signal;
      if (!isRoomMeshClientAuth(auth) || !isRoomMeshSignal(signal) || signal.roomId !== auth.roomId) return response(target, 400, { error: 'Invalid request' });
      const delivered = await this.withMeshMutation(() => mesh.deliverFromMember(auth, signal));
      if (delivered.accepted) return response(target, 204);
      if (delivered.reason === 'not-member') return response(target, 403, { error: 'Invalid room credential' });
      if (delivered.reason === 'stale-membership') return response(target, 409, { error: 'Stale membership' });
      return response(target, 409, { error: 'Unknown mesh target' });
    }

    if (url === '/v1/room/mesh/leave') {
      const auth = body.auth;
      if (!isRoomMeshClientAuth(auth)) return response(target, 400, { error: 'Invalid request' });
      const left = await this.withMeshMutation(() => mesh.leave(auth));
      return response(target, left ? 204 : 403, left ? undefined : { error: 'Invalid room credential' });
    }

    return response(target, 404, { error: 'Not found' });
  }

  private async handle(request: IncomingMessage, target: ServerResponse): Promise<void> {
    const active = this.active;
    const ip = remoteIp(request);
    if (!active || !ip || !this.allowedIp(ip) || !await this.isAllowedPeer(ip)) return response(target, 404, { error: 'Not found' });
    if (request.method !== 'POST') return response(target, 404, { error: 'Not found' });

    let body: Record<string, unknown> | undefined;
    try {
      body = envelope(await readJson(request));
    } catch {
      return response(target, 400, { error: 'Invalid request' });
    }
    if (!body) return response(target, 400, { error: 'Invalid request' });
    if (body.protocolVersion !== sessionProtocolVersion) return protocolMismatch(target);

    if (request.url === '/v1/room/info') {
      const room = await this.currentRoom(active);
      if (!room) return response(target, 404, { error: 'Not found' });
      return response(target, 200, { room: this.roomSummary(active, room) });
    }

    if (!active.rateLimiter.allow(ip)) return response(target, 429, { error: 'Too many requests' });

    if (request.url?.startsWith('/v1/room/mesh/')) return this.handleMeshRequest(active, request.url, target, ip, body);

    // A mesh-enabled listener cannot safely accept the old single-controller
    // admission: it would create a member with no participant identity and no
    // way to establish the remaining direct peer pairs. Make the upgrade
    // explicit instead of silently mixing two incompatible room topologies.
    // Code lookup remains discovery-only so a current client can locate the
    // owner and then call the typed mesh admission endpoint. The old answer
    // route stays blocked, preventing a legacy single-controller admission.
    if (active.mesh && request.url?.startsWith('/v1/room/') && request.url !== '/v1/room/code-lookup') return protocolMismatch(target);

    if (request.url === '/v1/room/lookup' || request.url === '/v1/room/answer') {
      const room = await this.currentRoom(active);
      if (!room || body.roomId !== room.id) return response(target, 403, { error: 'Invalid room credential' });
      const passwordValid = typeof body.password === 'string' && await this.verifyRoomPassword(body.password);
      const codeValid = isSessionCode(body.code) && sameCode(body.code, active.code) && !this.codeExpired(active);
      if (!passwordValid && !codeValid) {
        if (isSessionCode(body.code) && sameCode(body.code, active.code) && this.codeExpired(active)) return response(target, 404, { error: 'Invite expired' });
        return response(target, 403, { error: 'Invalid room credential' });
      }
      if (request.url === '/v1/room/lookup') {
        if (this.isFull(active, room)) return response(target, 409, { error: 'Room full' });
        return response(target, 200, { offer: active.offer });
      }
      if (!validAnswer(body, active.offer, this.now())) return response(target, 400, { error: 'Invalid request' });
      return this.handleAdmission(active, target, ip, body.answer, room);
    }

    if (request.url === '/v1/room/code-lookup') {
      const room = await this.currentRoom(active);
      if (!room || !isSessionCode(body.code) || !sameCode(body.code, active.code) || this.codeExpired(active)) return response(target, 404, { error: 'Not found' });
      if (typeof body.password === 'string' && body.password.length > 0 && !await this.verifyRoomPassword(body.password)) return response(target, 403, { error: 'Invalid room password' });
      if (this.isFull(active, room)) return response(target, 409, { error: 'Room full' });
      return response(target, 200, { offer: active.offer, room: this.roomSummary(active, room) });
    }

    if (!isSessionCode(body.code) || !sameCode(body.code, active.code)) return response(target, 404, { error: 'Not found' });
    if (this.codeExpired(active)) {
      if (!active.room) await this.stop();
      return response(target, 404, { error: 'Not found' });
    }
    if (request.url === '/v1/session/lookup') {
      if (this.isFull(active)) return response(target, 409, { error: 'Room full' });
      return response(target, 200, { offer: active.offer });
    }
    if (request.url !== '/v1/session/answer' || !validAnswer(body, active.offer, this.now())) return response(target, 400, { error: 'Invalid request' });
    return this.handleAdmission(active, target, ip, body.answer);
  }

  async discoverRooms(status: TailscaleStatus): Promise<RoomSummary[]> {
    if (status.state !== 'ready') throw fault('tailscale-unavailable', status.message ?? 'Tailscale indisponível.', true);
    const peers = status.peers.filter((peer) => peer.online).slice(0, 16);
    let protocolMismatchFound = false;
    const rooms = await Promise.all(peers.map(async (peer): Promise<RoomSummary | undefined> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1_500);
      try {
        const result = await this.request(tailscaleHttpUrl(peer.ip, this.port, '/v1/room/info'), {
          method: 'POST', body: JSON.stringify({ protocolVersion: sessionProtocolVersion }), headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        });
        if (result.status === 426) {
          protocolMismatchFound = true;
          return undefined;
        }
        if (!result.ok) return undefined;
        const body = envelope(await result.json());
        const room = body?.room;
        if (!isRoomConfigV2(room)) return undefined;
        const value = room as unknown as Record<string, unknown>;
        const memberCount = typeof value.memberCount === 'number' && Number.isSafeInteger(value.memberCount) && value.memberCount >= 1 && value.memberCount <= roomMaxCapacity
          ? value.memberCount
          : undefined;
        return {
          ...room,
          hostIp: peer.ip,
          hostName: peer.name,
          memberCount,
          status: isRoomStatus(value.status) ? value.status : undefined,
        };
      } catch {
        return undefined;
      } finally {
        clearTimeout(timeout);
      }
    }));
    const discovered = rooms.filter((room): room is RoomSummary => room !== undefined);
    if (discovered.length === 0 && protocolMismatchFound) throw fault('update-required', protocolUpdateMessage, false);
    return discovered;
  }

  async findRoom(roomId: string, password: string, status: TailscaleStatus): Promise<DiscoveredSession> {
    const room = (await this.discoverRooms(status)).find((candidate) => candidate.id === roomId);
    if (!room) throw fault('session-not-found', 'A sala não está mais disponível na tailnet.', true);
    const result = await this.request(tailscaleHttpUrl(room.hostIp, this.port, '/v1/room/lookup'), {
      method: 'POST', body: JSON.stringify({ protocolVersion: sessionProtocolVersion, roomId, password }), headers: { 'Content-Type': 'application/json' },
    });
    if (result.status === 426) throw fault('update-required', protocolUpdateMessage, false);
    if (result.status === 403) throw fault('invalid-request', 'Senha incorreta.', true);
    if (result.status === 409) throw fault('room-full', 'A sala já possui quatro participantes.', true);
    if (!result.ok) throw fault('invalid-response', 'A sala não respondeu ao pedido de entrada.', true);
    const body = envelope(await result.json());
    if (!body || !isSessionDescription(body.offer, 'offer')) throw fault('invalid-response', 'A oferta da sala é inválida. Atualize os dois computadores.', false);
    return { hostIp: room.hostIp, offer: body.offer, ...(room.topology ? { topology: room.topology } : {}) };
  }

  /** Code is sufficient for entry; a supplied password is verified as an extra guard. */
  async findRoomByCode(code: string, password: string | undefined, status: TailscaleStatus): Promise<DiscoveredRoomSession> {
    if (!isSessionCode(code)) throw fault('invalid-request', 'Digite um código válido no formato XXX-XXX-X.');
    if (status.state !== 'ready') throw fault('tailscale-unavailable', status.message ?? 'Tailscale indisponível.', true);
    const peers = status.peers.filter((peer) => peer.online).slice(0, 16);
    let protocolMismatchFound = false;
    let full = false;
    let badPassword = false;
    const results = await Promise.all(peers.map(async (peer): Promise<DiscoveredRoomSession | undefined> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1_500);
      try {
        const result = await this.request(tailscaleHttpUrl(peer.ip, this.port, '/v1/room/code-lookup'), {
          method: 'POST',
          body: JSON.stringify({ protocolVersion: sessionProtocolVersion, code, ...(password === undefined ? {} : { password }) }),
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        });
        if (result.status === 426) {
          protocolMismatchFound = true;
          return undefined;
        }
        if (result.status === 409) {
          full = true;
          return undefined;
        }
        if (result.status === 403) {
          badPassword = true;
          return undefined;
        }
        if (!result.ok) return undefined;
        const body = envelope(await result.json());
        if (!body || !isSessionDescription(body.offer, 'offer') || !isRoomConfigV2(body.room)) {
          protocolMismatchFound = true;
          return undefined;
        }
        const wireRoom = body.room as unknown as Record<string, unknown>;
        const memberCount = typeof wireRoom.memberCount === 'number' && Number.isSafeInteger(wireRoom.memberCount) && wireRoom.memberCount >= 1 && wireRoom.memberCount <= roomMaxCapacity
          ? wireRoom.memberCount
          : undefined;
        return {
          hostIp: peer.ip,
          offer: body.offer,
          ...(wireRoom.topology === 'mesh' ? { topology: 'mesh' as const } : {}),
          room: {
            ...body.room,
            hostIp: peer.ip,
            hostName: peer.name,
            memberCount,
            status: isRoomStatus(wireRoom.status) ? wireRoom.status : undefined,
          },
        };
      } catch {
        return undefined;
      } finally {
        clearTimeout(timeout);
      }
    }));
    const rooms = results.filter((result): result is DiscoveredRoomSession => result !== undefined);
    if (rooms.length > 1) throw fault('session-busy', 'Foram encontradas salas ambíguas para este código. Peça um novo código.', true);
    if (rooms.length === 1) return rooms[0];
    if (badPassword) throw fault('invalid-request', 'Senha incorreta.', true);
    if (full) throw fault('room-full', 'A sala já possui quatro participantes.', true);
    if (protocolMismatchFound) throw fault('update-required', protocolUpdateMessage, false);
    throw fault('session-not-found', 'Nenhuma sala foi encontrada para este código.', true);
  }

  async submitRoomAnswer(hostIp: string, roomId: string, password: string | undefined, answer: SessionDescription, inviteCode?: string): Promise<void> {
    if (!this.allowedIp(hostIp) || typeof roomId !== 'string' || !isSessionDescription(answer, 'answer') || (password !== undefined && typeof password !== 'string') || (inviteCode !== undefined && !isSessionCode(inviteCode)) || (password === undefined && inviteCode === undefined)) throw fault('invalid-request', 'A resposta da sala é inválida.');
    const result = await this.request(tailscaleHttpUrl(hostIp, this.port, '/v1/room/answer'), {
      method: 'POST', body: JSON.stringify({ protocolVersion: sessionProtocolVersion, roomId, ...(password === undefined ? {} : { password }), ...(inviteCode === undefined ? {} : { code: inviteCode }), sessionId: answer.sessionId, answer }), headers: { 'Content-Type': 'application/json' },
    });
    if (result.status === 426) throw fault('update-required', protocolUpdateMessage, false);
    if (result.status === 403) throw fault('invalid-request', 'Senha ou código incorreto.', true);
    if (result.status === 409) throw fault('room-full', 'A sala já possui quatro participantes.', true);
    if (result.status === 404) throw fault('session-expired', 'O código da sala expirou.', true);
    if (!result.ok) throw fault('invalid-response', 'O host recusou a entrada na sala.', true);
  }

  /** Joins the coordinator-backed mesh after the caller has discovered its host. */
  async joinRoomMesh(hostIp: string, request: RoomMeshJoinRequest): Promise<RoomMeshJoinResult> {
    if (!this.allowedIp(hostIp) || !isRoomMeshJoinRequest(request)) throw fault('invalid-request', 'Os dados para entrar na malha da sala são inválidos.');
    const result = await this.request(tailscaleHttpUrl(hostIp, this.port, '/v1/room/mesh/join'), {
      method: 'POST',
      body: JSON.stringify({ protocolVersion: sessionProtocolVersion, ...request }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (result.status === 426) throw fault('update-required', protocolUpdateMessage, false);
    if (result.status === 403) throw fault('invalid-request', 'Senha, código ou retomada da sala incorreto.', true);
    if (result.status === 404) throw fault('session-expired', 'A sala ou o código não está mais disponível.', true);
    if (result.status === 409) throw fault('room-full', 'A sala já possui quatro participantes ou este participante já entrou.', true);
    if (!result.ok) throw fault('invalid-response', 'O coordenador da sala não respondeu à entrada.', true);
    const body = await result.json();
    if (!isRoomMeshJoinResult(body)) throw fault('invalid-response', 'A resposta de entrada da malha é inválida.', false);
    return body;
  }

  /** Polls ordered coordinator events. The returned snapshot heals missed events. */
  async pollRoomMesh(hostIp: string, auth: RoomMeshClientAuth, afterSequence?: number): Promise<RoomMeshPollResult> {
    if (!this.allowedIp(hostIp) || !isRoomMeshClientAuth(auth) || (afterSequence !== undefined && (!Number.isSafeInteger(afterSequence) || afterSequence < 0))) throw fault('invalid-request', 'A retomada da malha da sala é inválida.');
    const result = await this.request(tailscaleHttpUrl(hostIp, this.port, '/v1/room/mesh/poll'), {
      method: 'POST',
      body: JSON.stringify({ protocolVersion: sessionProtocolVersion, auth, ...(afterSequence === undefined ? {} : { afterSequence }) }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (result.status === 426) throw fault('update-required', protocolUpdateMessage, false);
    if (result.status === 403) throw fault('invalid-request', 'A retomada da sala expirou.', true);
    if (!result.ok) throw fault('invalid-response', 'Não foi possível atualizar a malha da sala.', true);
    const body = await result.json();
    if (!isRoomMeshPollResult(body)) throw fault('invalid-response', 'A atualização da malha é inválida.', false);
    return body;
  }

  /** Routes SDP/candidate bundles through the coordinator, never media. */
  async sendRoomMeshSignal(hostIp: string, auth: RoomMeshClientAuth, signal: RoomMeshSignal): Promise<void> {
    if (!this.allowedIp(hostIp) || !isRoomMeshClientAuth(auth) || !isRoomMeshSignal(signal) || auth.roomId !== signal.roomId) throw fault('invalid-request', 'O sinal da malha da sala é inválido.');
    const result = await this.request(tailscaleHttpUrl(hostIp, this.port, '/v1/room/mesh/signal'), {
      method: 'POST',
      body: JSON.stringify({ protocolVersion: sessionProtocolVersion, auth, signal }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (result.status === 426) throw fault('update-required', protocolUpdateMessage, false);
    if (result.status === 403) throw fault('invalid-request', 'A retomada da sala expirou.', true);
    if (result.status === 409) throw fault('session-busy', 'A lista de participantes mudou; atualize a malha antes de tentar novamente.', true);
    if (!result.ok) throw fault('invalid-response', 'O coordenador não aceitou o sinal da malha.', true);
  }

  async leaveRoomMesh(hostIp: string, auth: RoomMeshClientAuth): Promise<void> {
    if (!this.allowedIp(hostIp) || !isRoomMeshClientAuth(auth)) throw fault('invalid-request', 'A saída da malha da sala é inválida.');
    const result = await this.request(tailscaleHttpUrl(hostIp, this.port, '/v1/room/mesh/leave'), {
      method: 'POST',
      body: JSON.stringify({ protocolVersion: sessionProtocolVersion, auth }),
      headers: { 'Content-Type': 'application/json' },
    });
    if (result.status === 426) throw fault('update-required', protocolUpdateMessage, false);
    if (result.status === 403) throw fault('invalid-request', 'A retomada da sala expirou.', true);
    if (!result.ok) throw fault('invalid-response', 'O coordenador não confirmou a saída da sala.', true);
  }

  async find(code: string, status: TailscaleStatus): Promise<DiscoveredSession> {
    if (!isSessionCode(code)) throw fault('invalid-request', 'Digite um código válido no formato XXX-XXX-X.');
    if (status.state !== 'ready') throw fault('tailscale-unavailable', status.message ?? 'Tailscale indisponível.', true);
    const peers = status.peers.filter((peer) => peer.online).slice(0, 8);
    let protocolMismatchFound = false;
    let full = false;
    const results = await Promise.all(peers.map(async (peer) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1_500);
      try {
        const result = await this.request(tailscaleHttpUrl(peer.ip, this.port, '/v1/session/lookup'), {
          method: 'POST',
          body: JSON.stringify({ protocolVersion: sessionProtocolVersion, code }),
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        });
        if (result.status === 426) {
          protocolMismatchFound = true;
          return undefined;
        }
        if (result.status === 409) {
          full = true;
          return undefined;
        }
        if (!result.ok) return undefined;
        const body = envelope(await result.json());
        if (body && !isSessionDescription(body.offer, 'offer')) protocolMismatchFound = true;
        return body && isSessionDescription(body.offer, 'offer') && Date.parse(body.offer.expiresAt) > this.now() ? { hostIp: peer.ip, offer: body.offer } : undefined;
      } catch {
        return undefined;
      } finally {
        clearTimeout(timeout);
      }
    }));
    const sessions = results.filter((result): result is DiscoveredSession => result !== undefined);
    if (sessions.length === 0 && protocolMismatchFound) throw fault('update-required', protocolUpdateMessage, false);
    if (sessions.length === 0 && full) throw fault('room-full', 'A sessão já possui quatro participantes.', true);
    if (sessions.length === 0) throw fault('session-not-found', 'Nenhuma sessão foi encontrada para este código.', true);
    if (sessions.length > 1) throw fault('session-busy', 'Foram encontradas sessões ambíguas para este código. Crie um novo código.', true);
    return sessions[0];
  }

  async submitAnswer(hostIp: string, code: string, answer: SessionDescription): Promise<void> {
    if (!this.allowedIp(hostIp) || !isSessionCode(code) || !isSessionDescription(answer, 'answer')) throw fault('invalid-request', 'A resposta de sessão é inválida.');
    if (Date.parse(answer.expiresAt) <= this.now()) throw fault('session-expired', 'A resposta da sessão já expirou.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6_000);
    try {
      const result = await this.request(tailscaleHttpUrl(hostIp, this.port, '/v1/session/answer'), {
        method: 'POST',
        body: JSON.stringify({ protocolVersion: sessionProtocolVersion, code, sessionId: answer.sessionId, answer }),
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      if (result.status === 426) throw fault('update-required', protocolUpdateMessage, false);
      if (result.status === 409) throw fault('room-full', 'A sessão já possui quatro participantes.', true);
      if (result.status === 404) throw fault('session-expired', 'A sessão expirou ou já foi usada.');
      if (!result.ok) throw fault('invalid-response', 'O apresentador rejeitou a resposta da sessão.', true);
    } catch (caught) {
      if (caught instanceof Error && caught.name === 'AbortError') throw fault('timeout', 'O apresentador não respondeu a tempo.', true);
      throw caught;
    } finally {
      clearTimeout(timeout);
    }
  }
}
