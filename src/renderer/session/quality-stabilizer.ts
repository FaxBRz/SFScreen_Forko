/**
 * A small, transport-agnostic sample used to decide when it is safe to show a
 * shared screen at its intended size.  It intentionally contains only media
 * measurements; it must never carry SDP, ICE, addresses, or identifiers.
 */
export interface QualitySample {
  sampledAtMs: number;
  width?: number;
  height?: number;
  bitrateKbps?: number;
}

export interface QualityTarget {
  width: number;
  height: number;
  bitrateKbps: number;
}

export type QualityStabilizationPhase = 'idle' | 'adjusting' | 'ready' | 'limited-network';

export interface QualityStabilizationState {
  phase: QualityStabilizationPhase;
  target?: QualityTarget;
  startedAtMs?: number;
  lastSample?: QualitySample;
  consecutiveHealthySamples: number;
  /** The stage may paint the video, but it must preserve its received size. */
  shouldRenderVideo: boolean;
  /** Scaling a soft first frame up is only safe once the stream is healthy. */
  allowScaleUp: boolean;
  limitedNetwork: boolean;
  message?: 'Ajustando qualidade…' | 'Rede limitada: exibindo na resolução recebida.';
}

export const qualityStabilizationTimeoutMs = 3_000;
export const qualityResolutionThreshold = 0.9;
export const qualityBitrateThreshold = 0.4;

const monotonicNow = (): number => globalThis.performance?.now?.() ?? Date.now();

export const createIdleQualityStabilizationState = (): QualityStabilizationState => ({
  phase: 'idle',
  consecutiveHealthySamples: 0,
  shouldRenderVideo: false,
  allowScaleUp: false,
  limitedNetwork: false,
});

const isPositiveFinite = (value: number): boolean => Number.isFinite(value) && value > 0;

const validTarget = (target: QualityTarget): boolean => (
  isPositiveFinite(target.width) && isPositiveFinite(target.height) && isPositiveFinite(target.bitrateKbps)
);

const meetsResolutionTarget = (sample: QualitySample, target: QualityTarget): boolean => {
  if (!isPositiveFinite(sample.width ?? Number.NaN) || !isPositiveFinite(sample.height ?? Number.NaN)) return false;
  const width = sample.width as number;
  const height = sample.height as number;
  const normalOrientation = width >= target.width * qualityResolutionThreshold
    && height >= target.height * qualityResolutionThreshold;
  // A portrait share can legitimately report the dimensions swapped.
  const rotatedOrientation = width >= target.height * qualityResolutionThreshold
    && height >= target.width * qualityResolutionThreshold;
  return normalOrientation || rotatedOrientation;
};

const meetsBitrateTarget = (sample: QualitySample, target: QualityTarget): boolean => (
  isPositiveFinite(sample.bitrateKbps ?? Number.NaN)
  && (sample.bitrateKbps as number) >= target.bitrateKbps * qualityBitrateThreshold
);

const stableState = (
  phase: Extract<QualityStabilizationPhase, 'adjusting' | 'ready' | 'limited-network'>,
  target: QualityTarget,
  startedAtMs: number,
  lastSample: QualitySample | undefined,
  consecutiveHealthySamples: number,
): QualityStabilizationState => {
  if (phase === 'ready') {
    return {
      phase,
      target,
      startedAtMs,
      lastSample,
      consecutiveHealthySamples,
      shouldRenderVideo: true,
      allowScaleUp: true,
      limitedNetwork: false,
    };
  }
  if (phase === 'limited-network') {
    return {
      phase,
      target,
      startedAtMs,
      lastSample,
      consecutiveHealthySamples,
      shouldRenderVideo: true,
      allowScaleUp: false,
      limitedNetwork: true,
      message: 'Rede limitada: exibindo na resolução recebida.',
    };
  }
  return {
    phase,
    target,
    startedAtMs,
    lastSample,
    consecutiveHealthySamples,
    shouldRenderVideo: false,
    allowScaleUp: false,
    limitedNetwork: false,
    message: 'Ajustando qualidade…',
  };
};

/**
 * Holds the bounded initial quality gate for one screen.  A stream must pass
 * two consecutive measurements at 90% resolution and 40% bitrate before it
 * can be enlarged.  It never hides a stream again after it has become ready.
 */
export class QualityStabilizer {
  private current = createIdleQualityStabilizationState();

  get state(): QualityStabilizationState {
    return this.current;
  }

  begin(target: QualityTarget, startedAtMs = monotonicNow()): QualityStabilizationState {
    if (!validTarget(target) || !Number.isFinite(startedAtMs)) return this.reset();
    this.current = stableState('adjusting', { ...target }, startedAtMs, undefined, 0);
    return this.current;
  }

  reset(): QualityStabilizationState {
    this.current = createIdleQualityStabilizationState();
    return this.current;
  }

  tick(nowMs = monotonicNow()): QualityStabilizationState {
    if (this.current.phase !== 'adjusting') return this.current;
    const startedAtMs = this.current.startedAtMs;
    const target = this.current.target;
    if (startedAtMs === undefined || !target || !Number.isFinite(nowMs)) return this.reset();
    if (nowMs - startedAtMs >= qualityStabilizationTimeoutMs) {
      this.current = stableState(
        'limited-network',
        target,
        startedAtMs,
        this.current.lastSample,
        this.current.consecutiveHealthySamples,
      );
    }
    return this.current;
  }

  sample(sample: QualitySample): QualityStabilizationState {
    if (this.current.phase === 'idle') return this.current;
    const target = this.current.target;
    const startedAtMs = this.current.startedAtMs;
    if (!target || startedAtMs === undefined || !Number.isFinite(sample.sampledAtMs)) return this.reset();

    const sampleIsHealthy = meetsResolutionTarget(sample, target) && meetsBitrateTarget(sample, target);
    const healthySamples = sampleIsHealthy ? this.current.consecutiveHealthySamples + 1 : 0;

    // Once the video was shown at full size, a transient bad sample must not
    // make the UI flicker back to a loading pane.  It is still retained for
    // diagnostics and callers may surface it independently.
    if (this.current.phase === 'ready') {
      this.current = stableState('ready', target, startedAtMs, { ...sample }, healthySamples);
      return this.current;
    }

    if (healthySamples >= 2) {
      this.current = stableState('ready', target, startedAtMs, { ...sample }, healthySamples);
      return this.current;
    }

    if (this.current.phase === 'limited-network') {
      this.current = stableState('limited-network', target, startedAtMs, { ...sample }, healthySamples);
      return this.current;
    }

    this.current = stableState('adjusting', target, startedAtMs, { ...sample }, healthySamples);
    return this.tick(sample.sampledAtMs);
  }
}
