class StereoPcmRingBuffer {
  private readonly left: Float32Array;
  private readonly right: Float32Array;
  private readIndex = 0;
  private writeIndex = 0;
  private available = 0;

  constructor(private readonly capacity = 48_000 * 2) {
    this.left = new Float32Array(capacity);
    this.right = new Float32Array(capacity);
  }

  write(buffer: ArrayBuffer): void {
    const view = new DataView(buffer);
    for (let offset = 0; offset + 3 < view.byteLength; offset += 4) {
      if (this.available === this.capacity) {
        this.readIndex = (this.readIndex + 1) % this.capacity;
        this.available -= 1;
      }
      this.left[this.writeIndex] = view.getInt16(offset, true) / 32768;
      this.right[this.writeIndex] = view.getInt16(offset + 2, true) / 32768;
      this.writeIndex = (this.writeIndex + 1) % this.capacity;
      this.available += 1;
    }
  }

  readInto(left: Float32Array, right: Float32Array): void {
    const frames = Math.min(left.length, right.length);
    for (let index = 0; index < frames; index += 1) {
      if (this.available === 0) {
        left[index] = 0;
        right[index] = 0;
        continue;
      }
      left[index] = this.left[this.readIndex];
      right[index] = this.right[this.readIndex];
      this.readIndex = (this.readIndex + 1) % this.capacity;
      this.available -= 1;
    }
  }
}

interface FilteredTrackHandle {
  track: MediaStreamTrack;
  dispose: () => void;
}

const createFilteredAudioTrack = async (): Promise<FilteredTrackHandle | undefined> => {
  const AudioContextConstructor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) throw new Error('Web Audio não está disponível nesta versão do Chromium.');

  const context = new AudioContextConstructor({ sampleRate: 48_000, latencyHint: 'interactive' });
  const destination = context.createMediaStreamDestination();
  const processor = context.createScriptProcessor(2_048, 0, 2);
  const queue = new StereoPcmRingBuffer();
  const unsubscribe = window.sfscreen.onFilteredAudioChunk((chunk) => queue.write(chunk));

  processor.onaudioprocess = (event) => {
    queue.readInto(event.outputBuffer.getChannelData(0), event.outputBuffer.getChannelData(1));
  };
  processor.connect(destination);
  await context.resume();

  const started = await window.sfscreen.startFilteredSystemAudio();
  if (!started.ok) {
    unsubscribe();
    processor.disconnect();
    void context.close();
    throw new Error(started.error.message);
  }

  if (started.value.mode === 'not-needed') {
    unsubscribe();
    processor.disconnect();
    void context.close();
    return undefined;
  }

  const captureId = started.value.captureId;
  const track = destination.stream.getAudioTracks()[0];
  if (!track || !captureId) {
    unsubscribe();
    processor.disconnect();
    void context.close();
    if (captureId) void window.sfscreen.stopFilteredSystemAudio(captureId);
    throw new Error('Não foi possível criar a faixa de áudio filtrado.');
  }

  let disposed = false;
  const nativeStop = track.stop.bind(track);
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    processor.onaudioprocess = null;
    processor.disconnect();
    void window.sfscreen.stopFilteredSystemAudio(captureId);
    void context.close();
  };

  try {
    Object.defineProperty(track, 'stop', {
      configurable: true,
      value: (): void => {
        dispose();
        nativeStop();
      },
    });
  } catch {
    track.addEventListener('ended', dispose, { once: true });
  }

  track.addEventListener('ended', dispose, { once: true });
  return { track, dispose };
};

const wantsAudio = (constraints?: DisplayMediaStreamOptions): boolean => {
  if (!constraints) return false;
  return constraints.audio !== undefined && constraints.audio !== false;
};

let installed = false;

export const installFilteredSystemAudio = (): void => {
  if (installed || !navigator.mediaDevices?.getDisplayMedia) return;
  installed = true;

  const original = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getDisplayMedia = async (constraints?: DisplayMediaStreamOptions): Promise<MediaStream> => {
    const stream = await original(constraints);
    if (!wantsAudio(constraints)) return stream;

    const originalAudioTracks = stream.getAudioTracks();
    try {
      const filtered = await createFilteredAudioTrack();
      if (!filtered) return stream; // Discord is not running; normal system loopback is safe.

      for (const track of originalAudioTracks) {
        stream.removeTrack(track);
        track.stop();
      }
      stream.addTrack(filtered.track);
      return stream;
    } catch (error) {
      // Discord is running but filtered capture failed. Do not leak the call through normal loopback.
      for (const track of originalAudioTracks) {
        stream.removeTrack(track);
        track.stop();
      }
      console.error('SFScreen: filtered system audio unavailable', error);
      return stream;
    }
  };
};
