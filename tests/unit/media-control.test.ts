import { describe, expect, it } from 'vitest';
import { parseControlMessage, serializeControlMessage } from '../../src/shared/session/media-control';
import { sessionProtocolVersion } from '../../src/shared/session/types';

describe('media control protocol', () => {
  it('round-trips the typed video states', () => {
    const message = { protocolVersion: sessionProtocolVersion, type: 'video-state' as const, state: 'active' as const };
    expect(parseControlMessage(serializeControlMessage(message))).toEqual(message);
  });

  it('rejects malformed and older protocol messages', () => {
    expect(parseControlMessage('{')).toBeUndefined();
    expect(parseControlMessage(JSON.stringify({ protocolVersion: 1, type: 'video-state', state: 'active' }))).toBeUndefined();
    expect(parseControlMessage(JSON.stringify({ protocolVersion: sessionProtocolVersion, type: 'video-state', state: 'playing' }))).toBeUndefined();
  });
});
