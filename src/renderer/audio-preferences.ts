export const AUDIO_OUTPUT_STORAGE_KEY = 'sfscreen_preferred_audio_output';
export const AUDIO_OUTPUT_CHANGE_EVENT = 'sfscreen:audio-output-changed';
export const MICROPHONE_VOLUME_STORAGE_KEY = 'sfscreen_microphone_volume';
export const MICROPHONE_VOLUME_CHANGE_EVENT = 'sfscreen:microphone-volume-changed';
export const OUTPUT_VOLUME_STORAGE_KEY = 'sfscreen_output_volume';
export const OUTPUT_VOLUME_CHANGE_EVENT = 'sfscreen:output-volume-changed';
export const MICROPHONE_PROCESSING_CHANGE_EVENT = 'sfscreen:microphone-processing-changed';

const INPUT_PROFILE_STORAGE_KEY = 'sfscreen_input_profile';
const NOISE_SUPPRESSION_STORAGE_KEY = 'sfscreen_noise_suppression';
const ECHO_CANCELLATION_STORAGE_KEY = 'sfscreen_echo_cancellation';
const AUTO_SENSITIVITY_STORAGE_KEY = 'sfscreen_auto_input_sensitivity';
const INPUT_SENSITIVITY_STORAGE_KEY = 'sfscreen_input_sensitivity';

export type InputProfile = 'voice-isolation' | 'studio' | 'custom';
export type NoiseSuppressionLevel = 'off' | 'standard' | 'strong';

export interface MicrophoneProcessingPreferences {
  profile: InputProfile;
  noiseSuppression: NoiseSuppressionLevel;
  echoCancellation: boolean;
  autoSensitivity: boolean;
  sensitivity: number;
}

export interface EffectiveMicrophoneProcessing {
  noiseSuppression: NoiseSuppressionLevel;
  echoCancellation: boolean;
  autoGainControl: boolean;
  autoSensitivity: boolean;
  sensitivity: number;
}

const readStoredValue = (key: string, fallback: string): string => {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
};

const saveStoredValue = (key: string, eventName: string, value: string): void => {
  try { localStorage.setItem(key, value); } catch { /* Keep the current-session update. */ }
  window.dispatchEvent(new CustomEvent<string>(eventName, { detail: value }));
};

const normalizeVolume = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));
const readBoolean = (key: string, fallback: boolean): boolean => readStoredValue(key, String(fallback)) === 'true';

const emitMicrophoneProcessingChange = (): void => {
  window.dispatchEvent(new CustomEvent(MICROPHONE_PROCESSING_CHANGE_EVENT));
};

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

export const readMicrophoneProcessingPreferences = (): MicrophoneProcessingPreferences => {
  const storedProfile = readStoredValue(INPUT_PROFILE_STORAGE_KEY, 'voice-isolation');
  const storedSuppression = readStoredValue(NOISE_SUPPRESSION_STORAGE_KEY, 'strong');
  return {
    profile: storedProfile === 'studio' || storedProfile === 'custom' ? storedProfile : 'voice-isolation',
    noiseSuppression: storedSuppression === 'off' || storedSuppression === 'standard' ? storedSuppression : 'strong',
    echoCancellation: readBoolean(ECHO_CANCELLATION_STORAGE_KEY, true),
    autoSensitivity: readBoolean(AUTO_SENSITIVITY_STORAGE_KEY, true),
    sensitivity: normalizeVolume(Number(readStoredValue(INPUT_SENSITIVITY_STORAGE_KEY, '0.62'))),
  };
};

export const getEffectiveMicrophoneProcessing = (
  preferences = readMicrophoneProcessingPreferences()
): EffectiveMicrophoneProcessing => {
  if (preferences.profile === 'studio') {
    return { noiseSuppression: 'off', echoCancellation: false, autoGainControl: false, autoSensitivity: false, sensitivity: 0 };
  }
  if (preferences.profile === 'voice-isolation') {
    return { noiseSuppression: 'strong', echoCancellation: true, autoGainControl: true, autoSensitivity: true, sensitivity: 0.62 };
  }
  return {
    noiseSuppression: preferences.noiseSuppression,
    echoCancellation: preferences.echoCancellation,
    autoGainControl: preferences.noiseSuppression !== 'off',
    autoSensitivity: preferences.autoSensitivity,
    sensitivity: preferences.sensitivity,
  };
};

export const saveInputProfile = (profile: InputProfile): void => {
  try { localStorage.setItem(INPUT_PROFILE_STORAGE_KEY, profile); } catch { /* Keep the current-session update. */ }
  emitMicrophoneProcessingChange();
};

export const saveNoiseSuppression = (level: NoiseSuppressionLevel): void => {
  try { localStorage.setItem(NOISE_SUPPRESSION_STORAGE_KEY, level); } catch { /* Keep the current-session update. */ }
  emitMicrophoneProcessingChange();
};

export const saveEchoCancellation = (enabled: boolean): void => {
  try { localStorage.setItem(ECHO_CANCELLATION_STORAGE_KEY, String(enabled)); } catch { /* Keep the current-session update. */ }
  emitMicrophoneProcessingChange();
};

export const saveAutoSensitivity = (enabled: boolean): void => {
  try { localStorage.setItem(AUTO_SENSITIVITY_STORAGE_KEY, String(enabled)); } catch { /* Keep the current-session update. */ }
  emitMicrophoneProcessingChange();
};

export const saveInputSensitivity = (value: number): void => {
  try { localStorage.setItem(INPUT_SENSITIVITY_STORAGE_KEY, String(normalizeVolume(value))); } catch { /* Keep the current-session update. */ }
  emitMicrophoneProcessingChange();
};
