import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { formatSessionCode, normalizeSessionCode } from '../../shared/session/code';
import { diagnosticsFormatVersion, type DiagnosticEvent, type DiagnosticsReport, type WebRtcMetrics } from '../../shared/diagnostics';
import type { ScreenSelection, ScreenSource } from '../../shared/screen-source';
import type { CameraState, ChatMessagePayload, RemoteControlConfig, RemoteControlStatus, RemoteInputPayload, RoomChatRequest, ScreenQualitySignature } from '../../shared/session/media-control';
import { roomInviteLifetimeMs, type ChatItem, type HostedRoom, type ParticipantState, type RoomMembershipSnapshot, type RoomSummary, type RoomSystemEventKind, type SessionError, type TailscaleStatus } from '../../shared/session/types';
import { initialSessionState, normalizeUserName, sessionReducer, type AudioPhase, type MediaPhase, type SessionUiState } from './session-machine';
import { WebRtcSession, screenQualityProfileFor, type WebRtcQualitySample } from './webrtc-session';
import { RoomMeshClient } from './room-mesh-client';
import { VoiceActivityMonitor } from './voice-activity';
import { QualityStabilizer, createIdleQualityStabilizationState, type QualitySample, type QualityStabilizationState, type QualityTarget } from './quality-stabilizer';
import { playRoomSystemEventSound } from './room-event-sound';
import { maxRoomChatItems } from './room-chat';
import {
  MICROPHONE_PROCESSING_CHANGE_EVENT,
  MICROPHONE_VOLUME_CHANGE_EVENT,
  getEffectiveMicrophoneProcessing,
  readMicrophoneVolume,
  type EffectiveMicrophoneProcessing,
} from '../audio-preferences';

const errorMessage = (error: SessionError | Error | unknown): string => {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') return error.message;
  return 'Não foi possível concluir a operação.';
};

const stopTracks = (stream: MediaStream | undefined): void => stream?.getTracks().forEach((track) => track.stop());

