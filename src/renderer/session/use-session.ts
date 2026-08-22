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

const resDimensionMap: Record<StreamResolution, { width: number; height: number }> = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
};

const captureDisplayStream = (includeSystemAudio: boolean, resolution: StreamResolution = '1080p', fps: StreamFps = 60): Promise<MediaStream> => {
  const audio = includeSystemAudio ? ({ restrictOwnAudio: true } as MediaTrackConstraints) : false;
  const dim = resDimensionMap[resolution] || resDimensionMap['1080p'];
  const video: MediaTrackConstraints = {
    width: { ideal: dim.width, max: dim.width },
    height: { ideal: dim.height, max: dim.height },
    frameRate: { ideal: fps, max: fps },
  };
  const request = navigator.mediaDevices.getDisplayMedia({ audio, video });
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

const createSimulatedScreenStream = (
  resolution: StreamResolution = '1080p',
  fps: StreamFps = 60,
  enableAudio: boolean = true
): { stream: MediaStream; stop: () => void } => {
  const canvas = document.createElement('canvas');
  const dim = resolution === '1440p' ? { width: 2560, height: 1440 } : resolution === '720p' ? { width: 1280, height: 720 } : { width: 1920, height: 1080 };
  canvas.width = dim.width;
  canvas.height = dim.height;
  const ctx = canvas.getContext('2d');

  let intervalId: number | null = null;
  let t = 0;

  const stream = canvas.captureStream ? canvas.captureStream(fps) : new MediaStream();
  const videoTrack = stream.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined;

  const renderFrame = () => {
    if (!ctx) return;
    t += 0.05;

    ctx.save();
    ctx.scale(dim.width / 1280, dim.height / 720);

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

    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(40, 40, 1200, 70);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
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
    ctx.fillText(`${fps} FPS · ${resolution} · ${timeStr}`, 1215, 82);

    if (enableAudio) {
      ctx.fillStyle = '#5865f2';
      for (let b = 0; b < 24; b++) {
        const barH = 10 + Math.abs(Math.sin(t * 4 + b * 0.4)) * 40;
        ctx.fillRect(65 + b * 8, 620 - barH, 5, barH);
      }
      ctx.fillStyle = '#949ba4';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Áudio estéreo sintetizado (Teste de latência e PiP)', 280, 615);
    } else {
      ctx.fillStyle = '#4e5058';
      for (let b = 0; b < 24; b++) {
        ctx.fillRect(65 + b * 8, 616, 5, 4);
      }
      ctx.fillStyle = '#72767d';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Transmissão sem áudio do sistema (Mudo)', 280, 615);
    }

    ctx.restore();

    videoTrack?.requestFrame?.();
  };

  renderFrame();
  intervalId = window.setInterval(renderFrame, 1000 / fps);

  let audioContextToClose: AudioContext | null = null;
  let audioIntervalId: number | null = null;

  if (enableAudio) {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const ctxAudio = new AudioCtx();
        audioContextToClose = ctxAudio;
        if (ctxAudio.state === 'suspended') {
          void ctxAudio.resume();
        }

        const dest = ctxAudio.createMediaStreamDestination();
        const mainGain = ctxAudio.createGain();
        mainGain.gain.setValueAtTime(0.1, ctxAudio.currentTime);
        mainGain.connect(dest);

        // Play pleasant rhythmic melodic chord tones (A4, C#5, E5, A5)
        const notes = [440, 554.37, 659.25, 880];
        let noteIndex = 0;

        const playChime = () => {
          if (ctxAudio.state === 'closed') return;
          if (ctxAudio.state === 'suspended') void ctxAudio.resume();

          const now = ctxAudio.currentTime;
          const osc = ctxAudio.createOscillator();
          const noteGain = ctxAudio.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(notes[noteIndex % notes.length], now);
          noteIndex++;

          noteGain.gain.setValueAtTime(0, now);
          noteGain.gain.linearRampToValueAtTime(0.15, now + 0.02);
          noteGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

          osc.connect(noteGain);
          noteGain.connect(mainGain);

          osc.start(now);
          osc.stop(now + 0.36);
        };

        playChime();
        audioIntervalId = window.setInterval(playChime, 800);

        dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
      }
    } catch {
      // Unsupported in headless/mock test
    }
  }

  const stop = () => {
    if (intervalId !== null) window.clearInterval(intervalId);
    if (audioIntervalId !== null) window.clearInterval(audioIntervalId);
    try {
      void audioContextToClose?.close();
    } catch {
      // Ignored
    }
    stream.getTracks().forEach((track) => track.stop());
  };

  return { stream, stop };
};

