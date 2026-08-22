import { sessionProtocolVersion } from './types';

export type VideoState = 'starting' | 'active' | 'stopped' | 'failed';
export type AudioState = 'unavailable' | 'starting' | 'active' | 'stopped' | 'failed';
export type CameraState = 'starting' | 'active' | 'stopped' | 'failed';

export interface ChatMessagePayload {
  id: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export type SessionControlMessage =
  | { protocolVersion: typeof sessionProtocolVersion; type: 'security-confirmed' }
  | { protocolVersion: typeof sessionProtocolVersion; type: 'user-profile'; userName: string; userAvatar?: string }
  | { protocolVersion: typeof sessionProtocolVersion; type: 'chat-message'; message: ChatMessagePayload }
  | { protocolVersion: typeof sessionProtocolVersion; type: 'delete-chat-message'; messageId: string }
  | { protocolVersion: typeof sessionProtocolVersion; type: 'video-state'; state: VideoState }
  | { protocolVersion: typeof sessionProtocolVersion; type: 'camera-state'; state: CameraState }
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
    if (control.type === 'user-profile' && typeof control.userName === 'string' && control.userName.trim().length > 0 && control.userName.length <= 64) {
      const userAvatar = typeof control.userAvatar === 'string' && control.userAvatar.length <= 250000 ? control.userAvatar : undefined;
      return { protocolVersion: sessionProtocolVersion, type: 'user-profile', userName: control.userName.trim(), userAvatar };
    }

    if (control.type === 'delete-chat-message' && typeof control.messageId === 'string' && control.messageId.length > 0 && control.messageId.length <= 128) {
      return { protocolVersion: sessionProtocolVersion, type: 'delete-chat-message', messageId: control.messageId };
    }
    if (control.type === 'chat-message' && typeof control.message === 'object' && control.message !== null) {
      const msg = control.message as Record<string, unknown>;
      if (
        typeof msg.id === 'string' && msg.id.length > 0 && msg.id.length <= 128
        && typeof msg.senderName === 'string' && msg.senderName.length > 0 && msg.senderName.length <= 64
        && typeof msg.text === 'string' && msg.text.trim().length > 0 && msg.text.length <= 4096
        && typeof msg.timestamp === 'number' && Number.isFinite(msg.timestamp)
      ) {
        return {
          protocolVersion: sessionProtocolVersion,
          type: 'chat-message',
          message: {
            id: msg.id,
            senderName: msg.senderName,
            text: msg.text,
            timestamp: msg.timestamp,
          },
        };
      }
    }
    if (control.type === 'video-state' && (control.state === 'starting' || control.state === 'active' || control.state === 'stopped' || control.state === 'failed')) return { protocolVersion: sessionProtocolVersion, type: 'video-state', state: control.state };
    if (control.type === 'camera-state' && (control.state === 'starting' || control.state === 'active' || control.state === 'stopped' || control.state === 'failed')) return { protocolVersion: sessionProtocolVersion, type: 'camera-state', state: control.state };
    if (control.type === 'audio-state' && (control.state === 'unavailable' || control.state === 'starting' || control.state === 'active' || control.state === 'stopped' || control.state === 'failed')) return { protocolVersion: sessionProtocolVersion, type: 'audio-state', state: control.state };
  } catch {
    return undefined;
  }
  return undefined;
};

