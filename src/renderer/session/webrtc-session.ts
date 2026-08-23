import {
  serializeControlMessage,
  parseControlMessage,
  type AudioState,
  type CameraState,
  type ChatMessagePayload,
  type RoomChatRequest,
  type RemoteControlConfig,
  type RemoteControlStatus,
  type RemoteInputPayload,
  type RoomCallState,
  type ScreenQualitySignature,
  type SessionControlMessage,
  type VideoState,
} from '../../shared/session/media-control';
import { filterTailscaleCandidates, tailscaleStunUrl } from '../../shared/session/network';
import { sessionLifetimeMs, sessionProtocolVersion, type CandidateData, type ChatItem, type MediaSlot, type ScreenSubscriptionTier, type SessionDescription } from '../../shared/session/types';
import type { QualityLimitationReason, WebRtcMetrics } from '../../shared/diagnostics';

export interface WebRtcSessionEvents {
  onChannelOpen: () => void;
  onControlMessage: (message: SessionControlMessage) => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
  onRemoteStream: (stream: MediaStream, trackKind: 'video' | 'audio') => void;
  onRemoteCameraStream?: (stream: MediaStream) => void;
  /** Voice-only stream. System audio is deliberately excluded for VAD/UI use. */
  onRemoteVoiceStream?: (stream: MediaStream) => void;
  /** System audio from a screen share. Voice is deliberately excluded. */
  onRemoteSystemAudioStream?: (stream: MediaStream) => void;
}

/**
 * Stable media sections negotiated for every peer. Keeping audio sources in
 * different sections is important: replacing a screen-audio track must never
 * replace (or remove) the microphone track.
 */
export const mediaSlots = ['screen-video', 'camera-video', 'voice-audio', 'screen-audio'] as const;
export type { MediaSlot, ScreenSubscriptionTier } from '../../shared/session/types';
export type ScreenResolution = '720p' | '1080p' | '1440p';

export interface VideoQualityProfile {
  maxBitrateBps: number;
  maxFramerate: number;
  scaleResolutionDownBy?: number;
  active?: boolean;
  degradationPreference?: RTCDegradationPreference;
  priority?: RTCPriorityType;
  networkPriority?: RTCPriorityType;
}

export interface WebRtcQualitySample {
  sampledAtMs: number;
  outboundBitrateKbps?: number;
  outboundFrameWidth?: number;
  outboundFrameHeight?: number;
  outboundFramesPerSecond?: number;
  outboundQp?: number;
  outboundQualityLimitationReason?: string;
  inboundFrameWidth?: number;
  inboundFrameHeight?: number;
  inboundFramesPerSecond?: number;
  inboundBitrateKbps?: number;
  inboundPacketsLost?: number;
  inboundNackCount?: number;
  inboundPliCount?: number;
  roundTripTimeMs?: number;
}

/**
 * A sender profile for the currently supported one-to-one session. The same
 * helper also exposes the lower multi-party tiers so a future mesh manager can
 * subscribe without inventing a second set of limits.
 */
export const screenQualityProfileFor = (
  resolution: ScreenResolution,
  requestedFps: number,
  participantCount = 2,
  tier: ScreenSubscriptionTier = 'focused',
): VideoQualityProfile => {
  if (participantCount >= 3) {
    if (tier === 'paused') return { maxBitrateBps: 0, maxFramerate: 1, active: false, degradationPreference: 'maintain-resolution', priority: 'very-low', networkPriority: 'very-low' };
    if (tier === 'thumbnail') return { maxBitrateBps: 700_000, maxFramerate: 15, scaleResolutionDownBy: 2, degradationPreference: 'maintain-resolution', priority: 'low', networkPriority: 'low' };
    if (tier === 'grid') return { maxBitrateBps: 1_200_000, maxFramerate: 15, degradationPreference: 'maintain-resolution', priority: 'medium', networkPriority: 'medium' };
    return { maxBitrateBps: 5_000_000, maxFramerate: 30, degradationPreference: 'maintain-resolution', priority: 'high', networkPriority: 'high' };
  }

  const cappedFps = resolution === '1440p' ? Math.min(requestedFps, 30) : requestedFps;
  const maxBitrateBps = resolution === '720p'
    ? (cappedFps >= 60 ? 4_000_000 : 2_500_000)
    : resolution === '1080p'
      ? (cappedFps >= 60 ? 8_000_000 : 5_000_000)
      : 10_000_000;
  return { maxBitrateBps, maxFramerate: cappedFps, degradationPreference: 'maintain-resolution', priority: 'high', networkPriority: 'high' };
};

