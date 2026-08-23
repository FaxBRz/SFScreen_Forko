// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MICROPHONE_PROCESSING_CHANGE_EVENT,
  getEffectiveMicrophoneProcessing,
  readMicrophoneProcessingPreferences,
  saveAutoSensitivity,
  saveEchoCancellation,
  saveInputProfile,
  saveInputSensitivity,
  saveNoiseSuppression,
} from '../../src/renderer/audio-preferences';

describe('microphone processing preferences', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to a strong local voice-isolation profile', () => {
    expect(readMicrophoneProcessingPreferences().profile).toBe('voice-isolation');
    expect(getEffectiveMicrophoneProcessing()).toEqual({
      noiseSuppression: 'strong',
      echoCancellation: true,
      autoGainControl: true,
      autoSensitivity: true,
      sensitivity: 0.62,
    });
  });

  it('persists and resolves the custom processing controls', () => {
    const changed = vi.fn();
    window.addEventListener(MICROPHONE_PROCESSING_CHANGE_EVENT, changed);

    saveInputProfile('custom');
    saveNoiseSuppression('standard');
    saveEchoCancellation(false);
    saveAutoSensitivity(false);
    saveInputSensitivity(0.74);

    expect(getEffectiveMicrophoneProcessing()).toEqual({
      noiseSuppression: 'standard',
      echoCancellation: false,
      autoGainControl: true,
      autoSensitivity: false,
      sensitivity: 0.74,
    });
    expect(changed).toHaveBeenCalledTimes(5);
    window.removeEventListener(MICROPHONE_PROCESSING_CHANGE_EVENT, changed);
  });

  it('keeps studio input completely unprocessed', () => {
    saveInputProfile('studio');
    expect(getEffectiveMicrophoneProcessing()).toEqual({
      noiseSuppression: 'off',
      echoCancellation: false,
      autoGainControl: false,
      autoSensitivity: false,
      sensitivity: 0,
    });
  });
});
