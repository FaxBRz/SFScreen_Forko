import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { formatSessionCode, normalizeSessionCode } from '../../shared/session/code';
import { diagnosticsFormatVersion, type DiagnosticEvent, type DiagnosticsReport, type WebRtcMetrics } from '../../shared/diagnostics';
import type { ScreenSelection, ScreenSource } from '../../shared/screen-source';
import type { ChatMessagePayload } from '../../shared/session/media-control';
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

const createSimulatedScreenStream = (): { stream: MediaStream; stop: () => void } => {

  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');

  let animationFrame: number | null = null;
  let t = 0;

  const renderFrame = () => {
    if (!ctx) return;
    t += 0.03;

    const grad = ctx.createLinearGradient(0, 0, 1280, 720);
    grad.addColorStop(0, '#0c0e14');
    grad.addColorStop(0.5, '#161926');
    grad.addColorStop(1, '#0c0e14');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1280, 720);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < 1280; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 720);
      ctx.stroke();
    }
    for (let y = 0; y < 720; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1280, y);
      ctx.stroke();
    }

    const centerX = 640 + Math.sin(t * 0.8) * 80;
    const centerY = 320 + Math.cos(t * 0.9) * 40;

    for (let i = 4; i >= 1; i--) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, 70 + i * 25 + Math.sin(t * 2 + i) * 10, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(35, 165, 90, ${0.03 * i})`;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(centerX, centerY, 55, 0, Math.PI * 2);
    ctx.fillStyle = '#23a55a';
    ctx.fill();
    ctx.strokeStyle = '#57f287';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#07130a';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LIVE', centerX, centerY);

    ctx.beginPath();
    ctx.moveTo(0, 520);
    for (let x = 0; x < 1280; x += 10) {
      const y = 520 + Math.sin(x * 0.01 + t * 3) * 25 + Math.cos(x * 0.02 + t * 2) * 15;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(1280, 720);
    ctx.lineTo(0, 720);
    ctx.closePath();
    const waveGrad = ctx.createLinearGradient(0, 500, 0, 720);
    waveGrad.addColorStop(0, 'rgba(88, 101, 242, 0.25)');
    waveGrad.addColorStop(1, 'rgba(35, 165, 90, 0.05)');
    ctx.fillStyle = waveGrad;
    ctx.fill();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(40, 40, 1200, 70);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.strokeRect(40, 40, 1200, 70);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('📺 Transmissão Remota Simulada · SFScreen', 65, 82);

    ctx.fillStyle = '#23a55a';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'right';
    const now = new Date();
    const timeStr = `${now.toLocaleTimeString('pt-BR')}.${String(Math.floor(now.getMilliseconds() / 10)).padStart(2, '0')}`;
    ctx.fillText(`60 FPS · 1080p · ${timeStr}`, 1215, 82);

    ctx.fillStyle = '#5865f2';
    for (let b = 0; b < 24; b++) {
      const barH = 10 + Math.abs(Math.sin(t * 4 + b * 0.4)) * 40;
      ctx.fillRect(65 + b * 8, 620 - barH, 5, barH);
    }

    ctx.fillStyle = '#949ba4';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Áudio estéreo sintetizado (Teste de latência e PiP)', 280, 615);

    animationFrame = requestAnimationFrame(renderFrame);
  };

  renderFrame();

  const stream = canvas.captureStream ? canvas.captureStream(30) : new MediaStream();

  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctxAudio = new AudioCtx();
      const osc = ctxAudio.createOscillator();
      const gain = ctxAudio.createGain();
      const dest = ctxAudio.createMediaStreamDestination();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, ctxAudio.currentTime);
      gain.gain.setValueAtTime(0.01, ctxAudio.currentTime);

      osc.connect(gain);
      gain.connect(dest);
      osc.start();

      dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
    }
  } catch {
    // Unsupported in headless/mock test
  }

  const stop = () => {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    stream.getTracks().forEach((track) => track.stop());
  };

  return { stream, stop };
};

export type StreamResolution = '720p' | '1080p' | '1440p';
export type StreamFps = 30 | 60;


export interface SessionModel {
  state: SessionUiState;
  joinCode: string;
  sources: ScreenSource[];
  sourcePickerOpen: boolean;
  resolution: StreamResolution;
  fps: StreamFps;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  remoteMediaPhase?: MediaPhase;
  remoteMediaError?: string;
  remoteAudioPhase?: AudioPhase;
  remoteAudioError?: string;
  isSimulatedPeer: boolean;
  setJoinCode: (value: string) => void;
  setResolution: (resolution: StreamResolution) => void;
  setFps: (fps: StreamFps) => void;
  toggleSystemAudio: () => Promise<void>;
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
  sendChatMessage: (text: string) => void;
  setUserName: (name: string) => void;
  toggleSessionModal: (open?: boolean) => void;
  toggleChatPanel: (open?: boolean) => void;
  simulatePeer: (enable?: boolean) => void;
}


export const useSession = (): SessionModel => {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const [joinCode, setJoinCodeState] = useState('');
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [resolution, setResolution] = useState<StreamResolution>('1080p');
  const [fps, setFps] = useState<StreamFps>(60);
  const [localStream, setLocalStream] = useState<MediaStream | undefined>(undefined);

  const [remoteStream, setRemoteStream] = useState<MediaStream | undefined>(undefined);
  const [remoteMediaPhase, setRemoteMediaPhase] = useState<MediaPhase>('stopped');
  const [remoteMediaError, setRemoteMediaError] = useState<string | undefined>(undefined);
  const [remoteAudioPhase, setRemoteAudioPhase] = useState<AudioPhase>('unavailable');
  const [remoteAudioError, setRemoteAudioError] = useState<string | undefined>(undefined);
  const [isSimulatedPeer, setIsSimulatedPeer] = useState(false);
  const simulatedStreamCleanupRef = useRef<(() => void) | null>(null);
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
  const localUserNameRef = useRef(state.localUserName);

  useEffect(() => {
    localUserNameRef.current = state.localUserName;
  }, [state.localUserName]);

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
    simulatedStreamCleanupRef.current?.();
    simulatedStreamCleanupRef.current = null;
    setIsSimulatedPeer(false);
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
  }, [recordDiagnostic]);


  const createController = useCallback((): WebRtcSession => {
    controllerRef.current?.close();
    const controller = new WebRtcSession({
      onChannelOpen: () => {
        recordDiagnostic('channel-open');
        controller.sendUserProfile(localUserNameRef.current);
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
        if (message.type === 'user-profile') {
          dispatch({ type: 'set-remote-user-name', name: message.userName });
          return;
        }
        if (message.type === 'chat-message') {
          dispatch({ type: 'add-chat-message', message: message.message });
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
    if (!controller) return;
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
    const isConnected = state.phase === 'connected';
    const previous = localStreamRef.current;
    let captured: MediaStream | undefined;

    controller?.sendVideoState('starting');
    dispatch({ type: 'media', phase: 'starting' });
    recordDiagnostic('video-starting');
    if (includeSystemAudio) {
      controller?.sendAudioState('starting');
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

      if (isConnected && controller) {
        await controller.replaceVideoTrack(videoTrack);
      }

      if (includeSystemAudio) {
        const audioTrack = captured.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = true;
          audioTrack.onended = () => { if (localStreamRef.current === captured) void stopAudio(); };
          if (isConnected && controller) {
            await controller.replaceAudioTrack(audioTrack);
            controller.sendAudioState('active');
          }
          dispatch({ type: 'audio', phase: 'active' });
          recordDiagnostic('audio-active');
        } else {
          if (isConnected && controller) {
            await controller.removeAudioTrack();
            controller.sendAudioState('unavailable');
          }
          dispatch({ type: 'audio', phase: 'unavailable', error: 'O Windows não disponibilizou o áudio do sistema.' });
recordDiagnostic('audio-unavailable');
        }
      } else {
        if (isConnected && controller) {
          await controller.removeAudioTrack();
          controller.sendAudioState('unavailable');
        }
        dispatch({ type: 'audio', phase: 'unavailable' });
      }

      localStreamRef.current = captured;
      capturedSourceIdRef.current = source.id;
      setLocalStream(captured);
      if (previous && previous !== captured) stopTracks(previous);
      controller?.sendVideoState('active');
      dispatch({ type: 'media', phase: 'sharing' });
      recordDiagnostic('video-active');
    } catch (caught) {
      if (captured && captured !== localStreamRef.current) stopTracks(captured);
      const authorizationState = await window.sfscreen.getCaptureAuthorizationState().catch(() => 'idle' as const);
      const message = captureErrorMessage(caught, authorizationState);
      if (previous?.getVideoTracks().some((track) => track.readyState === 'live')) {
        controller?.sendVideoState('active');
        dispatch({ type: 'media', phase: 'sharing', error: message });
      } else {
        controller?.sendVideoState('failed');
        controller?.sendAudioState('failed');
        dispatch({ type: 'media', phase: 'failed', error: message });
      }
    }
  }, [recordDiagnostic, state.phase, stopAudio, stopSharing]);

  const openSourcePicker = useCallback(async (): Promise<void> => {
    const result = await window.sfscreen.listScreenSources();
    if (!result.ok) return dispatch({ type: 'media', phase: 'failed', error: result.error.message });
    setSources(result.value);
    setSourcePickerOpen(true);
  }, []);

  const startSharing = useCallback(async (): Promise<void> => {
    if (!state.selectedSource) return void openSourcePicker();
    const prepared = localStreamRef.current;
    const preparedVideo = prepared?.getVideoTracks().find((track) => track.readyState === 'live');
    if (prepared && preparedVideo && capturedSourceIdRef.current === state.selectedSource.id) {
      try {
        if (state.phase === 'connected') await activatePreparedStream(prepared);
        else {
          dispatch({ type: 'media', phase: 'sharing' });
          if (state.includeSystemAudio) dispatch({ type: 'audio', phase: 'active' });
        }
      } catch (caught) {
        controllerRef.current?.sendVideoState('failed');
        dispatch({ type: 'media', phase: 'failed', error: errorMessage(caught) });
      }
      return;
    }
    await captureAndAttach(state.selectedSource, state.includeSystemAudio, true);
  }, [activatePreparedStream, captureAndAttach, openSourcePicker, state.includeSystemAudio, state.phase, state.selectedSource]);

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
        dispatch({ type: 'verifying', securityCode, message: 'Resposta recebida. Compare o código de segurança.' });
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

  const selectSource = useCallback(async (source: ScreenSource, includeSystemAudio: boolean): Promise<void> => {
    const selection: ScreenSelection = { sourceId: source.id, includeSystemAudio };
    const result = await window.sfscreen.selectScreenSource(selection);
    if (!result.ok) return dispatch({ type: 'media', phase: 'failed', error: result.error.message });
    dispatch({ type: 'source-selected', source, includeSystemAudio });
    setSourcePickerOpen(false);
    await captureAndAttach(source, includeSystemAudio, true);
  }, [captureAndAttach]);

  const toggleSystemAudio = useCallback(async (): Promise<void> => {
    if (!state.selectedSource || state.mediaPhase !== 'sharing') return;
    const newAudio = !state.includeSystemAudio;
    const currentStream = localStreamRef.current;
    const controller = controllerRef.current;
    const isConnected = state.phase === 'connected';

    if (!newAudio) {
      if (currentStream) {
        currentStream.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }
      if (isConnected && controller) {
        await controller.removeAudioTrack();
        controller.sendAudioState('unavailable');
      }
      dispatch({ type: 'source-selected', source: state.selectedSource, includeSystemAudio: false });
      dispatch({ type: 'audio', phase: 'unavailable' });
      recordDiagnostic('audio-stopped');
    } else {
      const existingAudioTrack = currentStream?.getAudioTracks().find((t) => t.readyState === 'live');
      if (existingAudioTrack) {
        existingAudioTrack.enabled = true;
        if (isConnected && controller) {
          await controller.replaceAudioTrack(existingAudioTrack);
          controller.sendAudioState('active');
        }
        dispatch({ type: 'source-selected', source: state.selectedSource, includeSystemAudio: true });
        dispatch({ type: 'audio', phase: 'active' });
        recordDiagnostic('audio-active');
      } else {
        dispatch({ type: 'source-selected', source: state.selectedSource, includeSystemAudio: true });
        await captureAndAttach(state.selectedSource, true, false);
      }
    }
  }, [captureAndAttach, recordDiagnostic, state.includeSystemAudio, state.mediaPhase, state.phase, state.selectedSource]);



  const host = useCallback(async (): Promise<void> => {
    dispatch({ type: 'begin', role: 'host', phase: 'hosting', message: 'Preparando a conexão segura…' });
    sessionStartedAtRef.current = Date.now();
    diagnosticEventsRef.current = [];
    metricsRef.current = {};
    recordDiagnostic('session-started');

    try {
      const status = await requireReady();
      if (!status?.selfIp) return;

      const videoTrack = localStreamRef.current?.getVideoTracks().find((track) => track.readyState === 'live');
      const audioTrack = state.includeSystemAudio ? localStreamRef.current?.getAudioTracks().find((track) => track.readyState === 'live') : undefined;

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
      controllerRef.current?.close();
      dispatch({ type: 'failed', message: errorMessage(caught) });
    }
  }, [createController, recordDiagnostic, requireReady, state.includeSystemAudio]);

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
      dispatch({ type: 'verifying', securityCode, message: 'Resposta enviada. Compare o código de segurança.' });
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
    controllerRef.current?.sendUserProfile(localUserNameRef.current);
    dispatch({ type: 'local-confirmed' });
    if (remoteConfirmedRef.current) {
      recordDiagnostic('verified');
      dispatch({ type: 'connected' });
      if (localStreamRef.current) {
        void activatePreparedStream(localStreamRef.current);
      }
    }
  }, [activatePreparedStream, recordDiagnostic]);

  const setJoinCode = useCallback((value: string): void => setJoinCodeState(normalizeSessionCode(value)), []);

  const copyCode = useCallback(async (): Promise<boolean> => {
    if (!state.hosted) return false;
    const text = state.hosted.code;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fallback
    }
    try {
      if (typeof document !== 'undefined') {
        const el = document.createElement('textarea');
        el.value = text;
        el.setAttribute('readonly', '');
        el.style.position = 'fixed';
        el.style.top = '0';
        el.style.left = '0';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.focus();
        el.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(el);
        return successful;
      }
    } catch {
      // Fallback failed
    }
    return false;
  }, [state.hosted]);


  const exportDiagnostics = useCallback(async (): Promise<boolean> => {
    const controllerMetrics = await controllerRef.current?.getMetrics().catch(() => undefined);
    if (controllerMetrics) metricsRef.current = controllerMetrics;
    const route = ['direct', 'relay', 'peer-relay', 'unknown'].includes(state.route) ? state.route as DiagnosticsReport['route'] : 'unknown';
    const report: DiagnosticsReport = { formatVersion: diagnosticsFormatVersion, appVersion: '0.1.3', exportedAt: new Date().toISOString(), route, events: diagnosticEventsRef.current, metrics: metricsRef.current };
    const result = await window.sfscreen.exportDiagnostics(report);
    return result.ok && result.value;
  }, [state.route]);

  const sendChatMessage = useCallback((text: string): void => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const message: ChatMessagePayload = {
      id: crypto.randomUUID(),
      senderName: state.localUserName,
      text: trimmed,
      timestamp: Date.now(),
    };
    dispatch({ type: 'add-chat-message', message });
    if (state.phase === 'connected') {
      controllerRef.current?.sendChatMessage(message);
    }
  }, [state.localUserName, state.phase]);

  const setUserName = useCallback((name: string): void => {
    const trimmed = name.trim();
    if (!trimmed) return;
    dispatch({ type: 'set-user-name', name: trimmed });
    if (state.phase === 'connected') {
      controllerRef.current?.sendUserProfile(trimmed);
    }
  }, [state.phase]);

  const toggleSessionModal = useCallback((open?: boolean): void => {
    dispatch({ type: 'toggle-session-modal', open });
  }, []);

  const toggleChatPanel = useCallback((open?: boolean): void => {
    dispatch({ type: 'toggle-chat-panel', open });
  }, []);

  const simulatePeer = useCallback((enable?: boolean): void => {
    const shouldEnable = enable !== undefined ? enable : !isSimulatedPeer;
    if (!shouldEnable) {
      simulatedStreamCleanupRef.current?.();
      simulatedStreamCleanupRef.current = null;
      setIsSimulatedPeer(false);
      setRemoteStream(undefined);
      setRemoteMediaPhase('stopped');
      setRemoteAudioPhase('unavailable');
      dispatch({ type: 'closed' });
      return;
    }

    simulatedStreamCleanupRef.current?.();
    const { stream, stop } = createSimulatedScreenStream();
    simulatedStreamCleanupRef.current = stop;
    setIsSimulatedPeer(true);
    setRemoteStream(stream);
    setRemoteMediaPhase('sharing');
    setRemoteAudioPhase('active');
    dispatch({ type: 'connected', route: 'direct' });
    dispatch({ type: 'set-remote-user-name', userName: 'Alex (Simulado)' });
    dispatch({
      type: 'add-chat-message',
      message: {
        id: crypto.randomUUID(),
        senderName: 'Alex (Simulado)',
        text: 'Olá! Sou o participante simulado. Você pode testar compartilhar sua tela, alternar o foco no PiP, minimizar/mudar de janela para testar economia de RAM, ou trocar a qualidade!',
        timestamp: Date.now(),
      },
    });
  }, [isSimulatedPeer]);

  return {
    state,
    joinCode,
    sources,
    sourcePickerOpen,
    resolution,
    fps,
    localStream,
    remoteStream,
    remoteMediaPhase,
    remoteMediaError,
    remoteAudioPhase,
    remoteAudioError,
    isSimulatedPeer,
    setJoinCode,
    setResolution,
    setFps,
    toggleSystemAudio,
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
    sendChatMessage,
    setUserName,
    toggleSessionModal,
    toggleChatPanel,
    simulatePeer,
  };
};


