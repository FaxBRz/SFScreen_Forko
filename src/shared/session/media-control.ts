import { sessionProtocolVersion } from './types';

export type VideoState = 'starting' | 'active' | 'stopped' | 'failed';
export type AudioState = 'unavailable' | 'starting' | 'active' | 'stopped' | 'failed';

export type SessionControlMessage =
  | { protocolVersion: typeof sessionProtocolVersion; type: 'security-confirmed' }
  | { protocolVersion: typeof sessionProtocolVersion; type: 'video-state'; state: VideoState }
  | { protocolVersion: typeof sessionProtocolVersion; type: 'audio-state'; state: AudioState };

export const serializeControlMessage = (message: SessionControlMessage): string => JSON.stringify(message);

export const parseControlMessage = (value: unknown): SessionControlMessage | undefined => {
  if (typeof value !== 'string') return undefined;
  try {
    const message: unknown = JSON.parse(value);
    if (typeof message !== 'object' || message === null) return undefined;
    const control = message as Record<string, unknown>;
    if (control.protocolVersion !== sessionProtocolVersion) return undefined;
    if (control.type === 'security-confirmed') return { protocolVersion: sessionProtocolVersion, type: 'security-confirmed' };
    if (control.type === 'video-state' && (control.state === 'starting' || control.state === 'active' || control.state === 'stopped' || control.state === 'failed')) return { protocolVersion: sessionProtocolVersion, type: 'video-state', state: control.state };
    if (control.type === 'audio-state' && (control.state === 'unavailable' || control.state === 'starting' || control.state === 'active' || control.state === 'stopped' || control.state === 'failed')) return { protocolVersion: sessionProtocolVersion, type: 'audio-state', state: control.state };
  } catch {
    return undefined;
  }
  return undefined;
};
