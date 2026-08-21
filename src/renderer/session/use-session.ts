import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { formatSessionCode, normalizeSessionCode } from '../../shared/session/code';
import type { ScreenSource } from '../../shared/screen-source';
import type { SessionError, TailscaleStatus } from '../../shared/session/types';
import { initialSessionState, sessionReducer, type SessionUiState } from './session-machine';
import { WebRtcSession } from './webrtc-session';

const errorMessage = (error: SessionError | Error | unknown): string => {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') return error.message;
  return 'Não foi possível concluir a operação.';
};

const stopTracks = (stream: MediaStream | undefined): void => stream?.getTracks().forEach((track) => track.stop());

export interface SessionModel {
  state: SessionUiState;
  joinCode: string;
  sources: ScreenSource[];
  sourcePickerOpen: boolean;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  setJoinCode: (value: string) => void;
  refresh: () => Promise<TailscaleStatus | undefined>;
  openSourcePicker: () => Promise<void>;
  closeSourcePicker: () => void;
  selectSource: (source: ScreenSource) => Promise<void>;
  host: () => Promise<void>;
  join: () => Promise<void>;
  confirmSecurity: () => void;
  startSharing: () => Promise<void>;
  stopSharing: () => Promise<void>;
  close: () => Promise<void>;
  copyCode: () => Promise<boolean>;
}

