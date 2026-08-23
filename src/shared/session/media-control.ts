import { sessionProtocolVersion } from './types';

export type VideoState = 'starting' | 'active' | 'stopped' | 'failed';
export type AudioState = 'unavailable' | 'starting' | 'active' | 'stopped' | 'failed';
export type CameraState = 'starting' | 'active' | 'stopped' | 'failed';
export type RoomCallState = 'joined' | 'left';

export type RemoteControlStatus = 'idle' | 'active' | 'paused-by-host' | 'disabled';

export interface RemoteControlConfig {
  enabled: boolean;
  allowMouse: boolean;
  allowKeyboard: boolean;
  allowClipboard: boolean;
}

export type RemoteInputPayload =
  | { kind: 'mouse-move'; x: number; y: number }
  | { kind: 'mouse-down' | 'mouse-up'; button: 'left' | 'right' | 'middle'; x: number; y: number }
  | { kind: 'mouse-wheel'; deltaX: number; deltaY: number; x: number; y: number }
  | { kind: 'key-down' | 'key-up'; code: string; key: string; nativeKeyCode?: number; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean }
  | { kind: 'special'; action: 'ctrl-alt-del' | 'win' | 'taskmgr' };

export interface ChatMessagePayload {
  id: string;
  senderName: string;
  text: string;
  imageData?: string;
  imageName?: string;
  timestamp: number;
  isSelf?: boolean;
}

export type SessionControlMessage =
  | { protocolVersion: typeof sessionProtocolVersion; type: 'security-confirmed' }
  | { protocolVersion: typeof sessionProtocolVersion; type: 'session-closed' }
  | { protocolVersion: typeof sessionProtocolVersion; type: 'user-profile'; userName: string; userAvatar?: string }
  | { protocolVersion: typeof sessionProtocolVersion; type: 'chat-message'; message: ChatMessagePayload }
  | { protocolVersion: typeof sessionProtocolVersion; type: 'delete-chat-message'; messageId: string }
  | { protocolVersion: typeof sessionProtocolVersion; type: 'video-state'; state: VideoState }
  | { protocolVersion: typeof sessionProtocolVersion; type: 'camera-state'; state: CameraState }
  | { protocolVersion: typeof sessionProtocolVersion; type: 'audio-state'; state: AudioState }
  | { protocolVersion: typeof sessionProtocolVersion; type: 'room-call-state'; state: RoomCallState }
  | { protocolVersion: typeof sessionProtocolVersion; type: 'remote-control-config'; config: RemoteControlConfig }
  | { protocolVersion: typeof sessionProtocolVersion; type: 'remote-control-status'; status: RemoteControlStatus; timeoutMs?: number }
  | { protocolVersion: typeof sessionProtocolVersion; type: 'remote-control-input'; input: RemoteInputPayload }
  | { protocolVersion: typeof sessionProtocolVersion; type: 'remote-clipboard'; text: string }
  | { protocolVersion: typeof sessionProtocolVersion; type: 'select-monitor'; monitorIndex: number };

export const serializeControlMessage = (message: SessionControlMessage): string => JSON.stringify(message);

