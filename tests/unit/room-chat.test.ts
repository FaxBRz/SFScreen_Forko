import { describe, expect, it } from 'vitest';
import { insertRoomChatItem, systemEventText } from '../../src/renderer/session/room-chat';
import type { ChatItem } from '../../src/shared/session/types';

const joinedEvent: ChatItem = {
  id: 'item-joined-0000001',
  sequence: 2,
  type: 'system-event',
  timestamp: '2026-08-23T12:00:02.000Z',
  event: {
    id: 'event-joined-000001',
    sequence: 2,
    kind: 'participant-joined',
    timestamp: '2026-08-23T12:00:02.000Z',
    participantId: 'participant-alex-01',
    participantName: 'Alex',
  },
};

const userMessage: ChatItem = {
  id: 'item-message-000001',
  sequence: 1,
  type: 'user-message',
  timestamp: '2026-08-23T12:00:01.000Z',
  senderId: 'participant-rafa-01',
  senderName: 'Rafa',
  text: 'Olá!',
};

describe('room chat timeline', () => {
  it('orders coordinator items by sequence even when they arrive out of order', () => {
    const lateFirst = insertRoomChatItem([], joinedEvent);
    const ordered = insertRoomChatItem(lateFirst, userMessage);

    expect(ordered.map((item) => item.sequence)).toEqual([1, 2]);
  });

  it('deduplicates retries by envelope id and by system-event id', () => {
    const first = insertRoomChatItem([], joinedEvent);
    const sameEnvelope = insertRoomChatItem(first, joinedEvent);
    const retriedEnvelope: ChatItem = {
      ...joinedEvent,
      id: 'item-joined-retry01',
    };
    const sameEvent = insertRoomChatItem(first, retriedEnvelope);

    expect(sameEnvelope).toHaveLength(1);
    expect(sameEvent).toHaveLength(1);
  });

  it('uses stable human-readable copy for room system events', () => {
    expect(systemEventText(joinedEvent.event)).toBe('Alex acabou de entrar no chat');
    expect(systemEventText({ ...joinedEvent.event, kind: 'participant-left' })).toBe('Alex saiu da sala');
    expect(systemEventText({ ...joinedEvent.event, kind: 'participant-left-call' })).toBe('Alex saiu da chamada');
  });
});
