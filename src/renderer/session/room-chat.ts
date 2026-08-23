import type { ChatItem, RoomSystemEvent } from '../../shared/session/types';

/**
 * Room chat is deliberately short lived. A new member receives only events
 * produced after it joined, so retaining a small local timeline is enough and
 * prevents a long-running room from growing the renderer indefinitely.
 */
export const maxRoomChatItems = 250;

const compareItems = (left: ChatItem, right: ChatItem): number => {
  if (left.sequence !== right.sequence) return left.sequence - right.sequence;
  const timestamp = Date.parse(left.timestamp) - Date.parse(right.timestamp);
  if (timestamp !== 0) return timestamp;
  return left.id.localeCompare(right.id);
};

const eventIdFor = (item: ChatItem): string | undefined => item.type === 'system-event' ? item.event.id : undefined;

/**
 * Adds a canonical room item exactly once and keeps the renderer timeline in
 * coordinator order. The event id is checked as well as the chat id because a
 * retried relay may give a system event a different envelope id.
 */
export const insertRoomChatItem = (items: readonly ChatItem[], item: ChatItem): ChatItem[] => {
  const eventId = eventIdFor(item);
  const duplicate = items.some((existing) => existing.id === item.id
    || (eventId !== undefined && eventIdFor(existing) === eventId));
  if (duplicate) return [...items];

  const ordered = [...items, item].sort(compareItems);
  return ordered.length > maxRoomChatItems ? ordered.slice(-maxRoomChatItems) : ordered;
};

export const systemEventText = (event: RoomSystemEvent): string => {
  const name = event.participantName?.trim() || 'Um participante';
  if (event.kind === 'participant-joined') return `${name} acabou de entrar no chat`;
  if (event.kind === 'participant-left') return `${name} saiu da sala`;
  if (event.kind === 'participant-left-call') return `${name} saiu da chamada`;
  return 'A sala foi encerrada pelo dono';
};
