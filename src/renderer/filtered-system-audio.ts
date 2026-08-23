import { AUDIO_EXCLUSIONS_CHANGE_EVENT, readAudioExclusions } from './audio-exclusions';

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
}

const createFilteredAudioTrack = async (): Promise<FilteredTrackHandle> => {
  const context = new AudioContext({ sampleRate: 48_000, latencyHint: 'interactive' });
  const destination = context.createMediaStreamDestination();
  const processor = context.createScriptProcessor(2_048, 0, 2);
  const queue = new StereoPcmRingBuffer();
  const unsubscribe = window.sfscreen.onFilteredAudioChunk((chunk) => queue.write(chunk));

  processor.onaudioprocess = (event) => {
    queue.readInto(event.outputBuffer.getChannelData(0), event.outputBuffer.getChannelData(1));
  };
  processor.connect(destination);
  await context.resume();

  const started = await window.sfscreen.startFilteredSystemAudio(readAudioExclusions());
  if (!started.ok) {
    unsubscribe();
    processor.disconnect();
    void context.close();
    throw new Error(started.error.message);
  }

  let captureId = started.value.captureId;
  const track = destination.stream.getAudioTracks()[0];
  if (!track || !captureId) {
    unsubscribe();
    processor.disconnect();
    void context.close();
    if (captureId) void window.sfscreen.stopFilteredSystemAudio(captureId);
    throw new Error('Não foi possível criar a faixa de áudio filtrado.');
  }

  let disposed = false;
  let restartQueue = Promise.resolve();
  const watchdogTimer = { id: undefined as number | undefined };
  const handleExclusionsChanged = (): void => {
    restartQueue = restartQueue.then(async () => {
      const previousCaptureId = captureId;
      captureId = undefined;
      if (previousCaptureId) await window.sfscreen.stopFilteredSystemAudio(previousCaptureId);
      if (disposed) return;
      const replacement = await window.sfscreen.startFilteredSystemAudio(readAudioExclusions());
      if (!replacement.ok || !replacement.value.captureId) return;
      if (disposed) {
        void window.sfscreen.stopFilteredSystemAudio(replacement.value.captureId);
        return;
      }
      captureId = replacement.value.captureId;
    }).catch(() => undefined);
  };
  window.addEventListener(AUDIO_EXCLUSIONS_CHANGE_EVENT, handleExclusionsChanged);
  const nativeStop = track.stop.bind(track);
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    if (watchdogTimer.id !== undefined) window.clearInterval(watchdogTimer.id);
    window.removeEventListener(AUDIO_EXCLUSIONS_CHANGE_EVENT, handleExclusionsChanged);
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
    // Some Chromium builds expose MediaStreamTrack.stop as non-configurable.
  }

  track.addEventListener('ended', dispose, { once: true });
  watchdogTimer.id = window.setInterval(() => {
    if (track.readyState === 'ended') dispose();
  }, 500);

  return { track };

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
      for (const track of originalAudioTracks) {
        stream.removeTrack(track);
        track.stop();
      }
      stream.addTrack(filtered.track);
      return stream;
    } catch (error) {
      // Never fall back to unfiltered loopback: that would leak Discord audio.
      for (const track of originalAudioTracks) {
        stream.removeTrack(track);
        track.stop();
      }
      console.error('SFScreen: filtered system audio unavailable', error);
      return stream;
    }
  };
};
