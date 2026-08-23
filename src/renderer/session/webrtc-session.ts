import {
  serializeControlMessage,
  parseControlMessage,
  type AudioState,
  type CameraState,
  type ChatMessagePayload,
  type RemoteControlConfig,
  type RemoteControlStatus,
  type RemoteInputPayload,
  type RoomCallState,
  type SessionControlMessage,
  type VideoState,
} from '../../shared/session/media-control';
import { filterTailscaleCandidates, tailscaleStunUrl } from '../../shared/session/network';
import { sessionLifetimeMs, sessionProtocolVersion, type CandidateData, type SessionDescription } from '../../shared/session/types';
import type { WebRtcMetrics } from '../../shared/diagnostics';

export interface WebRtcSessionEvents {
  onChannelOpen: () => void;
  onControlMessage: (message: SessionControlMessage) => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
  onRemoteStream: (stream: MediaStream, trackKind: 'video' | 'audio') => void;
  onRemoteCameraStream?: (stream: MediaStream) => void;
}

const fingerprint = (sdp: string): string => {
  const value = /^a=fingerprint:sha-256\s+(.+)$/im.exec(sdp)?.[1]?.trim();
  if (!value) throw new Error('A descrição WebRTC não contém fingerprint DTLS.');
  return value;
};

export const securityCodeFor = async (sessionId: string, nonce: string, first: string, second: string): Promise<string> => {
  const bytes = new TextEncoder().encode(`${sessionId}|${nonce}|${[first, second].sort().join('|')}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return (Number.parseInt(hex.slice(0, 12), 16) % 1_000_000).toString().padStart(6, '0');
};

const waitForIce = (peer: RTCPeerConnection): Promise<void> => new Promise((resolve) => {
  if (peer.iceGatheringState === 'complete') return resolve();
  let settled = false;
  let candidateTimer: number | undefined;

  function finish(): void {
    if (settled) return;
    settled = true;
    window.clearTimeout(maxTimeout);
    if (candidateTimer) window.clearTimeout(candidateTimer);
    peer.removeEventListener('icegatheringstatechange', onChange);
    peer.removeEventListener('icecandidate', onCandidate);
    resolve();
  }

  const onChange = (): void => {
    if (peer.iceGatheringState === 'complete') finish();
  };

  const onCandidate = (event: RTCPeerConnectionIceEvent): void => {
    if (event.candidate && !candidateTimer) {
      candidateTimer = window.setTimeout(finish, 150);
    }
  };

  const maxTimeout = window.setTimeout(finish, 800);
  peer.addEventListener('icegatheringstatechange', onChange);
  peer.addEventListener('icecandidate', onCandidate);
});

const candidateData = (candidate: RTCIceCandidate): CandidateData => {
  const value = candidate.toJSON();
  return { candidate: value.candidate ?? '', sdpMid: value.sdpMid ?? null, sdpMLineIndex: value.sdpMLineIndex ?? null, usernameFragment: value.usernameFragment ?? null };
};

const preferVp8 = (transceiver: RTCRtpTransceiver): void => {
  const capabilities = RTCRtpSender.getCapabilities?.('video');
  if (!capabilities) return;
  const vp8 = capabilities.codecs.filter((codec) => codec.mimeType.toLowerCase() === 'video/vp8');
  if (vp8.length === 0) return;
  transceiver.setCodecPreferences([
    ...vp8,
    ...capabilities.codecs.filter((codec) => codec.mimeType.toLowerCase() !== 'video/vp8'),
  ]);
};

export class WebRtcSession {
  private peer?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private videoSender?: RTCRtpSender;
  private cameraSender?: RTCRtpSender;
  private audioSender?: RTCRtpSender;
  private videoPlaceholder?: { stream: MediaStream; track: MediaStreamTrack };
  private cameraPlaceholder?: { stream: MediaStream; track: MediaStreamTrack };
  private audioPlaceholder?: { stream: MediaStream; track: MediaStreamTrack };
  private readonly remoteTracks = new Map<string, MediaStreamTrack>();
  private readonly remoteCameraTracks = new Map<string, MediaStreamTrack>();
  private readonly candidates: CandidateData[] = [];
  private confirmed = false;
  private previousOutbound?: { bytes: number; at: number };
  private previousOutboundFrames?: { frames: number; at: number };

  constructor(private readonly events: WebRtcSessionEvents) {}

  async createOffer(
    selfIps: readonly string[],
    stunServerIp: string,
    sessionId: string,
    nonce: string,
    initialVideoTrack?: MediaStreamTrack,
    initialAudioTrack?: MediaStreamTrack,
    initialCameraTrack?: MediaStreamTrack,
  ): Promise<SessionDescription> {
    const peer = this.createPeer(stunServerIp);
    this.attachChannel(peer.createDataChannel('sfscreen-diagnostics', { ordered: true }));
    const videoTransceiver = peer.addTransceiver(initialVideoTrack ?? 'video', { direction: 'sendrecv' });
    preferVp8(videoTransceiver);
    this.videoSender = videoTransceiver.sender;

    const cameraTransceiver = peer.addTransceiver(initialCameraTrack ?? 'video', { direction: 'sendrecv' });
    preferVp8(cameraTransceiver);
    this.cameraSender = cameraTransceiver.sender;

    const audioTrack = initialAudioTrack ?? this.ensureAudioPlaceholder();
    const audioTransceiver = peer.addTransceiver(audioTrack ?? 'audio', { direction: 'sendrecv' });
    this.audioSender = audioTransceiver.sender;
    if (audioTrack && this.audioSender.track !== audioTrack) {
      void this.audioSender.replaceTrack(audioTrack);
    }

    const offer = await peer.createOffer();
    if (!offer.sdp) throw new Error('A oferta WebRTC não contém SDP.');
    await peer.setLocalDescription(offer);
    await waitForIce(peer);
    return this.description('offer', offer.sdp, selfIps, sessionId, nonce);
  }

  async createAnswer(offer: SessionDescription, selfIps: readonly string[], stunServerIp: string): Promise<{ answer: SessionDescription; securityCode: string }> {
    const peer = this.createPeer(stunServerIp);
    await this.applyDescription(offer);

    const videoTransceivers = peer.getTransceivers().filter((transceiver) => transceiver.receiver.track.kind === 'video');
    if (videoTransceivers[0]) {
      videoTransceivers[0].direction = 'sendrecv';
      preferVp8(videoTransceivers[0]);
      this.videoSender = videoTransceivers[0].sender;
      await this.videoSender.replaceTrack(this.ensureVideoPlaceholder());
    }

    if (videoTransceivers[1]) {
      videoTransceivers[1].direction = 'sendrecv';
      preferVp8(videoTransceivers[1]);
      this.cameraSender = videoTransceivers[1].sender;
      await this.cameraSender.replaceTrack(this.ensureCameraPlaceholder());
    }

    const audioTransceiver = peer.getTransceivers().find((transceiver) => transceiver.receiver.track.kind === 'audio');
    if (audioTransceiver) {
      audioTransceiver.direction = 'sendrecv';
      this.audioSender = audioTransceiver.sender;
      const placeholderAudio = this.ensureAudioPlaceholder();
      if (placeholderAudio) {
        await this.audioSender.replaceTrack(placeholderAudio);
      }
    }

    const answer = await peer.createAnswer();
    if (!answer.sdp) throw new Error('A resposta WebRTC não contém SDP.');
    await peer.setLocalDescription(answer);
    await waitForIce(peer);
    const description = this.description('answer', answer.sdp, selfIps, offer.sessionId, offer.nonce);
    return { answer: description, securityCode: await securityCodeFor(description.sessionId, description.nonce, offer.fingerprint, description.fingerprint) };
  }

  async applyAnswer(answer: SessionDescription): Promise<string> {
    await this.applyDescription(answer);
    const local = this.peer?.localDescription?.sdp;
    if (!local) throw new Error('A oferta local WebRTC não está disponível.');
    return securityCodeFor(answer.sessionId, answer.nonce, fingerprint(local), answer.fingerprint);
  }

  confirmSecurity(): void {
    this.confirmed = true;
    this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'security-confirmed' });
  }

  sendUserProfile(userName: string, userAvatar?: string): void {
    this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'user-profile', userName, userAvatar });
  }


  sendChatMessage(message: ChatMessagePayload): void {
    this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'chat-message', message });
  }

  sendDeleteChatMessage(messageId: string): void {
    this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'delete-chat-message', messageId });
  }

  sendVideoState(state: VideoState): void {
    this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'video-state', state });
  }

  sendCameraState(state: CameraState): void {
    this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'camera-state', state });
  }

  sendAudioState(state: AudioState): void {
    this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'audio-state', state });
  }

  sendRoomCallState(state: RoomCallState): void {
    this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'room-call-state', state });
  }

  sendSessionClosed(): void {
    this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'session-closed' });
  }

  sendRemoteControlConfig(config: RemoteControlConfig): void {
    this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'remote-control-config', config });
  }

  sendRemoteControlStatus(status: RemoteControlStatus, timeoutMs?: number): void {
    this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'remote-control-status', status, timeoutMs });
  }

  sendRemoteInput(input: RemoteInputPayload): void {
    this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'remote-control-input', input });
  }

  sendRemoteClipboard(text: string): void {
    this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'remote-clipboard', text });
  }

  sendSelectMonitor(monitorIndex: number): void {
    this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'select-monitor', monitorIndex });
  }

  async updateVideoParameters(maxBitrateBps?: number, maxFramerate?: number): Promise<void> {
    if (!this.videoSender) return;
    try {
      const parameters = this.videoSender.getParameters();
      if (!parameters.encodings || parameters.encodings.length === 0) {
        parameters.encodings = [{}];
      }
      if (maxBitrateBps !== undefined) parameters.encodings[0].maxBitrate = maxBitrateBps;
      if (maxFramerate !== undefined) parameters.encodings[0].maxFramerate = maxFramerate;
      await this.videoSender.setParameters(parameters);
    } catch {
      // Ignored if browser/peer doesn't support changing parameters on live track
    }
  }

  async replaceVideoTrack(track: MediaStreamTrack, maxBitrate = 6_000_000, maxFramerate = 60): Promise<void> {
    if (!this.videoSender) throw new Error('O canal de vídeo não foi negociado.');
    track.contentHint = maxFramerate === 60 ? 'motion' : 'detail';
    if (this.videoSender.track !== track) await this.videoSender.replaceTrack(track);
    try {
      const parameters = this.videoSender.getParameters();
      if (!parameters.encodings || parameters.encodings.length === 0) parameters.encodings = [{}];
      parameters.encodings[0].maxBitrate = maxBitrate;
      parameters.encodings[0].maxFramerate = maxFramerate;
      await this.videoSender.setParameters(parameters);
    } catch {
      // Ignored
    }
  }


  async parkVideoTrack(): Promise<void> {
    if (!this.videoSender) return;
    const placeholder = this.ensureVideoPlaceholder();
    if (this.videoSender.track !== placeholder) await this.videoSender.replaceTrack(placeholder);
  }

  async removeVideoTrack(): Promise<void> {
    await this.videoSender?.replaceTrack(null);
  }

  async replaceCameraTrack(track: MediaStreamTrack, maxBitrate = 2_500_000, maxFramerate = 30): Promise<void> {
    if (!this.cameraSender) return;
    track.contentHint = 'motion';
    if (this.cameraSender.track !== track) await this.cameraSender.replaceTrack(track);
    try {
      const parameters = this.cameraSender.getParameters();
      if (parameters.encodings && parameters.encodings[0]) {
        parameters.encodings[0].maxBitrate = maxBitrate;
        parameters.encodings[0].maxFramerate = maxFramerate;
        await this.cameraSender.setParameters(parameters);
      }
    } catch {
      // Ignored
    }
  }

  async parkCameraTrack(): Promise<void> {
    if (!this.cameraSender) return;
    const placeholder = this.ensureCameraPlaceholder();
    if (this.cameraSender.track !== placeholder) await this.cameraSender.replaceTrack(placeholder);
  }

  async removeCameraTrack(): Promise<void> {
    await this.cameraSender?.replaceTrack(null);
  }

  async replaceAudioTrack(track: MediaStreamTrack): Promise<void> {
    if (!this.audioSender) throw new Error('O canal de áudio não foi negociado.');
    if (this.audioSender.track !== track) await this.audioSender.replaceTrack(track);
  }

  async removeAudioTrack(): Promise<void> {
    const placeholder = this.ensureAudioPlaceholder();
    if (placeholder && this.audioSender) {
      await this.audioSender.replaceTrack(placeholder);
    } else {
      await this.audioSender?.replaceTrack(null);
    }
  }

  async getMetrics(): Promise<WebRtcMetrics> {
    if (!this.peer) return {};
    const stats = await this.peer.getStats();
    let screenStats: RTCStatsReport | undefined;
    try {
      screenStats = await this.videoSender?.getStats();
    } catch {
      // Fall back to the complete peer report on older Chromium versions.
    }
    const metrics: WebRtcMetrics = {};
    let outboundBytes: number | undefined;
    let outboundFrames: number | undefined;
    for (const stat of stats.values()) {
      const value = stat as unknown as Record<string, unknown>;
      if (value.type === 'candidate-pair' && value.nominated === true && typeof value.currentRoundTripTime === 'number') metrics.roundTripTimeMs = Math.round(value.currentRoundTripTime * 1_000);
      if (!screenStats && value.type === 'outbound-rtp' && value.kind === 'video') {
        if (typeof value.bytesSent === 'number') outboundBytes = value.bytesSent;
        if (typeof value.framesPerSecond === 'number') metrics.videoFramesPerSecond = Math.round(value.framesPerSecond);
        if (typeof value.framesEncoded === 'number') outboundFrames = value.framesEncoded;
      }
      if (value.type === 'inbound-rtp' && value.kind === 'video') {
        if (typeof value.bytesReceived === 'number') metrics.videoBytesReceived = value.bytesReceived;
        if (typeof value.framesDecoded === 'number') metrics.videoFramesDecoded = value.framesDecoded;
        if (typeof value.framesPerSecond === 'number') metrics.videoFramesReceivedPerSecond = Math.round(value.framesPerSecond);
      }
      if (value.type === 'remote-inbound-rtp' && value.kind === 'video' && typeof value.packetsLost === 'number') metrics.videoPacketsLost = value.packetsLost;
      if (value.type === 'remote-inbound-rtp' && value.kind === 'audio' && typeof value.packetsLost === 'number') metrics.audioPacketsLost = value.packetsLost;
    }
    if (screenStats) {
      for (const stat of screenStats.values()) {
        const value = stat as unknown as Record<string, unknown>;
        if (value.type !== 'outbound-rtp' || value.kind !== 'video') continue;
        if (typeof value.bytesSent === 'number') outboundBytes = value.bytesSent;
        if (typeof value.framesPerSecond === 'number') metrics.videoFramesPerSecond = Math.round(value.framesPerSecond);
        if (typeof value.framesEncoded === 'number') outboundFrames = value.framesEncoded;
      }
    }
    const now = performance.now();
    if (outboundBytes !== undefined && this.previousOutbound && now > this.previousOutbound.at) metrics.outgoingBitrateKbps = Math.round(((outboundBytes - this.previousOutbound.bytes) * 8) / (now - this.previousOutbound.at));
    if (outboundBytes !== undefined) this.previousOutbound = { bytes: outboundBytes, at: now };
    if (metrics.videoFramesPerSecond === undefined && outboundFrames !== undefined && this.previousOutboundFrames && now > this.previousOutboundFrames.at) {
      metrics.videoFramesPerSecond = Math.max(0, Math.round(((outboundFrames - this.previousOutboundFrames.frames) * 1_000) / (now - this.previousOutboundFrames.at)));
    }
    if (outboundFrames !== undefined) this.previousOutboundFrames = { frames: outboundFrames, at: now };
    return metrics;
  }

  close(): void {
    try {
      this.sendSessionClosed();
    } catch {
      // Channel may already be closed
    }
    this.channel?.close();
    this.channel = undefined;
    this.peer?.close();
    this.peer = undefined;
    this.videoSender = undefined;
    this.cameraSender = undefined;
    this.audioSender = undefined;
    this.videoPlaceholder?.stream.getTracks().forEach((track) => track.stop());
    this.videoPlaceholder = undefined;
    this.cameraPlaceholder?.stream.getTracks().forEach((track) => track.stop());
    this.cameraPlaceholder = undefined;
    this.audioPlaceholder?.stream.getTracks().forEach((track) => track.stop());
    this.audioPlaceholder = undefined;
    this.remoteTracks.forEach((track) => track.stop());
    this.remoteTracks.clear();
    this.remoteCameraTracks.forEach((track) => track.stop());
    this.remoteCameraTracks.clear();
    this.candidates.length = 0;
    this.confirmed = false;
    this.previousOutbound = undefined;
    this.previousOutboundFrames = undefined;
  }

  private createPeer(stunServerIp: string): RTCPeerConnection {
    this.close();
    const peer = new RTCPeerConnection({ iceServers: [{ urls: tailscaleStunUrl(stunServerIp) }], iceTransportPolicy: 'all', bundlePolicy: 'max-bundle' });
    peer.onicecandidate = (event) => { if (event.candidate) this.candidates.push(candidateData(event.candidate)); };
    peer.onconnectionstatechange = () => this.events.onConnectionState(peer.connectionState);
    peer.ondatachannel = (event) => this.attachChannel(event.channel);
    peer.ontrack = (event) => {
      if (event.track.kind === 'audio') {
        this.remoteTracks.set(event.track.id, event.track);
        event.track.onended = () => this.remoteTracks.delete(event.track.id);
        this.events.onRemoteStream(new MediaStream(Array.from(this.remoteTracks.values())), 'audio');
        return;
      }
      if (event.track.kind === 'video') {
        const transceivers = peer.getTransceivers().filter((t) => t.receiver.track.kind === 'video');
        const isCamera = event.transceiver === transceivers[1];
        if (isCamera) {
          this.remoteCameraTracks.set(event.track.id, event.track);
          event.track.onended = () => this.remoteCameraTracks.delete(event.track.id);
          this.events.onRemoteCameraStream?.(new MediaStream(Array.from(this.remoteCameraTracks.values())));
        } else {
          this.remoteTracks.set(event.track.id, event.track);
          event.track.onended = () => this.remoteTracks.delete(event.track.id);
          this.events.onRemoteStream(new MediaStream(Array.from(this.remoteTracks.values())), 'video');
        }
      }
    };
    this.peer = peer;
    return peer;
  }

  private ensureAudioPlaceholder(): MediaStreamTrack | undefined {
    if (this.audioPlaceholder?.track.readyState === 'live') return this.audioPlaceholder.track;
    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        const ctx = new AudioCtxClass();
        const dest = ctx.createMediaStreamDestination();
        const track = dest.stream.getAudioTracks()[0];
        if (track) {
          track.enabled = true;
          this.audioPlaceholder = { stream: dest.stream, track };
          return track;
        }
      }
    } catch {
      // Ignored
    }
    return undefined;
  }

  private ensureVideoPlaceholder(): MediaStreamTrack {
    if (this.videoPlaceholder?.track.readyState === 'live') return this.videoPlaceholder.track;
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 9;
    const context = canvas.getContext('2d');
    context?.fillRect(0, 0, canvas.width, canvas.height);
    const stream = canvas.captureStream ? canvas.captureStream(1) : new MediaStream();
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error('Não foi possível criar a faixa de espera do WebRTC.');
    track.enabled = false;
    this.videoPlaceholder = { stream, track };
    return track;
  }

  private ensureCameraPlaceholder(): MediaStreamTrack {
    if (this.cameraPlaceholder?.track.readyState === 'live') return this.cameraPlaceholder.track;
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 9;
    const context = canvas.getContext('2d');
    context?.fillRect(0, 0, canvas.width, canvas.height);
    const stream = canvas.captureStream ? canvas.captureStream(1) : new MediaStream();
    const track = stream.getVideoTracks()[0];
    if (track) {
      track.enabled = false;
      this.cameraPlaceholder = { stream, track };
      return track;
    }
    return this.ensureVideoPlaceholder();
  }

  private attachChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.onopen = () => {
      if (this.confirmed) this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'security-confirmed' });
      this.events.onChannelOpen();
    };
    channel.onclose = () => {
      this.events.onConnectionState('closed');
    };
    channel.onmessage = (event) => {
      const message = parseControlMessage(event.data);
      if (message) this.events.onControlMessage(message);
    };
  }

  private sendControl(message: SessionControlMessage): void {
    if (this.channel?.readyState === 'open') this.channel.send(serializeControlMessage(message));
  }

  private async applyDescription(description: SessionDescription): Promise<void> {
    if (!this.peer) throw new Error('A sessão WebRTC não foi inicializada.');
    await this.peer.setRemoteDescription({ type: description.type, sdp: description.sdp });
    for (const candidate of description.candidates) await this.peer.addIceCandidate(candidate);
  }

  private description(type: 'offer' | 'answer', sdp: string, selfIps: readonly string[], sessionId: string, nonce: string): SessionDescription {
    const candidates = filterTailscaleCandidates(this.candidates, selfIps);
    if (candidates.length === 0) {
      const gathered = this.candidates.length;
      throw new Error(gathered === 0
        ? 'O Chromium não produziu candidatos ICE locais. Verifique se o adaptador Tailscale está ativo e tente novamente.'
        : `O Chromium reuniu ${gathered} candidato(s) ICE, mas nenhum pertence aos adaptadores Tailscale locais.`);
    }
    return { protocolVersion: sessionProtocolVersion, type, sdp, candidates, fingerprint: fingerprint(sdp), sessionId, nonce, expiresAt: new Date(Date.now() + sessionLifetimeMs).toISOString() };
  }
}
