import type { ScreenSource } from '../../shared/screen-source';
import type { HostedSession, TailscaleStatus } from '../../shared/session/types';

export type SessionPhase = 'checking' | 'idle' | 'hosting' | 'searching' | 'negotiating' | 'verifying' | 'connected' | 'failed' | 'closed';
export type SessionRole = 'host' | 'viewer';
export type MediaPhase = 'unselected' | 'selected' | 'starting' | 'sharing' | 'stopped' | 'failed';
export type AudioPhase = 'unavailable' | 'starting' | 'active' | 'stopped' | 'failed';

export interface SessionUiState {
  phase: SessionPhase;
  role?: SessionRole;
  tailscale: TailscaleStatus;
  message: string;
  error?: string;
  hosted?: HostedSession;
  securityCode?: string;
  localConfirmed: boolean;
  remoteConfirmed: boolean;
  route: string;
  mediaPhase: MediaPhase;
  selectedSource?: ScreenSource;
  mediaError?: string;
  includeSystemAudio: boolean;
  audioPhase: AudioPhase;
  audioError?: string;
  now: number;
}

export type SessionAction =
  | { type: 'status'; status: TailscaleStatus }
  | { type: 'begin'; role: SessionRole; phase: 'hosting' | 'searching' | 'negotiating'; message: string }
  | { type: 'hosted'; hosted: HostedSession }
  | { type: 'verifying'; message: string; securityCode?: string }
  | { type: 'local-confirmed' }
  | { type: 'remote-confirmed' }
  | { type: 'connected'; route?: string }
  | { type: 'route'; route: string }
  | { type: 'source-selected'; source: ScreenSource; includeSystemAudio: boolean }
  | { type: 'source-cleared' }
  | { type: 'media'; phase: Exclude<MediaPhase, 'unselected' | 'selected'>; error?: string }
  | { type: 'audio'; phase: AudioPhase; error?: string }
  | { type: 'failed'; message: string }
  | { type: 'closed' }
  | { type: 'tick'; now: number };

const emptyStatus: TailscaleStatus = { state: 'offline', peers: [] };

export const initialSessionState: SessionUiState = {
  phase: 'checking',
  tailscale: emptyStatus,
  message: 'Verificando o Tailscale…',
  localConfirmed: false,
  remoteConfirmed: false,
  route: 'unknown',
  mediaPhase: 'unselected',
  includeSystemAudio: false,
  audioPhase: 'unavailable',
  now: Date.now(),
};

const connectedState = (state: SessionUiState, route = state.route): SessionUiState => ({
  ...state,
  phase: 'connected',
  route,
  message: 'Conexão verificada. Ambos podem compartilhar a própria tela.',
});

export const sessionReducer = (state: SessionUiState, action: SessionAction): SessionUiState => {
  switch (action.type) {
    case 'status':
      return { ...state, tailscale: action.status, phase: state.phase === 'checking' ? action.status.state === 'ready' ? 'idle' : 'failed' : state.phase, message: state.phase === 'checking' ? action.status.state === 'ready' ? 'Tailscale pronto. Crie ou entre em uma sessão.' : action.status.message ?? 'Tailscale indisponível.' : state.message };
    case 'begin':
      return { ...state, phase: action.phase, role: action.role, message: action.message, error: undefined, hosted: undefined, securityCode: undefined, localConfirmed: false, remoteConfirmed: false, route: 'unknown', mediaPhase: action.role === 'host' && state.selectedSource ? 'selected' : 'unselected', mediaError: undefined, audioPhase: state.includeSystemAudio ? 'stopped' : 'unavailable', audioError: undefined };
    case 'hosted':
      return { ...state, hosted: action.hosted, message: 'Sessão pronta. Compartilhe este código com o espectador.' };
    case 'verifying':
      // Handshake events can arrive almost simultaneously. Once connected, never let a late
      // data-channel/open or SDP callback downgrade the UI back to verification.
      if (state.phase === 'connected') return state;
      return { ...state, phase: 'verifying', message: action.message, securityCode: action.securityCode ?? state.securityCode };
    case 'local-confirmed': {
      if (state.localConfirmed) return state;
      const next = { ...state, localConfirmed: true };
      return state.remoteConfirmed ? connectedState(next) : next;
    }
    case 'remote-confirmed': {
      if (state.remoteConfirmed) return state;
      const next = { ...state, remoteConfirmed: true };
      return state.localConfirmed ? connectedState(next) : next;
    }
    case 'connected':
      return connectedState(state, action.route ?? state.route);
    case 'route':
      return { ...state, route: action.route };
    case 'source-selected':
      return { ...state, selectedSource: action.source, includeSystemAudio: action.includeSystemAudio, mediaPhase: state.mediaPhase === 'sharing' ? 'sharing' : 'selected', mediaError: undefined, audioPhase: action.includeSystemAudio ? 'stopped' : 'unavailable', audioError: undefined };
    case 'source-cleared':
      return { ...state, selectedSource: undefined, includeSystemAudio: false, mediaPhase: state.mediaPhase === 'sharing' ? 'sharing' : 'unselected', audioPhase: state.mediaPhase === 'sharing' ? state.audioPhase : 'unavailable' };
    case 'media':
      return { ...state, mediaPhase: action.phase, mediaError: action.error };
    case 'audio':
      return { ...state, audioPhase: action.phase, audioError: action.error };
    case 'failed':
      return { ...state, phase: 'failed', error: action.message, message: 'Não foi possível concluir a sessão.' };
    case 'closed':
      return { ...initialSessionState, phase: 'closed', tailscale: state.tailscale, message: 'Sessão encerrada.', now: state.now };
    case 'tick':
      return { ...state, now: action.now };
  }
};
