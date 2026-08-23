export const AUDIO_OUTPUT_STORAGE_KEY = 'sfscreen_preferred_audio_output';
export const AUDIO_OUTPUT_CHANGE_EVENT = 'sfscreen:audio-output-changed';
export const MICROPHONE_VOLUME_STORAGE_KEY = 'sfscreen_microphone_volume';
export const MICROPHONE_VOLUME_CHANGE_EVENT = 'sfscreen:microphone-volume-changed';
export const OUTPUT_VOLUME_STORAGE_KEY = 'sfscreen_output_volume';
export const OUTPUT_VOLUME_CHANGE_EVENT = 'sfscreen:output-volume-changed';

const readStoredValue = (key: string, fallback: string): string => {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
};

const saveStoredValue = (key: string, eventName: string, value: string): void => {
  try { localStorage.setItem(key, value); } catch { /* Keep the current-session update. */ }
  window.dispatchEvent(new CustomEvent<string>(eventName, { detail: value }));
};

const normalizeVolume = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));

export const readPreferredAudioOutput = (): string => readStoredValue(AUDIO_OUTPUT_STORAGE_KEY, 'default');

export const saveAudioOutputPreference = (deviceId: string): void => {
  saveStoredValue(AUDIO_OUTPUT_STORAGE_KEY, AUDIO_OUTPUT_CHANGE_EVENT, deviceId || 'default');
};

export const readMicrophoneVolume = (): number => normalizeVolume(Number(readStoredValue(MICROPHONE_VOLUME_STORAGE_KEY, '1')));
export const readOutputVolume = (): number => normalizeVolume(Number(readStoredValue(OUTPUT_VOLUME_STORAGE_KEY, '1')));

export const saveMicrophoneVolume = (value: number): void => {
  saveStoredValue(MICROPHONE_VOLUME_STORAGE_KEY, MICROPHONE_VOLUME_CHANGE_EVENT, String(normalizeVolume(value)));
};

export const saveOutputVolume = (value: number): void => {
  saveStoredValue(OUTPUT_VOLUME_STORAGE_KEY, OUTPUT_VOLUME_CHANGE_EVENT, String(normalizeVolume(value)));
};
