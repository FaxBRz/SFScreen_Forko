import { serializeControlMessage, parseControlMessage, type AudioState, type SessionControlMessage, type VideoState } from '../../shared/session/media-control';
import { filterTailscaleCandidates } from '../../shared/session/network';
import { sessionLifetimeMs, sessionProtocolVersion, type CandidateData, type SessionDescription } from '../../shared/session/types';
import type { WebRtcMetrics } from '../../shared/diagnostics';

export interface WebRtcSessionEvents {
  onChannelOpen: () => void;
  onControlMessage: (message: SessionControlMessage) => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
  onRemoteStream: (stream: MediaStream) => void;
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

export class WebRtcSession {
  private peer?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private videoSender?: RTCRtpSender;
  private audioSender?: RTCRtpSender;
  private readonly candidates: CandidateData[] = [];
  private confirmed = false;
  private previousOutbound?: { bytes: number; at: number };

  constructor(private readonly events: WebRtcSessionEvents) {}

  async createOffer(selfIp: string, sessionId: string, nonce: string): Promise<SessionDescription> {
    const peer = this.createPeer();
    this.attachChannel(peer.createDataChannel('sfscreen-diagnostics', { ordered: true }));
    this.videoSender = peer.addTransceiver('video', { direction: 'sendonly' }).sender;
    this.audioSender = peer.addTransceiver('audio', { direction: 'sendonly' }).sender;
    const offer = await peer.createOffer();
    if (!offer.sdp) throw new Error('A oferta WebRTC não contém SDP.');
    await peer.setLocalDescription(offer);
    await waitForIce(peer);
    return this.description('offer', offer.sdp, selfIp, sessionId, nonce);
  }

  async createAnswer(offer: SessionDescription, selfIp: string): Promise<{ answer: SessionDescription; securityCode: string }> {
    const peer = this.createPeer();
    await this.applyDescription(offer);
    const answer = await peer.createAnswer();
    if (!answer.sdp) throw new Error('A resposta WebRTC não contém SDP.');
    await peer.setLocalDescription(answer);
    await waitForIce(peer);
    const description = this.description('answer', answer.sdp, selfIp, offer.sessionId, offer.nonce);
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

  sendVideoState(state: VideoState): void {
    this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'video-state', state });
  }

  sendAudioState(state: AudioState): void {
    this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'audio-state', state });
  }

  async replaceVideoTrack(track: MediaStreamTrack): Promise<void> {
    if (!this.videoSender) throw new Error('O canal de vídeo não foi negociado.');
    track.contentHint = 'detail';
    await this.videoSender.replaceTrack(track);
    const parameters = this.videoSender.getParameters();
    if (parameters.encodings[0]) {
      parameters.encodings[0].maxBitrate = 5_000_000;
      await this.videoSender.setParameters(parameters);
    }
  }

  async removeVideoTrack(): Promise<void> {
    await this.videoSender?.replaceTrack(null);
  }

  async replaceAudioTrack(track: MediaStreamTrack): Promise<void> {
    if (!this.audioSender) throw new Error('O canal de áudio não foi negociado.');
    await this.audioSender.replaceTrack(track);
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
    this.candidates.length = 0;
    this.confirmed = false;
    this.previousOutbound = undefined;
  }

  private createPeer(): RTCPeerConnection {
    this.close();
    const peer = new RTCPeerConnection({ iceServers: [], iceTransportPolicy: 'all', bundlePolicy: 'max-bundle' });
    peer.onicecandidate = (event) => { if (event.candidate) this.candidates.push(candidateData(event.candidate)); };
    peer.onconnectionstatechange = () => this.events.onConnectionState(peer.connectionState);
    peer.ondatachannel = (event) => this.attachChannel(event.channel);
    peer.ontrack = (event) => this.events.onRemoteStream(event.streams[0] ?? new MediaStream([event.track]));
    this.peer = peer;
    return peer;
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

  private description(type: 'offer' | 'answer', sdp: string, selfIp: string, sessionId: string, nonce: string): SessionDescription {
    const candidates = filterTailscaleCandidates(this.candidates, selfIp);
    if (candidates.length === 0) throw new Error('O Chromium não expôs um candidato ICE do adaptador Tailscale.');
    return { protocolVersion: sessionProtocolVersion, type, sdp, candidates, fingerprint: fingerprint(sdp), sessionId, nonce, expiresAt: new Date(Date.now() + sessionLifetimeMs).toISOString() };
  }
}
