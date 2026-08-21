import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { formatSessionCode, normalizeSessionCode } from '../../shared/session/code';
import { diagnosticsFormatVersion, type DiagnosticEvent, type DiagnosticsReport, type WebRtcMetrics } from '../../shared/diagnostics';
import type { ScreenSelection, ScreenSource } from '../../shared/screen-source';
import type { SessionError, TailscaleStatus } from '../../shared/session/types';
import { initialSessionState, sessionReducer, type AudioPhase, type MediaPhase, type SessionUiState } from './session-machine';
import { WebRtcSession } from './webrtc-session';

const errorMessage = (error: SessionError | Error | unknown): string => {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') return error.message;
  return 'Não foi possível concluir a operação.';
};

const stopTracks = (stream: MediaStream | undefined): void => stream?.getTracks().forEach((track) => track.stop());

const captureDisplayStream = (includeSystemAudio: boolean): Promise<MediaStream> => {
  const audio = includeSystemAudio ? ({ restrictOwnAudio: true } as MediaTrackConstraints) : false;
  const request = navigator.mediaDevices.getDisplayMedia({ audio, video: true });
  return new Promise<MediaStream>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      request.then(stopTracks).catch(() => undefined);
      reject(new Error('A captura não foi iniciada em 10 segundos.'));
    }, 10_000);
    request.then((stream) => {
      window.clearTimeout(timeout);
      resolve(stream);
    }, (error: unknown) => {
      window.clearTimeout(timeout);
      reject(error);
    });
  });
};

const captureErrorMessage = (error: unknown, state: import('../../shared/screen-source').CaptureAuthorizationState): string => {
  if (state === 'selected') return 'O Electron recusou a captura antes de consultar o autorizador do monitor.';
  if (state === 'request-received') return 'O Electron recebeu o pedido de captura, mas não concluiu a validação da fonte. Escolha o monitor novamente e tente.';
  if (state === 'authorized') return 'O Electron autorizou o monitor, mas não iniciou a stream de captura. Reinicie o app e tente novamente.';
  if (state === 'rejected-frame') return 'A captura foi recusada porque a solicitação não veio da janela principal esperada.';
  if (state === 'rejected-origin') return 'A captura foi recusada porque a origem da solicitação não corresponde ao app.';
  if (state === 'rejected-gesture') return 'A captura foi recusada porque o Electron não identificou um clique válido. Tente novamente pelo botão.';
  if (state === 'rejected-video') return 'A captura foi recusada porque a solicitação não incluía vídeo.';
  if (state === 'rejected-selection') return 'A autorização do monitor expirou antes da captura. Escolha o monitor novamente.';
  if (state === 'rejected-audio') return 'A solicitação de áudio não corresponde ao monitor selecionado.';
  if (state === 'source-unavailable') return 'O monitor selecionado não está mais disponível.';
  return errorMessage(error);
};

export interface SessionModel {
  state: SessionUiState;
  joinCode: string;
  sources: ScreenSource[];
  sourcePickerOpen: boolean;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  remoteMediaPhase?: MediaPhase;
  remoteMediaError?: string;
  remoteAudioPhase?: AudioPhase;
  remoteAudioError?: string;
  setJoinCode: (value: string) => void;
  refresh: () => Promise<TailscaleStatus | undefined>;
  openSourcePicker: () => Promise<void>;
  closeSourcePicker: () => void;
  selectSource: (source: ScreenSource, includeSystemAudio: boolean) => Promise<void>;
  host: () => Promise<void>;
  join: () => Promise<void>;
  confirmSecurity: () => void;
  startSharing: () => Promise<void>;
  stopSharing: () => Promise<void>;
  stopAudio: () => Promise<void>;
  close: () => Promise<void>;
  copyCode: () => Promise<boolean>;
  exportDiagnostics: () => Promise<boolean>;
}

