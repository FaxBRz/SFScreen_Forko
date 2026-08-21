import { serializeControlMessage, parseControlMessage, type AudioState, type ChatMessagePayload, type SessionControlMessage, type VideoState } from '../../shared/session/media-control';
import { filterTailscaleCandidates, tailscaleStunUrl } from '../../shared/session/network';
import { sessionLifetimeMs, sessionProtocolVersion, type CandidateData, type SessionDescription } from '../../shared/session/types';
import type { WebRtcMetrics } from '../../shared/diagnostics';

export interface WebRtcSessionEvents {
  onChannelOpen: () => void;
  onControlMessage: (message: SessionControlMessage) => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
  onRemoteStream: (stream: MediaStream, trackKind: 'video' | 'audio') => void;
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
  const timeout = window.setTimeout(finish, 5_000);
  const onChange = (): void => { if (peer.iceGatheringState === 'complete') finish(); };
  function finish(): void {
    window.clearTimeout(timeout);
    peer.removeEventListener('icegatheringstatechange', onChange);
    resolve();
  }
  peer.addEventListener('icegatheringstatechange', onChange);
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
  private audioSender?: RTCRtpSender;
  private videoPlaceholder?: { stream: MediaStream; track: MediaStreamTrack };
  private readonly remoteTracks = new Map<string, MediaStreamTrack>();
  private readonly candidates: CandidateData[] = [];
  private confirmed = false;
  private previousOutbound?: { bytes: number; at: number };

  constructor(private readonly events: WebRtcSessionEvents) {}

  async createOffer(
    selfIps: readonly string[],
    stunServerIp: string,
    sessionId: string,
    nonce: string,
    initialVideoTrack?: MediaStreamTrack,
    initialAudioTrack?: MediaStreamTrack,
  ): Promise<SessionDescription> {
    const peer = this.createPeer(stunServerIp);
    this.attachChannel(peer.createDataChannel('sfscreen-diagnostics', { ordered: true }));
    const videoTransceiver = peer.addTransceiver(initialVideoTrack ?? 'video', { direction: 'sendrecv' });
    preferVp8(videoTransceiver);
    this.videoSender = videoTransceiver.sender;
    this.audioSender = peer.addTransceiver(initialAudioTrack ?? 'audio', { direction: 'sendrecv' }).sender;
    const offer = await peer.createOffer();
    if (!offer.sdp) throw new Error('A oferta WebRTC não contém SDP.');
    await peer.setLocalDescription(offer);
    await waitForIce(peer);
    return this.description('offer', offer.sdp, selfIps, sessionId, nonce);
  }

  async createAnswer(offer: SessionDescription, selfIps: readonly string[], stunServerIp: string): Promise<{ answer: SessionDescription; securityCode: string }> {
    const peer = this.createPeer(stunServerIp);
    await this.applyDescription(offer);

    const videoTransceiver = peer.getTransceivers().find((transceiver) => transceiver.receiver.track.kind === 'video');
    if (videoTransceiver) {
      videoTransceiver.direction = 'sendrecv';
      preferVp8(videoTransceiver);
      this.videoSender = videoTransceiver.sender;
      await this.videoSender.replaceTrack(this.ensureVideoPlaceholder());
    }

    const audioTransceiver = peer.getTransceivers().find((transceiver) => transceiver.receiver.track.kind === 'audio');
    if (audioTransceiver) {
      audioTransceiver.direction = 'sendrecv';
      this.audioSender = audioTransceiver.sender;
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

  sendUserProfile(userName: string): void {
    this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'user-profile', userName });
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

  sendAudioState(state: AudioState): void {
    this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'audio-state', state });
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

