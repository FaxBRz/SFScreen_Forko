import { describe, expect, it } from 'vitest';
import { initialSessionState, sessionReducer } from '../../src/renderer/session/session-machine';

const ready = { state: 'ready' as const, selfIp: '100.90.1.2', peers: [] };

describe('session machine', () => {
  it('moves a hosted session through verification to connected', () => {
    const idle = sessionReducer(initialSessionState, { type: 'status', status: ready });
    const hosting = sessionReducer(idle, { type: 'begin', role: 'host', phase: 'hosting', message: 'Preparando' });
    const hosted = sessionReducer(hosting, { type: 'hosted', hosted: { code: 'K7P-4MX-Q', expiresAt: '2026-08-21T12:00:00.000Z' } });
    const verifying = sessionReducer(hosted, { type: 'verifying', message: 'Compare', securityCode: '123456' });
    const locallyConfirmed = sessionReducer(verifying, { type: 'local-confirmed' });
    const remotelyConfirmed = sessionReducer(locallyConfirmed, { type: 'remote-confirmed' });
    const connected = sessionReducer(remotelyConfirmed, { type: 'connected', route: 'relay' });
    expect(connected).toMatchObject({ phase: 'connected', securityCode: '123456', localConfirmed: true, remoteConfirmed: true, route: 'relay' });
  });

  it('clears transient data when a session is closed', () => {
    const active = { ...initialSessionState, phase: 'verifying' as const, hosted: { code: 'K7P-4MX-Q', expiresAt: '2026-08-21T12:00:00.000Z' }, securityCode: '123456' };
    const closed = sessionReducer(active, { type: 'closed' });
    expect(closed.phase).toBe('closed');
    expect(closed.hosted).toBeUndefined();
    expect(closed.securityCode).toBeUndefined();
  });

  it('keeps media state independent from the verified connection', () => {
    const source = { id: 'screen:1', name: 'Monitor 1', thumbnailDataUrl: 'data:image/png;base64,' };
    const selected = sessionReducer(initialSessionState, { type: 'source-selected', source });
    const connected = sessionReducer(selected, { type: 'connected' });
    const sharing = sessionReducer(connected, { type: 'media', phase: 'sharing' });
    const stopped = sessionReducer(sharing, { type: 'media', phase: 'stopped' });
    expect(stopped.phase).toBe('connected');
    expect(stopped.mediaPhase).toBe('stopped');
  });
});
