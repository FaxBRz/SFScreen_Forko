import { describe, expect, it } from 'vitest';
import { createSecurityCode, parseMessage, signMessage } from '../../src/shared/signaling';

const payload = {
  version: 1,
  kind: 'invite' as const,
  sessionId: 'session-123',
  createdAt: '2026-08-20T20:00:00.000Z',
  expiresAt: '2026-08-20T20:10:00.000Z',
  nonce: 'nonce-123',
  sdp: 'v=0\r\na=fingerprint:sha-256 AA:BB\r\n',
  candidates: [],
  fingerprint: 'AA:BB',
};

describe('manual signaling', () => {
  it('accepts a valid, unexpired message with an intact checksum', async () => {
    const message = await signMessage(payload);
    await expect(parseMessage(JSON.stringify(message), Date.parse('2026-08-20T20:01:00.000Z'))).resolves.toEqual(message);
  });

  it('rejects a modified message', async () => {
    const message = await signMessage(payload);
    const modified = { ...message, sessionId: 'different-session' };
    await expect(parseMessage(JSON.stringify(modified), Date.parse('2026-08-20T20:01:00.000Z'))).rejects.toThrow('checksum');
  });

  it('derives the same code independently of fingerprint ordering', async () => {
    await expect(createSecurityCode('session-123', 'nonce-123', 'AA:BB', 'CC:DD')).resolves.toEqual(
      await createSecurityCode('session-123', 'nonce-123', 'CC:DD', 'AA:BB'),
    );
  });
});
