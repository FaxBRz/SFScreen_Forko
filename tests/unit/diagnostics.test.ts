import { describe, expect, it } from 'vitest';
import { diagnosticsFormatVersion, isDiagnosticsReport } from '../../src/shared/diagnostics';

const report = { formatVersion: diagnosticsFormatVersion, appVersion: '0.1.2', exportedAt: '2026-08-21T12:00:00.000Z', route: 'relay', events: [{ atMs: 120, event: 'video-active' }], metrics: { roundTripTimeMs: 42 } };

describe('sanitized diagnostics', () => {
  it('accepts only the small allowlisted diagnostic shape', () => {
    expect(isDiagnosticsReport(report)).toBe(true);
  });

  it('rejects sensitive or arbitrary fields', () => {
    expect(isDiagnosticsReport({ ...report, sdp: 'secret' })).toBe(false);
    expect(isDiagnosticsReport({ ...report, metrics: { ...report.metrics, candidate: '100.1.2.3' } })).toBe(false);
  });
});
