import type { ScreenSource } from '../../shared/screen-source';
import type { ChatMessagePayload } from '../../shared/session/media-control';
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
  localUserName: string;
  localUserAvatar?: string;
  remoteUserName: string;
  remoteUserAvatar?: string;
  chatMessages: ChatMessagePayload[];
  sessionModalOpen: boolean;
  chatPanelOpen: boolean;
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
  | { type: 'set-user-name'; name: string }
  | { type: 'set-local-user-name'; userName: string }
  | { type: 'set-local-user-avatar'; avatar?: string }
  | { type: 'set-remote-user-profile'; userName: string; userAvatar?: string }
  | { type: 'set-remote-user-name'; name?: string; userName?: string }
  | { type: 'set-remote-user-avatar'; avatar?: string }
  | { type: 'add-chat-message'; message: ChatMessagePayload }
  | { type: 'delete-chat-message'; id: string }
  | { type: 'toggle-session-modal'; open?: boolean }
  | { type: 'toggle-chat-panel'; open?: boolean }
  | { type: 'tick'; now: number };

const emptyStatus: TailscaleStatus = { state: 'offline', peers: [] };

export const normalizeUserName = (value?: string): string => {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || /^(voc[eê])(\s*\(\s*voc[eê]\s*\))?$/i.test(trimmed)) return 'Usuario';
  return trimmed;
};

export const getSavedUserName = (): string => {
  try {
    const saved = localStorage.getItem('sfscreen_username');
    if (saved && saved.trim()) return normalizeUserName(saved);
  } catch {
    // Local storage may be restricted in some test environments
  }
  return 'Usuario';
};

export const getSavedUserAvatar = (): string | undefined => {
  try {
    const saved = localStorage.getItem('sfscreen_avatar');
    if (saved && saved.trim()) return saved.trim();
  } catch {
    // Ignored
  }
  return undefined;
};

export const getSavedSystemAudio = (): boolean => {
  try {
    const saved = localStorage.getItem('sfscreen_include_system_audio');
    return saved !== null ? saved === 'true' : false;
  } catch {
    return false;
  }
};

export const initialSessionState: SessionUiState = {
  phase: 'checking',
  tailscale: emptyStatus,
  message: 'Verificando o Tailscale…',
  localConfirmed: false,
  remoteConfirmed: false,
  route: 'unknown',
  mediaPhase: 'unselected',
  includeSystemAudio: getSavedSystemAudio(),
  audioPhase: 'unavailable',
  localUserName: getSavedUserName(),
  localUserAvatar: getSavedUserAvatar(),
  remoteUserName: 'Outra pessoa',
  remoteUserAvatar: undefined,
  chatMessages: [],
  sessionModalOpen: false,
  chatPanelOpen: false,
  now: Date.now(),
};


const connectedState = (state: SessionUiState, route = state.route): SessionUiState => ({
  ...state,
  phase: 'connected',
  route,
  sessionModalOpen: false,
  message: 'Conexão verificada. Ambos podem compartilhar a própria tela.',
});

