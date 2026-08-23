import { describe, expect, it } from 'vitest';
import { createPublicUpdateFeedUrl, normalizeUpdateFeedUrl } from '../../src/main/update/update-config';

describe('normalizeUpdateFeedUrl', () => {
  it('normalizes a secure static Squirrel feed', () => {
    expect(normalizeUpdateFeedUrl(' https://updates.example.com/windows/x64/ '))
      .toBe('https://updates.example.com/windows/x64');
  });

  it.each([
    '',
    'http://updates.example.com/windows/x64',
    'https://user:secret@updates.example.com/windows/x64',
    'https://updates.example.com/windows/x64?token=secret',
    'not a URL',
  ])('rejects an unsafe or invalid feed: %s', (feed) => {
    expect(normalizeUpdateFeedUrl(feed)).toBeUndefined();
  });
});

describe('createPublicUpdateFeedUrl', () => {
  it('creates the official public Electron update feed', () => {
    expect(createPublicUpdateFeedUrl('win32', 'x64', '0.1.5'))
      .toBe('https://update.electronjs.org/FaxBRz/SFScreen_Forko/win32-x64/0.1.5');
  });

  it('rejects unsafe path segments', () => {
    expect(createPublicUpdateFeedUrl('win32', 'x64', '../secret')).toBeUndefined();
  });
});
