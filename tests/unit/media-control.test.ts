import { describe, expect, it } from 'vitest';
import { parseControlMessage, serializeControlMessage } from '../../src/shared/session/media-control';
import { sessionProtocolVersion } from '../../src/shared/session/types';

describe('media control protocol', () => {
  it('round-trips the typed video states', () => {
    const message = { protocolVersion: sessionProtocolVersion, type: 'video-state' as const, state: 'active' as const };
    expect(parseControlMessage(serializeControlMessage(message))).toEqual(message);
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



  it('rejects malformed and older protocol messages', () => {
    expect(parseControlMessage('{')).toBeUndefined();
    expect(parseControlMessage(JSON.stringify({ protocolVersion: 1, type: 'video-state', state: 'active' }))).toBeUndefined();
    expect(parseControlMessage(JSON.stringify({ protocolVersion: sessionProtocolVersion, type: 'video-state', state: 'playing' }))).toBeUndefined();
  });
});

