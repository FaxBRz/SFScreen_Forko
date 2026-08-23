import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebRtcSession, cameraQualityProfileFor, screenQualityProfileFor } from '../../src/renderer/session/webrtc-session';

type FakeSender = {
  track: MediaStreamTrack | null;
  replaceTrack: ReturnType<typeof vi.fn>;
  getParameters: ReturnType<typeof vi.fn>;
  setParameters: ReturnType<typeof vi.fn>;
};

const track = (id: string, kind: 'audio' | 'video' = 'audio'): MediaStreamTrack => ({
  id,
  kind,
  contentHint: '',
  getSettings: () => ({ height: 1080, frameRate: 30 }),
} as unknown as MediaStreamTrack);

const sender = (): FakeSender => {
  const fake: FakeSender = {
    track: null,
    replaceTrack: vi.fn(),
    getParameters: vi.fn(() => ({ codecs: [], headerExtensions: [], rtcp: {}, transactionId: 'test', encodings: [{}] })),
    setParameters: vi.fn(async () => undefined),
  };
  fake.replaceTrack.mockImplementation(async (next: MediaStreamTrack | null) => {
    fake.track = next;
  });
  return fake;
};

const report = (...values: Array<Record<string, unknown>>): RTCStatsReport => (
  new Map(values.map((value, index) => [String(index), value])) as unknown as RTCStatsReport
);

const createSession = (): WebRtcSession => new WebRtcSession({
  onChannelOpen: vi.fn(),
  onControlMessage: vi.fn(),
  onConnectionState: vi.fn(),
  onRemoteStream: vi.fn(),
});

