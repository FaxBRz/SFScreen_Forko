import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { formatGeneratedSessionCode, isValidSessionCode, normalizeSessionCode } from '../../shared/session/code';
import { isTailscaleIp } from '../../shared/session/network';
import { maxSignalBytes, sessionLifetimeMs, signalingPort, type DiscoveredSession, type HostedSession, type SessionAnswerEvent, type SessionDescription, type TailscaleStatus } from '../../shared/session/types';

interface ActiveSession {
  code: string;
  offer: SessionDescription;
  allowedPeerIps: Set<string>;
  expiresAt: number;
  server: Server;
  attempts: Map<string, number[]>;
  globalAttempts: number[];
  expirationTimer: NodeJS.Timeout;
  onAnswer: (event: SessionAnswerEvent) => void;
}

const sessionDescriptionIsValid = (value: unknown, expectedType?: 'offer' | 'answer'): value is SessionDescription => {
  if (typeof value !== 'object' || value === null) return false;
  const description = value as Record<string, unknown>;
  return (description.type === 'offer' || description.type === 'answer')
    && (expectedType === undefined || description.type === expectedType)
    && typeof description.sdp === 'string'
    && Array.isArray(description.candidates)
    && typeof description.fingerprint === 'string'
    && typeof description.sessionId === 'string'
    && typeof description.nonce === 'string'
    && typeof description.expiresAt === 'string';
};

const response = (target: ServerResponse, status: number, body?: unknown): void => {
  target.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  target.end(body === undefined ? undefined : JSON.stringify(body));
};

const remoteIp = (request: IncomingMessage): string | undefined => request.socket.remoteAddress?.replace(/^::ffff:/, '');

const readJson = async (request: IncomingMessage): Promise<unknown> => new Promise((resolve, reject) => {
  let size = 0;
  const chunks: Buffer[] = [];
  request.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > maxSignalBytes) {
      reject(new Error('payload-too-large'));
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', () => {
    try {
      resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch {
      reject(new Error('invalid-json'));
    }
  });
  request.on('error', reject);
});

const sameCode = (left: string, right: string): boolean => {
  const first = Buffer.from(normalizeSessionCode(left));
  const second = Buffer.from(normalizeSessionCode(right));
  return first.length === 7 && second.length === 7 && timingSafeEqual(first, second);
};

export class SessionServer {
  private active?: ActiveSession;

  async host(offer: SessionDescription, status: TailscaleStatus, onAnswer: (event: SessionAnswerEvent) => void): Promise<HostedSession> {
    if (status.state !== 'ready' || !status.selfIp) throw new Error(status.message ?? 'Tailscale indisponível.');
    if (!sessionDescriptionIsValid(offer, 'offer')) throw new Error('Oferta WebRTC inválida.');
    await this.stop();

    const code = formatGeneratedSessionCode(randomBytes(7));
    const expiresAt = Date.now() + sessionLifetimeMs;
    const server = createServer((request, target) => void this.handle(request, target));
    const expirationTimer = setTimeout(() => { void this.stop(); }, sessionLifetimeMs);
    expirationTimer.unref();
    this.active = {
      code,
      offer,
      allowedPeerIps: new Set(status.peers.map((peer) => peer.ip)),
      expiresAt,
      server,
      attempts: new Map(),
      globalAttempts: [],
      expirationTimer,
      onAnswer,
    };
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(signalingPort, status.selfIp, () => {
        server.off('error', reject);
        resolve();
      });
    });
    return { code, expiresAt: new Date(expiresAt).toISOString() };
  }

  async stop(): Promise<void> {
    const active = this.active;
    this.active = undefined;
    if (!active) return;
    clearTimeout(active.expirationTimer);
    await new Promise<void>((resolve) => active.server.close(() => resolve()));
  }

  private recordAttempt(active: ActiveSession, ip: string): boolean {
    const now = Date.now();
    active.globalAttempts = active.globalAttempts.filter((time) => time > now - 60_000);
    active.globalAttempts.push(now);
    const attempts = (active.attempts.get(ip) ?? []).filter((time) => time > now - 60_000);
    attempts.push(now);
    active.attempts.set(ip, attempts);
    return attempts.length <= 5 && active.globalAttempts.length <= 30;
  }

  private async handle(request: IncomingMessage, target: ServerResponse): Promise<void> {
    const active = this.active;
    const ip = remoteIp(request);
    if (!active || !ip || !isTailscaleIp(ip) || !active.allowedPeerIps.has(ip)) return response(target, 404, { error: 'Not found' });
    if (!this.recordAttempt(active, ip)) return response(target, 429, { error: 'Too many requests' });
    if (Date.now() >= active.expiresAt) {
      await this.stop();
      return response(target, 404, { error: 'Not found' });
    }
    if (request.method !== 'POST') return response(target, 404, { error: 'Not found' });

    let body: unknown;
    try {
      body = await readJson(request);
    } catch (error) {
      return response(target, error instanceof Error && error.message === 'payload-too-large' ? 413 : 400, { error: 'Invalid request' });
    }
    const submittedCode = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).code : undefined;
    if (typeof submittedCode !== 'string' || !sameCode(submittedCode, active.code)) {
      return response(target, 404, { error: 'Not found' });
    }

    if (request.url === '/v1/session/lookup') return response(target, 200, { offer: active.offer });
    if (request.url !== '/v1/session/answer' || (body as Record<string, unknown>).sessionId !== active.offer.sessionId || !sessionDescriptionIsValid((body as Record<string, unknown>).answer, 'answer')) {
      return response(target, 400, { error: 'Invalid request' });
    }
    const answer = (body as { answer: SessionDescription }).answer;
    active.onAnswer({ answer, peerIp: ip });
    response(target, 204);
    await this.stop();
  }

  async find(code: string, status: TailscaleStatus): Promise<DiscoveredSession> {
    if (!isValidSessionCode(code)) throw new Error('Digite um código válido no formato XXX-XXX-X.');
    if (status.state !== 'ready') throw new Error(status.message ?? 'Tailscale indisponível.');
    const peers = status.peers.slice(0, 8);
    const results = await Promise.all(peers.map(async (peer) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1_500);
      try {
        const result = await fetch(`http://${peer.ip}:${signalingPort}/v1/session/lookup`, {
          method: 'POST', body: JSON.stringify({ code }), headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        });
        if (!result.ok) return undefined;
        const body: unknown = await result.json();
        const offer = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).offer : undefined;
        return sessionDescriptionIsValid(offer, 'offer') ? { hostIp: peer.ip, offer } : undefined;
      } catch {
        return undefined;
      } finally {
        clearTimeout(timeout);
      }
    }));
    const sessions = results.filter((result): result is DiscoveredSession => result !== undefined);
    if (sessions.length !== 1) throw new Error('Sessão não encontrada ou ambígua na tailnet.');
    return sessions[0];
  }

  async submitAnswer(hostIp: string, code: string, answer: SessionDescription): Promise<void> {
    if (!isTailscaleIp(hostIp) || !isValidSessionCode(code) || !sessionDescriptionIsValid(answer, 'answer')) throw new Error('Resposta de sessão inválida.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6_000);
    try {
      const result = await fetch(`http://${hostIp}:${signalingPort}/v1/session/answer`, {
        method: 'POST', body: JSON.stringify({ code, sessionId: answer.sessionId, answer }), headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      });
      if (!result.ok) throw new Error('O apresentador rejeitou a resposta da sessão.');
    } finally {
      clearTimeout(timeout);
    }
  }
}
