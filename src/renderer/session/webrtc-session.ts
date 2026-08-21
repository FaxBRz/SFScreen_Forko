import { filterTailscaleCandidates } from '../../shared/session/network';
import { sessionLifetimeMs, sessionProtocolVersion, type CandidateData, type SessionDescription } from '../../shared/session/types';

export interface WebRtcSessionEvents {
  onChannelOpen: () => void;
  onRemoteConfirmed: () => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
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
  private readonly candidates: CandidateData[] = [];
  private confirmed = false;

  constructor(private readonly events: WebRtcSessionEvents) {}

  async createOffer(selfIp: string, sessionId: string, nonce: string): Promise<SessionDescription> {
    const peer = this.createPeer();
    this.attachChannel(peer.createDataChannel('sfscreen-diagnostics', { ordered: true }));
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
    if (this.channel?.readyState === 'open') this.channel.send('security-confirmed');
  }

  close(): void {
    this.channel?.close();
    this.channel = undefined;
    this.peer?.close();
    this.peer = undefined;
    this.candidates.length = 0;
    this.confirmed = false;
  }

  private createPeer(): RTCPeerConnection {
    this.close();
    const peer = new RTCPeerConnection({ iceServers: [], iceTransportPolicy: 'all', bundlePolicy: 'max-bundle' });
    peer.onicecandidate = (event) => { if (event.candidate) this.candidates.push(candidateData(event.candidate)); };
    peer.onconnectionstatechange = () => this.events.onConnectionState(peer.connectionState);
    peer.ondatachannel = (event) => this.attachChannel(event.channel);
    this.peer = peer;
    return peer;
  }

  private attachChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.onopen = () => {
      if (this.confirmed) channel.send('security-confirmed');
      this.events.onChannelOpen();
    };
    channel.onmessage = (event) => { if (event.data === 'security-confirmed') this.events.onRemoteConfirmed(); };
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
