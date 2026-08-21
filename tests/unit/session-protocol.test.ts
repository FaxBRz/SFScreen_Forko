import { describe, expect, it } from 'vitest';
import { isSessionDescription } from '../../src/shared/session/protocol';
import { sessionProtocolVersion, type SessionDescription } from '../../src/shared/session/types';

const description: SessionDescription = {
  protocolVersion: sessionProtocolVersion,
  type: 'offer',
  sdp: 'v=0\r\na=fingerprint:sha-256 AA:BB\r\n',
  candidates: [{ candidate: 'candidate:1 1 udp 1 100.90.1.2 43920 typ host', sdpMid: '0', sdpMLineIndex: 0 }],
  fingerprint: 'AA:BB',
  sessionId: 'c29b3549-31d6-48c7-9e2f-c50989b21a15',
  nonce: '1983ac11-44ad-4b5e-9cc5-7c31a5b3f84c',
  expiresAt: '2026-08-21T12:00:00.000Z',
};

describe('session protocol', () => {
  it('accepts the current version and rejects the experimental wire shape', () => {
    expect(isSessionDescription(description, 'offer')).toBe(true);
    expect(isSessionDescription({ ...description, protocolVersion: 0 })).toBe(false);
  });

  it('rejects oversized or malformed candidates', () => {
    expect(isSessionDescription({ ...description, candidates: [{ ...description.candidates[0], candidate: 'x'.repeat(2_049) }] })).toBe(false);
  });
});
