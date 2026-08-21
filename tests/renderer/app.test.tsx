// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/app';
import { initialSessionState, type SessionUiState } from '../../src/renderer/session/session-machine';
import { useSession, type SessionModel } from '../../src/renderer/session/use-session';

vi.mock('../../src/renderer/session/use-session', () => ({ useSession: vi.fn() }));

const readyState = (overrides: Partial<SessionUiState> = {}): SessionUiState => ({
  ...initialSessionState,
  phase: 'idle',
  tailscale: { state: 'ready', selfIp: '100.90.1.2', peers: [] },
  message: 'Tailscale pronto.',
  ...overrides,
});

const model = (state = readyState()): SessionModel => ({
  state,
  joinCode: '',
  setJoinCode: vi.fn(),
  refresh: vi.fn(async () => state.tailscale),
  host: vi.fn(async () => undefined),
  join: vi.fn(async () => undefined),
  confirmSecurity: vi.fn(),
  close: vi.fn(async () => undefined),
  copyCode: vi.fn(async () => true),
});

describe('session dashboard', () => {
  beforeEach(() => vi.mocked(useSession).mockReturnValue(model()));

  it('shows both focused flows and accepts Enter in the session field', () => {
    const current = model();
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Conecte-se com clareza.' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Criar sessão' }) as HTMLButtonElement).disabled).toBe(false);
    const input = screen.getByLabelText('Código da sessão');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(current.join).toHaveBeenCalledOnce();
  });

  it('emphasizes the one-time code and verification state', () => {
    const current = model(readyState({ phase: 'verifying', hosted: { code: 'K7P-4MX-Q', expiresAt: new Date(Date.now() + 60_000).toISOString() }, securityCode: '123456' }));
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);
    expect(screen.getByText('K7P-4MX-Q')).toBeTruthy();
    expect(screen.getByText('123456')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'O código confere' }));
    expect(current.confirmSecurity).toHaveBeenCalledOnce();
  });
});
