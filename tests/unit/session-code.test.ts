import { describe, expect, it } from 'vitest';
import { formatGeneratedSessionCode, formatSessionCode, isValidSessionCode, normalizeSessionCode } from '../../src/shared/session/code';

describe('session codes', () => {
  it('normalizes and formats a user-entered code', () => {
    expect(normalizeSessionCode('k7p-4mx-q')).toBe('K7P4MXQ');
    expect(formatSessionCode('k7p4mxq')).toBe('K7P-4MX-Q');
  });

  it('rejects incomplete and ambiguous codes', () => {
    expect(isValidSessionCode('K7P-4MX-Q')).toBe(true);
    expect(isValidSessionCode('K7P-4MX')).toBe(false);
    expect(isValidSessionCode('K7P-4I0-Q')).toBe(false);
  });

  it('uses seven random bytes to produce the expected shape', () => {
    expect(formatGeneratedSessionCode(new Uint8Array([0, 1, 2, 3, 4, 5, 6]))).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}-[A-Z2-9]$/);
  });
});