export const sessionReducer = (state: SessionUiState, action: SessionAction): SessionUiState => {
  switch (action.type) {
    case 'status': {
      const recoveredFromNetworkFailure = action.status.state === 'ready'
        && state.phase === 'failed'
        && state.tailscale.state !== 'ready';
      return {
        ...state,
        tailscale: action.status,
        phase: state.phase === 'checking' || recoveredFromNetworkFailure ? (action.status.state === 'ready' ? 'idle' : 'failed') : state.phase,
        error: recoveredFromNetworkFailure ? undefined : state.error,
        message: state.phase === 'checking' || recoveredFromNetworkFailure
          ? (action.status.state === 'ready' ? action.status.message ?? 'Tailscale pronto. Sala ativa.' : action.status.message ?? 'Tailscale indisponível.')
          : state.message,
      };
    }
    case 'begin':
      return {
        ...state,
        phase: action.phase,
        role: action.role,
        message: action.message,
        error: undefined,
        hosted: undefined,
        securityCode: undefined,
        localConfirmed: false,
        remoteConfirmed: false,
        route: 'unknown',
        mediaPhase: action.role === 'host' && state.selectedSource ? 'selected' : (state.mediaPhase === 'sharing' ? 'sharing' : 'unselected'),
        mediaError: undefined,
        audioPhase: state.includeSystemAudio ? (state.mediaPhase === 'sharing' ? state.audioPhase : 'stopped') : 'unavailable',
        audioError: undefined,
        chatMessages: [],
      };
    case 'hosted':
      return {
        ...state,
        hosted: action.hosted,
        sessionModalOpen: true,
        message: 'Sessão pronta. Compartilhe o código com seu convidado.',
      };
    case 'verifying':
      if (state.phase === 'connected') return state;
      return {
        ...state,
        phase: 'verifying',
        sessionModalOpen: true,
        message: action.message,
        securityCode: action.securityCode ?? state.securityCode,
      };
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
      try {
        localStorage.setItem('sfscreen_include_system_audio', String(action.includeSystemAudio));
      } catch {
        // Ignored
      }
      return {
        ...state,
        selectedSource: action.source,
        includeSystemAudio: action.includeSystemAudio,
        mediaPhase: state.mediaPhase === 'sharing' ? 'sharing' : 'selected',
        mediaError: undefined,
        audioPhase: action.includeSystemAudio ? 'stopped' : 'unavailable',
        audioError: undefined,
      };
    case 'source-cleared':
      return {
        ...state,
        selectedSource: undefined,
        includeSystemAudio: false,
        mediaPhase: state.mediaPhase === 'sharing' ? 'sharing' : 'unselected',
        audioPhase: state.mediaPhase === 'sharing' ? state.audioPhase : 'unavailable',
      };
    case 'media':
      return { ...state, mediaPhase: action.phase, mediaError: action.error };
    case 'audio':
      return { ...state, audioPhase: action.phase, audioError: action.error };
    case 'failed':
      return { ...state, phase: 'failed', error: action.message, message: 'Não foi possível concluir a conexão.' };
    case 'closed':
      return {
        ...state,
        phase: 'idle',
        role: undefined,
        hosted: undefined,
        securityCode: undefined,
        localConfirmed: false,
        remoteConfirmed: false,
        route: 'unknown',
        remoteUserName: 'Outra pessoa',
        chatMessages: [],
        sessionModalOpen: false,
        message: 'Chamada ativa. Você está sozinho na sala.',
      };
    case 'set-user-name':
      try { localStorage.setItem('sfscreen_username', normalizeUserName(action.name)); } catch { /* ignore */ }
      return { ...state, localUserName: normalizeUserName(action.name) };
    case 'set-local-user-name':
      try { localStorage.setItem('sfscreen_username', normalizeUserName(action.userName)); } catch { /* ignore */ }
      return { ...state, localUserName: normalizeUserName(action.userName) };
    case 'set-local-user-avatar':
      try {
        if (action.avatar) {
          localStorage.setItem('sfscreen_avatar', action.avatar);
        } else {
          localStorage.removeItem('sfscreen_avatar');
        }
      } catch { /* ignore */ }
      return { ...state, localUserAvatar: action.avatar };
    case 'set-remote-user-profile':
      return {
        ...state,
        remoteUserName: normalizeUserName(action.userName),
        remoteUserAvatar: action.userAvatar,
      };
    case 'set-remote-user-name':
      return { ...state, remoteUserName: normalizeUserName(action.userName ?? action.name) };
    case 'set-remote-user-avatar':
      return { ...state, remoteUserAvatar: action.avatar };
    case 'add-chat-message':

      return { ...state, chatMessages: [...state.chatMessages, action.message] };
    case 'delete-chat-message':
      return { ...state, chatMessages: state.chatMessages.filter((m) => m.id !== action.id) };
    case 'toggle-session-modal':

      return { ...state, sessionModalOpen: action.open ?? !state.sessionModalOpen };
    case 'toggle-chat-panel':
      return { ...state, chatPanelOpen: action.open ?? !state.chatPanelOpen };
    case 'tick':
      return { ...state, now: action.now };
  }
};

