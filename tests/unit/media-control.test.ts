import { describe, expect, it } from 'vitest';
import { parseControlMessage, serializeControlMessage } from '../../src/shared/session/media-control';
import { sessionProtocolVersion } from '../../src/shared/session/types';

describe('media control protocol', () => {
  it('round-trips the typed video states', () => {
    const message = { protocolVersion: sessionProtocolVersion, type: 'video-state' as const, state: 'active' as const };
    expect(parseControlMessage(serializeControlMessage(message))).toEqual(message);
  });

  it('carries a bounded quality signature with a video state', () => {
    const message = {
      protocolVersion: sessionProtocolVersion,
      type: 'video-state' as const,
      state: 'starting' as const,
      quality: { width: 1920, height: 1080, bitrateKbps: 5_000 },
    };
    expect(parseControlMessage(serializeControlMessage(message))).toEqual(message);
    expect(parseControlMessage(JSON.stringify({ ...message, quality: { width: 1920, height: 1080, bitrateKbps: 1_000_000 } }))).toBeUndefined();
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
    const profile = { protocolVersion: sessionProtocolVersion, type: 'user-profile' as const, userName: 'Rafael', userAvatar: 'data:image/png;base64,avatar123', participantId: 'participant-rafa-01' };
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

  it('round-trips canonical room chat and only accepts bounded coordinator input', () => {
    const item = {
      id: 'room-item-joined1',
      sequence: 4,
      type: 'system-event' as const,
      timestamp: '2026-08-23T12:00:02.000Z',
      event: {
        id: 'room-event-joined1',
        sequence: 4,
        kind: 'participant-joined' as const,
        timestamp: '2026-08-23T12:00:02.000Z',
        participantId: 'participant-rafa-01',
        participantName: 'Rafael',
      },
    };
    const canonical = { protocolVersion: sessionProtocolVersion, type: 'room-chat-item' as const, item };
    expect(parseControlMessage(serializeControlMessage(canonical))).toEqual(canonical);

    const request = {
      protocolVersion: sessionProtocolVersion,
      type: 'room-chat-request' as const,
      request: { id: 'room-request-0001', text: 'Olá, sala!' },
    };
    expect(parseControlMessage(serializeControlMessage(request))).toEqual(request);
    expect(parseControlMessage(serializeControlMessage({ protocolVersion: sessionProtocolVersion, type: 'room-leave' as const }))).toEqual({ protocolVersion: sessionProtocolVersion, type: 'room-leave' });
    expect(parseControlMessage(JSON.stringify({ ...canonical, item: { ...item, sequence: -1 } }))).toBeUndefined();
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

