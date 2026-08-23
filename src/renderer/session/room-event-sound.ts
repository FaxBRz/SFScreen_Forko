import type { RoomSystemEventKind } from '../../shared/session/types';

/**
 * A tiny synthesized notification. It does not load external media, capture
 * any input, or retain an audio stream. Browser autoplay policies can block it
 * harmlessly; that must never affect room state or chat delivery.
 */
export const playRoomSystemEventSound = (kind: RoomSystemEventKind): void => {
  if (typeof window === 'undefined') return;

  try {
    const AudioContextConstructor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;

    const context = new AudioContextConstructor();
    const now = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.connect(context.destination);

    const notes: Record<RoomSystemEventKind, readonly number[]> = {
      'participant-joined': [660, 880],
      'participant-left': [520, 330],
      'participant-left-call': [440],
      'room-deleted': [330, 220],
    };

    notes[kind].forEach((frequency, index) => {
      const start = now + index * 0.09;
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.connect(gain);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.075, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);
      oscillator.start(start);
      oscillator.stop(start + 0.14);
    });

    const durationMs = notes[kind].length * 90 + 220;
    window.setTimeout(() => {
      if (context.state !== 'closed') void context.close().catch(() => undefined);
    }, durationMs);
  } catch {
    // Notifications are best effort. A blocked/suspended AudioContext must not
    // affect a connection, media, or the chat timeline.
  }
};
