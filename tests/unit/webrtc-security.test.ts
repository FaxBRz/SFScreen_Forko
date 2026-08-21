import { describe, expect, it } from 'vitest';
import { securityCodeFor } from '../../src/renderer/session/webrtc-session';

describe('WebRTC security code', () => {
  it('produces the same code on both peers regardless of fingerprint order', async () => {
    const host = await securityCodeFor('c29b3549-31d6-48c7-9e2f-c50989b21a15', '1983ac11-44ad-4b5e-9cc5-7c31a5b3f84c', 'AA:BB', 'CC:DD');
    const viewer = await securityCodeFor('c29b3549-31d6-48c7-9e2f-c50989b21a15', '1983ac11-44ad-4b5e-9cc5-7c31a5b3f84c', 'CC:DD', 'AA:BB');
    expect(host).toMatch(/^\d{6}$/);
    expect(viewer).toBe(host);
  });
});