/**
 * Cameras are deliberately modest next to a screen: at most 720p30/1.2 Mbps
 * on their own, and 360p15/0.35 Mbps while a screen is active. The caller
 * also applies matching capture constraints so the lower tier does not waste
 * GPU cycles encoding a 720p source merely to downscale it at the sender.
 */
export const cameraQualityProfileFor = (screenActive: boolean): VideoQualityProfile => screenActive
  ? {
    maxBitrateBps: 350_000,
    maxFramerate: 15,
    scaleResolutionDownBy: 2,
    degradationPreference: 'maintain-resolution',
    priority: 'low',
    networkPriority: 'low',
  }
  : {
    maxBitrateBps: 1_200_000,
    maxFramerate: 30,
    degradationPreference: 'maintain-resolution',
    priority: 'medium',
    networkPriority: 'medium',
  };

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
  /** screen-video sender, kept under the original name for API compatibility */
  private videoSender?: RTCRtpSender;
  private cameraSender?: RTCRtpSender;
  private voiceAudioSender?: RTCRtpSender;
  private systemAudioSender?: RTCRtpSender;
  /** Legacy alias for integrations still reading the former screen-audio sender. */
  private audioSender?: RTCRtpSender;
  private readonly slotTransceivers = new Map<MediaSlot, RTCRtpTransceiver>();
  private readonly transceiverSlots = new Map<RTCRtpTransceiver, MediaSlot>();
  private readonly remoteScreenTracks = new Map<string, MediaStreamTrack>();
  private readonly remoteCameraTracks = new Map<string, MediaStreamTrack>();
  private readonly remoteVoiceTracks = new Map<string, MediaStreamTrack>();
  private readonly remoteSystemAudioTracks = new Map<string, MediaStreamTrack>();
  private readonly candidates: CandidateData[] = [];
  private confirmed = false;
  private previousOutbound?: { bytes: number; at: number };
  private previousOutboundFrames?: { frames: number; at: number };
  private previousQualityOutbound?: { bytes: number; at: number };
  private previousQualityInbound?: { bytes: number; at: number };

  constructor(private readonly events: WebRtcSessionEvents) {}

  async createOffer(
    selfIps: readonly string[],
    stunServerIp: string,
    sessionId: string,
    nonce: string,
    initialVideoTrack?: MediaStreamTrack,
    initialSystemAudioTrack?: MediaStreamTrack,
    initialCameraTrack?: MediaStreamTrack,
    initialVoiceTrack?: MediaStreamTrack,
  ): Promise<SessionDescription> {
    const peer = this.createPeer(stunServerIp);
    this.attachChannel(peer.createDataChannel('sfscreen-diagnostics', { ordered: true }));
    this.createSlotTransceivers(peer);

    // Do not negotiate a 16×9/1fps placeholder. The real track is attached to
    // its fixed sender with its quality parameters before the first offer.
    if (initialVideoTrack) await this.replaceVideoTrack(initialVideoTrack, ...this.profileForTrack(initialVideoTrack));
    if (initialCameraTrack) await this.replaceCameraTrack(initialCameraTrack);
    if (initialVoiceTrack) await this.replaceVoiceTrack(initialVoiceTrack);
    if (initialSystemAudioTrack) await this.replaceSystemAudioTrack(initialSystemAudioTrack);

    const offer = await peer.createOffer();
    if (!offer.sdp) throw new Error('A oferta WebRTC não contém SDP.');
    await peer.setLocalDescription(offer);
    await waitForIce(peer);
    return this.description('offer', offer.sdp, selfIps, sessionId, nonce);
  }

  async createAnswer(offer: SessionDescription, selfIps: readonly string[], stunServerIp: string): Promise<{ answer: SessionDescription; securityCode: string }> {
    const peer = this.createPeer(stunServerIp);
    await this.applyDescription(offer);
    this.bindAnswerSlotTransceivers(peer);

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

  sendUserProfile(userName: string, userAvatar?: string, participantId?: string): void {
    this.sendControl({
      protocolVersion: sessionProtocolVersion,
      type: 'user-profile',
      userName,
      userAvatar,
      ...(participantId ? { participantId } : {}),
    });
  }


  sendChatMessage(message: ChatMessagePayload): void {
    this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'chat-message', message });
  }

  sendDeleteChatMessage(messageId: string): void {
    this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'delete-chat-message', messageId });
  }

  sendRoomChatRequest(request: RoomChatRequest): void {
    this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'room-chat-request', request });
  }

  sendRoomChatItem(item: ChatItem): void {
    this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'room-chat-item', item });
  }

  sendRoomLeave(): void {
    this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'room-leave' });
  }

  sendVideoState(state: VideoState, quality?: ScreenQualitySignature): void {
    this.sendControl({ protocolVersion: sessionProtocolVersion, type: 'video-state', state, quality });
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
    await this.applyScreenQualityProfile({
      maxBitrateBps: maxBitrateBps ?? 6_000_000,
      maxFramerate: maxFramerate ?? 60,
      degradationPreference: 'maintain-resolution',
      priority: 'high',
      networkPriority: 'high',
    });
  }

  async applyScreenQualityProfile(profile: VideoQualityProfile): Promise<void> {
    if (!this.videoSender) return;
    await this.applyVideoParameters(this.videoSender, profile);
  }

  async replaceVideoTrack(track: MediaStreamTrack, maxBitrate = 6_000_000, maxFramerate = 60): Promise<void> {
    if (!this.videoSender) throw new Error('O canal de vídeo não foi negociado.');
    track.contentHint = maxFramerate === 60 ? 'motion' : 'detail';
    const profile: VideoQualityProfile = {
      maxBitrateBps: maxBitrate,
      maxFramerate,
      degradationPreference: 'maintain-resolution',
      priority: 'high',
      networkPriority: 'high',
    };
    // Chromium accepts parameters on the transceiver before a live track is
    // attached. Applying them here prevents an uncapped first burst; applying
    // once more after replaceTrack covers older Chromium versions.
    await this.applyVideoParameters(this.videoSender, profile);
    if (this.videoSender.track !== track) await this.videoSender.replaceTrack(track);
    await this.applyVideoParameters(this.videoSender, profile);
  }

  async parkVideoTrack(): Promise<void> {
    await this.removeVideoTrack();
  }

  async removeVideoTrack(): Promise<void> {
    await this.videoSender?.replaceTrack(null);
  }

  async replaceCameraTrack(track: MediaStreamTrack, maxBitrate = 1_200_000, maxFramerate = 30): Promise<void> {
    if (!this.cameraSender) return;
    track.contentHint = 'motion';
    const profile: VideoQualityProfile = {
      maxBitrateBps: maxBitrate,
      maxFramerate,
      degradationPreference: 'maintain-resolution',
      priority: 'medium',
      networkPriority: 'medium',
    };
    await this.applyVideoParameters(this.cameraSender, profile);
    if (this.cameraSender.track !== track) await this.cameraSender.replaceTrack(track);
    await this.applyVideoParameters(this.cameraSender, profile);
  }

  async parkCameraTrack(): Promise<void> {
    await this.removeCameraTrack();
  }

  async removeCameraTrack(): Promise<void> {
    await this.cameraSender?.replaceTrack(null);
  }

  async replaceVoiceTrack(track: MediaStreamTrack): Promise<void> {
    if (!this.voiceAudioSender) throw new Error('O canal de voz não foi negociado.');
    if (this.voiceAudioSender.track !== track) await this.voiceAudioSender.replaceTrack(track);
  }

  async removeVoiceTrack(): Promise<void> {
    await this.voiceAudioSender?.replaceTrack(null);
  }

  async replaceSystemAudioTrack(track: MediaStreamTrack): Promise<void> {
    if (!this.systemAudioSender) throw new Error('O canal de áudio do compartilhamento não foi negociado.');
    if (this.systemAudioSender.track !== track) await this.systemAudioSender.replaceTrack(track);
  }

  async removeSystemAudioTrack(): Promise<void> {
    await this.systemAudioSender?.replaceTrack(null);
  }

  /** @deprecated Use replaceSystemAudioTrack or replaceVoiceTrack explicitly. */
  async replaceAudioTrack(track: MediaStreamTrack): Promise<void> {
    await this.replaceSystemAudioTrack(track);
  }

  /** @deprecated Use removeSystemAudioTrack or removeVoiceTrack explicitly. */
  async removeAudioTrack(): Promise<void> {
    await this.removeSystemAudioTrack();
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
        if (typeof value.frameWidth === 'number') metrics.outboundFrameWidth = value.frameWidth;
        if (typeof value.frameHeight === 'number') metrics.outboundFrameHeight = value.frameHeight;
        if (typeof value.qpSum === 'number' && typeof value.framesEncoded === 'number' && value.framesEncoded > 0) metrics.outboundQp = Math.round(value.qpSum / value.framesEncoded);
        if (value.qualityLimitationReason === 'none' || value.qualityLimitationReason === 'cpu' || value.qualityLimitationReason === 'bandwidth' || value.qualityLimitationReason === 'other') metrics.qualityLimitationReason = value.qualityLimitationReason as QualityLimitationReason;
      }
      if (value.type === 'inbound-rtp' && value.kind === 'video') {
        if (typeof value.bytesReceived === 'number') metrics.videoBytesReceived = value.bytesReceived;
        if (typeof value.framesDecoded === 'number') metrics.videoFramesDecoded = value.framesDecoded;
        if (typeof value.framesPerSecond === 'number') metrics.videoFramesReceivedPerSecond = Math.round(value.framesPerSecond);
        if (typeof value.frameWidth === 'number') metrics.inboundFrameWidth = value.frameWidth;
        if (typeof value.frameHeight === 'number') metrics.inboundFrameHeight = value.frameHeight;
        if (typeof value.qpSum === 'number' && typeof value.framesDecoded === 'number' && value.framesDecoded > 0) metrics.inboundQp = Math.round(value.qpSum / value.framesDecoded);
        if (typeof value.pliCount === 'number') metrics.videoPliCount = value.pliCount;
        if (typeof value.nackCount === 'number') metrics.videoNackCount = value.nackCount;
      }
      if (value.type === 'remote-inbound-rtp' && value.kind === 'video') {
        if (typeof value.packetsLost === 'number') metrics.videoPacketsLost = value.packetsLost;
        if (typeof value.pliCount === 'number') metrics.videoPliCount = value.pliCount;
        if (typeof value.nackCount === 'number') metrics.videoNackCount = value.nackCount;
      }
      if (value.type === 'remote-inbound-rtp' && value.kind === 'audio' && typeof value.packetsLost === 'number') metrics.audioPacketsLost = value.packetsLost;
    }
    if (screenStats) {
      for (const stat of screenStats.values()) {
        const value = stat as unknown as Record<string, unknown>;
        if (value.type !== 'outbound-rtp' || value.kind !== 'video') continue;
        if (typeof value.bytesSent === 'number') outboundBytes = value.bytesSent;
        if (typeof value.framesPerSecond === 'number') metrics.videoFramesPerSecond = Math.round(value.framesPerSecond);
        if (typeof value.framesEncoded === 'number') outboundFrames = value.framesEncoded;
        if (typeof value.frameWidth === 'number') metrics.outboundFrameWidth = value.frameWidth;
        if (typeof value.frameHeight === 'number') metrics.outboundFrameHeight = value.frameHeight;
        if (typeof value.qpSum === 'number' && typeof value.framesEncoded === 'number' && value.framesEncoded > 0) metrics.outboundQp = Math.round(value.qpSum / value.framesEncoded);
        if (value.qualityLimitationReason === 'none' || value.qualityLimitationReason === 'cpu' || value.qualityLimitationReason === 'bandwidth' || value.qualityLimitationReason === 'other') metrics.qualityLimitationReason = value.qualityLimitationReason as QualityLimitationReason;
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

  /**
   * A privacy-safe, screen-specific sample for the quality overlay. This
   * intentionally returns only aggregate transport/media counters; it never
   * includes SDP, ICE candidates, IP addresses, identifiers, or media data.
   */
  async getQualitySample(): Promise<WebRtcQualitySample> {
    const sampledAtMs = performance.now();
    const sample: WebRtcQualitySample = { sampledAtMs };
    if (!this.peer) return sample;

    const peerStats = await this.peer.getStats();
    let screenStats: RTCStatsReport | undefined;
    try {
      screenStats = await this.videoSender?.getStats();
    } catch {
      // The complete peer report remains a useful compatibility fallback.
    }

    let outboundBytes: number | undefined;
    for (const stat of (screenStats ?? peerStats).values()) {
      const value = stat as unknown as Record<string, unknown>;
      if (value.type !== 'outbound-rtp' || value.kind !== 'video') continue;
      if (typeof value.bytesSent === 'number') outboundBytes = value.bytesSent;
      if (typeof value.frameWidth === 'number') sample.outboundFrameWidth = value.frameWidth;
      if (typeof value.frameHeight === 'number') sample.outboundFrameHeight = value.frameHeight;
      if (typeof value.framesPerSecond === 'number') sample.outboundFramesPerSecond = Math.round(value.framesPerSecond);
      if (typeof value.qpSum === 'number' && typeof value.framesEncoded === 'number' && value.framesEncoded > 0) {
        sample.outboundQp = Math.round(value.qpSum / value.framesEncoded);
      }
      if (typeof value.qualityLimitationReason === 'string') sample.outboundQualityLimitationReason = value.qualityLimitationReason;
      break;
    }
    if (outboundBytes !== undefined && this.previousQualityOutbound && sampledAtMs > this.previousQualityOutbound.at) {
      sample.outboundBitrateKbps = Math.max(0, Math.round(((outboundBytes - this.previousQualityOutbound.bytes) * 8) / (sampledAtMs - this.previousQualityOutbound.at)));
    }
    if (outboundBytes !== undefined) this.previousQualityOutbound = { bytes: outboundBytes, at: sampledAtMs };

    let inboundBytes: number | undefined;
    for (const stat of peerStats.values()) {
      const value = stat as unknown as Record<string, unknown>;
      if (value.type === 'candidate-pair' && value.nominated === true && typeof value.currentRoundTripTime === 'number') {
        sample.roundTripTimeMs = Math.round(value.currentRoundTripTime * 1_000);
      }
      if (value.type !== 'inbound-rtp' || value.kind !== 'video') continue;
      if (typeof value.bytesReceived === 'number') inboundBytes = value.bytesReceived;
      if (typeof value.frameWidth === 'number') sample.inboundFrameWidth = value.frameWidth;
      if (typeof value.frameHeight === 'number') sample.inboundFrameHeight = value.frameHeight;
      if (typeof value.framesPerSecond === 'number') sample.inboundFramesPerSecond = Math.round(value.framesPerSecond);
      if (typeof value.packetsLost === 'number') sample.inboundPacketsLost = value.packetsLost;
      if (typeof value.nackCount === 'number') sample.inboundNackCount = value.nackCount;
      if (typeof value.pliCount === 'number') sample.inboundPliCount = value.pliCount;
      break;
    }
    if (inboundBytes !== undefined && this.previousQualityInbound && sampledAtMs > this.previousQualityInbound.at) {
      sample.inboundBitrateKbps = Math.max(0, Math.round(((inboundBytes - this.previousQualityInbound.bytes) * 8) / (sampledAtMs - this.previousQualityInbound.at)));
    }
    if (inboundBytes !== undefined) this.previousQualityInbound = { bytes: inboundBytes, at: sampledAtMs };
    return sample;
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
    this.voiceAudioSender = undefined;
    this.systemAudioSender = undefined;
    this.audioSender = undefined;
    this.slotTransceivers.clear();
    this.transceiverSlots.clear();
    this.stopAndClear(this.remoteScreenTracks);
    this.remoteCameraTracks.forEach((track) => track.stop());
    this.remoteCameraTracks.clear();
    this.stopAndClear(this.remoteVoiceTracks);
    this.stopAndClear(this.remoteSystemAudioTracks);
    this.candidates.length = 0;
    this.confirmed = false;
    this.previousOutbound = undefined;
    this.previousOutboundFrames = undefined;
    this.previousQualityOutbound = undefined;
    this.previousQualityInbound = undefined;
  }

  private createPeer(stunServerIp: string): RTCPeerConnection {
    this.close();
    const peer = new RTCPeerConnection({ iceServers: [{ urls: tailscaleStunUrl(stunServerIp) }], iceTransportPolicy: 'all', bundlePolicy: 'max-bundle' });
    peer.onicecandidate = (event) => { if (event.candidate) this.candidates.push(candidateData(event.candidate)); };
    peer.onconnectionstatechange = () => this.events.onConnectionState(peer.connectionState);
    peer.ondatachannel = (event) => this.attachChannel(event.channel);
    peer.ontrack = (event) => this.handleRemoteTrack(peer, event);
    this.peer = peer;
    return peer;
  }

  private createSlotTransceivers(peer: RTCPeerConnection): void {
    for (const slot of mediaSlots) {
      const transceiver = peer.addTransceiver(slot.endsWith('video') ? 'video' : 'audio', { direction: 'sendrecv' });
      if (slot.endsWith('video')) preferVp8(transceiver);
      this.bindSlot(slot, transceiver);
    }
  }

  private bindAnswerSlotTransceivers(peer: RTCPeerConnection): void {
    const videoTransceivers = peer.getTransceivers().filter((transceiver) => transceiver.receiver.track.kind === 'video');
    const audioTransceivers = peer.getTransceivers().filter((transceiver) => transceiver.receiver.track.kind === 'audio');
    const assignments: Array<readonly [MediaSlot, RTCRtpTransceiver | undefined]> = [
      ['screen-video', videoTransceivers[0]],
      ['camera-video', videoTransceivers[1]],
      ['voice-audio', audioTransceivers[0]],
      ['screen-audio', audioTransceivers[1]],
    ];
    for (const [slot, transceiver] of assignments) {
      if (!transceiver) continue;
      transceiver.direction = 'sendrecv';
      if (slot.endsWith('video')) preferVp8(transceiver);
      this.bindSlot(slot, transceiver);
    }
  }

  private bindSlot(slot: MediaSlot, transceiver: RTCRtpTransceiver): void {
    this.slotTransceivers.set(slot, transceiver);
    this.transceiverSlots.set(transceiver, slot);
    if (slot === 'screen-video') this.videoSender = transceiver.sender;
    if (slot === 'camera-video') this.cameraSender = transceiver.sender;
    if (slot === 'voice-audio') this.voiceAudioSender = transceiver.sender;
    if (slot === 'screen-audio') {
      this.systemAudioSender = transceiver.sender;
      this.audioSender = transceiver.sender;
    }
  }

  private profileForTrack(track: MediaStreamTrack): readonly [number, number] {
    const settings = track.getSettings?.();
    const height = typeof settings?.height === 'number' ? settings.height : 1080;
    const frameRate = typeof settings?.frameRate === 'number' ? Math.round(settings.frameRate) : 30;
    const resolution: ScreenResolution = height >= 1300 ? '1440p' : height >= 900 ? '1080p' : '720p';
    const profile = screenQualityProfileFor(resolution, frameRate);
    return [profile.maxBitrateBps, profile.maxFramerate];
  }

  private async applyVideoParameters(sender: RTCRtpSender, profile: VideoQualityProfile): Promise<void> {
    let baselineApplied = false;
    try {
      const parameters = sender.getParameters();
      if (parameters.encodings.length === 0) parameters.encodings = [{}];
      const encoding = parameters.encodings[0];
      if (!encoding) return;
      encoding.maxBitrate = profile.maxBitrateBps;
      encoding.maxFramerate = profile.maxFramerate;
      if (profile.scaleResolutionDownBy !== undefined) encoding.scaleResolutionDownBy = profile.scaleResolutionDownBy;
      if (profile.active !== undefined) encoding.active = profile.active;
      await sender.setParameters(parameters);
      baselineApplied = true;
    } catch {
      // Some Chromium builds reject parameters before a negotiated track exists.
      // replaceVideoTrack retries after attachment, preserving compatibility.
    }
    if (!baselineApplied || (profile.priority === undefined && profile.networkPriority === undefined && profile.degradationPreference === undefined)) return;
    try {
      const parameters = sender.getParameters();
      if (parameters.encodings.length === 0) return;
      const encoding = parameters.encodings[0];
      if (!encoding) return;
      if (profile.priority !== undefined) encoding.priority = profile.priority;
      if (profile.networkPriority !== undefined) encoding.networkPriority = profile.networkPriority;
      if (profile.degradationPreference !== undefined) parameters.degradationPreference = profile.degradationPreference;
      await sender.setParameters(parameters);
    } catch {
      // Priority hints are best-effort. The bitrate/FPS cap above remains set.
    }
  }

  private handleRemoteTrack(peer: RTCPeerConnection, event: RTCTrackEvent): void {
    const slot = this.transceiverSlots.get(event.transceiver) ?? this.inferRemoteSlot(peer, event.transceiver, event.track.kind);
    if (slot === 'camera-video') {
      this.addRemoteTrack(this.remoteCameraTracks, event.track, () => {
        this.events.onRemoteCameraStream?.(new MediaStream(Array.from(this.remoteCameraTracks.values())));
      });
      return;
    }
    if (slot === 'voice-audio') {
      this.addRemoteTrack(this.remoteVoiceTracks, event.track, () => {
        this.events.onRemoteVoiceStream?.(new MediaStream(Array.from(this.remoteVoiceTracks.values())));
        this.emitRemoteMainStream('audio');
      });
      return;
    }
    if (slot === 'screen-audio') {
      this.addRemoteTrack(this.remoteSystemAudioTracks, event.track, () => {
        this.events.onRemoteSystemAudioStream?.(new MediaStream(Array.from(this.remoteSystemAudioTracks.values())));
        this.emitRemoteMainStream('audio');
      });
      return;
    }
    this.addRemoteTrack(this.remoteScreenTracks, event.track, () => this.emitRemoteMainStream(event.track.kind === 'audio' ? 'audio' : 'video'));
  }

  private inferRemoteSlot(peer: RTCPeerConnection, transceiver: RTCRtpTransceiver, kind: MediaStreamTrack['kind']): MediaSlot {
    const matches = peer.getTransceivers().filter((candidate) => candidate.receiver.track.kind === kind);
    const index = matches.indexOf(transceiver);
    if (kind === 'video') return index === 1 ? 'camera-video' : 'screen-video';
    // v5 peers had a single audio m-line. Treat it as voice rather than mixing
    // it with screen audio, which is the safer failure mode for speech UI.
    return index === 1 ? 'screen-audio' : 'voice-audio';
  }

  private addRemoteTrack(
    tracks: Map<string, MediaStreamTrack>,
    track: MediaStreamTrack,
    onChanged: () => void,
  ): void {
    tracks.set(track.id, track);
    track.onended = () => {
      tracks.delete(track.id);
      onChanged();
    };
    onChanged();
  }

  private emitRemoteMainStream(trackKind: 'video' | 'audio'): void {
    this.events.onRemoteStream(new MediaStream([
      ...this.remoteScreenTracks.values(),
      ...this.remoteVoiceTracks.values(),
      ...this.remoteSystemAudioTracks.values(),
    ]), trackKind);
  }

  private stopAndClear(tracks: Map<string, MediaStreamTrack>): void {
    tracks.forEach((track) => track.stop());
    tracks.clear();
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
