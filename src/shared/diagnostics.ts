import type { TailscaleRoute } from './session/types';

export const diagnosticsFormatVersion = 1 as const;
export const maxDiagnosticsBytes = 64 * 1024;

export type DiagnosticEvent = 'session-started' | 'channel-open' | 'verified' | 'video-starting' | 'video-active' | 'video-stopped' | 'audio-starting' | 'audio-active' | 'audio-stopped' | 'audio-unavailable' | 'connection-failed' | 'session-closed';

export interface WebRtcMetrics {
  roundTripTimeMs?: number;
  outgoingBitrateKbps?: number;
  videoFramesPerSecond?: number;
  videoPacketsLost?: number;
  audioPacketsLost?: number;
}

export interface DiagnosticsReport {
  formatVersion: typeof diagnosticsFormatVersion;
  appVersion: string;
  exportedAt: string;
  route: TailscaleRoute;
  events: Array<{ atMs: number; event: DiagnosticEvent }>;
  metrics: WebRtcMetrics;
}

const events: readonly DiagnosticEvent[] = ['session-started', 'channel-open', 'verified', 'video-starting', 'video-active', 'video-stopped', 'audio-starting', 'audio-active', 'audio-stopped', 'audio-unavailable', 'connection-failed', 'session-closed'];
const metricKeys: readonly (keyof WebRtcMetrics)[] = ['roundTripTimeMs', 'outgoingBitrateKbps', 'videoFramesPerSecond', 'videoPacketsLost', 'audioPacketsLost'];

export const isDiagnosticsReport = (value: unknown): value is DiagnosticsReport => {
  if (typeof value !== 'object' || value === null) return false;
  const report = value as Partial<DiagnosticsReport>;
  if (Object.keys(report).some((key) => !['formatVersion', 'appVersion', 'exportedAt', 'route', 'events', 'metrics'].includes(key)) || report.formatVersion !== diagnosticsFormatVersion || report.appVersion !== '0.1.2' || typeof report.exportedAt !== 'string' || !Number.isFinite(Date.parse(report.exportedAt)) || !['direct', 'relay', 'peer-relay', 'unknown'].includes(String(report.route)) || !Array.isArray(report.events) || typeof report.metrics !== 'object' || report.metrics === null || report.events.length > 500) return false;
  if (!report.events.every((event) => typeof event === 'object' && event !== null && Object.keys(event).every((key) => key === 'atMs' || key === 'event') && typeof event.atMs === 'number' && Number.isFinite(event.atMs) && event.atMs >= 0 && events.includes(event.event as DiagnosticEvent))) return false;
  const metrics = report.metrics as WebRtcMetrics;
  return !Object.keys(metrics).some((key) => !metricKeys.includes(key as keyof WebRtcMetrics)) && metricKeys.every((key) => metrics[key] === undefined || (typeof metrics[key] === 'number' && Number.isFinite(metrics[key]) && metrics[key]! >= 0));
};