describe('WebRTC media slots', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the microphone sender untouched while system audio is attached and removed', async () => {
    const session = createSession();
    const voiceSender = sender();
    const systemSender = sender();
    const internal = session as unknown as { voiceAudioSender: RTCRtpSender; systemAudioSender: RTCRtpSender };
    internal.voiceAudioSender = voiceSender as unknown as RTCRtpSender;
    internal.systemAudioSender = systemSender as unknown as RTCRtpSender;
    const voiceTrack = track('voice');
    const systemTrack = track('system');

    await session.replaceVoiceTrack(voiceTrack);
    await session.replaceSystemAudioTrack(systemTrack);
    await session.removeSystemAudioTrack();

    expect(voiceSender.track).toBe(voiceTrack);
    expect(voiceSender.replaceTrack).toHaveBeenCalledTimes(1);
    expect(systemSender.replaceTrack).toHaveBeenCalledWith(systemTrack);
    expect(systemSender.replaceTrack).toHaveBeenLastCalledWith(null);
  });

  it('keeps screen audio attached while the microphone is removed', async () => {
    const session = createSession();
    const voiceSender = sender();
    const systemSender = sender();
    const internal = session as unknown as { voiceAudioSender: RTCRtpSender; systemAudioSender: RTCRtpSender };
    internal.voiceAudioSender = voiceSender as unknown as RTCRtpSender;
    internal.systemAudioSender = systemSender as unknown as RTCRtpSender;
    const voiceTrack = track('voice');
    const systemTrack = track('system');

    await session.replaceVoiceTrack(voiceTrack);
    await session.replaceSystemAudioTrack(systemTrack);
    await session.removeVoiceTrack();

    expect(voiceSender.track).toBeNull();
    expect(systemSender.track).toBe(systemTrack);
    expect(systemSender.replaceTrack).toHaveBeenCalledTimes(1);
  });

  it('applies bitrate/FPS before and after attaching the screen track', async () => {
    const session = createSession();
    const screenSender = sender();
    const internal = session as unknown as { videoSender: RTCRtpSender };
    internal.videoSender = screenSender as unknown as RTCRtpSender;
    const screenTrack = track('screen', 'video');

    await session.replaceVideoTrack(screenTrack, 5_000_000, 30);

    expect(screenSender.replaceTrack).toHaveBeenCalledWith(screenTrack);
    expect(screenTrack.contentHint).toBe('detail');
    expect(screenSender.setParameters).toHaveBeenCalled();
    const baselineCall = screenSender.setParameters.mock.calls.find(([parameters]) => (
      (parameters as RTCRtpSendParameters).encodings[0]?.maxBitrate === 5_000_000
      && (parameters as RTCRtpSendParameters).encodings[0]?.maxFramerate === 30
    ));
    expect(baselineCall).toBeDefined();
  });

  it('uses the agreed caps for direct and multi-party screen profiles', () => {
    expect(screenQualityProfileFor('720p', 30)).toMatchObject({ maxBitrateBps: 2_500_000, maxFramerate: 30 });
    expect(screenQualityProfileFor('1080p', 60)).toMatchObject({ maxBitrateBps: 8_000_000, maxFramerate: 60 });
    expect(screenQualityProfileFor('1440p', 60)).toMatchObject({ maxBitrateBps: 10_000_000, maxFramerate: 30 });
    expect(screenQualityProfileFor('1080p', 60, 4, 'thumbnail')).toMatchObject({ maxBitrateBps: 700_000, maxFramerate: 15, scaleResolutionDownBy: 2 });
    expect(screenQualityProfileFor('1080p', 30, 3, 'paused')).toMatchObject({ active: false, maxBitrateBps: 0 });
  });

  it('keeps camera bitrate low while a screen is active', () => {
    expect(cameraQualityProfileFor(false)).toMatchObject({ maxBitrateBps: 1_200_000, maxFramerate: 30 });
    expect(cameraQualityProfileFor(true)).toMatchObject({ maxBitrateBps: 350_000, maxFramerate: 15, scaleResolutionDownBy: 2 });
  });

  it('negotiates four empty, stable media slots instead of placeholder tracks', async () => {
    class FakePeerConnection {
      static latest?: FakePeerConnection;
      readonly iceGatheringState: RTCIceGatheringState = 'complete';
      readonly transceivers: RTCRtpTransceiver[] = [];
      readonly addTransceiver = vi.fn((kind: 'audio' | 'video' | MediaStreamTrack) => {
        const mediaKind = typeof kind === 'string' ? kind : kind.kind;
        const transceiver = {
          direction: 'sendrecv',
          sender: sender(),
          receiver: { track: { kind: mediaKind } },
          setCodecPreferences: vi.fn(),
        } as unknown as RTCRtpTransceiver;
        this.transceivers.push(transceiver);
        return transceiver;
      });
      readonly createDataChannel = vi.fn(() => ({ readyState: 'connecting', close: vi.fn() }));
      onicecandidate?: (event: RTCPeerConnectionIceEvent) => void;
      onconnectionstatechange?: () => void;
      ondatachannel?: (event: RTCDataChannelEvent) => void;
      ontrack?: (event: RTCTrackEvent) => void;
      readonly createOffer = vi.fn(async () => ({ type: 'offer' as const, sdp: 'v=0\r\na=fingerprint:sha-256 AA:BB\r\n' }));
      readonly setLocalDescription = vi.fn(async () => {
        this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: 'candidate:1 1 udp 1 100.64.0.1 43921 typ host', sdpMid: '0', sdpMLineIndex: 0 }) } } as unknown as RTCPeerConnectionIceEvent);
      });
      readonly getTransceivers = vi.fn(() => this.transceivers);
      readonly getStats = vi.fn(async () => report());
      readonly close = vi.fn();
      constructor() {
        FakePeerConnection.latest = this;
      }
    }
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection);
    vi.stubGlobal('RTCRtpSender', { getCapabilities: () => ({ codecs: [] }) });
    const session = createSession();

    await session.createOffer(['100.64.0.1'], '100.64.0.1', 'session-id', 'nonce');

    expect(FakePeerConnection.latest?.addTransceiver.mock.calls.map(([kind]) => kind)).toEqual(['video', 'video', 'audio', 'audio']);
    expect(FakePeerConnection.latest?.transceivers.every((transceiver) => transceiver.sender.track === null)).toBe(true);
  });

  it('returns a screen-specific quality sample without transport identifiers', async () => {
    const session = createSession();
    let bytesSent = 1_000;
    let bytesReceived = 5_000;
    const internal = session as unknown as {
      peer: { getStats: () => Promise<RTCStatsReport> };
      videoSender: { getStats: () => Promise<RTCStatsReport> };
    };
    internal.peer = {
      getStats: async () => report(
        { type: 'candidate-pair', nominated: true, currentRoundTripTime: 0.021 },
        { type: 'inbound-rtp', kind: 'video', bytesReceived, frameWidth: 1920, frameHeight: 1080, framesPerSecond: 30, packetsLost: 2, nackCount: 3, pliCount: 4 },
      ),
    };
    internal.videoSender = {
      getStats: async () => report({ type: 'outbound-rtp', kind: 'video', bytesSent, frameWidth: 1280, frameHeight: 720, framesPerSecond: 30, qpSum: 900, framesEncoded: 30, qualityLimitationReason: 'bandwidth' }),
    };
    vi.spyOn(performance, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);

    const first = await session.getQualitySample();
    bytesSent = 2_000;
    bytesReceived = 6_000;
    const second = await session.getQualitySample();

    expect(first).toMatchObject({ outboundFrameWidth: 1280, outboundFrameHeight: 720, outboundQp: 30, inboundFrameWidth: 1920, inboundPacketsLost: 2, roundTripTimeMs: 21 });
    expect(second.outboundBitrateKbps).toBe(8);
    expect(second.inboundBitrateKbps).toBe(8);
    expect(Object.keys(second)).not.toContain('ip');
    expect(Object.keys(second)).not.toContain('candidate');
  });
});
