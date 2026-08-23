import { describe, expect, it } from 'vitest';
import { parseControlMessage, serializeControlMessage } from '../../src/shared/session/media-control';
import { sessionProtocolVersion } from '../../src/shared/session/types';

describe('media control protocol', () => {
  it('round-trips the typed video states', () => {
    const message = { protocolVersion: sessionProtocolVersion, type: 'video-state' as const, state: 'active' as const };
    expect(parseControlMessage(serializeControlMessage(message))).toEqual(message);
  });

  it('round-trips security-confirmed and session-closed', () => {
    const closed = { protocolVersion: sessionProtocolVersion, type: 'session-closed' as const };
    expect(parseControlMessage(serializeControlMessage(closed))).toEqual(closed);
  });

  it('round-trips camera states and rejects invalid camera state', () => {
    const message = { protocolVersion: sessionProtocolVersion, type: 'camera-state' as const, state: 'active' as const };
    expect(parseControlMessage(serializeControlMessage(message))).toEqual(message);
    expect(parseControlMessage(JSON.stringify({ protocolVersion: sessionProtocolVersion, type: 'camera-state', state: 'unsupported' }))).toBeUndefined();
  });

  it('round-trips audio states and rejects invalid audio state', () => {
    const message = { protocolVersion: sessionProtocolVersion, type: 'audio-state' as const, state: 'active' as const };
    expect(parseControlMessage(serializeControlMessage(message))).toEqual(message);
    expect(parseControlMessage(JSON.stringify({ protocolVersion: sessionProtocolVersion, type: 'audio-state', state: 'microphone' }))).toBeUndefined();
  });

  it('round-trips user-profile and chat-message', () => {
    const profile = { protocolVersion: sessionProtocolVersion, type: 'user-profile' as const, userName: 'Rafael', userAvatar: 'data:image/png;base64,avatar123' };
    expect(parseControlMessage(serializeControlMessage(profile))).toEqual(profile);


    const chat = {
      protocolVersion: sessionProtocolVersion,
      type: 'chat-message' as const,
      messageId: undefined,
      message: {
        id: 'msg-1',
        senderName: 'Rafael',
        text: 'Olá amigo',
        timestamp: 1700000000000,
      },
    };
    expect(parseControlMessage(serializeControlMessage(chat))).toEqual(chat);

    const del = {
      protocolVersion: sessionProtocolVersion,
      type: 'delete-chat-message' as const,
      messageId: 'msg-1',
    };
    expect(parseControlMessage(serializeControlMessage(del))).toEqual(del);
  });

  it('round-trips room call membership and rejects invalid states', () => {
    const message = { protocolVersion: sessionProtocolVersion, type: 'room-call-state' as const, state: 'joined' as const };
    expect(parseControlMessage(serializeControlMessage(message))).toEqual(message);
    expect(parseControlMessage(JSON.stringify({ protocolVersion: sessionProtocolVersion, type: 'room-call-state', state: 'ringing' }))).toBeUndefined();
  });

  it('accepts a chat image without text and rejects an oversized image payload', () => {
    const image = {
      protocolVersion: sessionProtocolVersion,
      type: 'chat-message' as const,
      message: { id: 'image-1', senderName: 'Rafael', text: '', imageData: 'data:image/jpeg;base64,abc', imageName: 'foto.jpg', timestamp: 1700000000000 },
    };
    expect(parseControlMessage(serializeControlMessage(image))).toEqual(image);
    const tooLarge = { ...image, message: { ...image.message, imageData: `data:image/jpeg;base64,${'a'.repeat(1_500_001)}` } };
    expect(parseControlMessage(serializeControlMessage(tooLarge))).toBeUndefined();
  });

  it('round-trips remote-control-config and remote-control-status', () => {
    const config = {
      protocolVersion: sessionProtocolVersion,
      type: 'remote-control-config' as const,
      config: { enabled: true, allowMouse: true, allowKeyboard: true, allowClipboard: true },
    };
    expect(parseControlMessage(serializeControlMessage(config))).toEqual(config);

    const status = {
      protocolVersion: sessionProtocolVersion,
      type: 'remote-control-status' as const,
      status: 'paused-by-host' as const,
      timeoutMs: 5000,
    };
    expect(parseControlMessage(serializeControlMessage(status))).toEqual(status);
  });

  it('round-trips remote-control-input events and remote-clipboard', () => {
    const move = {
      protocolVersion: sessionProtocolVersion,
      type: 'remote-control-input' as const,
      input: { kind: 'mouse-move' as const, x: 0.5, y: 0.25 },
    };
    expect(parseControlMessage(serializeControlMessage(move))).toEqual(move);

    const click = {
      protocolVersion: sessionProtocolVersion,
      type: 'remote-control-input' as const,
      input: { kind: 'mouse-down' as const, button: 'left' as const, x: 0.5, y: 0.25 },
    };
    expect(parseControlMessage(serializeControlMessage(click))).toEqual(click);

    const key = {
      protocolVersion: sessionProtocolVersion,
      type: 'remote-control-input' as const,
      input: { kind: 'key-down' as const, code: 'KeyA', key: 'a', nativeKeyCode: 0x41, ctrlKey: true, shiftKey: false, altKey: false, metaKey: false },
    };
    expect(parseControlMessage(serializeControlMessage(key))).toEqual(key);

    const clip = {
      protocolVersion: sessionProtocolVersion,
      type: 'remote-clipboard' as const,
      text: 'Texto copiado remotamente',
    };
    expect(parseControlMessage(serializeControlMessage(clip))).toEqual(clip);
  });



  it('rejects malformed and older protocol messages', () => {
    expect(parseControlMessage('{')).toBeUndefined();
    expect(parseControlMessage(JSON.stringify({ protocolVersion: 1, type: 'video-state', state: 'active' }))).toBeUndefined();
    expect(parseControlMessage(JSON.stringify({ protocolVersion: sessionProtocolVersion, type: 'video-state', state: 'playing' }))).toBeUndefined();
  });
});

