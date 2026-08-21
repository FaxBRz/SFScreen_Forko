import { describe, expect, it } from 'vitest';
import { initialSessionState, sessionReducer } from '../../src/renderer/session/session-machine';

const verifying = {
  ...initialSessionState,
  phase: 'verifying' as const,
  tailscale: { state: 'ready' as const, selfIp: '100.90.1.2', peers: [] },
  message: 'Compare o código.',
  securityCode: '123456',
};

describe('security verification state machine', () => {
  it('connects when local confirmation arrives first', () => {
    const local = sessionReducer(verifying, { type: 'local-confirmed' });
    const connected = sessionReducer(local, { type: 'remote-confirmed' });
    expect(connected.phase).toBe('connected');
    expect(connected.localConfirmed).toBe(true);
    expect(connected.remoteConfirmed).toBe(true);
  });

  it('connects when remote confirmation arrives first', () => {
    const remote = sessionReducer(verifying, { type: 'remote-confirmed' });
    const connected = sessionReducer(remote, { type: 'local-confirmed' });
    expect(connected.phase).toBe('connected');
    expect(connected.localConfirmed).toBe(true);
    expect(connected.remoteConfirmed).toBe(true);
  });

  it('never downgrades a connected session when a late verifying callback arrives', () => {
    const connected = sessionReducer(
      sessionReducer(verifying, { type: 'local-confirmed' }),
      { type: 'remote-confirmed' },
    );
    const late = sessionReducer(connected, { type: 'verifying', message: 'Evento atrasado.' });
    expect(late.phase).toBe('connected');
    expect(late.message).toContain('Conexão verificada');
  });

  it('treats duplicate confirmation messages as idempotent', () => {
    const once = sessionReducer(verifying, { type: 'remote-confirmed' });
    const twice = sessionReducer(once, { type: 'remote-confirmed' });
    expect(twice).toEqual(once);
  });
});
