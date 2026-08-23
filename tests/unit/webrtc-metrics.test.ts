import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebRtcSession } from '../../src/renderer/session/webrtc-session';

const report = (...values: Array<Record<string, unknown>>): RTCStatsReport => (
  new Map(values.map((value, index) => [String(index), value])) as unknown as RTCStatsReport
);

const createSession = (): WebRtcSession => new WebRtcSession({
  onChannelOpen: vi.fn(),
  onControlMessage: vi.fn(),
  onConnectionState: vi.fn(),
  onRemoteStream: vi.fn(),
});

describe('WebRTC screen metrics', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads FPS from the screen sender without mixing in the camera sender', async () => {
    const session = createSession();
    const internal = session as unknown as {
      peer: { getStats: () => Promise<RTCStatsReport> };
      videoSender: { getStats: () => Promise<RTCStatsReport> };
    };
    internal.peer = {
      getStats: vi.fn(async () => report(
        { type: 'candidate-pair', nominated: true, currentRoundTripTime: 0.012 },
        { type: 'outbound-rtp', kind: 'video', framesPerSecond: 30, bytesSent: 999 },
      )),
    };
    internal.videoSender = {
      getStats: vi.fn(async () => report({ type: 'outbound-rtp', kind: 'video', framesPerSecond: 60, bytesSent: 2_000 })),
    };

    const metrics = await session.getMetrics();

    expect(metrics.videoFramesPerSecond).toBe(60);
    expect(metrics.roundTripTimeMs).toBe(12);
  });

  it('calculates real FPS from encoded frame deltas when Chromium omits framesPerSecond', async () => {
    const session = createSession();
    const internal = session as unknown as {
      peer: { getStats: () => Promise<RTCStatsReport> };
      videoSender: { getStats: () => Promise<RTCStatsReport> };
    };
    let sample = 0;
    internal.peer = { getStats: vi.fn(async () => report()) };
    internal.videoSender = {
      getStats: vi.fn(async () => {
        sample += 1;
        return report({ type: 'outbound-rtp', kind: 'video', framesEncoded: sample * 120, bytesSent: sample * 1_000_000 });
      }),
    };
    vi.spyOn(performance, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(3_000);

    await session.getMetrics();
    const metrics = await session.getMetrics();

    expect(metrics.videoFramesPerSecond).toBe(60);
    expect(metrics.outgoingBitrateKbps).toBe(4_000);
  });
});
