import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fault } from '../../shared/session/errors';
import { formatGeneratedSessionCode, normalizeSessionCode } from '../../shared/session/code';
import { isTailscaleIp, tailscaleHttpUrl } from '../../shared/session/network';
import { isSessionCode, isSessionDescription } from '../../shared/session/protocol';
import { maxSignalBytes, sessionLifetimeMs, signalingPort, type DiscoveredSession, type HostedSession, type SessionAnswerEvent, type SessionDescription, type TailscaleStatus } from '../../shared/session/types';
import { RateLimiter } from './rate-limiter';

interface ActiveSession {
  code: string;
  offer: SessionDescription;
  expiresAt: number;
  server: Server;
  rateLimiter: RateLimiter;
  expirationTimer: NodeJS.Timeout;
  onAnswer: (event: SessionAnswerEvent) => void;
}

interface SessionServerDependencies {
  port?: number;
  now?: () => number;
  random?: (size: number) => Uint8Array;
  fetch?: typeof fetch;
  isAllowedIp?: (ip: string) => boolean;
}

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

export class SessionServer {
  private active?: ActiveSession;
  private port: number;
  private readonly now: () => number;
  private readonly random: (size: number) => Uint8Array;
  private readonly request: typeof fetch;
  private readonly allowedIp: (ip: string) => boolean;

  constructor(
    private readonly getTailscaleStatus: () => Promise<TailscaleStatus>,
    dependencies: SessionServerDependencies = {},
  ) {
    this.port = dependencies.port ?? signalingPort;
    this.now = dependencies.now ?? Date.now;
    this.random = dependencies.random ?? randomBytes;
    this.request = dependencies.fetch ?? fetch;
    this.allowedIp = dependencies.isAllowedIp ?? isTailscaleIp;
  }

  async host(offer: SessionDescription, status: TailscaleStatus, onAnswer: (event: SessionAnswerEvent) => void): Promise<HostedSession> {
    if (status.state !== 'ready' || !status.selfIp) throw fault('tailscale-unavailable', status.message ?? 'Tailscale indisponível.');
    if (!isSessionDescription(offer, 'offer')) throw fault('invalid-request', 'A oferta WebRTC é incompatível com esta versão do SFScreen.');
    if (Date.parse(offer.expiresAt) <= this.now()) throw fault('session-expired', 'A oferta WebRTC já expirou.');
    await this.stop();

    const code = formatGeneratedSessionCode(this.random(7));
    const expiresAt = this.now() + sessionLifetimeMs;
    const server = createServer((request, target) => void this.handle(request, target));
    const expirationTimer = setTimeout(() => { void this.stop(); }, sessionLifetimeMs);
    expirationTimer.unref();
    const active: ActiveSession = {
      code,
      offer,
      expiresAt,
      server,
      rateLimiter: new RateLimiter(this.now),
      expirationTimer,
      onAnswer,
    };
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
      clearTimeout(expirationTimer);
      const codeName = typeof caught === 'object' && caught !== null && 'code' in caught ? String((caught as { code?: unknown }).code) : '';
      throw fault(codeName === 'EACCES' ? 'policy-blocked' : 'tailscale-unavailable', 'Não foi possível abrir a porta de sessão no adaptador Tailscale.', true);
    }
    return { code, expiresAt: new Date(expiresAt).toISOString() };
  }

  async stop(): Promise<void> {
    const active = this.active;
    this.active = undefined;
    if (!active) return;
    clearTimeout(active.expirationTimer);
    if (!active.server.listening) return;
    await new Promise<void>((resolve) => active.server.close(() => resolve()));
  }

  private async isAllowedPeer(ip: string): Promise<boolean> {
    const status = await this.getTailscaleStatus();
    return status.state === 'ready' && status.peers.some((peer) => peer.online && peer.ip === ip);
  }

  private async handle(request: IncomingMessage, target: ServerResponse): Promise<void> {
    const active = this.active;
    const ip = remoteIp(request);
    if (!active || !ip || !this.allowedIp(ip) || !await this.isAllowedPeer(ip)) return response(target, 404, { error: 'Not found' });
    if (!active.rateLimiter.allow(ip)) return response(target, 429, { error: 'Too many requests' });
    if (this.now() >= active.expiresAt) {
      await this.stop();
      return response(target, 404, { error: 'Not found' });
    }
    if (request.method !== 'POST') return response(target, 404, { error: 'Not found' });

    let body: Record<string, unknown> | undefined;
    try {
      body = envelope(await readJson(request));
    } catch {
      return response(target, 400, { error: 'Invalid request' });
    }
    if (!body) return response(target, 400, { error: 'Invalid request' });
    if (body.protocolVersion !== 1) return response(target, 426, { error: 'Protocol version mismatch' });
    if (!isSessionCode(body.code) || !sameCode(body.code, active.code)) return response(target, 404, { error: 'Not found' });
    if (request.url === '/v1/session/lookup') return response(target, 200, { offer: active.offer });
    if (request.url !== '/v1/session/answer' || body.sessionId !== active.offer.sessionId || !isSessionDescription(body.answer, 'answer') || Date.parse(body.answer.expiresAt) <= this.now()) return response(target, 400, { error: 'Invalid request' });

    active.onAnswer({ answer: body.answer, peerIp: ip });
    response(target, 204);
    await this.stop();
  }

  async find(code: string, status: TailscaleStatus): Promise<DiscoveredSession> {
    if (!isSessionCode(code)) throw fault('invalid-request', 'Digite um código válido no formato XXX-XXX-X.');
    if (status.state !== 'ready') throw fault('tailscale-unavailable', status.message ?? 'Tailscale indisponível.', true);
    const peers = status.peers.filter((peer) => peer.online).slice(0, 8);
    let protocolMismatch = false;
    const results = await Promise.all(peers.map(async (peer) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1_500);
      try {
        const result = await this.request(tailscaleHttpUrl(peer.ip, this.port, '/v1/session/lookup'), {
          method: 'POST',
          body: JSON.stringify({ protocolVersion: 1, code }),
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
        });
        if (result.status === 426) {
          protocolMismatch = true;
          return undefined;
        }
        if (!result.ok) return undefined;
        const body = envelope(await result.json());
        if (body && !isSessionDescription(body.offer, 'offer')) protocolMismatch = true;
        return body && isSessionDescription(body.offer, 'offer') && Date.parse(body.offer.expiresAt) > this.now() ? { hostIp: peer.ip, offer: body.offer } : undefined;
      } catch {
        return undefined;
      } finally {
        clearTimeout(timeout);
      }
    }));
    const sessions = results.filter((result): result is DiscoveredSession => result !== undefined);
    if (sessions.length === 0 && protocolMismatch) throw fault('invalid-response', 'Uma sessão respondeu com versão incompatível do SFScreen. Atualize os dois computadores.', false);
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
        body: JSON.stringify({ protocolVersion: 1, code, sessionId: answer.sessionId, answer }),
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
      if (result.status === 426) throw fault('invalid-response', 'O apresentador usa uma versão incompatível do SFScreen. Atualize os dois computadores.');
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
