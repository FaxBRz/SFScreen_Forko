// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const model = (state = readyState({ selectedSource: { id: 'screen:1', name: 'Monitor 1', thumbnailDataUrl: 'data:image/png;base64,' }, mediaPhase: 'selected' })): SessionModel => ({
  state,
  joinCode: '',
  sources: [],
  sourcePickerOpen: false,
  localStream: undefined,
  remoteStream: undefined,
  setJoinCode: vi.fn(),
  refresh: vi.fn(async () => state.tailscale),
  openSourcePicker: vi.fn(async () => undefined),
  closeSourcePicker: vi.fn(),
  selectSource: vi.fn(async () => undefined),
  host: vi.fn(async () => undefined),
  join: vi.fn(async () => undefined),
  confirmSecurity: vi.fn(),
  startSharing: vi.fn(async () => undefined),
  stopSharing: vi.fn(async () => undefined),
  stopAudio: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
  copyCode: vi.fn(async () => true),
  exportDiagnostics: vi.fn(async () => true),
});

describe('session dashboard', () => {
  afterEach(cleanup);
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

  it('shows the monitor picker and starts only after verification', () => {
    const current = model();
    current.sourcePickerOpen = true;
    current.sources = [{ id: 'screen:1', name: 'Monitor principal', thumbnailDataUrl: 'data:image/png;base64,' }];
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);
    expect(screen.getByRole('dialog', { name: 'Escolha o que compartilhar' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Monitor principal' }));
    expect(current.selectSource).toHaveBeenCalledOnce();
  });

  it('keeps system audio opt-in in the source picker', () => {
    const current = model();
    current.sourcePickerOpen = true;
    current.sources = [{ id: 'screen:1', name: 'Monitor principal', thumbnailDataUrl: 'data:image/png;base64,' }];
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);
    const option = screen.getByRole('checkbox', { name: /compartilhar áudio do sistema/i });
    expect((option as HTMLInputElement).checked).toBe(false);
    fireEvent.click(option);
    fireEvent.click(screen.getByRole('button', { name: 'Monitor principal' }));
    expect(current.selectSource).toHaveBeenCalledWith(current.sources[0], true);
  });
});
