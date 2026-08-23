import { describe, expect, it } from 'vitest';
import { normalizeUpdateFeedUrl } from '../../src/main/update/update-config';

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

