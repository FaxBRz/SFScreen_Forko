import { describe, expect, it } from 'vitest';
import { diagnosticsFormatVersion, isDiagnosticsReport } from '../../src/shared/diagnostics';

const report = {
  formatVersion: diagnosticsFormatVersion,
  appVersion: '0.2.0',
  exportedAt: '2026-08-21T12:00:00.000Z',
  route: 'relay',
  events: [{ atMs: 120, event: 'remote-video-track' }],
  peers: [{ id: 'peer-1', metrics: { roundTripTimeMs: 42, videoFramesDecoded: 18, qualityLimitationReason: 'bandwidth' } }],
};

describe('sanitized diagnostics', () => {
  it('accepts only the small allowlisted diagnostic shape', () => {
    expect(isDiagnosticsReport(report)).toBe(true);
  });

  it('rejects sensitive or arbitrary fields', () => {
    expect(isDiagnosticsReport({ ...report, sdp: 'secret' })).toBe(false);
    const reportWithName = {
      ...report,
      peers: [{ id: 'Alex', metrics: {} }],
    };
    expect(isDiagnosticsReport(reportWithName)).toBe(false);
    const reportWithCandidate = {
      ...report,
      peers: [{ id: 'peer-1', metrics: { candidate: '100.1.2.3' } }],
    };
    expect(isDiagnosticsReport(reportWithCandidate)).toBe(false);
  });

  it('permits no more than three local pseudonymous peer summaries', () => {
    expect(isDiagnosticsReport({ ...report, peers: Array.from({ length: 4 }, (_, index) => ({ id: `peer-${index + 1}`, metrics: {} })) })).toBe(false);
    expect(isDiagnosticsReport({ ...report, peers: [{ id: 'peer-1', metrics: {} }, { id: 'peer-1', metrics: {} }] })).toBe(false);
  });
});