export const parseControlMessage = (value: unknown): SessionControlMessage | undefined => {
  if (typeof value !== 'string') return undefined;
  try {
    const message: unknown = JSON.parse(value);
    if (typeof message !== 'object' || message === null) return undefined;
    const control = message as Record<string, unknown>;
    if (control.protocolVersion !== sessionProtocolVersion) return undefined;
    if (control.type === 'security-confirmed') return { protocolVersion: sessionProtocolVersion, type: 'security-confirmed' };
    if (control.type === 'session-closed') return { protocolVersion: sessionProtocolVersion, type: 'session-closed' };
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
        && typeof msg.text === 'string' && msg.text.length <= 4096
        && typeof msg.timestamp === 'number' && Number.isFinite(msg.timestamp)
        && (msg.text.trim().length > 0 || (typeof msg.imageData === 'string' && msg.imageData.startsWith('data:image/') && msg.imageData.length <= 1_500_000))
      ) {
        return {
          protocolVersion: sessionProtocolVersion,
          type: 'chat-message',
          message: {
            id: msg.id,
            senderName: msg.senderName,
            text: msg.text,
            imageData: typeof msg.imageData === 'string' && msg.imageData.startsWith('data:image/') && msg.imageData.length <= 1_500_000 ? msg.imageData : undefined,
            imageName: typeof msg.imageName === 'string' && msg.imageName.length <= 128 ? msg.imageName : undefined,
            timestamp: msg.timestamp,
          },
        };
      }
    }
    if (control.type === 'video-state' && (control.state === 'starting' || control.state === 'active' || control.state === 'stopped' || control.state === 'failed')) return { protocolVersion: sessionProtocolVersion, type: 'video-state', state: control.state };
    if (control.type === 'camera-state' && (control.state === 'starting' || control.state === 'active' || control.state === 'stopped' || control.state === 'failed')) return { protocolVersion: sessionProtocolVersion, type: 'camera-state', state: control.state };
    if (control.type === 'audio-state' && (control.state === 'unavailable' || control.state === 'starting' || control.state === 'active' || control.state === 'stopped' || control.state === 'failed')) return { protocolVersion: sessionProtocolVersion, type: 'audio-state', state: control.state };
    if (control.type === 'room-call-state' && (control.state === 'joined' || control.state === 'left')) return { protocolVersion: sessionProtocolVersion, type: 'room-call-state', state: control.state };

    if (control.type === 'remote-control-config' && typeof control.config === 'object' && control.config !== null) {
      const cfg = control.config as Record<string, unknown>;
      return {
        protocolVersion: sessionProtocolVersion,
        type: 'remote-control-config',
        config: {
          enabled: Boolean(cfg.enabled),
          allowMouse: Boolean(cfg.allowMouse),
          allowKeyboard: Boolean(cfg.allowKeyboard),
          allowClipboard: Boolean(cfg.allowClipboard),
        },
      };
    }

    if (control.type === 'remote-control-status' && (control.status === 'idle' || control.status === 'active' || control.status === 'paused-by-host' || control.status === 'disabled')) {
      const timeoutMs = typeof control.timeoutMs === 'number' && Number.isFinite(control.timeoutMs) ? control.timeoutMs : undefined;
      return { protocolVersion: sessionProtocolVersion, type: 'remote-control-status', status: control.status, timeoutMs };
    }

    if (control.type === 'remote-control-input' && typeof control.input === 'object' && control.input !== null) {
      const inp = control.input as Record<string, unknown>;
      if (inp.kind === 'mouse-move' && typeof inp.x === 'number' && typeof inp.y === 'number') {
        return { protocolVersion: sessionProtocolVersion, type: 'remote-control-input', input: { kind: 'mouse-move', x: inp.x, y: inp.y } };
      }
      if ((inp.kind === 'mouse-down' || inp.kind === 'mouse-up') && (inp.button === 'left' || inp.button === 'right' || inp.button === 'middle') && typeof inp.x === 'number' && typeof inp.y === 'number') {
        return { protocolVersion: sessionProtocolVersion, type: 'remote-control-input', input: { kind: inp.kind, button: inp.button, x: inp.x, y: inp.y } };
      }
      if (inp.kind === 'mouse-wheel' && typeof inp.deltaX === 'number' && typeof inp.deltaY === 'number' && typeof inp.x === 'number' && typeof inp.y === 'number') {
        return { protocolVersion: sessionProtocolVersion, type: 'remote-control-input', input: { kind: 'mouse-wheel', deltaX: inp.deltaX, deltaY: inp.deltaY, x: inp.x, y: inp.y } };
      }
      if ((inp.kind === 'key-down' || inp.kind === 'key-up') && typeof inp.code === 'string' && typeof inp.key === 'string') {
        return {
          protocolVersion: sessionProtocolVersion,
          type: 'remote-control-input',
          input: {
            kind: inp.kind,
            code: inp.code,
            key: inp.key,
            nativeKeyCode: typeof inp.nativeKeyCode === 'number' && Number.isInteger(inp.nativeKeyCode) && inp.nativeKeyCode > 0 && inp.nativeKeyCode < 256 ? inp.nativeKeyCode : undefined,
            ctrlKey: Boolean(inp.ctrlKey),
            shiftKey: Boolean(inp.shiftKey),
            altKey: Boolean(inp.altKey),
            metaKey: Boolean(inp.metaKey),
          },
        };
      }
      if (inp.kind === 'special' && (inp.action === 'ctrl-alt-del' || inp.action === 'win' || inp.action === 'taskmgr')) {
        return { protocolVersion: sessionProtocolVersion, type: 'remote-control-input', input: { kind: 'special', action: inp.action } };
      }
    }

    if (control.type === 'remote-clipboard' && typeof control.text === 'string' && control.text.length <= 100000) {
      return { protocolVersion: sessionProtocolVersion, type: 'remote-clipboard', text: control.text };
    }

    if (control.type === 'select-monitor' && typeof control.monitorIndex === 'number' && Number.isInteger(control.monitorIndex) && control.monitorIndex >= 0 && control.monitorIndex <= 10) {
      return { protocolVersion: sessionProtocolVersion, type: 'select-monitor', monitorIndex: control.monitorIndex };
    }
  } catch {
    return undefined;
  }
  return undefined;
};

