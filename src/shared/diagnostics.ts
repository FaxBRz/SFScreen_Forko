import type { TailscaleRoute } from './session/types';

/**
 * V2 deliberately contains only aggregate WebRTC counters.  A diagnostic
 * file is safe to send to support because it has no SDP, ICE, address,
 * identity, password, token, or media payload.
 */
export const diagnosticsFormatVersion = 2 as const;
export const maxDiagnosticsBytes = 64 * 1024;

export type DiagnosticEvent = 'session-started' | 'channel-open' | 'verified' | 'video-starting' | 'video-active' | 'remote-video-track' | 'video-stopped' | 'audio-starting' | 'audio-active' | 'audio-stopped' | 'audio-unavailable' | 'connection-failed' | 'session-closed';

export interface WebRtcMetrics {
  roundTripTimeMs?: number;
  outgoingBitrateKbps?: number;
  videoFramesPerSecond?: number;
  outboundFrameWidth?: number;
  outboundFrameHeight?: number;
  outboundQp?: number;
  qualityLimitationReason?: QualityLimitationReason;
  videoBytesReceived?: number;
  videoFramesDecoded?: number;
  videoFramesReceivedPerSecond?: number;
  inboundFrameWidth?: number;
  inboundFrameHeight?: number;
  inboundQp?: number;
  videoPacketsLost?: number;
  videoPliCount?: number;
  videoNackCount?: number;
  audioPacketsLost?: number;
}

export type QualityLimitationReason = 'none' | 'cpu' | 'bandwidth' | 'other';

/** A local-only pseudonym; it must never be a display name or network ID. */
export interface DiagnosticsPeer {
  id: string;
  metrics: WebRtcMetrics;
}

export interface DiagnosticsReport {
  formatVersion: typeof diagnosticsFormatVersion;
  appVersion: string;
  exportedAt: string;
  route: TailscaleRoute;
  events: Array<{ atMs: number; event: DiagnosticEvent }>;
  /** At most three peer connections, identified only by local pseudonyms. */
  peers: DiagnosticsPeer[];
}

const events: readonly DiagnosticEvent[] = ['session-started', 'channel-open', 'verified', 'video-starting', 'video-active', 'remote-video-track', 'video-stopped', 'audio-starting', 'audio-active', 'audio-stopped', 'audio-unavailable', 'connection-failed', 'session-closed'];
const metricKeys: readonly (keyof WebRtcMetrics)[] = [
  'roundTripTimeMs',
  'outgoingBitrateKbps',
  'videoFramesPerSecond',
  'outboundFrameWidth',
  'outboundFrameHeight',
  'outboundQp',
  'qualityLimitationReason',
  'videoBytesReceived',
  'videoFramesDecoded',
  'videoFramesReceivedPerSecond',
  'inboundFrameWidth',
  'inboundFrameHeight',
  'inboundQp',
  'videoPacketsLost',
  'videoPliCount',
  'videoNackCount',
  'audioPacketsLost',
];
const qualityLimitationReasons: readonly QualityLimitationReason[] = ['none', 'cpu', 'bandwidth', 'other'];
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const pseudonymPattern = /^peer-[a-z0-9]{1,16}$/;

const isMetrics = (value: unknown): value is WebRtcMetrics => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const metrics = value as WebRtcMetrics;
  return !Object.keys(metrics).some((key) => !metricKeys.includes(key as keyof WebRtcMetrics))
    && metricKeys.every((key) => {
      const metric = metrics[key];
      if (metric === undefined) return true;
      if (key === 'qualityLimitationReason') return qualityLimitationReasons.includes(metric as QualityLimitationReason);
      return typeof metric === 'number' && Number.isFinite(metric) && metric >= 0;
    });
};

const isDiagnosticsPeer = (value: unknown): value is DiagnosticsPeer => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const peer = value as Partial<DiagnosticsPeer>;
  return Object.keys(peer).every((key) => key === 'id' || key === 'metrics')
    && typeof peer.id === 'string'
    && pseudonymPattern.test(peer.id)
    && isMetrics(peer.metrics);
};

export const isDiagnosticsReport = (value: unknown): value is DiagnosticsReport => {
  if (typeof value !== 'object' || value === null) return false;
  const report = value as Partial<DiagnosticsReport>;
  if (Object.keys(report).some((key) => !['formatVersion', 'appVersion', 'exportedAt', 'route', 'events', 'peers'].includes(key)) || report.formatVersion !== diagnosticsFormatVersion || typeof report.appVersion !== 'string' || report.appVersion.length > 64 || !versionPattern.test(report.appVersion) || typeof report.exportedAt !== 'string' || !Number.isFinite(Date.parse(report.exportedAt)) || !['direct', 'relay', 'peer-relay', 'unknown'].includes(String(report.route)) || !Array.isArray(report.events) || !Array.isArray(report.peers) || report.events.length > 500 || report.peers.length > 3) return false;
  if (!report.events.every((event) => typeof event === 'object' && event !== null && Object.keys(event).every((key) => key === 'atMs' || key === 'event') && typeof event.atMs === 'number' && Number.isFinite(event.atMs) && event.atMs >= 0 && events.includes(event.event as DiagnosticEvent))) return false;
  return report.peers.every(isDiagnosticsPeer) && new Set(report.peers.map((peer) => peer.id)).size === report.peers.length;
};
