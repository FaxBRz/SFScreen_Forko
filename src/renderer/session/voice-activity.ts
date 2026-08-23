/**
 * Local-only voice activity detection.  It deliberately consumes only a voice
 * MediaStream; screen/system audio must never be passed here.
 */
export class VoiceActivityGate {
  private noiseFloor = 0.006;
  private consecutiveSpeechSamples = 0;
  private hangoverSamples = 0;
  private active = false;

  sample(rms: number): boolean {
    const level = Number.isFinite(rms) ? Math.max(0, rms) : 0;
    const threshold = Math.max(0.015, this.noiseFloor * 2.5);
    const isSpeech = level >= threshold;

    if (!isSpeech) {
      // Update the floor only while the input is quiet so normal speech does
      // not slowly raise the threshold.
      this.noiseFloor = (this.noiseFloor * 0.975) + (level * 0.025);
      this.consecutiveSpeechSamples = 0;
      if (this.hangoverSamples > 0) this.hangoverSamples -= 1;
    } else {
      this.consecutiveSpeechSamples += 1;
      if (this.consecutiveSpeechSamples >= 2) this.hangoverSamples = 6; // 300 ms at 50 ms/sample
    }

    const next = this.consecutiveSpeechSamples >= 2 || this.hangoverSamples > 0;
    this.active = next;
    return next;
  }

  reset(): boolean {
    this.consecutiveSpeechSamples = 0;
    this.hangoverSamples = 0;
    this.active = false;
    return this.active;
  }

  get speaking(): boolean {
    return this.active;
  }
}

export interface VoiceActivityMonitorOptions {
  onChange: (speaking: boolean) => void;
}

/** A small Web Audio wrapper around VoiceActivityGate. */
export class VoiceActivityMonitor {
  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private analyser?: AnalyserNode;
  private timer?: number;
  private samples?: Uint8Array<ArrayBuffer>;
  private readonly gate = new VoiceActivityGate();
  private lastValue = false;

  constructor(private readonly options: VoiceActivityMonitorOptions) {}

  watch(stream: MediaStream | undefined): void {
    this.stop(false);
    const track = stream?.getAudioTracks().find((candidate) => candidate.readyState === 'live');
    if (!track || typeof window.AudioContext !== 'function') {
      this.publish(false);
      return;
    }

    try {
      this.context = new window.AudioContext();
      this.source = this.context.createMediaStreamSource(new MediaStream([track]));
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.68;
      this.samples = new Uint8Array(this.analyser.fftSize);
      this.source.connect(this.analyser);
      this.timer = window.setInterval(() => this.measure(), 50);
    } catch {
      this.stop(false);
      this.publish(false);
    }
  }

  setInactive(): void {
    this.gate.reset();
    this.publish(false);
  }

  stop(publish = true): void {
    if (this.timer !== undefined) {
      window.clearInterval(this.timer);
      this.timer = undefined;
    }
    try { this.source?.disconnect(); } catch { /* Already detached. */ }
    this.source = undefined;
    this.analyser = undefined;
    this.samples = undefined;
    const context = this.context;
    this.context = undefined;
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
    this.gate.reset();
    if (publish) this.publish(false);
  }

  private measure(): void {
    const analyser = this.analyser;
    const samples = this.samples;
    if (!analyser || !samples) return;
    analyser.getByteTimeDomainData(samples);
    let energy = 0;
    for (const sample of samples) {
      const normalized = (sample - 128) / 128;
      energy += normalized * normalized;
    }
    this.publish(this.gate.sample(Math.sqrt(energy / samples.length)));
  }

  private publish(value: boolean): void {
    if (this.lastValue === value) return;
    this.lastValue = value;
    this.options.onChange(value);
  }
}