const createRoomEntityId = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    // The fallback is only for restricted test/webview environments. It is
    // still opaque and meets the wire protocol's bounded identifier rules.
    return `room-participant-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }
};

const simulatedTailscaleStatus = (): TailscaleStatus => ({
  state: 'ready',
  selfIp: '100.100.100.1',
  selfIps: ['100.100.100.1'],
  peers: [{ id: 'test-peer-alex', name: 'Alex (Simulado)', ip: '100.100.100.2', online: true, route: 'direct' }],
  message: 'Rede de teste ativa. Nenhum tráfego está sendo enviado pelo Tailscale.',
});

const getSavedTestNetwork = (): boolean => {
  try { return localStorage.getItem('sfscreen_test_network') === 'true'; } catch { return false; }
};

const simulatedRoom = (): RoomSummary => ({
  id: 'test-room-alex',
  name: 'Sala de Alex (Simulada)',
  hasPassword: false,
  hostIp: '100.100.100.2',
  hostName: 'Alex (Simulado)',
});

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

type QualitySampleDirection = 'outbound' | 'inbound';

const qualityTargetFor = (resolution: StreamResolution, bitrateBps: number): QualityTarget => ({
  ...resDimensionMap[resolution],
  bitrateKbps: Math.max(1, Math.round(bitrateBps / 1_000)),
});

const qualitySampleFromWebRtc = (sample: WebRtcQualitySample, direction: QualitySampleDirection): QualitySample => ({
  sampledAtMs: sample.sampledAtMs,
  width: direction === 'outbound' ? sample.outboundFrameWidth : sample.inboundFrameWidth,
  height: direction === 'outbound' ? sample.outboundFrameHeight : sample.inboundFrameHeight,
  bitrateKbps: direction === 'outbound' ? sample.outboundBitrateKbps : sample.inboundBitrateKbps,
});

const getSavedStreamResolution = (): StreamResolution => {
  try {
    const saved = localStorage.getItem('sfscreen_stream_resolution');
    if (saved === '720p' || saved === '1080p' || saved === '1440p') return saved;
  } catch {
    // Local storage may be unavailable.
  }
  return '1080p';
};

const getSavedStreamFps = (): StreamFps => {
  try {
    const saved = Number(localStorage.getItem('sfscreen_stream_fps'));
    if (saved === 30 || saved === 60) return saved;
  } catch {
    // Local storage may be unavailable.
  }
  return 60;
};

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
  joinRoomCall?: boolean;
}

export interface SessionModel {
  state: SessionUiState;
  joinCode: string;
  sources: ScreenSource[];
  sourcePickerOpen: boolean;
  resolution: StreamResolution;
  fps: StreamFps;
  captureFps?: number;
  outgoingFps?: number;
  /** Bounded first-frame gate for the currently focused direct screen. */
  qualityState?: QualityStabilizationState;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  localCameraStream?: MediaStream;
  remoteCameraStream?: MediaStream;
  cameraActive: boolean;
  voiceActive: boolean;
  voiceMuted: boolean;
  /** Local-only speaking detector. It is driven solely by the microphone track. */
  localSpeaking: boolean;
  /** Remote-only speaking detector. Screen/system audio is never used here. */
  remoteSpeaking: boolean;
  roomCallActive: boolean;
  remoteRoomCallActive: boolean;
  remoteMediaPhase?: MediaPhase;
  remoteMediaError?: string;
  remoteAudioPhase?: AudioPhase;
  remoteAudioError?: string;
  activeRoom?: HostedRoom;
  /** Authoritative V6 membership when this room uses the full direct mesh. */
  roomMembership?: RoomMembershipSnapshot;
  /** Direct WebRTC connections owned locally (never more than three). */
  roomPeerCount?: number;
  isSimulatedPeer: boolean;
  testNetworkEnabled: boolean;
  remoteControlConfig: import('../../shared/session/media-control').RemoteControlConfig;
  remotePeerControlConfig: import('../../shared/session/media-control').RemoteControlConfig;
  remoteControlStatus: import('../../shared/session/media-control').RemoteControlStatus;
  remoteControlOverrideTimeoutMs?: number;
  setJoinCode: (value: string) => void;
  setResolution: (resolution: StreamResolution) => void;
  setFps: (fps: StreamFps) => void;
  toggleSystemAudio: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  toggleVoice: () => Promise<void>;
  toggleVoiceMute: () => void;
  joinRoomCall: () => Promise<void>;
  leaveRoomCall: () => Promise<void>;
  refresh: () => Promise<TailscaleStatus | undefined>;
  openSourcePicker: () => Promise<void>;
  closeSourcePicker: () => void;
  selectSource: (source: ScreenSource, includeSystemAudio: boolean, remoteControl?: Partial<import('../../shared/session/media-control').RemoteControlConfig>, allowWithoutGesture?: boolean) => Promise<void>;
  host: () => Promise<void>;
  join: () => Promise<void>;
  hostRoom: () => Promise<HostedRoom | undefined>;
  discoverRooms: () => Promise<RoomSummary[]>;
  joinRoom: (room: RoomSummary, password: string) => Promise<void>;
  joinRoomByCode: (code: string, password?: string) => Promise<void>;
  confirmSecurity: () => void;
  startSharing: () => Promise<void>;
  stopSharing: () => Promise<void>;
  stopAudio: () => Promise<void>;
  close: () => Promise<void>;
  copyCode: () => Promise<boolean>;
  exportDiagnostics: () => Promise<boolean>;
  sendChatMessage: (text: string, image?: { data: string; name: string }) => void;
  deleteChatMessage: (id: string) => void;
  setUserName: (name: string) => void;
  setUserAvatar: (avatar?: string) => void;
  toggleSessionModal: (open?: boolean) => void;
  toggleChatPanel: (open?: boolean) => void;
  simulatePeer: (enable?: boolean | SimulatedPeerOptions, options?: SimulatedPeerOptions) => void;
  setTestNetworkEnabled: (enabled: boolean) => Promise<void>;
  getMetrics: () => Promise<WebRtcMetrics>;
  updateRemoteControlConfig: (cfg: Partial<import('../../shared/session/media-control').RemoteControlConfig>) => Promise<void>;
  sendRemoteInput: (input: import('../../shared/session/media-control').RemoteInputPayload) => void;
  sendRemoteClipboard: (text: string) => void;
  sendSelectMonitor: (monitorIndex: number) => void;
  resumeRemoteControlOverride: () => Promise<void>;
}


export const useSession = (): SessionModel => {
  const [state, dispatch] = useReducer(sessionReducer, initialSessionState);
  const [joinCode, setJoinCodeState] = useState('');
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [activeRoom, setActiveRoom] = useState<HostedRoom | undefined>(undefined);
  const [roomMembership, setRoomMembership] = useState<RoomMembershipSnapshot | undefined>(undefined);
  const [roomPeerCount, setRoomPeerCount] = useState(0);
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);
  const [roomCallActive, setRoomCallActive] = useState(false);
  const [remoteRoomCallActive, setRemoteRoomCallActive] = useState(false);
  const remoteRoomCallActiveRef = useRef(false);
  const microphoneStreamRef = useRef<MediaStream | undefined>(undefined);
  const rawMicrophoneStreamRef = useRef<MediaStream | undefined>(undefined);
  const microphoneAudioContextRef = useRef<AudioContext | undefined>(undefined);
  const microphoneGainRef = useRef<GainNode | undefined>(undefined);
  const microphoneGateRef = useRef<GainNode | undefined>(undefined);
  const microphoneHighPassRef = useRef<BiquadFilterNode | undefined>(undefined);
  const microphoneLowPassRef = useRef<BiquadFilterNode | undefined>(undefined);
  const microphoneCompressorRef = useRef<DynamicsCompressorNode | undefined>(undefined);
  const microphoneGateIntervalRef = useRef<number | undefined>(undefined);
  const microphoneProcessingRef = useRef<EffectiveMicrophoneProcessing>(getEffectiveMicrophoneProcessing());
  const localVoiceActivityRef = useRef<VoiceActivityMonitor | undefined>(undefined);
  const remoteVoiceActivityRef = useRef<VoiceActivityMonitor | undefined>(undefined);
  const activeRoomRef = useRef<HostedRoom | undefined>(undefined);
  const roomHostRef = useRef(false);
  const localRoomParticipantIdRef = useRef(createRoomEntityId());
  const remoteRoomParticipantRef = useRef<{ id?: string; name?: string; joined: boolean; left: boolean }>({ joined: false, left: false });
  const roomChatSequenceRef = useRef(0);
  const roomChatSeenKeysRef = useRef(new Set<string>());
  const roomChatSeenKeyOrderRef = useRef<string[]>([]);
  const roomChatRequestItemsRef = useRef(new Map<string, ChatItem>());
  const roomCallActiveRef = useRef(false);
  const [resolution, setResolutionState] = useState<StreamResolution>(getSavedStreamResolution);
  const [fps, setFpsState] = useState<StreamFps>(getSavedStreamFps);
  const resolutionRef = useRef<StreamResolution>(resolution);
  const fpsRef = useRef<StreamFps>(fps);
  const [captureFps, setCaptureFps] = useState<number | undefined>(undefined);
  const [outgoingFps, setOutgoingFps] = useState<number | undefined>(undefined);
  const qualityStabilizerRef = useRef(new QualityStabilizer());
  const qualitySamplingRef = useRef(false);
  const qualityGenerationRef = useRef(0);
  const qualityDirectionRef = useRef<QualitySampleDirection>('outbound');
  const [qualityState, setQualityState] = useState<QualityStabilizationState>(createIdleQualityStabilizationState);
  const [localStream, setLocalStream] = useState<MediaStream | undefined>(undefined);
  const [localCameraStream, setLocalCameraStream] = useState<MediaStream | undefined>(undefined);
  const [remoteCameraStream, setRemoteCameraStream] = useState<MediaStream | undefined>(undefined);
  const [cameraActive, setCameraActive] = useState(false);
  const localCameraStreamRef = useRef<MediaStream | undefined>(undefined);
  const simulatedCameraCleanupRef = useRef<(() => void) | null>(null);
  const remoteCameraStateRef = useRef<CameraState>('stopped');
  const rawRemoteCameraStreamRef = useRef<MediaStream | undefined>(undefined);

  const [remoteStream, setRemoteStream] = useState<MediaStream | undefined>(undefined);
  const [remoteMediaPhase, setRemoteMediaPhase] = useState<MediaPhase>('stopped');
  const [remoteMediaError, setRemoteMediaError] = useState<string | undefined>(undefined);
  const [remoteAudioPhase, setRemoteAudioPhase] = useState<AudioPhase>('unavailable');
  const [remoteAudioError, setRemoteAudioError] = useState<string | undefined>(undefined);
  const [isSimulatedPeer, setIsSimulatedPeer] = useState(false);
  const [testNetworkEnabled, setTestNetworkEnabledState] = useState(getSavedTestNetwork);
  const testNetworkEnabledRef = useRef(testNetworkEnabled);
  const simulatePeerRef = useRef<(options?: SimulatedPeerOptions) => void>(() => undefined);
  const [remoteControlConfig, setRemoteControlConfigState] = useState<RemoteControlConfig>({
    enabled: false,
    allowMouse: true,
    allowKeyboard: true,
    allowClipboard: true,
  });
  const [remotePeerControlConfig, setRemotePeerControlConfig] = useState<RemoteControlConfig>({
    enabled: false,
    allowMouse: false,
    allowKeyboard: false,
    allowClipboard: false,
  });
  const [remoteControlStatus, setRemoteControlStatus] = useState<RemoteControlStatus>('idle');
  const [remoteControlOverrideTimeoutMs, setRemoteControlOverrideTimeoutMs] = useState<number | undefined>(undefined);

  const simulatedStreamCleanupRef = useRef<(() => void) | null>(null);
  const controllerRef = useRef<WebRtcSession | undefined>(undefined);
  const roomMeshRef = useRef<RoomMeshClient | undefined>(undefined);
  const activatePreparedStreamRef = useRef<((stream: MediaStream) => Promise<void>) | undefined>(undefined);

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
  const switchMonitorByViewerRef = useRef<((monitorIndex: number) => Promise<void>) | undefined>(undefined);

  const stopMicrophoneCapture = useCallback((): void => {
    if (microphoneGateIntervalRef.current !== undefined) {
      window.clearInterval(microphoneGateIntervalRef.current);
      microphoneGateIntervalRef.current = undefined;
    }
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
    rawMicrophoneStreamRef.current?.getTracks().forEach((track) => track.stop());
    microphoneStreamRef.current = undefined;
    rawMicrophoneStreamRef.current = undefined;
    microphoneGainRef.current = undefined;
    microphoneGateRef.current = undefined;
    microphoneHighPassRef.current = undefined;
    microphoneLowPassRef.current = undefined;
    microphoneCompressorRef.current = undefined;
    localVoiceActivityRef.current?.stop();
    const context = microphoneAudioContextRef.current;
    microphoneAudioContextRef.current = undefined;
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
  }, []);

  const watchLocalVoice = useCallback((stream: MediaStream | undefined): void => {
    if (!localVoiceActivityRef.current) {
      localVoiceActivityRef.current = new VoiceActivityMonitor({ onChange: setLocalSpeaking });
    }
    localVoiceActivityRef.current.watch(stream);
  }, []);

  const watchRemoteVoice = useCallback((stream: MediaStream | undefined): void => {
    if (!remoteVoiceActivityRef.current) {
      remoteVoiceActivityRef.current = new VoiceActivityMonitor({ onChange: setRemoteSpeaking });
    }
    remoteVoiceActivityRef.current.watch(stream);
  }, []);

  useEffect(() => {
    const handleMicrophoneVolumeChange = (event: Event): void => {
      const value = Math.max(0, Math.min(1, Number((event as CustomEvent<string>).detail)));
      const context = microphoneAudioContextRef.current;
      const gain = microphoneGainRef.current;
      if (!context || !gain || !Number.isFinite(value)) return;
      gain.gain.setTargetAtTime(value, context.currentTime, 0.02);
    };
    window.addEventListener(MICROPHONE_VOLUME_CHANGE_EVENT, handleMicrophoneVolumeChange);
    return () => window.removeEventListener(MICROPHONE_VOLUME_CHANGE_EVENT, handleMicrophoneVolumeChange);
  }, []);

  useEffect(() => {
    const handleMicrophoneProcessingChange = (): void => {
      const processing = getEffectiveMicrophoneProcessing();
      microphoneProcessingRef.current = processing;
      const context = microphoneAudioContextRef.current;
      const now = context?.currentTime ?? 0;
      const noiseEnabled = processing.noiseSuppression !== 'off';
      const strong = processing.noiseSuppression === 'strong';

      if (context && microphoneHighPassRef.current) {
        microphoneHighPassRef.current.frequency.setTargetAtTime(noiseEnabled ? (strong ? 80 : 65) : 20, now, 0.03);
      }
      if (context && microphoneLowPassRef.current) {
        microphoneLowPassRef.current.frequency.setTargetAtTime(noiseEnabled ? (strong ? 13_500 : 16_000) : 20_000, now, 0.03);
      }
      if (context && microphoneCompressorRef.current) {
        microphoneCompressorRef.current.ratio.setTargetAtTime(noiseEnabled ? (strong ? 2.2 : 1.5) : 1, now, 0.03);
      }
      if (!noiseEnabled && context && microphoneGateRef.current) {
        microphoneGateRef.current.gain.setTargetAtTime(1, now, 0.01);
      }

      const rawTrack = rawMicrophoneStreamRef.current?.getAudioTracks()[0];
      if (rawTrack?.applyConstraints) {
        void rawTrack.applyConstraints({
          noiseSuppression: noiseEnabled,
          echoCancellation: processing.echoCancellation,
          autoGainControl: processing.autoGainControl,
        }).catch(() => undefined);
      }

      const rawStream = rawMicrophoneStreamRef.current;
      const processedStream = microphoneStreamRef.current;
      if (!noiseEnabled && readMicrophoneVolume() >= 0.999 && context && rawStream && rawTrack && processedStream && processedStream !== rawStream) {
        const currentContext = context;
        const currentRawStream = rawStream;
        const currentRawTrack = rawTrack;
        const currentProcessedStream = processedStream;
        void (async () => {
          try {
            await controllerRef.current?.replaceVoiceTrack(currentRawTrack);
          } catch {
            return;
          }
          if (getEffectiveMicrophoneProcessing().noiseSuppression !== 'off') return;
          if (microphoneGateIntervalRef.current !== undefined) {
            window.clearInterval(microphoneGateIntervalRef.current);
            microphoneGateIntervalRef.current = undefined;
          }
          currentProcessedStream.getTracks().forEach((track) => track.stop());
          microphoneStreamRef.current = currentRawStream;
          localVoiceActivityRef.current?.watch(currentRawStream);
          microphoneAudioContextRef.current = undefined;
          microphoneGainRef.current = undefined;
          microphoneGateRef.current = undefined;
          microphoneHighPassRef.current = undefined;
          microphoneLowPassRef.current = undefined;
          microphoneCompressorRef.current = undefined;
          if (currentContext.state !== 'closed') void currentContext.close().catch(() => undefined);
        })();
      }
    };
    window.addEventListener(MICROPHONE_PROCESSING_CHANGE_EVENT, handleMicrophoneProcessingChange);
    return () => window.removeEventListener(MICROPHONE_PROCESSING_CHANGE_EVENT, handleMicrophoneProcessingChange);
  }, []);

  useEffect(() => {
    localUserNameRef.current = state.localUserName;
  }, [state.localUserName]);

  useEffect(() => {
    localUserAvatarRef.current = state.localUserAvatar;
  }, [state.localUserAvatar]);

  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  const recordDiagnostic = useCallback((event: DiagnosticEvent): void => {
    const startedAt = sessionStartedAtRef.current;
    if (startedAt === undefined || diagnosticEventsRef.current.length >= 500) return;
    diagnosticEventsRef.current.push({ atMs: Math.max(0, Date.now() - startedAt), event });
  }, []);

  const resetRoomChatTimeline = useCallback((): void => {
    roomChatSequenceRef.current = 0;
    roomChatSeenKeysRef.current.clear();
    roomChatSeenKeyOrderRef.current = [];
    roomChatRequestItemsRef.current.clear();
    remoteRoomParticipantRef.current = { joined: false, left: false };
    dispatch({ type: 'clear-room-chat' });
  }, []);

  /**
   * A room item may be echoed through the coordinator or retried after a
   * temporary reconnection. Keep a small id ledger so rendering and audio
   * notification happen exactly once for the canonical item/event.
   */
  const ingestRoomChatItem = useCallback((item: ChatItem): boolean => {
    const keys = [`item:${item.id}`];
    if (item.type === 'system-event') keys.push(`event:${item.event.id}`);
    if (keys.some((key) => roomChatSeenKeysRef.current.has(key))) return false;

    keys.forEach((key) => {
      roomChatSeenKeysRef.current.add(key);
      roomChatSeenKeyOrderRef.current.push(key);
    });
    while (roomChatSeenKeyOrderRef.current.length > maxRoomChatItems * 4) {
      const oldest = roomChatSeenKeyOrderRef.current.shift();
      if (oldest) roomChatSeenKeysRef.current.delete(oldest);
    }
    roomChatSequenceRef.current = Math.max(roomChatSequenceRef.current, item.sequence);
    dispatch({ type: 'add-room-chat-item', item });
    if (item.type === 'system-event') playRoomSystemEventSound(item.event.kind);
    return true;
  }, []);

  const publishRoomChatItem = useCallback((item: ChatItem): boolean => {
    const inserted = ingestRoomChatItem(item);
    if (inserted) controllerRef.current?.sendRoomChatItem(item);
    return inserted;
  }, [ingestRoomChatItem]);

  const createRoomUserItem = useCallback((request: RoomChatRequest, senderId: string, senderName: string): ChatItem => {
    const timestamp = new Date().toISOString();
    return {
      id: request.id,
      sequence: ++roomChatSequenceRef.current,
      type: 'user-message',
      timestamp,
      senderId,
      senderName: normalizeUserName(senderName),
      text: request.text.trim(),
      ...(request.imageData ? { imageData: request.imageData } : {}),
      ...(request.imageName ? { imageName: request.imageName } : {}),
    };
  }, []);

  const emitRoomSystemEvent = useCallback((kind: RoomSystemEventKind, participantId?: string, participantName?: string): void => {
    if (!activeRoomRef.current) return;
    const timestamp = new Date().toISOString();
    const id = createRoomEntityId();
    const sequence = ++roomChatSequenceRef.current;
    publishRoomChatItem({
      id,
      sequence,
      type: 'system-event',
      timestamp,
      event: {
        id,
        sequence,
        kind,
        timestamp,
        ...(participantId ? { participantId } : {}),
        ...(participantName ? { participantName: normalizeUserName(participantName) } : {}),
      },
    });
  }, [publishRoomChatItem]);

  const beginQualityStabilization = useCallback((direction: QualitySampleDirection, targetOverride?: QualityTarget | ScreenQualitySignature): void => {
    const profile = screenQualityProfileFor(resolutionRef.current, fpsRef.current);
    qualityGenerationRef.current += 1;
    qualityDirectionRef.current = direction;
    setQualityState(qualityStabilizerRef.current.begin(targetOverride ?? qualityTargetFor(resolutionRef.current, profile.maxBitrateBps)));
  }, []);

  const resetQualityStabilization = useCallback((): void => {
    qualityGenerationRef.current += 1;
    qualitySamplingRef.current = false;
    setQualityState(qualityStabilizerRef.current.reset());
  }, []);

  /**
   * The regular UI still renders one focused remote stream, while the V6
   * client keeps up to three independent direct peer sessions underneath it.
   * Membership remains authoritative in the coordinator; media remains direct
   * between the two participant browsers.
   */
  const createRoomMeshClient = useCallback((status: TailscaleStatus, isHost: boolean, hostIp?: string): RoomMeshClient => {
    const localParticipant: ParticipantState = {
      id: localRoomParticipantIdRef.current,
      displayName: localUserNameRef.current,
      joinedAt: new Date().toISOString(),
      presence: 'connected',
      callState: roomCallActiveRef.current ? 'in-call' : 'outside-call',
    };
    const client = new RoomMeshClient({
      api: window.sfscreen,
      localParticipant,
      selfIps: status.selfIps ?? (status.selfIp ? [status.selfIp] : []),
      stunServerIp: status.selfIp ?? '',
      isHost,
      hostIp,
      events: {
        onMembership: (snapshot, peerCount) => {
          setRoomMembership(snapshot);
          setRoomPeerCount(peerCount);
          const active = activeRoomRef.current;
          if (!active) return;
          const updated = { ...active, memberCount: snapshot.participants.length };
          activeRoomRef.current = updated;
          setActiveRoom(updated);
        },
        onRemoteStream: (_participant, stream, trackKind) => {
          setRemoteStream(stream);
          if (trackKind === 'video') {
            setRemoteMediaPhase('sharing');
            setRemoteMediaError(undefined);
          }
        },
        onRemoteCameraStream: (_participant, stream) => {
          rawRemoteCameraStreamRef.current = stream;
          setRemoteCameraStream(stream);
        },
        onRemoteVoiceStream: (_participant, stream) => watchRemoteVoice(stream),
        onRemoteSystemAudioStream: () => {
          setRemoteAudioPhase('active');
          setRemoteAudioError(undefined);
        },
        onConnectionState: (_participant, connectionState) => {
          if (connectionState !== 'connected' && connectionState !== 'connecting') {
            setRoomPeerCount((count) => Math.max(0, count - 1));
          }
        },
        onError: (error) => {
          // A single peer can fail or be retried without tearing down the
          // room. Preserve the error as media status instead of closing chat.
          setRemoteMediaError(error.message);
        },
      },
    });
    return client;
  }, [watchRemoteVoice]);

  const syncMeshLocalTracks = useCallback(async (mesh = roomMeshRef.current): Promise<void> => {
    if (!mesh) return;
    const screen = localStreamRef.current?.getVideoTracks().find((track) => track.readyState === 'live');
    const systemAudio = state.includeSystemAudio
      ? localStreamRef.current?.getAudioTracks().find((track) => track.readyState === 'live')
      : undefined;
    const camera = localCameraStreamRef.current?.getVideoTracks().find((track) => track.readyState === 'live');
    const voice = voiceActive
      ? microphoneStreamRef.current?.getAudioTracks().find((track) => track.readyState === 'live')
      : undefined;
    const updates: Array<Promise<void>> = [];
    updates.push(screen ? mesh.setLocalTrack('screen-video', screen) : mesh.removeLocalTrack('screen-video'));
    updates.push(systemAudio ? mesh.setLocalTrack('screen-audio', systemAudio) : mesh.removeLocalTrack('screen-audio'));
    updates.push(camera ? mesh.setLocalTrack('camera-video', camera) : mesh.removeLocalTrack('camera-video'));
    updates.push(voice ? mesh.setLocalTrack('voice-audio', voice) : mesh.removeLocalTrack('voice-audio'));
    await Promise.all(updates);
  }, [state.includeSystemAudio, voiceActive]);

  useEffect(() => {
    void syncMeshLocalTracks().catch(() => undefined);
  }, [localStream, localCameraStream, state.includeSystemAudio, syncMeshLocalTracks, voiceActive]);

  const refresh = useCallback(async (): Promise<TailscaleStatus | undefined> => {
    try {
      if (testNetworkEnabledRef.current) {
        const status = simulatedTailscaleStatus();
        dispatch({ type: 'status', status });
        return status;
      }
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
    await controllerRef.current?.removeSystemAudioTrack();
    await roomMeshRef.current?.removeLocalTrack('screen-audio');
    stream.getAudioTracks().forEach((track) => track.stop());
    controllerRef.current?.sendAudioState('stopped');
    dispatch({ type: 'audio', phase: 'stopped' });
    recordDiagnostic('audio-stopped');
  }, [recordDiagnostic]);

  const stopSharing = useCallback(async (): Promise<void> => {
    if (stoppingMediaRef.current) return;
    stoppingMediaRef.current = true;
    try {
      resetQualityStabilization();
      await controllerRef.current?.parkVideoTrack();
      await controllerRef.current?.removeSystemAudioTrack();
      controllerRef.current?.sendVideoState('stopped');
      controllerRef.current?.sendAudioState('stopped');
      stopTracks(localStreamRef.current);
      localStreamRef.current = undefined;
      capturedSourceIdRef.current = undefined;
      setLocalStream(undefined);
      setCaptureFps(undefined);
      setOutgoingFps(undefined);
      await clearSource();
      dispatch({ type: 'media', phase: 'stopped' });
      dispatch({ type: 'audio', phase: 'stopped' });
      recordDiagnostic('video-stopped');
    } finally {
      stoppingMediaRef.current = false;
    }
  }, [clearSource, recordDiagnostic, resetQualityStabilization]);

  const close = useCallback(async (): Promise<void> => {
    simulatedStreamCleanupRef.current?.();
    simulatedStreamCleanupRef.current = null;
    simulatedCameraCleanupRef.current?.();
    simulatedCameraCleanupRef.current = null;
    setIsSimulatedPeer(false);
    const mesh = roomMeshRef.current;
    roomMeshRef.current = undefined;
    if (mesh) {
      try {
        if (roomHostRef.current) mesh.dispose();
        else await mesh.leave();
      } catch {
        // A failed best-effort leave must not strand local capture or tray
        // shutdown. The host removes inactive guests after its 30 s grace.
        mesh.dispose();
      }
    }
    setRoomMembership(undefined);
    setRoomPeerCount(0);
    const controller = controllerRef.current;
    if (activeRoomRef.current) {
      if (roomHostRef.current) {
        emitRoomSystemEvent('room-deleted', localRoomParticipantIdRef.current, localUserNameRef.current);
      } else {
        // The coordinator turns this into the canonical participant-left item.
        controller?.sendRoomLeave();
      }
      // Ordered control messages place the room event ahead of the close
      // notification for peers that are still connected.
      controller?.sendSessionClosed();
    }
    controller?.close();
    controllerRef.current = undefined;
    remoteIpRef.current = undefined;
    localConfirmedRef.current = false;
    remoteConfirmedRef.current = false;
    setRemoteStream(undefined);
    setRemoteCameraStream(undefined);
    remoteCameraStateRef.current = 'stopped';
    rawRemoteCameraStreamRef.current = undefined;
    setRemoteMediaPhase('stopped');
    setRemoteMediaError(undefined);
    setRemoteAudioPhase('unavailable');
    setRemoteAudioError(undefined);
    resetQualityStabilization();
    setActiveRoom(undefined);
    activeRoomRef.current = undefined;
    roomHostRef.current = false;
    roomCallActiveRef.current = false;
    setRoomCallActive(false);
    remoteRoomCallActiveRef.current = false;
    setRemoteRoomCallActive(false);
    resetRoomChatTimeline();
    stopMicrophoneCapture();
    remoteVoiceActivityRef.current?.stop();
    setVoiceActive(false);
    setVoiceMuted(false);
    setLocalSpeaking(false);
    setRemoteSpeaking(false);
    await window.sfscreen.stopHostedSession();
    recordDiagnostic('session-closed');
    dispatch({ type: 'closed' });
  }, [emitRoomSystemEvent, recordDiagnostic, resetQualityStabilization, resetRoomChatTimeline, stopMicrophoneCapture]);


  const createController = useCallback((): WebRtcSession => {
    controllerRef.current?.close();
    remoteCameraStateRef.current = 'stopped';
    rawRemoteCameraStreamRef.current = undefined;
    const controller = new WebRtcSession({
      onChannelOpen: () => {
        recordDiagnostic('channel-open');
        controller.sendUserProfile(localUserNameRef.current, localUserAvatarRef.current, localRoomParticipantIdRef.current);
        if (activeRoomRef.current) controller.sendRoomCallState(roomCallActiveRef.current ? 'joined' : 'left');
        // DTLS/SRTP is already authenticated at this point. V6 room entry is
        // direct, so a second bilateral confirmation must not block media.
        localConfirmedRef.current = true;
        remoteConfirmedRef.current = true;
        recordDiagnostic('verified');
        dispatch({ type: 'connected' });
        if ((!activeRoomRef.current || roomCallActiveRef.current) && localStreamRef.current) {
          void activatePreparedStreamRef.current?.(localStreamRef.current);
        }
        if ((!activeRoomRef.current || roomCallActiveRef.current) && localCameraStreamRef.current) {
          const cameraTrack = localCameraStreamRef.current.getVideoTracks().find((track) => track.readyState === 'live');
          if (cameraTrack) {
            void controller.replaceCameraTrack(cameraTrack);
            controller.sendCameraState('active');
          }
        }
      },
      onControlMessage: (message) => {
        if (message.type === 'security-confirmed') {
          remoteConfirmedRef.current = true;
          dispatch({ type: 'remote-confirmed' });
          if (localConfirmedRef.current) {
            recordDiagnostic('verified');
            dispatch({ type: 'connected' });
            if ((!activeRoomRef.current || roomCallActiveRef.current) && localCameraStreamRef.current) {
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
          if (activeRoomRef.current) {
            const remote = remoteRoomParticipantRef.current;
            remote.id = message.participantId ?? remote.id;
            remote.name = message.userName;
            if (roomHostRef.current && !remote.joined) {
              remote.joined = true;
              remote.left = false;
              emitRoomSystemEvent('participant-joined', remote.id, remote.name);
            }
          }
          return;
        }
        if (message.type === 'room-chat-item') {
          if (activeRoomRef.current) ingestRoomChatItem(message.item);
          return;
        }
        if (message.type === 'room-chat-request') {
          if (!activeRoomRef.current || !roomHostRef.current) return;
          const existing = roomChatRequestItemsRef.current.get(message.request.id);
          if (existing) {
            // A retried request gets the original canonical envelope back.
            controller.sendRoomChatItem(existing);
            return;
          }
          const remote = remoteRoomParticipantRef.current;
          const item = createRoomUserItem(
            message.request,
            remote.id ?? 'remote-participant',
            remote.name ?? 'Um participante',
          );
          roomChatRequestItemsRef.current.set(message.request.id, item);
          if (roomChatRequestItemsRef.current.size > maxRoomChatItems) {
            const oldestRequestId = roomChatRequestItemsRef.current.keys().next().value;
            if (oldestRequestId) roomChatRequestItemsRef.current.delete(oldestRequestId);
          }
          publishRoomChatItem(item);
          return;
        }
        if (message.type === 'room-leave') {
          if (activeRoomRef.current && roomHostRef.current && !remoteRoomParticipantRef.current.left) {
            const remote = remoteRoomParticipantRef.current;
            remote.left = true;
            emitRoomSystemEvent('participant-left', remote.id, remote.name);
          }
          return;
        }
        if (message.type === 'chat-message') {
          dispatch({ type: 'add-chat-message', message: { ...message.message, isSelf: false } });
          return;
        }
        if (message.type === 'delete-chat-message') {
          dispatch({ type: 'delete-chat-message', id: message.messageId });
          return;
        }
        if (message.type === 'camera-state') {
          remoteCameraStateRef.current = message.state;
          if (message.state === 'active') {
            if (rawRemoteCameraStreamRef.current) {
              setRemoteCameraStream(rawRemoteCameraStreamRef.current);
            }
          } else {
            setRemoteCameraStream(undefined);
          }
          return;
        }
        if (message.type === 'audio-state') {
          setRemoteAudioPhase(message.state);
          setRemoteAudioError(message.state === 'failed' ? 'O áudio remoto não ficou disponível.' : undefined);
          return;
        }
        if (message.type === 'room-call-state') {
          const wasInCall = remoteRoomCallActiveRef.current;
          const isInCall = message.state === 'joined';
          remoteRoomCallActiveRef.current = isInCall;
          setRemoteRoomCallActive(isInCall);
          if (activeRoomRef.current && roomHostRef.current && wasInCall && !isInCall) {
            const remote = remoteRoomParticipantRef.current;
            emitRoomSystemEvent('participant-left-call', remote.id, remote.name);
          }
          return;
        }
        if (message.type === 'session-closed') {
          recordDiagnostic('session-closed');
          setRemoteStream(undefined);
          setRemoteCameraStream(undefined);
          remoteCameraStateRef.current = 'stopped';
          rawRemoteCameraStreamRef.current = undefined;
          setRemoteMediaPhase('stopped');
          setRemoteAudioPhase('unavailable');
          remoteVoiceActivityRef.current?.stop();
          resetQualityStabilization();
          dispatch({ type: 'closed' });
          return;
        }
        if (message.type === 'video-state') {
          if (message.state === 'active') {
            setRemoteMediaPhase('sharing');
            setRemoteMediaError(undefined);
          } else if (message.state === 'starting') {
            beginQualityStabilization('inbound', message.quality);
            setRemoteMediaPhase('starting');
            setRemoteMediaError(undefined);
          } else if (message.state === 'failed') {
            resetQualityStabilization();
            setRemoteMediaPhase('failed');
            setRemoteMediaError('A outra pessoa não conseguiu iniciar o compartilhamento.');
          } else {
            resetQualityStabilization();
            setRemoteMediaPhase('stopped');
            setRemoteMediaError(undefined);
          }
          return;
        }
        if (message.type === 'remote-control-config') {
          setRemotePeerControlConfig(message.config);
          return;
        }
        if (message.type === 'remote-control-status') {
          setRemoteControlStatus(message.status);
          setRemoteControlOverrideTimeoutMs(message.timeoutMs);
          return;
        }
        if (message.type === 'remote-control-input') {
          void window.sfscreen.executeRemoteInput?.(message.input, capturedSourceIdRef.current);
          return;
        }
        if (message.type === 'remote-clipboard') {
          try {
            void navigator.clipboard?.writeText(message.text);
          } catch {
            // Ignored if clipboard write fails
          }
          return;
        }
        if (message.type === 'select-monitor') {
          void switchMonitorByViewerRef.current?.(message.monitorIndex);
          return;
        }
      },
      onConnectionState: (connectionState) => {
        if (connectionState === 'failed') {
          recordDiagnostic('connection-failed');
          setRemoteStream(undefined);
          setRemoteCameraStream(undefined);
          remoteCameraStateRef.current = 'stopped';
          rawRemoteCameraStreamRef.current = undefined;
          setRemoteMediaPhase('stopped');
          setRemoteAudioPhase('unavailable');
          remoteVoiceActivityRef.current?.stop();
          resetQualityStabilization();
          dispatch({ type: 'failed', message: 'A conexão WebRTC falhou pela interface Tailscale.' });
        } else if (connectionState === 'closed' || connectionState === 'disconnected') {
          recordDiagnostic('session-closed');
          setRemoteStream(undefined);
          setRemoteCameraStream(undefined);
          remoteCameraStateRef.current = 'stopped';
          rawRemoteCameraStreamRef.current = undefined;
          setRemoteMediaPhase('stopped');
          setRemoteAudioPhase('unavailable');
          remoteVoiceActivityRef.current?.stop();
          resetQualityStabilization();
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
        rawRemoteCameraStreamRef.current = stream;
        if (remoteCameraStateRef.current === 'active') {
          setRemoteCameraStream(stream);
        }
      },
      onRemoteVoiceStream: (stream) => {
        watchRemoteVoice(stream);
      },
    });
    controllerRef.current = controller;
    return controller;
  }, [beginQualityStabilization, createRoomUserItem, emitRoomSystemEvent, ingestRoomChatItem, publishRoomChatItem, recordDiagnostic, resetQualityStabilization, watchRemoteVoice]);

  const activatePreparedStream = useCallback(async (stream: MediaStream): Promise<void> => {
    const controller = controllerRef.current;
    if (!controller) return;
    const videoTrack = stream.getVideoTracks().find((track) => track.readyState === 'live');
    if (!videoTrack) throw new Error('Nenhuma faixa de vídeo foi disponibilizada pelo monitor selecionado.');

    const profile = screenQualityProfileFor(resolutionRef.current, fpsRef.current);
    const qualitySignature = qualityTargetFor(resolutionRef.current, profile.maxBitrateBps);
    beginQualityStabilization('outbound', qualitySignature);
    controller.sendVideoState('starting', qualitySignature);
    dispatch({ type: 'media', phase: 'starting' });
    recordDiagnostic('video-starting');
    videoTrack.enabled = true;
    await controller.replaceVideoTrack(videoTrack, profile.maxBitrateBps, profile.maxFramerate);

    if (state.includeSystemAudio) {
      controller.sendAudioState('starting');
      dispatch({ type: 'audio', phase: 'starting' });
      recordDiagnostic('audio-starting');
      const audioTrack = stream.getAudioTracks().find((track) => track.readyState === 'live');
      if (audioTrack) {
        audioTrack.enabled = true;
        await controller.replaceSystemAudioTrack(audioTrack);
        controller.sendAudioState('active');
        dispatch({ type: 'audio', phase: 'active' });
        recordDiagnostic('audio-active');
      } else {
        controller.sendAudioState('unavailable');
        dispatch({ type: 'audio', phase: 'unavailable', error: 'O Windows não disponibilizou o áudio do sistema.' });
        recordDiagnostic('audio-unavailable');
      }
    } else {
      await controller.removeSystemAudioTrack();
      controller.sendAudioState('unavailable');
      dispatch({ type: 'audio', phase: 'unavailable' });
    }

    controller.sendVideoState('active', qualitySignature);
    dispatch({ type: 'media', phase: 'sharing' });
    recordDiagnostic('video-active');
  }, [beginQualityStabilization, recordDiagnostic, state.includeSystemAudio]);

  useEffect(() => {
    activatePreparedStreamRef.current = activatePreparedStream;
    return () => {
      activatePreparedStreamRef.current = undefined;
    };
  }, [activatePreparedStream]);

  const captureAndAttach = useCallback(async (source: ScreenSource, includeSystemAudio: boolean, selectionAlreadyArmed: boolean): Promise<void> => {
    const controller = controllerRef.current;
    const isConnected = state.phase === 'connected';
    const previous = localStreamRef.current;
    let captured: MediaStream | undefined;

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
      const dim = resDimensionMap[resolutionRef.current];
      await videoTrack.applyConstraints?.({
        width: { ideal: dim.width, max: dim.width },
        height: { ideal: dim.height, max: dim.height },
        frameRate: { ideal: fpsRef.current, max: fpsRef.current },
      }).catch(() => undefined);
      const acceptedFrameRate = videoTrack.getSettings?.().frameRate;
      setCaptureFps(typeof acceptedFrameRate === 'number' ? Math.round(acceptedFrameRate) : fpsRef.current);
      setOutgoingFps(undefined);
      videoTrack.contentHint = fpsRef.current === 60 ? 'motion' : 'detail';
      videoTrack.enabled = true;
      videoTrack.onended = () => { if (localStreamRef.current === captured) void stopSharing(); };

      if (isConnected && controller) {
        const profile = screenQualityProfileFor(resolutionRef.current, fpsRef.current);
        const qualitySignature = qualityTargetFor(resolutionRef.current, profile.maxBitrateBps);
        beginQualityStabilization('outbound', qualitySignature);
        controller.sendVideoState('starting', qualitySignature);
        await controller.replaceVideoTrack(videoTrack, profile.maxBitrateBps, profile.maxFramerate);
      }


      if (includeSystemAudio) {
        const audioTrack = captured.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = true;
          audioTrack.onended = () => { if (localStreamRef.current === captured) void stopAudio(); };
          if (isConnected && controller) {
            await controller.replaceSystemAudioTrack(audioTrack);
            controller.sendAudioState('active');
          }
          dispatch({ type: 'audio', phase: 'active' });
          recordDiagnostic('audio-active');
        } else {
          if (isConnected && controller) {
            await controller.removeSystemAudioTrack();
            controller.sendAudioState('unavailable');
          }
          dispatch({ type: 'audio', phase: 'unavailable', error: 'O Windows não disponibilizou o áudio do sistema.' });
recordDiagnostic('audio-unavailable');
        }
      } else {
        if (isConnected && controller) {
          await controller.removeSystemAudioTrack();
          controller.sendAudioState('unavailable');
        }
        dispatch({ type: 'audio', phase: 'unavailable' });
      }

      localStreamRef.current = captured;
      capturedSourceIdRef.current = source.id;
      setLocalStream(captured);
      if (previous && previous !== captured) stopTracks(previous);
      if (isConnected && controller) {
        const profile = screenQualityProfileFor(resolutionRef.current, fpsRef.current);
        controller.sendVideoState('active', qualityTargetFor(resolutionRef.current, profile.maxBitrateBps));
      }
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
        resetQualityStabilization();
        controller?.sendVideoState('failed');
        controller?.sendAudioState('failed');
        dispatch({ type: 'media', phase: 'failed', error: message });
      }
    }
  }, [beginQualityStabilization, recordDiagnostic, resetQualityStabilization, state.phase, stopAudio, stopSharing]);

  const openSourcePicker = useCallback(async (): Promise<void> => {
    const result = await window.sfscreen.listScreenSources();
    if (!result.ok) return dispatch({ type: 'media', phase: 'failed', error: result.error.message });
    setSources(result.value);
    setSourcePickerOpen(true);
  }, []);

  const startSharing = useCallback(async (): Promise<void> => {
    if (activeRoomRef.current && !roomCallActiveRef.current) return;
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
      const controller = controllerRef.current;
      if (!controller) return;
      void controller.getMetrics().then((metrics) => {
        metricsRef.current = metrics;
        setOutgoingFps(metrics.videoFramesPerSecond);
      }).catch(() => undefined);
    }, 2_000);
    const qualityTimer = window.setInterval(() => {
      const stabilizer = qualityStabilizerRef.current;
      if (stabilizer.state.phase === 'idle') return;
      const controller = controllerRef.current;
      if (!controller) {
        setQualityState(stabilizer.tick(performance.now()));
        return;
      }
      if (qualitySamplingRef.current) return;

      qualitySamplingRef.current = true;
      const generation = qualityGenerationRef.current;
      const direction = qualityDirectionRef.current;
      void controller.getQualitySample().then((sample) => {
        if (generation !== qualityGenerationRef.current) return;
        setQualityState(stabilizer.sample(qualitySampleFromWebRtc(sample, direction)));
      }).catch(() => {
        if (generation !== qualityGenerationRef.current) return;
        setQualityState(stabilizer.tick(performance.now()));
      }).finally(() => {
        if (generation === qualityGenerationRef.current) qualitySamplingRef.current = false;
      });
    }, 250);
    const unsubscribe = window.sfscreen.onSessionAnswer((event) => {
      const controller = controllerRef.current;
      if (!controller) return;
      void controller.applyAnswer(event.answer).then(() => {
        remoteIpRef.current = event.peerIp;
        dispatch({ type: 'verifying', message: 'Resposta recebida. Autenticando o canal seguro…' });
      }).catch((caught: unknown) => dispatch({ type: 'failed', message: errorMessage(caught) }));
    });
    const unsubStatus = window.sfscreen.onRemoteControlStatusChanged?.((status) => {
      setRemoteControlStatus(status.state);
      setRemoteControlOverrideTimeoutMs(status.timeoutMs);
      controllerRef.current?.sendRemoteControlStatus(status.state, status.timeoutMs);
    });
    return () => {
      window.clearInterval(clock);
      window.clearInterval(metricsTimer);
      window.clearInterval(qualityTimer);
      unsubscribe();
      unsubStatus?.();
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

  // A room may be opened before another machine is online. Tailscale still
  // assigns a local address in `no-peers`, which is enough for the listener to
  // bind and advertise later when a peer becomes available.
  const requireRoomHostNetwork = useCallback(async (): Promise<TailscaleStatus | undefined> => {
    const status = await refresh();
    if (!status || !status.selfIp || (status.state !== 'ready' && status.state !== 'no-peers')) {
      dispatch({ type: 'failed', message: status?.message ?? 'Tailscale indisponível para abrir a sala.' });
      return undefined;
    }
    return status;
  }, [refresh]);

  const selectSource = useCallback(async (source: ScreenSource, includeSystemAudio: boolean, remoteControl?: Partial<RemoteControlConfig>, allowWithoutGesture = false): Promise<void> => {
    const selection: ScreenSelection = { sourceId: source.id, includeSystemAudio, allowWithoutGesture };
    const result = await window.sfscreen.selectScreenSource(selection);
    if (!result.ok) return dispatch({ type: 'media', phase: 'failed', error: result.error.message });
    dispatch({ type: 'source-selected', source, includeSystemAudio });
    setSourcePickerOpen(false);
    if (remoteControl) {
      const updated: RemoteControlConfig = {
        enabled: remoteControl.enabled ?? false,
        allowMouse: remoteControl.allowMouse ?? true,
        allowKeyboard: remoteControl.allowKeyboard ?? true,
        allowClipboard: remoteControl.allowClipboard ?? true,
      };
      setRemoteControlConfigState(updated);
      void window.sfscreen.setRemoteControlHostConfig(updated);
      controllerRef.current?.sendRemoteControlConfig(updated);
    }
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
        await controller.removeSystemAudioTrack();
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
          await controller.replaceSystemAudioTrack(existingAudioTrack);
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
      if (testNetworkEnabledRef.current) {
        dispatch({ type: 'hosted', hosted: { code: 'TST-000-1', expiresAt: new Date(Date.now() + 10 * 60 * 1_000).toISOString() } });
        return;
      }

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
      if (testNetworkEnabledRef.current) {
        simulatePeerRef.current();
        return;
      }
      const found = await window.sfscreen.findSession(code);
      if (!found.ok) return dispatch({ type: 'failed', message: found.error.message });
      remoteIpRef.current = found.value.hostIp;
      dispatch({ type: 'begin', role: 'viewer', phase: 'negotiating', message: 'Sessão encontrada. Criando conexão segura…' });
      const controller = createController();
      const { answer } = await controller.createAnswer(found.value.offer, status.selfIps ?? [status.selfIp], found.value.hostIp);
      dispatch({ type: 'verifying', message: 'Resposta enviada. Autenticando o canal seguro…' });
      const submitted = await window.sfscreen.submitAnswer(found.value.hostIp, code, answer);
      if (!submitted.ok) dispatch({ type: 'failed', message: submitted.error.message });
    } catch (caught) {
      controllerRef.current?.close();
      dispatch({ type: 'failed', message: errorMessage(caught) });
    }
  }, [joinCode, createController, recordDiagnostic, requireReady]);

  const hostRoom = useCallback(async (): Promise<HostedRoom | undefined> => {
    roomHostRef.current = false;
    roomCallActiveRef.current = false;
    setRoomCallActive(false);
    remoteRoomCallActiveRef.current = false;
    setRemoteRoomCallActive(false);
    resetRoomChatTimeline();
    dispatch({ type: 'begin', role: 'host', phase: 'hosting', message: 'Abrindo a sala privada na tailnet…' });
    sessionStartedAtRef.current = Date.now();
    diagnosticEventsRef.current = [];
    metricsRef.current = {};
    recordDiagnostic('session-started');
    try {
      const status = await requireRoomHostNetwork();
      if (!status?.selfIp) return undefined;
      if (testNetworkEnabledRef.current) {
        const saved = await window.sfscreen.getLocalRoom();
        if (!saved.ok || !saved.value) throw new Error(saved.ok ? 'Crie uma sala antes de hospedá-la.' : saved.error.message);
        const hosted: HostedRoom = { room: saved.value, expiresAt: new Date(Date.now() + 10 * 60 * 1_000).toISOString() };
        activeRoomRef.current = hosted;
        setActiveRoom(hosted);
        roomHostRef.current = true;
        emitRoomSystemEvent('participant-joined', localRoomParticipantIdRef.current, localUserNameRef.current);
        dispatch({ type: 'connected' });
        return hosted;
      }
      if (typeof window.sfscreen?.hostMeshRoomSession !== 'function') {
        throw new Error('O SFScreen foi atualizado. Feche e abra o aplicativo para carregar o novo sistema de salas.');
      }
      // The bootstrap offer keeps the listener contract compatible while the
      // V6 coordinator exchanges a distinct direct offer/answer for every
      // participant pair. It never carries room media itself.
      const bootstrap = createController();
      const offer = await bootstrap.createOffer(status.selfIps ?? [status.selfIp], status.selfIp, crypto.randomUUID(), crypto.randomUUID());
      const hostParticipant: ParticipantState = {
        id: localRoomParticipantIdRef.current,
        displayName: localUserNameRef.current,
        joinedAt: new Date().toISOString(),
        presence: 'connected',
        callState: 'outside-call',
      };
      const result = await window.sfscreen.hostMeshRoomSession(offer, hostParticipant);
      if (!result.ok) throw new Error(result.error.message);
      bootstrap.close();
      controllerRef.current = undefined;
      const mesh = createRoomMeshClient(status, true);
      roomMeshRef.current?.dispose();
      roomMeshRef.current = mesh;
      mesh.startHosted(result.value.membership);
      await syncMeshLocalTracks(mesh);
      activeRoomRef.current = result.value;
      setActiveRoom(result.value);
      roomHostRef.current = true;
      emitRoomSystemEvent('participant-joined', localRoomParticipantIdRef.current, localUserNameRef.current);
      // The owner is now inside the room even if no guest has connected yet.
      // Entering the call remains a separate explicit action.
      dispatch({ type: 'connected' });
      return result.value;
    } catch (caught) {
      controllerRef.current?.close();
      roomHostRef.current = false;
      dispatch({ type: 'failed', message: errorMessage(caught) });
      return undefined;
    }
  }, [createController, createRoomMeshClient, emitRoomSystemEvent, recordDiagnostic, requireRoomHostNetwork, resetRoomChatTimeline, syncMeshLocalTracks]);

  const discoverRooms = useCallback(async (): Promise<RoomSummary[]> => {
    if (testNetworkEnabledRef.current) return [simulatedRoom()];
    if (typeof window.sfscreen?.discoverRooms !== 'function') {
      throw new Error('O SFScreen foi atualizado. Feche e abra o aplicativo para carregar o novo sistema de salas.');
    }
    const result = await window.sfscreen.discoverRooms();
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  }, []);

  const setTestNetworkEnabled = useCallback(async (enabled: boolean): Promise<void> => {
    testNetworkEnabledRef.current = enabled;
    setTestNetworkEnabledState(enabled);
    try { localStorage.setItem('sfscreen_test_network', String(enabled)); } catch { /* Ignored */ }
    setActiveRoom(undefined);
    activeRoomRef.current = undefined;
    roomHostRef.current = false;
    roomCallActiveRef.current = false;
    setRoomCallActive(false);
    remoteRoomCallActiveRef.current = false;
    setRemoteRoomCallActive(false);
    resetRoomChatTimeline();
    dispatch({ type: 'closed' });
    await refresh();
  }, [refresh, resetRoomChatTimeline]);

  const joinRoom = useCallback(async (room: RoomSummary, password: string): Promise<void> => {
    const roomId = room.id;
    const hostedRoom: HostedRoom = { room, expiresAt: new Date(Date.now() + 10 * 60 * 1_000).toISOString() };
    roomHostRef.current = false;
    resetRoomChatTimeline();
    activeRoomRef.current = hostedRoom;
    setActiveRoom(hostedRoom);
    roomCallActiveRef.current = false;
    setRoomCallActive(false);
    remoteRoomCallActiveRef.current = false;
    setRemoteRoomCallActive(false);
    dispatch({ type: 'begin', role: 'viewer', phase: 'searching', message: 'Entrando na sala privada pela tailnet…' });
    sessionStartedAtRef.current = Date.now();
    diagnosticEventsRef.current = [];
    metricsRef.current = {};
    recordDiagnostic('session-started');
    try {
      const status = await requireReady();
      if (!status?.selfIp) return;
      if (testNetworkEnabledRef.current) {
        const testRoom = simulatedRoom();
        if (testRoom.id !== roomId) throw new Error('A sala simulada não está mais disponível.');
        simulatePeerRef.current();
        return;
      }
      if (typeof window.sfscreen?.findRoom !== 'function' || typeof window.sfscreen?.submitRoomAnswer !== 'function') {
        throw new Error('O SFScreen foi atualizado. Feche e abra o aplicativo para carregar o novo sistema de salas.');
      }
      const found = await window.sfscreen.findRoom(roomId, password);
      if (!found.ok) throw new Error(found.error.message);
      remoteIpRef.current = found.value.hostIp;
      if (found.value.topology === 'mesh') {
        const mesh = createRoomMeshClient(status, false, found.value.hostIp);
        roomMeshRef.current?.dispose();
        roomMeshRef.current = mesh;
        await mesh.join({ roomId, password });
        await syncMeshLocalTracks(mesh);
        dispatch({ type: 'connected' });
        return;
      }
      dispatch({ type: 'begin', role: 'viewer', phase: 'negotiating', message: 'Sala encontrada. Criando conexão P2P segura…' });
      const controller = createController();
      const { answer } = await controller.createAnswer(found.value.offer, status.selfIps ?? [status.selfIp], found.value.hostIp);
      dispatch({ type: 'verifying', message: 'Conexão com a sala criada. Autenticando o canal seguro…' });
      const submitted = await window.sfscreen.submitRoomAnswer(found.value.hostIp, roomId, password, answer);
      if (!submitted.ok) throw new Error(submitted.error.message);
    } catch (caught) {
      controllerRef.current?.close();
      activeRoomRef.current = undefined;
      setActiveRoom(undefined);
      resetRoomChatTimeline();
      dispatch({ type: 'failed', message: errorMessage(caught) });
    }
  }, [createController, createRoomMeshClient, recordDiagnostic, requireReady, resetRoomChatTimeline, syncMeshLocalTracks]);

  const joinRoomByCode = useCallback(async (rawCode: string, password?: string): Promise<void> => {
    const inviteCode = normalizeSessionCode(rawCode);
    if (inviteCode.length !== 7) {
      dispatch({ type: 'failed', message: 'Digite um código de sala válido no formato XXX-XXX-X.' });
      return;
    }

    roomHostRef.current = false;
    resetRoomChatTimeline();
    roomCallActiveRef.current = false;
    setRoomCallActive(false);
    remoteRoomCallActiveRef.current = false;
    setRemoteRoomCallActive(false);
    dispatch({ type: 'begin', role: 'viewer', phase: 'searching', message: 'Procurando a sala pelo código…' });
    sessionStartedAtRef.current = Date.now();
    diagnosticEventsRef.current = [];
    metricsRef.current = {};
    recordDiagnostic('session-started');

    try {
      const status = await requireReady();
      if (!status?.selfIp) return;
      if (testNetworkEnabledRef.current) {
        const room = simulatedRoom();
        const hosted: HostedRoom = {
          room,
          code: inviteCode,
          expiresAt: new Date(Date.now() + roomInviteLifetimeMs).toISOString(),
        };
        activeRoomRef.current = hosted;
        setActiveRoom(hosted);
        simulatePeerRef.current();
        return;
      }
      if (typeof window.sfscreen?.findRoomByCode !== 'function' || typeof window.sfscreen?.submitRoomAnswer !== 'function') {
        throw new Error('O SFScreen foi atualizado. Feche e abra o aplicativo para carregar o novo sistema de salas.');
      }

      const found = await window.sfscreen.findRoomByCode(inviteCode, password);
      if (!found.ok) throw new Error(found.error.message);
      const hosted: HostedRoom = {
        room: found.value.room,
        code: inviteCode,
        expiresAt: new Date(Date.now() + roomInviteLifetimeMs).toISOString(),
      };
      activeRoomRef.current = hosted;
      setActiveRoom(hosted);
      remoteIpRef.current = found.value.hostIp;
      if (found.value.topology === 'mesh') {
        const mesh = createRoomMeshClient(status, false, found.value.hostIp);
        roomMeshRef.current?.dispose();
        roomMeshRef.current = mesh;
        await mesh.join({ roomId: found.value.room.id, inviteCode, ...(password ? { password } : {}) });
        await syncMeshLocalTracks(mesh);
        dispatch({ type: 'connected' });
        return;
      }
      dispatch({ type: 'begin', role: 'viewer', phase: 'negotiating', message: 'Sala encontrada. Criando conexão P2P segura…' });
      const controller = createController();
      const { answer } = await controller.createAnswer(found.value.offer, status.selfIps ?? [status.selfIp], found.value.hostIp);
      dispatch({ type: 'verifying', message: 'Entrada autorizada. Autenticando o canal seguro…' });
      const submitted = await window.sfscreen.submitRoomAnswer(found.value.hostIp, found.value.room.id, password, answer, inviteCode);
      if (!submitted.ok) throw new Error(submitted.error.message);
    } catch (caught) {
      controllerRef.current?.close();
      activeRoomRef.current = undefined;
      setActiveRoom(undefined);
      resetRoomChatTimeline();
      dispatch({ type: 'failed', message: errorMessage(caught) });
    }
  }, [createController, createRoomMeshClient, recordDiagnostic, requireReady, resetRoomChatTimeline, syncMeshLocalTracks]);

  const toggleVoice = useCallback(async (): Promise<void> => {
    const controller = controllerRef.current;
    if (state.phase !== 'connected') return;
    if (activeRoomRef.current && !roomCallActiveRef.current) return;
    if (!controller && !roomMeshRef.current && !testNetworkEnabledRef.current) return;
    if (voiceActive) {
      stopMicrophoneCapture();
      const systemTrack = state.includeSystemAudio ? localStreamRef.current?.getAudioTracks().find((track) => track.readyState === 'live') : undefined;
      if (controller) {
        // Voice and screen audio use independent transceivers. Stopping the
        // microphone must never replace or remove the screen-audio sender.
        await controller.removeVoiceTrack();
        if (systemTrack) {
          await controller.replaceSystemAudioTrack(systemTrack);
          controller.sendAudioState('active');
        } else {
          await controller.removeSystemAudioTrack();
          controller.sendAudioState('unavailable');
        }
      }
      setVoiceActive(false);
      setVoiceMuted(false);
      return;
    }
    const preferred = (() => { try { return localStorage.getItem('sfscreen_preferred_microphone') || 'default'; } catch { return 'default'; } })();
    const processing = getEffectiveMicrophoneProcessing();
    microphoneProcessingRef.current = processing;
    const noiseEnabled = processing.noiseSuppression !== 'off';
    const rawStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: preferred === 'default' ? 'default' : { exact: preferred },
        echoCancellation: processing.echoCancellation,
        noiseSuppression: noiseEnabled,
        autoGainControl: processing.autoGainControl,
      },
      video: false,
    });
    let stream = rawStream;
    let audioContext: AudioContext | undefined;
    let gainNode: GainNode | undefined;
    let gateNode: GainNode | undefined;
    let highPassNode: BiquadFilterNode | undefined;
    let lowPassNode: BiquadFilterNode | undefined;
    let compressorNode: DynamicsCompressorNode | undefined;
    let gateInterval: number | undefined;
    const microphoneVolume = readMicrophoneVolume();
    const needsAudioGraph = noiseEnabled || Math.abs(microphoneVolume - 1) > 0.001;
    try {
      const AudioContextConstructor = window.AudioContext;
      if (AudioContextConstructor && needsAudioGraph) {
        audioContext = new AudioContextConstructor();
        if (audioContext.state === 'suspended') await audioContext.resume();
        const source = audioContext.createMediaStreamSource(rawStream);
        const destination = audioContext.createMediaStreamDestination();
        gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(microphoneVolume, audioContext.currentTime);

        if (noiseEnabled) {
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.68;
          highPassNode = audioContext.createBiquadFilter();
          highPassNode.type = 'highpass';
          highPassNode.frequency.setValueAtTime(processing.noiseSuppression === 'strong' ? 80 : 65, audioContext.currentTime);
          highPassNode.Q.setValueAtTime(0.66, audioContext.currentTime);
          lowPassNode = audioContext.createBiquadFilter();
          lowPassNode.type = 'lowpass';
          lowPassNode.frequency.setValueAtTime(processing.noiseSuppression === 'strong' ? 13_500 : 16_000, audioContext.currentTime);
          lowPassNode.Q.setValueAtTime(0.25, audioContext.currentTime);
          gateNode = audioContext.createGain();
          gateNode.gain.setValueAtTime(1, audioContext.currentTime);
          compressorNode = audioContext.createDynamicsCompressor();
          compressorNode.threshold.setValueAtTime(-26, audioContext.currentTime);
          compressorNode.knee.setValueAtTime(22, audioContext.currentTime);
          compressorNode.ratio.setValueAtTime(processing.noiseSuppression === 'strong' ? 2.2 : 1.5, audioContext.currentTime);
          compressorNode.attack.setValueAtTime(0.008, audioContext.currentTime);
          compressorNode.release.setValueAtTime(0.24, audioContext.currentTime);

          source.connect(highPassNode);
          highPassNode.connect(lowPassNode);
          lowPassNode.connect(analyser);
          analyser.connect(gateNode);
          gateNode.connect(compressorNode);
          compressorNode.connect(gainNode);

          const samples = new Uint8Array(analyser.fftSize);
          let noiseFloor = 0.006;
          let hangoverFrames = 0;
          let gateOpen = true;
          gateInterval = window.setInterval(() => {
            if (!audioContext || audioContext.state === 'closed' || !gateNode) return;
            const current = microphoneProcessingRef.current;
            if (current.noiseSuppression === 'off') {
              if (!gateOpen) gateNode.gain.setTargetAtTime(1, audioContext.currentTime, 0.006);
              gateOpen = true;
              return;
            }

            analyser.getByteTimeDomainData(samples);
            let energy = 0;
            for (const sample of samples) {
              const normalized = (sample - 128) / 128;
              energy += normalized * normalized;
            }
            const rms = Math.sqrt(energy / samples.length);
            const strongSuppression = current.noiseSuppression === 'strong';
            if (current.autoSensitivity && rms < Math.max(0.032, noiseFloor * 1.6)) {
              noiseFloor = (noiseFloor * 0.975) + (rms * 0.025);
            }
            const automaticThreshold = Math.max(0.006, Math.min(strongSuppression ? 0.038 : 0.028, noiseFloor * (strongSuppression ? 2.25 : 1.75)));
            const manualThreshold = 0.004 + ((1 - current.sensitivity) * 0.052);
            const threshold = current.autoSensitivity ? automaticThreshold : manualThreshold;
            const voiceDetected = rms >= threshold;

            if (voiceDetected) hangoverFrames = strongSuppression ? 28 : 22;
            else if (hangoverFrames > 0) hangoverFrames -= 1;
            const shouldOpen = voiceDetected || hangoverFrames > 0;
            if (shouldOpen !== gateOpen) {
              gateOpen = shouldOpen;
              const closedLevel = strongSuppression ? 0.1 : 0.28;
              gateNode.gain.setTargetAtTime(gateOpen ? 1 : closedLevel, audioContext.currentTime, gateOpen ? 0.004 : 0.12);
            }
          }, 16);
        } else {
          // Keep the Natural profile transparent: only apply the user's gain when needed.
          source.connect(gainNode);
        }
        gainNode.connect(destination);

        const processedTrack = destination.stream.getAudioTracks()[0];
        if (processedTrack) stream = new MediaStream([processedTrack]);
      }
    } catch {
      if (gateInterval !== undefined) window.clearInterval(gateInterval);
      if (audioContext && audioContext.state !== 'closed') void audioContext.close().catch(() => undefined);
      audioContext = undefined;
      gainNode = undefined;
      gateNode = undefined;
      highPassNode = undefined;
      lowPassNode = undefined;
      compressorNode = undefined;
      gateInterval = undefined;
      stream = rawStream;
    }
    if (stream === rawStream && audioContext) {
      if (gateInterval !== undefined) window.clearInterval(gateInterval);
      if (audioContext.state !== 'closed') void audioContext.close().catch(() => undefined);
      audioContext = undefined;
      gainNode = undefined;
      gateNode = undefined;
      highPassNode = undefined;
      lowPassNode = undefined;
      compressorNode = undefined;
      gateInterval = undefined;
    }
    const track = stream.getAudioTracks()[0];
    if (!track) {
      rawStream.getTracks().forEach((rawTrack) => rawTrack.stop());
      throw new Error('O microfone selecionado não ficou disponível.');
    }
    track.enabled = true;
    const handleEnded = (): void => {
      if (microphoneStreamRef.current === stream || rawMicrophoneStreamRef.current === rawStream) {
        localVoiceActivityRef.current?.stop();
        setVoiceActive(false);
        setVoiceMuted(false);
        setLocalSpeaking(false);
      }
    };
    track.onended = handleEnded;
    rawStream.getAudioTracks()[0].onended = handleEnded;
    stopMicrophoneCapture();
    microphoneStreamRef.current = stream;
    rawMicrophoneStreamRef.current = rawStream;
    microphoneAudioContextRef.current = stream === rawStream ? undefined : audioContext;
    microphoneGainRef.current = stream === rawStream ? undefined : gainNode;
    microphoneGateRef.current = stream === rawStream ? undefined : gateNode;
    microphoneHighPassRef.current = stream === rawStream ? undefined : highPassNode;
    microphoneLowPassRef.current = stream === rawStream ? undefined : lowPassNode;
    microphoneCompressorRef.current = stream === rawStream ? undefined : compressorNode;
    microphoneGateIntervalRef.current = stream === rawStream ? undefined : gateInterval;
    watchLocalVoice(stream);
    try {
      if (controller) {
        await controller.replaceVoiceTrack(track);
      }
    } catch (error) {
      stopMicrophoneCapture();
      throw error;
    }
    setVoiceActive(true);
    setVoiceMuted(false);
  }, [state.includeSystemAudio, state.phase, stopMicrophoneCapture, voiceActive, watchLocalVoice]);

  const toggleVoiceMute = useCallback((): void => {
    const track = microphoneStreamRef.current?.getAudioTracks()[0];
    if (!track || !voiceActive) return;
    track.enabled = !track.enabled;
    setVoiceMuted(!track.enabled);
    if (!track.enabled) {
      localVoiceActivityRef.current?.setInactive();
    }
  }, [voiceActive]);

  const confirmSecurity = useCallback((): void => {
    localConfirmedRef.current = true;
    controllerRef.current?.confirmSecurity();
    controllerRef.current?.sendUserProfile(localUserNameRef.current, localUserAvatarRef.current, localRoomParticipantIdRef.current);
    dispatch({ type: 'local-confirmed' });
    if (remoteConfirmedRef.current) {
      recordDiagnostic('verified');
      dispatch({ type: 'connected' });
      if ((!activeRoomRef.current || roomCallActiveRef.current) && localStreamRef.current) {
        void activatePreparedStream(localStreamRef.current);
      }
      if ((!activeRoomRef.current || roomCallActiveRef.current) && localCameraStreamRef.current) {
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
    const text = activeRoomRef.current?.code ?? state.hosted?.code;
    if (!text) return false;
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
    const appVersion = await window.sfscreen.getAppVersion?.().catch(() => '0.0.0') ?? '0.0.0';
    const report: DiagnosticsReport = {
      formatVersion: diagnosticsFormatVersion,
      appVersion,
      exportedAt: new Date().toISOString(),
      route,
      events: diagnosticEventsRef.current,
      peers: controllerRef.current ? [{ id: 'peer-1', metrics: metricsRef.current }] : [],
    };
    const result = await window.sfscreen.exportDiagnostics(report);
    return result.ok && result.value;
  }, [state.route]);

  const setResolution = useCallback((newResolution: StreamResolution): void => {
    resolutionRef.current = newResolution;
    setResolutionState(newResolution);
    try { localStorage.setItem('sfscreen_stream_resolution', newResolution); } catch { /* ignore */ }
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
    const profile = screenQualityProfileFor(newResolution, fpsRef.current);
    void controllerRef.current?.updateVideoParameters(profile.maxBitrateBps, profile.maxFramerate);
  }, []);

  const setFps = useCallback((newFps: StreamFps): void => {
    fpsRef.current = newFps;
    setFpsState(newFps);
    try { localStorage.setItem('sfscreen_stream_fps', String(newFps)); } catch { /* ignore */ }
    const stream = localStreamRef.current;
    if (stream) {
      const videoTrack = stream.getVideoTracks().find((t) => t.readyState === 'live');
      if (videoTrack && videoTrack.applyConstraints) {
        videoTrack.contentHint = newFps === 60 ? 'motion' : 'detail';
        void videoTrack.applyConstraints({
          frameRate: { ideal: newFps, max: newFps },
        }).catch(() => undefined);
      }
    }
    const profile = screenQualityProfileFor(resolutionRef.current, newFps);
    void controllerRef.current?.updateVideoParameters(profile.maxBitrateBps, profile.maxFramerate);
  }, []);

  const deleteChatMessage = useCallback((id: string): void => {
    dispatch({ type: 'delete-chat-message', id });
    if (state.phase === 'connected') {
      controllerRef.current?.sendDeleteChatMessage(id);
    }
  }, [state.phase]);

  const sendChatMessage = useCallback((text: string, image?: { data: string; name: string }): void => {
    const trimmed = text.trim();
    if (!trimmed && !image) return;
    if (activeRoomRef.current) {
      const request: RoomChatRequest = {
        id: createRoomEntityId(),
        text: trimmed,
        imageData: image?.data,
        imageName: image?.name,
      };
      if (roomHostRef.current) {
        const item = createRoomUserItem(request, localRoomParticipantIdRef.current, localUserNameRef.current);
        roomChatRequestItemsRef.current.set(request.id, item);
        if (roomChatRequestItemsRef.current.size > maxRoomChatItems) {
          const oldestRequestId = roomChatRequestItemsRef.current.keys().next().value;
          if (oldestRequestId) roomChatRequestItemsRef.current.delete(oldestRequestId);
        }
        publishRoomChatItem(item);
      } else {
        // Guests do not choose a sequence. They wait for the coordinator's
        // echoed item, which avoids different local orders during reconnects.
        controllerRef.current?.sendRoomChatRequest(request);
      }
      return;
    }
    const message: ChatMessagePayload = {
      id: crypto.randomUUID(),
      senderName: state.localUserName,
      text: trimmed,
      imageData: image?.data,
      imageName: image?.name,
      timestamp: Date.now(),
      isSelf: true,
    };
    dispatch({ type: 'add-chat-message', message });
    if (state.phase === 'connected') {
      controllerRef.current?.sendChatMessage(message);
    }
  }, [createRoomUserItem, publishRoomChatItem, state.localUserName, state.phase]);

  const setUserName = useCallback((name: string): void => {
    const normalized = normalizeUserName(name);
    dispatch({ type: 'set-user-name', name: normalized });
    if (state.phase === 'connected') {
      controllerRef.current?.sendUserProfile(normalized, localUserAvatarRef.current, localRoomParticipantIdRef.current);
    }
  }, [state.phase]);

  const setUserAvatar = useCallback((avatar?: string): void => {
    dispatch({ type: 'set-local-user-avatar', avatar });
    if (state.phase === 'connected') {
      controllerRef.current?.sendUserProfile(localUserNameRef.current, avatar, localRoomParticipantIdRef.current);
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
    if (activeRoomRef.current && !roomCallActiveRef.current) return;
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

  const joinRoomCall = useCallback(async (): Promise<void> => {
    if (!activeRoomRef.current || state.phase !== 'connected' || roomCallActiveRef.current) return;
    roomCallActiveRef.current = true;
    setRoomCallActive(true);
    controllerRef.current?.sendRoomCallState('joined');
    if (testNetworkEnabledRef.current && isSimulatedPeer) {
      remoteRoomCallActiveRef.current = true;
      setRemoteRoomCallActive(true);
      simulatePeerRef.current({ joinRoomCall: true, sendChatMessage: false });
    }
    try {
      if (!voiceActive) await toggleVoice();
    } catch (caught) {
      dispatch({ type: 'audio', phase: 'failed', error: `Você entrou na chamada, mas o microfone não iniciou: ${errorMessage(caught)}` });
    }
  }, [isSimulatedPeer, state.phase, toggleVoice, voiceActive]);

  const leaveRoomCall = useCallback(async (): Promise<void> => {
    if (!activeRoomRef.current || !roomCallActiveRef.current) return;
    if (voiceActive) await toggleVoice();
    if (cameraActive) await stopCamera();
    if (state.mediaPhase === 'sharing') await stopSharing();
    roomCallActiveRef.current = false;
    setRoomCallActive(false);
    controllerRef.current?.sendRoomCallState('left');
    if (roomHostRef.current) {
      emitRoomSystemEvent('participant-left-call', localRoomParticipantIdRef.current, localUserNameRef.current);
    }
  }, [cameraActive, emitRoomSystemEvent, state.mediaPhase, stopCamera, stopSharing, toggleVoice, voiceActive]);

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
      setRemoteRoomCallActive(false);
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
      joinRoomCall: opts?.joinRoomCall ?? !activeRoomRef.current,
    };

    simulatedStreamCleanupRef.current?.();
    simulatedCameraCleanupRef.current?.();

    if (effectiveOpts.joinRoomCall && effectiveOpts.enableScreen) {
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

    if (effectiveOpts.joinRoomCall && effectiveOpts.enableCamera) {
      const simCam = createSimulatedCameraStream('Alex (Simulado)', effectiveOpts.avatarUrl, effectiveOpts.cameraResolution, effectiveOpts.cameraFps);
      simulatedCameraCleanupRef.current = simCam.stop;
      setRemoteCameraStream(simCam.stream);
    } else {
      setRemoteCameraStream(undefined);
    }

    setIsSimulatedPeer(true);
    setRemoteRoomCallActive(effectiveOpts.joinRoomCall === true);
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

  useEffect(() => {
    simulatePeerRef.current = (options) => simulatePeer(true, options);
  }, [simulatePeer]);

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

  const updateRemoteControlConfig = useCallback(async (cfg: Partial<RemoteControlConfig>): Promise<void> => {
    const updated: RemoteControlConfig = {
      enabled: cfg.enabled ?? remoteControlConfig.enabled,
      allowMouse: cfg.allowMouse ?? remoteControlConfig.allowMouse,
      allowKeyboard: cfg.allowKeyboard ?? remoteControlConfig.allowKeyboard,
      allowClipboard: cfg.allowClipboard ?? remoteControlConfig.allowClipboard,
    };
    setRemoteControlConfigState(updated);
    await window.sfscreen.setRemoteControlHostConfig?.(updated);
    controllerRef.current?.sendRemoteControlConfig(updated);
  }, [remoteControlConfig]);

  const sendRemoteInput = useCallback((input: RemoteInputPayload): void => {
    controllerRef.current?.sendRemoteInput(input);
  }, []);

  const sendRemoteClipboard = useCallback((text: string): void => {
    if (text.trim()) controllerRef.current?.sendRemoteClipboard(text);
  }, []);

  const switchMonitorByViewer = useCallback(async (monitorIndex: number): Promise<void> => {
    try {
      const res = await window.sfscreen.listScreenSources();
      if (!res.ok) return;
      const screens = res.value.filter((s) => s.id.startsWith('screen:'));
      if (screens.length === 0) return;
      const target = screens[monitorIndex] || screens[screens.length - 1] || screens[0];
      if (!target) return;

      await selectSource(target, state.includeSystemAudio, undefined, true);
    } catch {
      // Ignored
    }
  }, [selectSource, state.includeSystemAudio]);

  useEffect(() => {
    switchMonitorByViewerRef.current = switchMonitorByViewer;
  }, [switchMonitorByViewer]);

  const sendSelectMonitor = useCallback((monitorIndex: number): void => {
    controllerRef.current?.sendSelectMonitor(monitorIndex);
  }, []);

  const resumeRemoteControlOverride = useCallback(async (): Promise<void> => {
    await window.sfscreen.resumeRemoteControlOverride?.();
    controllerRef.current?.sendRemoteControlStatus('active');
    setRemoteControlStatus('active');
  }, []);

  return {
    state,
    joinCode,
    sources,
    sourcePickerOpen,
    resolution,
    fps,
    captureFps,
    outgoingFps,
    qualityState,
    localStream,
    remoteStream,
    localCameraStream,
    remoteCameraStream,
    cameraActive,
    voiceActive,
    voiceMuted,
    localSpeaking,
    remoteSpeaking,
    roomCallActive,
    remoteRoomCallActive,
    remoteMediaPhase,
    remoteMediaError,
    remoteAudioPhase,
    remoteAudioError,
    activeRoom,
    roomMembership,
    roomPeerCount,
    isSimulatedPeer,
    testNetworkEnabled,
    remoteControlConfig,
    remotePeerControlConfig,
    remoteControlStatus,
    remoteControlOverrideTimeoutMs,
    setJoinCode,
    setResolution,
    setFps,
    toggleSystemAudio,
    toggleCamera,
    toggleVoice,
    toggleVoiceMute,
    joinRoomCall,
    leaveRoomCall,
    refresh,
    openSourcePicker,
    closeSourcePicker: () => setSourcePickerOpen(false),
    selectSource,
    host,
    join,
    hostRoom,
    discoverRooms,
    joinRoom,
    joinRoomByCode,
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
    setTestNetworkEnabled,
    getMetrics,
    updateRemoteControlConfig,
    sendRemoteInput,
    sendRemoteClipboard,
    sendSelectMonitor,
    resumeRemoteControlOverride,
  };
};

