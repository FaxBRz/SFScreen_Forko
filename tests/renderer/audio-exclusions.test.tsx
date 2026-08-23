// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_EXCLUSIONS_CHANGE_EVENT,
  normalizeAudioExclusions,
  readAudioExclusions,
  saveAudioExclusions,
} from '../../src/renderer/audio-exclusions';

describe('screen-share audio exclusions', () => {
  beforeEach(() => localStorage.clear());

  it('excludes Discord by default', () => {
    expect(readAudioExclusions()).toEqual(['discord.exe']);
  });

  it('normalizes, deduplicates and persists executable names', () => {
    const changed = vi.fn();
    window.addEventListener(AUDIO_EXCLUSIONS_CHANGE_EVENT, changed);
    expect(saveAudioExclusions(['Spotify', 'C:\\Apps\\spotify.exe', ' chrome.EXE '])).toEqual(['spotify.exe', 'chrome.exe']);
    expect(readAudioExclusions()).toEqual(['spotify.exe', 'chrome.exe']);
    expect(changed).toHaveBeenCalledOnce();
    window.removeEventListener(AUDIO_EXCLUSIONS_CHANGE_EVENT, changed);
  });

  it('rejects malformed executable values', () => {
    expect(normalizeAudioExclusions(['', 'bad|name.exe', 'ok.exe'])).toEqual(['ok.exe']);
  });
});
