import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../../src/main/tailscale/rate-limiter';

describe('rate limiter', () => {
  it('limits a peer and resets its window deterministically', () => {
    let now = 0;
    const limiter = new RateLimiter(() => now, 1_000, 2, 4);
    expect(limiter.allow('100.90.1.2')).toBe(true);
    expect(limiter.allow('100.90.1.2')).toBe(true);
    expect(limiter.allow('100.90.1.2')).toBe(false);
    now = 1_001;
    expect(limiter.allow('100.90.1.2')).toBe(true);
  });
});