export const useSession = (): SessionModel => {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const [joinCode, setJoinCodeState] = useState('');
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | undefined>(undefined);
  const [remoteStream, setRemoteStream] = useState<MediaStream | undefined>(undefined);
  const controllerRef = useRef<WebRtcSession | undefined>(undefined);
  const remoteIpRef = useRef<string | undefined>(undefined);
  const localConfirmedRef = useRef(false);
  const remoteConfirmedRef = useRef(false);
  const localStreamRef = useRef<MediaStream | undefined>(undefined);
  const stoppingMediaRef = useRef(false);

  const refresh = useCallback(async (): Promise<TailscaleStatus | undefined> => {
    try {
      const status = await window.sfscreen.getTailscaleStatus();
      dispatch({ type: 'status', status });
      return status;
    } catch {
      dispatch({ type: 'failed', message: 'Não foi possível consultar o Tailscale.' });
      return undefined;
    }
  }, []);

  const clearSource = useCallback(async (): Promise<void> => {
    await window.sfscreen.clearScreenSource();
    dispatch({ type: 'source-cleared' });
  }, []);

  const stopSharing = useCallback(async (): Promise<void> => {
    if (stoppingMediaRef.current) return;
    stoppingMediaRef.current = true;
    try {
      await controllerRef.current?.removeVideoTrack();
      controllerRef.current?.sendVideoState('stopped');
      stopTracks(localStreamRef.current);
      localStreamRef.current = undefined;
      setLocalStream(() => undefined);
      await clearSource();
      dispatch({ type: 'media', phase: 'stopped' });
    } finally {
      stoppingMediaRef.current = false;
    }
  }, [clearSource]);

  const close = useCallback(async (): Promise<void> => {
    await stopSharing();
    controllerRef.current?.close();
    controllerRef.current = undefined;
    remoteIpRef.current = undefined;
    localConfirmedRef.current = false;
    remoteConfirmedRef.current = false;
    setRemoteStream(undefined);
    await window.sfscreen.stopHostedSession();
    dispatch({ type: 'closed' });
  }, [stopSharing]);

  const createController = useCallback((): WebRtcSession => {
    controllerRef.current?.close();
    const controller = new WebRtcSession({
      onChannelOpen: () => dispatch({ type: 'verifying', message: 'Canal seguro conectado. Compare o código de segurança.' }),
      onControlMessage: (message) => {
        if (message.type === 'security-confirmed') {
          remoteConfirmedRef.current = true;
          dispatch({ type: 'remote-confirmed' });
          if (localConfirmedRef.current) dispatch({ type: 'connected' });
          return;
        }
        if (message.state === 'active') dispatch({ type: 'media', phase: 'sharing' });
        else if (message.state === 'starting') dispatch({ type: 'media', phase: 'starting' });
        else if (message.state === 'failed') {
          setRemoteStream(undefined);
          dispatch({ type: 'media', phase: 'failed', error: 'O apresentador não conseguiu iniciar o compartilhamento.' });
        } else {
          setRemoteStream(undefined);
          dispatch({ type: 'media', phase: 'stopped' });
        }
      },
      onConnectionState: (connectionState) => {
        if (connectionState === 'failed') dispatch({ type: 'failed', message: 'A conexão WebRTC falhou pela interface Tailscale.' });
        if (connectionState === 'connected') {
          void window.sfscreen.getTailscaleStatus().then((status) => {
            const route = status.peers.find((peer) => peer.ip === remoteIpRef.current)?.route;
            if (route) dispatch({ type: 'route', route });
          });
        }
      },
      onRemoteStream: (stream) => setRemoteStream(stream),
    });
    controllerRef.current = controller;
    return controller;
  }, []);

  const startSharing = useCallback(async (): Promise<void> => {
    const controller = controllerRef.current;
    if (!controller || !state.selectedSource || state.phase !== 'connected') return;
    dispatch({ type: 'media', phase: 'starting' });
    controller.sendVideoState('starting');
    let captured: MediaStream | undefined;
    try {
      // This deliberately precedes every await: getDisplayMedia needs the click's transient user activation.
      captured = await navigator.mediaDevices.getDisplayMedia({ audio: false, video: { width: { max: 1920 }, height: { max: 1080 }, frameRate: { max: 30 } } });
      const track = captured.getVideoTracks()[0];
      if (!track) throw new Error('Nenhuma faixa de vídeo foi disponibilizada pelo monitor selecionado.');
      track.contentHint = 'detail';
      track.onended = () => { void stopSharing(); };
      const previous = localStreamRef.current;
      await controller.replaceVideoTrack(track);
      localStreamRef.current = captured;
      setLocalStream(captured);
      stopTracks(previous);
      controller.sendVideoState('active');
      dispatch({ type: 'media', phase: 'sharing' });
    } catch (caught) {
      stopTracks(captured);
      controller.sendVideoState('failed');
      await clearSource();
      dispatch({ type: 'media', phase: 'failed', error: errorMessage(caught) });
    }
  }, [clearSource, state.phase, state.selectedSource, stopSharing]);

  useEffect(() => {
    void refresh();
    const clock = window.setInterval(() => dispatch({ type: 'tick', now: Date.now() }), 1_000);
    const unsubscribe = window.sfscreen.onSessionAnswer((event) => {
      const controller = controllerRef.current;
      if (!controller) return;
      void controller.applyAnswer(event.answer).then((securityCode) => {
        remoteIpRef.current = event.peerIp;
        dispatch({ type: 'verifying', securityCode, message: 'Resposta recebida. Aguarde o canal seguro e compare o código.' });
      }).catch((caught: unknown) => dispatch({ type: 'failed', message: errorMessage(caught) }));
    });
    return () => {
      window.clearInterval(clock);
      unsubscribe();
      stopTracks(localStreamRef.current);
      controllerRef.current?.close();
      void window.sfscreen.clearScreenSource();
      void window.sfscreen.stopHostedSession();
    };
  }, [refresh]);

  const requireReady = useCallback(async (): Promise<TailscaleStatus | undefined> => {
    const status = await refresh();
    if (!status || status.state !== 'ready' || !status.selfIp) {
      dispatch({ type: 'failed', message: status?.message ?? 'Tailscale indisponível.' });
      return undefined;
    }
    return status;
  }, [refresh]);

  const openSourcePicker = useCallback(async (): Promise<void> => {
    const result = await window.sfscreen.listScreenSources();
    if (!result.ok) return dispatch({ type: 'media', phase: 'failed', error: result.error.message });
    setSources(result.value);
    setSourcePickerOpen(true);
  }, []);

  const selectSource = useCallback(async (source: ScreenSource): Promise<void> => {
    const result = await window.sfscreen.selectScreenSource(source.id);
    if (!result.ok) return dispatch({ type: 'media', phase: 'failed', error: result.error.message });
    dispatch({ type: 'source-selected', source });
    setSourcePickerOpen(false);
  }, []);

  const host = useCallback(async (): Promise<void> => {
    if (!state.selectedSource) return void openSourcePicker();
    dispatch({ type: 'begin', role: 'host', phase: 'hosting', message: 'Preparando a conexão segura…' });
    try {
      const status = await requireReady();
      if (!status?.selfIp) return;
      const controller = createController();
      const offer = await controller.createOffer(status.selfIp, crypto.randomUUID(), crypto.randomUUID());
      const result = await window.sfscreen.hostSession(offer);
      if (!result.ok) return dispatch({ type: 'failed', message: result.error.message });
      dispatch({ type: 'hosted', hosted: result.value });
    } catch (caught) {
      controllerRef.current?.close();
      dispatch({ type: 'failed', message: errorMessage(caught) });
    }
  }, [createController, openSourcePicker, requireReady, state.selectedSource]);

  const join = useCallback(async (): Promise<void> => {
    const code = formatSessionCode(joinCode);
    dispatch({ type: 'begin', role: 'viewer', phase: 'searching', message: 'Procurando a sessão na sua tailnet…' });
    try {
      const status = await requireReady();
      if (!status?.selfIp) return;
      const found = await window.sfscreen.findSession(code);
      if (!found.ok) return dispatch({ type: 'failed', message: found.error.message });
      remoteIpRef.current = found.value.hostIp;
      dispatch({ type: 'begin', role: 'viewer', phase: 'negotiating', message: 'Sessão encontrada. Criando conexão segura…' });
      const controller = createController();
      const { answer, securityCode } = await controller.createAnswer(found.value.offer, status.selfIp);
      dispatch({ type: 'verifying', securityCode, message: 'Resposta enviada. Aguarde o canal seguro e compare o código.' });
      const submitted = await window.sfscreen.submitAnswer(found.value.hostIp, code, answer);
      if (!submitted.ok) dispatch({ type: 'failed', message: submitted.error.message });
    } catch (caught) {
      controllerRef.current?.close();
      dispatch({ type: 'failed', message: errorMessage(caught) });
    }
  }, [joinCode, createController, requireReady]);

  const confirmSecurity = useCallback((): void => {
    localConfirmedRef.current = true;
    controllerRef.current?.confirmSecurity();
    dispatch({ type: 'local-confirmed' });
    if (remoteConfirmedRef.current) dispatch({ type: 'connected' });
  }, []);

  const setJoinCode = useCallback((value: string): void => setJoinCodeState(normalizeSessionCode(value)), []);
  const copyCode = useCallback(async (): Promise<boolean> => {
    if (!state.hosted) return false;
    try { await navigator.clipboard.writeText(state.hosted.code); return true; } catch { return false; }
  }, [state.hosted]);

  return { state, joinCode, sources, sourcePickerOpen, localStream, remoteStream, setJoinCode, refresh, openSourcePicker, closeSourcePicker: () => setSourcePickerOpen(false), selectSource, host, join, confirmSecurity, startSharing, stopSharing, close, copyCode };
};