  async replaceVideoTrack(track: MediaStreamTrack, maxBitrate = 6_000_000, maxFramerate?: number): Promise<void> {
    if (!this.videoSender) throw new Error('O canal de vídeo não foi negociado.');
    track.contentHint = 'detail';
    if (this.videoSender.track !== track) await this.videoSender.replaceTrack(track);
    try {
      const parameters = this.videoSender.getParameters();
      if (parameters.encodings && parameters.encodings[0]) {
        parameters.encodings[0].maxBitrate = maxBitrate;
        if (maxFramerate) parameters.encodings[0].maxFramerate = maxFramerate;
        await this.videoSender.setParameters(parameters);
      }
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

  async replaceAudioTrack(track: MediaStreamTrack): Promise<void> {
    if (!this.audioSender) throw new Error('O canal de áudio não foi negociado.');
    if (this.audioSender.track !== track) await this.audioSender.replaceTrack(track);
  }

  async removeAudioTrack(): Promise<void> {
    await this.audioSender?.replaceTrack(null);
  }

  async getMetrics(): Promise<WebRtcMetrics> {
    if (!this.peer) return {};
    const stats = await this.peer.getStats();
    const metrics: WebRtcMetrics = {};
    let outboundBytes: number | undefined;
    for (const stat of stats.values()) {
      const value = stat as unknown as Record<string, unknown>;
      if (value.type === 'candidate-pair' && value.nominated === true && typeof value.currentRoundTripTime === 'number') metrics.roundTripTimeMs = Math.round(value.currentRoundTripTime * 1_000);
      if (value.type === 'outbound-rtp' && value.kind === 'video') {
        if (typeof value.bytesSent === 'number') outboundBytes = value.bytesSent;
        if (typeof value.framesPerSecond === 'number') metrics.videoFramesPerSecond = Math.round(value.framesPerSecond);
      }
      if (value.type === 'inbound-rtp' && value.kind === 'video') {
        if (typeof value.bytesReceived === 'number') metrics.videoBytesReceived = value.bytesReceived;
        if (typeof value.framesDecoded === 'number') metrics.videoFramesDecoded = value.framesDecoded;
        if (typeof value.framesPerSecond === 'number') metrics.videoFramesReceivedPerSecond = Math.round(value.framesPerSecond);
      }
      if (value.type === 'remote-inbound-rtp' && value.kind === 'video' && typeof value.packetsLost === 'number') metrics.videoPacketsLost = value.packetsLost;
      if (value.type === 'remote-inbound-rtp' && value.kind === 'audio' && typeof value.packetsLost === 'number') metrics.audioPacketsLost = value.packetsLost;
    }
    const now = performance.now();
    if (outboundBytes !== undefined && this.previousOutbound && now > this.previousOutbound.at) metrics.outgoingBitrateKbps = Math.round(((outboundBytes - this.previousOutbound.bytes) * 8) / (now - this.previousOutbound.at));
    if (outboundBytes !== undefined) this.previousOutbound = { bytes: outboundBytes, at: now };
    return metrics;
  }

  close(): void {
    this.channel?.close();
    this.channel = undefined;
    this.peer?.close();
    this.peer = undefined;
    this.videoSender = undefined;
    this.audioSender = undefined;
    this.videoPlaceholder?.stream.getTracks().forEach((track) => track.stop());
    this.videoPlaceholder = undefined;
    this.remoteTracks.forEach((track) => track.stop());
    this.remoteTracks.clear();
    this.candidates.length = 0;
    this.confirmed = false;
    this.previousOutbound = undefined;
  }

  private createPeer(stunServerIp: string): RTCPeerConnection {
    this.close();
    const peer = new RTCPeerConnection({ iceServers: [{ urls: tailscaleStunUrl(stunServerIp) }], iceTransportPolicy: 'all', bundlePolicy: 'max-bundle' });
    peer.onicecandidate = (event) => { if (event.candidate) this.candidates.push(candidateData(event.candidate)); };
    peer.onconnectionstatechange = () => this.events.onConnectionState(peer.connectionState);
    peer.ondatachannel = (event) => this.attachChannel(event.channel);
    peer.ontrack = (event) => {
      if (event.track.kind !== 'video' && event.track.kind !== 'audio') return;
      this.remoteTracks.set(event.track.id, event.track);
      event.track.onended = () => this.remoteTracks.delete(event.track.id);
      this.events.onRemoteStream(new MediaStream(Array.from(this.remoteTracks.values())), event.track.kind);
    };
    this.peer = peer;
    return peer;
  }

  private ensureVideoPlaceholder(): MediaStreamTrack {
    if (this.videoPlaceholder?.track.readyState === 'live') return this.videoPlaceholder.track;
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 9;
    const context = canvas.getContext('2d');
    context?.fillRect(0, 0, canvas.width, canvas.height);
    const stream = canvas.captureStream(1);
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error('Não foi possível criar a faixa de espera do WebRTC.');
    track.enabled = false;
    this.videoPlaceholder = { stream, track };
    return track;
  }

  private attachChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.onopen = () => {
      if (this.confirmed) this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'security-confirmed' });
      this.events.onChannelOpen();
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
