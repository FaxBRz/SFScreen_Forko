export const signalingVersion = 1;
export const signalLifetimeMs = 10 * 60 * 1000;
export const maxSignalBytes = 256 * 1024;

export type SignalKind = 'invite' | 'answer';

export interface SignalingMessage {
  version: number;
  kind: SignalKind;
  sessionId: string;
  createdAt: string;
  expiresAt: string;
  nonce: string;
  sdp: string;
  candidates: string[];
  fingerprint: string;
  checksum: string;
}

export type SignalingPayload = Omit<SignalingMessage, 'checksum'>;

const canonicalize = (payload: SignalingPayload): string => JSON.stringify({
  version: payload.version,
  kind: payload.kind,
  sessionId: payload.sessionId,
  createdAt: payload.createdAt,
  expiresAt: payload.expiresAt,
  nonce: payload.nonce,
  sdp: payload.sdp,
  candidates: payload.candidates,
  fingerprint: payload.fingerprint,
});

const digest = async (text: string): Promise<string> => {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

const isPayload = (value: unknown): value is SignalingPayload => {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Record<string, unknown>;
  return message.version === signalingVersion
    && (message.kind === 'invite' || message.kind === 'answer')
    && typeof message.sessionId === 'string'
    && typeof message.createdAt === 'string'
    && typeof message.expiresAt === 'string'
    && typeof message.nonce === 'string'
    && typeof message.sdp === 'string'
    && isStringArray(message.candidates)
    && typeof message.fingerprint === 'string';
};

export const signMessage = async (payload: SignalingPayload): Promise<SignalingMessage> => ({
  ...payload,
  checksum: await digest(canonicalize(payload)),
});

export const serializeMessage = (message: SignalingMessage): string => JSON.stringify(message);

export const parseMessage = async (text: string, now = Date.now()): Promise<SignalingMessage> => {
  if (new TextEncoder().encode(text).byteLength > maxSignalBytes) throw new Error('O arquivo excede o tamanho máximo permitido.');

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('O arquivo de sinalização não é um JSON válido.');
  }

  if (!isPayload(value) || typeof (value as Record<string, unknown>).checksum !== 'string') {
    throw new Error('O arquivo de sinalização possui formato incompatível.');
  }

  const message = value as SignalingMessage;
  const createdAt = Date.parse(message.createdAt);
  const expiresAt = Date.parse(message.expiresAt);
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || createdAt > expiresAt || expiresAt <= now) {
    throw new Error('O convite ou resposta expirou.');
  }
  if (expiresAt - createdAt > signalLifetimeMs) throw new Error('A validade do arquivo é inválida.');
  if (!message.sessionId || !message.nonce || !message.sdp || !message.fingerprint) {
    throw new Error('O arquivo de sinalização está incompleto.');
  }

  const expectedChecksum = await digest(canonicalize(message));
  if (message.checksum !== expectedChecksum) throw new Error('O checksum do arquivo não confere.');
  return message;
};

export const createSecurityCode = async (sessionId: string, nonce: string, firstFingerprint: string, secondFingerprint: string): Promise<string> => {
  const [first, second] = [firstFingerprint, secondFingerprint].sort();
  const hash = await digest(`${sessionId}|${nonce}|${first}|${second}`);
  return (Number.parseInt(hash.slice(0, 12), 16) % 1_000_000).toString().padStart(6, '0');
};

export const extractFingerprint = (sdp: string): string => {
  const match = /^a=fingerprint:sha-256\s+(.+)$/im.exec(sdp);
  if (!match?.[1]) throw new Error('A descrição WebRTC não contém fingerprint DTLS.');
  return match[1].trim();
};
