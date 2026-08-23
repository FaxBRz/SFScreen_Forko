export const AUDIO_EXCLUSIONS_STORAGE_KEY = 'sfscreen_audio_exclusions';
export const AUDIO_EXCLUSIONS_CHANGE_EVENT = 'sfscreen:audio-exclusions-changed';
export const DEFAULT_AUDIO_EXCLUSIONS = ['discord.exe'] as const;

export const normalizeExecutableName = (value: string): string => {
  const basename = value.trim().replaceAll('\\', '/').split('/').pop()?.trim().toLowerCase() ?? '';
  if (!/^[a-z0-9][a-z0-9._+ -]{0,79}(?:\.exe)?$/i.test(basename)) return '';
  return basename.endsWith('.exe') ? basename : `${basename}.exe`;
};

export const normalizeAudioExclusions = (values: readonly string[]): string[] => {
  return [...new Set(values.map(normalizeExecutableName).filter(Boolean))].slice(0, 32);
};

export const readAudioExclusions = (): string[] => {
  try {
    const stored = localStorage.getItem(AUDIO_EXCLUSIONS_STORAGE_KEY);
    if (!stored) return [...DEFAULT_AUDIO_EXCLUSIONS];
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? normalizeAudioExclusions(parsed.filter((item): item is string => typeof item === 'string')) : [...DEFAULT_AUDIO_EXCLUSIONS];
  } catch {
    return [...DEFAULT_AUDIO_EXCLUSIONS];
  }
};

export const saveAudioExclusions = (values: readonly string[]): string[] => {
  const normalized = normalizeAudioExclusions(values);
  try { localStorage.setItem(AUDIO_EXCLUSIONS_STORAGE_KEY, JSON.stringify(normalized)); } catch { /* Current-session update still applies. */ }
  window.dispatchEvent(new CustomEvent<string[]>(AUDIO_EXCLUSIONS_CHANGE_EVENT, { detail: normalized }));
  return normalized;
};
