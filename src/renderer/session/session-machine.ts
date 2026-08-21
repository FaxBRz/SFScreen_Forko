import type { ScreenSource } from '../../shared/screen-source';
import type { HostedSession, TailscaleStatus } from '../../shared/session/types';

export type SessionPhase = 'checking' | 'idle' | 'hosting' | 'searching' | 'negotiating' | 'verifying' | 'connected' | 'failed' | 'closed';
export type SessionRole = 'host' | 'viewer';
export type MediaPhase = 'unselected' | 'selected' | 'starting' | 'sharing' | 'stopped' | 'failed';

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
  | { type: 'source-selected'; source: ScreenSource }
  | { type: 'source-cleared' }
  | { type: 'media'; phase: Exclude<MediaPhase, 'unselected' | 'selected'>; error?: string }
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
  now: Date.now(),
};

export const sessionReducer = (state: SessionUiState, action: SessionAction): SessionUiState => {
  switch (action.type) {
    case 'status':
      return { ...state, tailscale: action.status, phase: state.phase === 'checking' ? action.status.state === 'ready' ? 'idle' : 'failed' : state.phase, message: state.phase === 'checking' ? action.status.state === 'ready' ? 'Tailscale pronto. Crie ou entre em uma sessão.' : action.status.message ?? 'Tailscale indisponível.' : state.message };
    case 'begin':
      return { ...state, phase: action.phase, role: action.role, message: action.message, error: undefined, hosted: undefined, securityCode: undefined, localConfirmed: false, remoteConfirmed: false, route: 'unknown', mediaPhase: action.role === 'host' && state.selectedSource ? 'selected' : 'unselected', mediaError: undefined };
    case 'hosted':
      return { ...state, hosted: action.hosted, message: 'Sessão pronta. Compartilhe este código com o espectador.' };
    case 'verifying':
      return { ...state, phase: 'verifying', message: action.message, securityCode: action.securityCode ?? state.securityCode };
    case 'local-confirmed':
      return { ...state, localConfirmed: true };
    case 'remote-confirmed':
      return { ...state, remoteConfirmed: true };
    case 'connected':
      return { ...state, phase: 'connected', route: action.route ?? state.route, message: 'Conexão verificada. O apresentador controla o início do vídeo.' };
    case 'route':
      return { ...state, route: action.route };
    case 'source-selected':
      return { ...state, selectedSource: action.source, mediaPhase: state.mediaPhase === 'sharing' ? 'sharing' : 'selected', mediaError: undefined };
    case 'source-cleared':
      return { ...state, selectedSource: undefined, mediaPhase: state.mediaPhase === 'sharing' ? 'sharing' : 'unselected' };
    case 'media':
      return { ...state, mediaPhase: action.phase, mediaError: action.error };
    case 'failed':
      return { ...state, phase: 'failed', error: action.message, message: 'Não foi possível concluir a sessão.' };
    case 'closed':
      return { ...initialSessionState, phase: 'closed', tailscale: state.tailscale, message: 'Sessão encerrada.', now: state.now };
    case 'tick':
      return { ...state, now: action.now };
  }
};