const createSimulatedCameraStream = (
  name: string,
  avatarUrl?: string,
  resolution: '480p' | '720p' | '1080p' = '720p',
  fps: 30 | 60 = 30
): { stream: MediaStream; stop: () => void } => {
  const canvas = document.createElement('canvas');
  const dim = resolution === '1080p' ? { width: 1920, height: 1080 } : resolution === '480p' ? { width: 640, height: 480 } : { width: 1280, height: 720 };
  canvas.width = dim.width;
  canvas.height = dim.height;
  const ctx = canvas.getContext('2d');

  let intervalId: number | null = null;
  let t = 0;

  const stream = canvas.captureStream ? canvas.captureStream(fps) : new MediaStream();
  const videoTrack = stream.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined;

  let loadedAvatarImg: HTMLImageElement | null = null;
  if (avatarUrl) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { loadedAvatarImg = img; };
    img.src = avatarUrl;
  }

  const renderFrame = () => {
    if (!ctx) return;
    t += 0.04;

    ctx.save();
    ctx.scale(dim.width / 640, dim.height / 480);

    const grad = ctx.createRadialGradient(320, 240, 50, 320, 240, 320);
    grad.addColorStop(0, '#1a2920');
    grad.addColorStop(1, '#0b100d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 640, 480);

    for (let p = 0; p < 8; p++) {
      const px = (p * 80 + Math.sin(t + p) * 40) % 640;
      const py = (p * 60 + Math.cos(t * 0.8 + p) * 30 + 100) % 480;
      ctx.beginPath();
      ctx.arc(px, py, 14 + Math.sin(t + p) * 6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(35, 165, 90, ${0.04 + Math.sin(t + p) * 0.02})`;
      ctx.fill();
    }

    const avatarY = 220 + Math.sin(t * 1.5) * 6;
    const avatarRadius = 70;

    ctx.save();
    ctx.beginPath();
    ctx.arc(320, avatarY, avatarRadius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#23a55a';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#23a55a';
    ctx.shadowBlur = 16;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(320, avatarY, avatarRadius, 0, Math.PI * 2);
    ctx.clip();

    if (loadedAvatarImg && loadedAvatarImg.complete) {
      ctx.drawImage(loadedAvatarImg, 320 - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
    } else {
      ctx.fillStyle = '#17241c';
      ctx.fillRect(320 - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
      ctx.fillStyle = '#23a55a';
      ctx.font = 'bold 54px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((name || 'A').slice(0, 1).toUpperCase(), 320, avatarY);
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.beginPath();
    ctx.roundRect(320 - 110, 330, 220, 32, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(35, 165, 90, 0.4)';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`📷 ${name} · ${resolution} ${fps}FPS`, 320, 346);

    ctx.restore();

    videoTrack?.requestFrame?.();
  };

  renderFrame();
  intervalId = window.setInterval(renderFrame, 1000 / fps);

  const stop = () => {
    if (intervalId !== null) window.clearInterval(intervalId);
    stream.getTracks().forEach((track) => track.stop());
  };

  return { stream, stop };
};

export type StreamResolution = '720p' | '1080p' | '1440p';
export type StreamFps = 30 | 60;

export interface SimulatedPeerOptions {
  enableScreen?: boolean;
  screenResolution?: StreamResolution;
  screenFps?: StreamFps;
  enableScreenAudio?: boolean;
  enableCamera?: boolean;
  cameraResolution?: '480p' | '720p' | '1080p';
  cameraFps?: 30 | 60;
  avatarUrl?: string;
  sendChatMessage?: boolean;
  chatMessageText?: string;
}

export interface SessionModel {
  state: SessionUiState;
  joinCode: string;
  sources: ScreenSource[];
  sourcePickerOpen: boolean;
  resolution: StreamResolution;
  fps: StreamFps;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  localCameraStream?: MediaStream;
  remoteCameraStream?: MediaStream;
  cameraActive: boolean;
  remoteMediaPhase?: MediaPhase;
  remoteMediaError?: string;
  remoteAudioPhase?: AudioPhase;
  remoteAudioError?: string;
  isSimulatedPeer: boolean;
  setJoinCode: (value: string) => void;
  setResolution: (resolution: StreamResolution) => void;
  setFps: (fps: StreamFps) => void;
  toggleSystemAudio: () => Promise<void>;
  toggleCamera: () => Promise<void>;
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
  deleteChatMessage: (id: string) => void;
  setUserName: (name: string) => void;
  setUserAvatar: (avatar?: string) => void;
  toggleSessionModal: (open?: boolean) => void;
  toggleChatPanel: (open?: boolean) => void;
  simulatePeer: (enable?: boolean | SimulatedPeerOptions, options?: SimulatedPeerOptions) => void;
  getMetrics: () => Promise<WebRtcMetrics>;
}


export const useSession = (): SessionModel => {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const [joinCode, setJoinCodeState] = useState('');
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [resolution, setResolutionState] = useState<StreamResolution>('1080p');
  const [fps, setFpsState] = useState<StreamFps>(60);
  const resolutionRef = useRef<StreamResolution>('1080p');
  const fpsRef = useRef<StreamFps>(60);
  const [localStream, setLocalStream] = useState<MediaStream | undefined>(undefined);
  const [localCameraStream, setLocalCameraStream] = useState<MediaStream | undefined>(undefined);
  const [remoteCameraStream, setRemoteCameraStream] = useState<MediaStream | undefined>(undefined);
  const [cameraActive, setCameraActive] = useState(false);
  const localCameraStreamRef = useRef<MediaStream | undefined>(undefined);
  const simulatedCameraCleanupRef = useRef<(() => void) | null>(null);

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
  const localUserAvatarRef = useRef(state.localUserAvatar);

  useEffect(() => {
    localUserNameRef.current = state.localUserName;
  }, [state.localUserName]);

  useEffect(() => {
    localUserAvatarRef.current = state.localUserAvatar;
  }, [state.localUserAvatar]);

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
    simulatedCameraCleanupRef.current?.();
    simulatedCameraCleanupRef.current = null;
    setIsSimulatedPeer(false);
    controllerRef.current?.close();
    controllerRef.current = undefined;
    remoteIpRef.current = undefined;
    localConfirmedRef.current = false;
    remoteConfirmedRef.current = false;
    setRemoteStream(undefined);
    setRemoteCameraStream(undefined);
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
        controller.sendUserProfile(localUserNameRef.current, localUserAvatarRef.current);
        dispatch({ type: 'verifying', message: 'Canal seguro conectado. Compare o código de segurança.' });
      },
      onControlMessage: (message) => {
        if (message.type === 'security-confirmed') {
          remoteConfirmedRef.current = true;
          dispatch({ type: 'remote-confirmed' });
          if (localConfirmedRef.current) {
            recordDiagnostic('verified');
            dispatch({ type: 'connected' });
            if (localCameraStreamRef.current) {
              const camTrack = localCameraStreamRef.current.getVideoTracks().find((track) => track.readyState === 'live');
              if (camTrack) {
                void controller.replaceCameraTrack(camTrack);
                controller.sendCameraState('active');
              }
            }
          }
          return;
        }
        if (message.type === 'user-profile') {
          dispatch({ type: 'set-remote-user-profile', userName: message.userName, userAvatar: message.userAvatar });
          return;
        }
        if (message.type === 'chat-message') {
          dispatch({ type: 'add-chat-message', message: message.message });
          return;
        }
        if (message.type === 'delete-chat-message') {
          dispatch({ type: 'delete-chat-message', id: message.messageId });
          return;
        }
        if (message.type === 'camera-state') {
          if (message.state === 'stopped' || message.state === 'failed') {
            setRemoteCameraStream(undefined);
          }
          return;
        }
        if (message.type === 'audio-state') {
          setRemoteAudioPhase(message.state);
          setRemoteAudioError(message.state === 'failed' ? 'O áudio remoto não ficou disponível.' : undefined);
          return;
        }
        if (message.type === 'video-state') {
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
          return;
        }
      },
      onConnectionState: (connectionState) => {
        if (connectionState === 'failed') {
          recordDiagnostic('connection-failed');
          setRemoteStream(undefined);
          setRemoteCameraStream(undefined);
          setRemoteMediaPhase('stopped');
          setRemoteAudioPhase('unavailable');
          dispatch({ type: 'failed', message: 'A conexão WebRTC falhou pela interface Tailscale.' });
        } else if (connectionState === 'closed' || connectionState === 'disconnected') {
          recordDiagnostic('session-closed');
          setRemoteStream(undefined);
          setRemoteCameraStream(undefined);
          setRemoteMediaPhase('stopped');
          setRemoteAudioPhase('unavailable');
          dispatch({ type: 'closed' });
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
      onRemoteCameraStream: (stream) => {
        recordDiagnostic('remote-video-track');
        setRemoteCameraStream(stream);
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

      captured = await captureDisplayStream(includeSystemAudio, resolutionRef.current, fpsRef.current);
      const videoTrack = captured.getVideoTracks()[0];
      if (!videoTrack) throw new Error('Nenhuma faixa de vídeo foi disponibilizada pelo monitor selecionado.');
      videoTrack.contentHint = 'detail';
      videoTrack.enabled = true;
      videoTrack.onended = () => { if (localStreamRef.current === captured) void stopSharing(); };

      if (isConnected && controller) {
        const resBitrateMap: Record<StreamResolution, number> = {
          '720p': 3_000_000,
          '1080p': 6_000_000,
          '1440p': 12_000_000,
        };
        await controller.replaceVideoTrack(videoTrack, resBitrateMap[resolutionRef.current], fpsRef.current);
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
    try {
      localStorage.setItem('sfscreen_include_system_audio', String(newAudio));
    } catch {
      // Ignored
    }
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
      const cameraTrack = localCameraStreamRef.current?.getVideoTracks().find((track) => track.readyState === 'live');

      const controller = createController();
      const offer = await controller.createOffer(
        status.selfIps ?? [status.selfIp],
        status.selfIp,
        crypto.randomUUID(),
        crypto.randomUUID(),
        videoTrack,
        audioTrack,
        cameraTrack,
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
    controllerRef.current?.sendUserProfile(localUserNameRef.current, localUserAvatarRef.current);
    dispatch({ type: 'local-confirmed' });
    if (remoteConfirmedRef.current) {
      recordDiagnostic('verified');
      dispatch({ type: 'connected' });
      if (localStreamRef.current) {
        void activatePreparedStream(localStreamRef.current);
      }
      if (localCameraStreamRef.current) {
        const camTrack = localCameraStreamRef.current.getVideoTracks().find((track) => track.readyState === 'live');
        if (camTrack) {
          void controllerRef.current?.replaceCameraTrack(camTrack);
          controllerRef.current?.sendCameraState('active');
        }
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

  const setResolution = useCallback((newResolution: StreamResolution): void => {
    resolutionRef.current = newResolution;
    setResolutionState(newResolution);
    const stream = localStreamRef.current;
    if (stream) {
      const videoTrack = stream.getVideoTracks().find((t) => t.readyState === 'live');
      if (videoTrack && videoTrack.applyConstraints) {
        const dim = resDimensionMap[newResolution];
        void videoTrack.applyConstraints({
          width: { ideal: dim.width, max: dim.width },
          height: { ideal: dim.height, max: dim.height },
        }).catch(() => undefined);
      }
    }
    const resBitrateMap: Record<StreamResolution, number> = {
      '720p': 3_000_000,
      '1080p': 6_000_000,
      '1440p': 12_000_000,
    };
    void controllerRef.current?.updateVideoParameters(resBitrateMap[newResolution], fpsRef.current);
  }, []);

  const setFps = useCallback((newFps: StreamFps): void => {
    fpsRef.current = newFps;
    setFpsState(newFps);
    const stream = localStreamRef.current;
    if (stream) {
      const videoTrack = stream.getVideoTracks().find((t) => t.readyState === 'live');
      if (videoTrack && videoTrack.applyConstraints) {
        void videoTrack.applyConstraints({
          frameRate: { ideal: newFps, max: newFps },
        }).catch(() => undefined);
      }
    }
    const resBitrateMap: Record<StreamResolution, number> = {
      '720p': 3_000_000,
      '1080p': 6_000_000,
      '1440p': 12_000_000,
    };
    void controllerRef.current?.updateVideoParameters(resBitrateMap[resolutionRef.current], newFps);
  }, []);

  const deleteChatMessage = useCallback((id: string): void => {
    dispatch({ type: 'delete-chat-message', id });
    if (state.phase === 'connected') {
      controllerRef.current?.sendDeleteChatMessage(id);
    }
  }, [state.phase]);

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
      controllerRef.current?.sendUserProfile(trimmed, localUserAvatarRef.current);
    }
  }, [state.phase]);

  const setUserAvatar = useCallback((avatar?: string): void => {
    dispatch({ type: 'set-local-user-avatar', avatar });
    if (state.phase === 'connected') {
      controllerRef.current?.sendUserProfile(localUserNameRef.current, avatar);
    }
  }, [state.phase]);

  const toggleSessionModal = useCallback((open?: boolean): void => {
    dispatch({ type: 'toggle-session-modal', open });
  }, []);

  const toggleChatPanel = useCallback((open?: boolean): void => {
    dispatch({ type: 'toggle-chat-panel', open });
  }, []);

  const stopCamera = useCallback(async (): Promise<void> => {
    if (localCameraStreamRef.current) {
      localCameraStreamRef.current.getTracks().forEach((t) => t.stop());
      localCameraStreamRef.current = undefined;
    }
    setLocalCameraStream(undefined);
    setCameraActive(false);
    if (controllerRef.current) {
      await controllerRef.current.parkCameraTrack();
      controllerRef.current.sendCameraState('stopped');
    }
  }, []);

  const toggleCamera = useCallback(async (): Promise<void> => {
    if (cameraActive) {
      await stopCamera();
      return;
    }

    try {
      let stream: MediaStream | undefined;
      if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
        try {
          // Solicita resolução ideal respeitando o framerate nativo do hardware (geralmente 30 FPS)
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          });
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
          } catch {
            const sim = createSimulatedCameraStream(state.localUserName, state.localUserAvatar);
            stream = sim.stream;
          }
        }
      } else {
        const sim = createSimulatedCameraStream(state.localUserName, state.localUserAvatar);
        stream = sim.stream;
      }

      if (stream) {
        const camTrack = stream.getVideoTracks()[0];
        if (camTrack) {
          camTrack.onended = () => {
            if (localCameraStreamRef.current === stream) {
              void stopCamera();
            }
          };
        }

        localCameraStreamRef.current = stream;
        setLocalCameraStream(stream);
        setCameraActive(true);

        if (controllerRef.current && camTrack) {
          await controllerRef.current.replaceCameraTrack(camTrack);
          controllerRef.current.sendCameraState('active');
        }
      }
    } catch {
      const sim = createSimulatedCameraStream(state.localUserName, state.localUserAvatar);
      localCameraStreamRef.current = sim.stream;
      setLocalCameraStream(sim.stream);
      setCameraActive(true);
    }
  }, [cameraActive, state.localUserAvatar, state.localUserName, stopCamera]);

  const simulatePeer = useCallback((enable?: boolean | SimulatedPeerOptions, options?: SimulatedPeerOptions): void => {
    let shouldEnable = true;
    let opts: SimulatedPeerOptions | undefined;

    if (typeof enable === 'boolean') {
      shouldEnable = enable;
      opts = options;
    } else if (typeof enable === 'object' && enable !== null) {
      shouldEnable = true;
      opts = enable;
    } else {
      shouldEnable = !isSimulatedPeer;
      opts = options;
    }

    if (!shouldEnable) {
      simulatedStreamCleanupRef.current?.();
      simulatedStreamCleanupRef.current = null;
      simulatedCameraCleanupRef.current?.();
      simulatedCameraCleanupRef.current = null;
      setIsSimulatedPeer(false);
      setRemoteStream(undefined);
      setRemoteCameraStream(undefined);
      setRemoteMediaPhase('stopped');
      setRemoteAudioPhase('unavailable');
      dispatch({ type: 'closed' });
      return;
    }

    const effectiveOpts: SimulatedPeerOptions = {
      enableScreen: opts?.enableScreen ?? true,
      screenResolution: opts?.screenResolution ?? '1080p',
      screenFps: opts?.screenFps ?? 60,
      enableScreenAudio: opts?.enableScreenAudio ?? true,
      enableCamera: opts?.enableCamera ?? true,
      cameraResolution: opts?.cameraResolution ?? '720p',
      cameraFps: opts?.cameraFps ?? 30,
      avatarUrl: opts?.avatarUrl,
      sendChatMessage: opts?.sendChatMessage ?? true,
      chatMessageText: opts?.chatMessageText ?? 'Olá! Sou o participante simulado. Você pode testar ligar sua câmera, focar na câmera ou na tela separadamente, e verificar a telemetria de rede!',
    };

    simulatedStreamCleanupRef.current?.();
    simulatedCameraCleanupRef.current?.();

    if (effectiveOpts.enableScreen) {
      const { stream, stop } = createSimulatedScreenStream(
        effectiveOpts.screenResolution,
        effectiveOpts.screenFps,
        effectiveOpts.enableScreenAudio
      );
      simulatedStreamCleanupRef.current = stop;
      setRemoteStream(stream);
      setRemoteMediaPhase('sharing');
      setRemoteAudioPhase(effectiveOpts.enableScreenAudio ? 'active' : 'unavailable');
    } else {
      setRemoteStream(undefined);
      setRemoteMediaPhase('stopped');
      setRemoteAudioPhase('unavailable');
    }

    if (effectiveOpts.enableCamera) {
      const simCam = createSimulatedCameraStream('Alex (Simulado)', effectiveOpts.avatarUrl, effectiveOpts.cameraResolution, effectiveOpts.cameraFps);
      simulatedCameraCleanupRef.current = simCam.stop;
      setRemoteCameraStream(simCam.stream);
    } else {
      setRemoteCameraStream(undefined);
    }

    setIsSimulatedPeer(true);
    dispatch({ type: 'connected', route: 'direct' });
    dispatch({ type: 'set-remote-user-name', userName: 'Alex (Simulado)' });
    dispatch({ type: 'set-remote-user-avatar', avatar: effectiveOpts.avatarUrl });

    if (effectiveOpts.sendChatMessage && effectiveOpts.chatMessageText?.trim()) {
      dispatch({
        type: 'add-chat-message',
        message: {
          id: crypto.randomUUID(),
          senderName: 'Alex (Simulado)',
          text: effectiveOpts.chatMessageText.trim(),
          timestamp: Date.now(),
        },
      });
    }
  }, [isSimulatedPeer]);

  const getMetrics = useCallback(async (): Promise<WebRtcMetrics> => {
    if (controllerRef.current) {
      try {
        const metrics = await controllerRef.current.getMetrics();
        metricsRef.current = metrics;
        return metrics;
      } catch {
        return metricsRef.current;
      }
    }
    return metricsRef.current;
  }, []);

  return {
    state,
    joinCode,
    sources,
    sourcePickerOpen,
    resolution,
    fps,
    localStream,
    remoteStream,
    localCameraStream,
    remoteCameraStream,
    cameraActive,
    remoteMediaPhase,
    remoteMediaError,
    remoteAudioPhase,
    remoteAudioError,
    isSimulatedPeer,
    setJoinCode,
    setResolution,
    setFps,
    toggleSystemAudio,
    toggleCamera,
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
    deleteChatMessage,
    setUserName,
    setUserAvatar,
    toggleSessionModal,
    toggleChatPanel,
    simulatePeer,
    getMetrics,
  };
};