export const useSession = (): SessionModel => {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const [joinCode, setJoinCodeState] = useState('');
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | undefined>(undefined);
  const [remoteStream, setRemoteStream] = useState<MediaStream | undefined>(undefined);
  const [remoteMediaPhase, setRemoteMediaPhase] = useState<MediaPhase>('stopped');
  const [remoteMediaError, setRemoteMediaError] = useState<string | undefined>(undefined);
  const [remoteAudioPhase, setRemoteAudioPhase] = useState<AudioPhase>('unavailable');
  const [remoteAudioError, setRemoteAudioError] = useState<string | undefined>(undefined);
  const controllerRef = useRef<WebRtcSession | undefined>(undefined);
  const remoteIpRef = useRef<string | undefined>(undefined);
  const localConfirmedRef = useRef(false);
  const remoteConfirmedRef = useRef(false);
  const localStreamRef = useRef<MediaStream | undefined>(undefined);
  const capturedSourceIdRef = useRef<string | undefined>(undefined);
  const stoppingMediaRef = useRef(false);
  const sessionStartedAtRef = useRef<number | undefined>(undefined);
  const diagnosticEventsRef = useRef<Array<{ atMs: number; event: DiagnosticEvent }>>([]);
  const metricsRef = useRef<WebRtcMetrics>({});

  const recordDiagnostic = useCallback((event: DiagnosticEvent): void => {
    const startedAt = sessionStartedAtRef.current;
    if (startedAt === undefined || diagnosticEventsRef.current.length >= 500) return;
    diagnosticEventsRef.current.push({ atMs: Math.max(0, Date.now() - startedAt), event });
  }, []);

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

  const stopAudio = useCallback(async (): Promise<void> => {
    const stream = localStreamRef.current;
    if (!stream) return;
    await controllerRef.current?.removeAudioTrack();
    stream.getAudioTracks().forEach((track) => track.stop());
    controllerRef.current?.sendAudioState('stopped');
    dispatch({ type: 'audio', phase: 'stopped' });
    recordDiagnostic('audio-stopped');
  }, [recordDiagnostic]);

  const stopSharing = useCallback(async (): Promise<void> => {
    if (stoppingMediaRef.current) return;
    stoppingMediaRef.current = true;
    try {
      await controllerRef.current?.parkVideoTrack();
      await controllerRef.current?.removeAudioTrack();
      controllerRef.current?.sendVideoState('stopped');
      controllerRef.current?.sendAudioState('stopped');
      stopTracks(localStreamRef.current);
      localStreamRef.current = undefined;
      capturedSourceIdRef.current = undefined;
      setLocalStream(undefined);
      await clearSource();
      dispatch({ type: 'media', phase: 'stopped' });
      dispatch({ type: 'audio', phase: 'stopped' });
      recordDiagnostic('video-stopped');
    } finally {
      stoppingMediaRef.current = false;
    }
  }, [clearSource, recordDiagnostic]);

  const close = useCallback(async (): Promise<void> => {
    await stopSharing();
    controllerRef.current?.close();
    controllerRef.current = undefined;
    remoteIpRef.current = undefined;
    localConfirmedRef.current = false;
    remoteConfirmedRef.current = false;
    setRemoteStream(undefined);
    setRemoteMediaPhase('stopped');
    setRemoteMediaError(undefined);
    setRemoteAudioPhase('unavailable');
    setRemoteAudioError(undefined);
    await window.sfscreen.stopHostedSession();
    recordDiagnostic('session-closed');
    dispatch({ type: 'closed' });
  }, [recordDiagnostic, stopSharing]);

  const createController = useCallback((): WebRtcSession => {
    controllerRef.current?.close();
    const controller = new WebRtcSession({
      onChannelOpen: () => {
        recordDiagnostic('channel-open');
        dispatch({ type: 'verifying', message: 'Canal seguro conectado. Compare o código de segurança.' });
      },
      onControlMessage: (message) => {
        if (message.type === 'security-confirmed') {
          remoteConfirmedRef.current = true;
          dispatch({ type: 'remote-confirmed' });
          if (localConfirmedRef.current) {
            recordDiagnostic('verified');
            dispatch({ type: 'connected' });
          }
          return;
        }
        if (message.type === 'audio-state') {
          setRemoteAudioPhase(message.state);
          setRemoteAudioError(message.state === 'failed' ? 'O áudio remoto não ficou disponível.' : undefined);
          return;
        }
        if (message.state === 'active') {
          setRemoteMediaPhase('sharing');
          setRemoteMediaError(undefined);
        } else if (message.state === 'starting') {
          setRemoteMediaPhase('starting');
          setRemoteMediaError(undefined);
        } else if (message.state === 'failed') {
          setRemoteMediaPhase('failed');
          setRemoteMediaError('A outra pessoa não conseguiu iniciar o compartilhamento.');
        } else {
          setRemoteMediaPhase('stopped');
          setRemoteMediaError(undefined);
        }
      },
      onConnectionState: (connectionState) => {
        if (connectionState === 'failed') {
          recordDiagnostic('connection-failed');
          dispatch({ type: 'failed', message: 'A conexão WebRTC falhou pela interface Tailscale.' });
        }
        if (connectionState === 'connected') {
          void window.sfscreen.getTailscaleStatus().then((status) => {
            const route = status.peers.find((peer) => peer.ip === remoteIpRef.current)?.route;
            if (route) dispatch({ type: 'route', route });
          });
        }
      },
      onRemoteStream: (stream, trackKind) => {
        if (trackKind === 'video') recordDiagnostic('remote-video-track');
        setRemoteStream(stream);
      },
    });
    controllerRef.current = controller;
    return controller;
  }, [recordDiagnostic]);

  const activatePreparedStream = useCallback(async (stream: MediaStream): Promise<void> => {
    const controller = controllerRef.current;
    if (!controller) throw new Error('A sessão WebRTC não está disponível.');
    const videoTrack = stream.getVideoTracks().find((track) => track.readyState === 'live');
    if (!videoTrack) throw new Error('Nenhuma faixa de vídeo foi disponibilizada pelo monitor selecionado.');

    controller.sendVideoState('starting');
    dispatch({ type: 'media', phase: 'starting' });
    recordDiagnostic('video-starting');
    videoTrack.enabled = true;
    await controller.replaceVideoTrack(videoTrack);

    if (state.includeSystemAudio) {
      controller.sendAudioState('starting');
      dispatch({ type: 'audio', phase: 'starting' });
      recordDiagnostic('audio-starting');
      const audioTrack = stream.getAudioTracks().find((track) => track.readyState === 'live');
      if (audioTrack) {
        audioTrack.enabled = true;
        await controller.replaceAudioTrack(audioTrack);
        controller.sendAudioState('active');
        dispatch({ type: 'audio', phase: 'active' });
        recordDiagnostic('audio-active');
      } else {
        controller.sendAudioState('unavailable');
        dispatch({ type: 'audio', phase: 'unavailable', error: 'O Windows não disponibilizou o áudio do sistema.' });
        recordDiagnostic('audio-unavailable');
      }
    } else {
      await controller.removeAudioTrack();
      controller.sendAudioState('unavailable');
      dispatch({ type: 'audio', phase: 'unavailable' });
    }

    controller.sendVideoState('active');
    dispatch({ type: 'media', phase: 'sharing' });
    recordDiagnostic('video-active');
  }, [recordDiagnostic, state.includeSystemAudio]);

  const captureAndAttach = useCallback(async (source: ScreenSource, includeSystemAudio: boolean, selectionAlreadyArmed: boolean): Promise<void> => {
    const controller = controllerRef.current;
    if (!controller || state.phase !== 'connected') return;
    const previous = localStreamRef.current;
    let captured: MediaStream | undefined;

    controller.sendVideoState('starting');
    dispatch({ type: 'media', phase: 'starting' });
    recordDiagnostic('video-starting');
    if (includeSystemAudio) {
      controller.sendAudioState('starting');
      dispatch({ type: 'audio', phase: 'starting' });
      recordDiagnostic('audio-starting');
    }

    try {
      if (!selectionAlreadyArmed) {
        const selection: ScreenSelection = { sourceId: source.id, includeSystemAudio };
        const result = await window.sfscreen.selectScreenSource(selection);
        if (!result.ok) throw new Error(result.error.message);
      }

      captured = await captureDisplayStream(includeSystemAudio);
      const videoTrack = captured.getVideoTracks()[0];
      if (!videoTrack) throw new Error('Nenhuma faixa de vídeo foi disponibilizada pelo monitor selecionado.');
      videoTrack.contentHint = 'detail';
      videoTrack.enabled = true;
      videoTrack.onended = () => { if (localStreamRef.current === captured) void stopSharing(); };
      await controller.replaceVideoTrack(videoTrack);

      if (includeSystemAudio) {
        const audioTrack = captured.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = true;
          audioTrack.onended = () => { if (localStreamRef.current === captured) void stopAudio(); };
          await controller.replaceAudioTrack(audioTrack);
          controller.sendAudioState('active');
          dispatch({ type: 'audio', phase: 'active' });
          recordDiagnostic('audio-active');
        } else {
          await controller.removeAudioTrack();
          controller.sendAudioState('unavailable');
          dispatch({ type: 'audio', phase: 'unavailable', error: 'O Windows não disponibilizou o áudio do sistema.' });
          recordDiagnostic('audio-unavailable');
        }
      } else {
        await controller.removeAudioTrack();
        controller.sendAudioState('unavailable');
        dispatch({ type: 'audio', phase: 'unavailable' });
      }

      localStreamRef.current = captured;
      capturedSourceIdRef.current = source.id;
      setLocalStream(captured);
      if (previous && previous !== captured) stopTracks(previous);
      controller.sendVideoState('active');
      dispatch({ type: 'media', phase: 'sharing' });
      recordDiagnostic('video-active');
    } catch (caught) {
      if (captured && captured !== localStreamRef.current) stopTracks(captured);
      const authorizationState = await window.sfscreen.getCaptureAuthorizationState().catch(() => 'idle' as const);
      const message = captureErrorMessage(caught, authorizationState);
      if (previous?.getVideoTracks().some((track) => track.readyState === 'live')) {
        controller.sendVideoState('active');
        dispatch({ type: 'media', phase: 'sharing', error: message });
      } else {
        controller.sendVideoState('failed');
        controller.sendAudioState('failed');
        dispatch({ type: 'media', phase: 'failed', error: message });
      }
    }
  }, [recordDiagnostic, state.phase, stopAudio, stopSharing]);

  const startSharing = useCallback(async (): Promise<void> => {
    if (!state.selectedSource || state.phase !== 'connected') return;
    const prepared = localStreamRef.current;
    const preparedVideo = prepared?.getVideoTracks().find((track) => track.readyState === 'live');
    if (prepared && preparedVideo && capturedSourceIdRef.current === state.selectedSource.id) {
      try {
        await activatePreparedStream(prepared);
      } catch (caught) {
        controllerRef.current?.sendVideoState('failed');
        dispatch({ type: 'media', phase: 'failed', error: errorMessage(caught) });
      }
      return;
    }
    await captureAndAttach(state.selectedSource, state.includeSystemAudio, true);
  }, [activatePreparedStream, captureAndAttach, state.includeSystemAudio, state.phase, state.selectedSource]);

  useEffect(() => {
    void refresh();
    const clock = window.setInterval(() => dispatch({ type: 'tick', now: Date.now() }), 1_000);
    const metricsTimer = window.setInterval(() => {
      void controllerRef.current?.getMetrics().then((metrics) => { metricsRef.current = metrics; }).catch(() => undefined);
    }, 5_000);
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
      window.clearInterval(metricsTimer);
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

  const selectSource = useCallback(async (source: ScreenSource, includeSystemAudio: boolean): Promise<void> => {
    const selection: ScreenSelection = { sourceId: source.id, includeSystemAudio };
    const result = await window.sfscreen.selectScreenSource(selection);
    if (!result.ok) return dispatch({ type: 'media', phase: 'failed', error: result.error.message });
    const switchingWhileSharing = state.phase === 'connected' && state.mediaPhase === 'sharing';
    dispatch({ type: 'source-selected', source, includeSystemAudio });
    setSourcePickerOpen(false);
    if (switchingWhileSharing) await captureAndAttach(source, includeSystemAudio, true);
  }, [captureAndAttach, state.mediaPhase, state.phase]);

  const host = useCallback(async (): Promise<void> => {
    if (!state.selectedSource) return void openSourcePicker();

    const capturePromise = captureDisplayStream(state.includeSystemAudio);
    dispatch({ type: 'begin', role: 'host', phase: 'hosting', message: 'Preparando a conexão segura…' });
    sessionStartedAtRef.current = Date.now();
    diagnosticEventsRef.current = [];
    metricsRef.current = {};
    recordDiagnostic('session-started');

    let captured: MediaStream | undefined;
    try {
      const status = await requireReady();
      if (!status?.selfIp) {
        void capturePromise.then(stopTracks).catch(() => undefined);
        return;
      }

      captured = await capturePromise;
      const videoTrack = captured.getVideoTracks()[0];
      if (!videoTrack) throw new Error('Nenhuma faixa de vídeo foi disponibilizada pelo monitor selecionado.');
      videoTrack.contentHint = 'detail';
      videoTrack.enabled = false;
      videoTrack.onended = () => { if (localStreamRef.current === captured) void stopSharing(); };

      const audioTrack = state.includeSystemAudio ? captured.getAudioTracks()[0] : undefined;
      if (audioTrack) {
        audioTrack.enabled = false;
        audioTrack.onended = () => { if (localStreamRef.current === captured) void stopAudio(); };
      }

      localStreamRef.current = captured;
      capturedSourceIdRef.current = state.selectedSource.id;
      setLocalStream(captured);

      const controller = createController();
      const offer = await controller.createOffer(
        status.selfIps ?? [status.selfIp],
        status.selfIp,
        crypto.randomUUID(),
        crypto.randomUUID(),
        videoTrack,
        audioTrack,
      );
      const result = await window.sfscreen.hostSession(offer);
      if (!result.ok) throw new Error(result.error.message);
      dispatch({ type: 'hosted', hosted: result.value });
    } catch (caught) {
      stopTracks(captured);
      if (localStreamRef.current === captured) {
        localStreamRef.current = undefined;
        capturedSourceIdRef.current = undefined;
        setLocalStream(undefined);
      }
      controllerRef.current?.close();
      const authorizationState = await window.sfscreen.getCaptureAuthorizationState().catch(() => 'idle' as const);
      await clearSource();
      dispatch({ type: 'failed', message: captureErrorMessage(caught, authorizationState) });
    }
  }, [clearSource, createController, openSourcePicker, recordDiagnostic, requireReady, state.includeSystemAudio, state.selectedSource, stopAudio, stopSharing]);

  const join = useCallback(async (): Promise<void> => {
    const code = formatSessionCode(joinCode);
    dispatch({ type: 'begin', role: 'viewer', phase: 'searching', message: 'Procurando a sessão na sua tailnet…' });
    sessionStartedAtRef.current = Date.now();
    diagnosticEventsRef.current = [];
    metricsRef.current = {};
    recordDiagnostic('session-started');
    try {
      const status = await requireReady();
      if (!status?.selfIp) return;
      const found = await window.sfscreen.findSession(code);
      if (!found.ok) return dispatch({ type: 'failed', message: found.error.message });
      remoteIpRef.current = found.value.hostIp;
      dispatch({ type: 'begin', role: 'viewer', phase: 'negotiating', message: 'Sessão encontrada. Criando conexão segura…' });
      const controller = createController();
      const { answer, securityCode } = await controller.createAnswer(found.value.offer, status.selfIps ?? [status.selfIp], found.value.hostIp);
      dispatch({ type: 'verifying', securityCode, message: 'Resposta enviada. Aguarde o canal seguro e compare o código.' });
      const submitted = await window.sfscreen.submitAnswer(found.value.hostIp, code, answer);
      if (!submitted.ok) dispatch({ type: 'failed', message: submitted.error.message });
    } catch (caught) {
      controllerRef.current?.close();
      dispatch({ type: 'failed', message: errorMessage(caught) });
    }
  }, [joinCode, createController, recordDiagnostic, requireReady]);

  const confirmSecurity = useCallback((): void => {
    localConfirmedRef.current = true;
    controllerRef.current?.confirmSecurity();
    dispatch({ type: 'local-confirmed' });
    if (remoteConfirmedRef.current) {
      recordDiagnostic('verified');
      dispatch({ type: 'connected' });
    }
  }, [recordDiagnostic]);

  const setJoinCode = useCallback((value: string): void => setJoinCodeState(normalizeSessionCode(value)), []);

  const copyCode = useCallback(async (): Promise<boolean> => {
    if (!state.hosted) return false;
    try { await navigator.clipboard.writeText(state.hosted.code); return true; } catch { return false; }
  }, [state.hosted]);

  const exportDiagnostics = useCallback(async (): Promise<boolean> => {
    const controllerMetrics = await controllerRef.current?.getMetrics().catch(() => undefined);
    if (controllerMetrics) metricsRef.current = controllerMetrics;
    const route = ['direct', 'relay', 'peer-relay', 'unknown'].includes(state.route) ? state.route as DiagnosticsReport['route'] : 'unknown';
    const report: DiagnosticsReport = { formatVersion: diagnosticsFormatVersion, appVersion: '0.1.3', exportedAt: new Date().toISOString(), route, events: diagnosticEventsRef.current, metrics: metricsRef.current };
    const result = await window.sfscreen.exportDiagnostics(report);
    return result.ok && result.value;
  }, [state.route]);

  return {
    state,
    joinCode,
    sources,
    sourcePickerOpen,
    localStream,
    remoteStream,
    remoteMediaPhase,
    remoteMediaError,
    remoteAudioPhase,
    remoteAudioError,
    setJoinCode,
    refresh,
    openSourcePicker,
    closeSourcePicker: () => setSourcePickerOpen(false),
    selectSource,
    host,
    join,
    confirmSecurity,
    startSharing,
    stopSharing,
    stopAudio,
    close,
    copyCode,
    exportDiagnostics,
  };
};
