import { describe, expect, it } from 'vitest';
import {
  QualityStabilizer,
  qualityBitrateThreshold,
  qualityResolutionThreshold,
  qualityStabilizationTimeoutMs,
} from '../../src/renderer/session/quality-stabilizer';

const target = { width: 1920, height: 1080, bitrateKbps: 5_000 };

const healthySample = (sampledAtMs: number) => ({
  sampledAtMs,
  width: target.width * qualityResolutionThreshold,
  height: target.height * qualityResolutionThreshold,
  bitrateKbps: target.bitrateKbps * qualityBitrateThreshold,
});

describe('QualityStabilizer', () => {
  it('keeps a new screen hidden and unscaled while it is adjusting', () => {
    const stabilizer = new QualityStabilizer();

    const state = stabilizer.begin(target, 100);

    expect(state).toMatchObject({
      phase: 'adjusting',
      shouldRenderVideo: false,
      allowScaleUp: false,
      limitedNetwork: false,
      message: 'Ajustando qualidade…',
    });
  });

  it('requires two consecutive samples at both thresholds before allowing enlargement', () => {
    const stabilizer = new QualityStabilizer();
    stabilizer.begin(target, 0);

    expect(stabilizer.sample(healthySample(100))).toMatchObject({ phase: 'adjusting', consecutiveHealthySamples: 1 });
    expect(stabilizer.sample({ ...healthySample(200), bitrateKbps: target.bitrateKbps * qualityBitrateThreshold - 1 })).toMatchObject({
      phase: 'adjusting',
      consecutiveHealthySamples: 0,
    });
    expect(stabilizer.sample(healthySample(300))).toMatchObject({ phase: 'adjusting', consecutiveHealthySamples: 1 });
    expect(stabilizer.sample(healthySample(400))).toMatchObject({
      phase: 'ready',
      consecutiveHealthySamples: 2,
      shouldRenderVideo: true,
      allowScaleUp: true,
    });
  });

  it('accepts portrait samples with swapped dimensions', () => {
    const stabilizer = new QualityStabilizer();
    stabilizer.begin({ width: 1080, height: 1920, bitrateKbps: 5_000 }, 0);

    stabilizer.sample({ sampledAtMs: 100, width: 1920, height: 1080, bitrateKbps: 2_000 });
    const state = stabilizer.sample({ sampledAtMs: 200, width: 1920, height: 1080, bitrateKbps: 2_000 });

    expect(state.phase).toBe('ready');
  });

  it('falls back after three seconds without enlarging a soft stream', () => {
    const stabilizer = new QualityStabilizer();
    stabilizer.begin(target, 1_000);

    expect(stabilizer.tick(1_000 + qualityStabilizationTimeoutMs - 1).phase).toBe('adjusting');
    const limited = stabilizer.tick(1_000 + qualityStabilizationTimeoutMs);

    expect(limited).toMatchObject({
      phase: 'limited-network',
      shouldRenderVideo: true,
      allowScaleUp: false,
      limitedNetwork: true,
      message: 'Rede limitada: exibindo na resolução recebida.',
    });
  });

  it('can recover from a limited network once two fresh healthy samples arrive', () => {
    const stabilizer = new QualityStabilizer();
    stabilizer.begin(target, 0);
    stabilizer.tick(qualityStabilizationTimeoutMs);

    expect(stabilizer.sample(healthySample(3_100)).phase).toBe('limited-network');
    expect(stabilizer.sample(healthySample(3_200))).toMatchObject({ phase: 'ready', allowScaleUp: true, limitedNetwork: false });
  });

  it('does not hide a stream again after it was accepted', () => {
    const stabilizer = new QualityStabilizer();
    stabilizer.begin(target, 0);
    stabilizer.sample(healthySample(100));
    stabilizer.sample(healthySample(200));

    const state = stabilizer.sample({ sampledAtMs: 300, width: 320, height: 180, bitrateKbps: 50 });

    expect(state).toMatchObject({ phase: 'ready', shouldRenderVideo: true, allowScaleUp: true, consecutiveHealthySamples: 0 });
  });
});
