import { randomBytes } from 'node:crypto';
import { roomMaxCapacity, type ParticipantState, type RoomMembershipSnapshot, type RoomMeshClientAuth, type RoomMeshEvent, type RoomMeshJoinResult, type RoomMeshPollResult, type RoomMeshQueuedSignal, type RoomMeshSignal } from '../../shared/session/types';

const maxQueuedEvents = 128;
const maxPollEvents = 64;
export const roomMeshReconnectGraceMs = 30_000;

export type MeshAdmissionRejection = 'already-member' | 'room-full' | 'invalid-resume-token';
export type MeshSignalRejection = 'not-member' | 'unknown-target' | 'stale-membership' | 'not-host' | 'duplicate-signal';

interface MeshMember {
  participant: ParticipantState;
  resumeToken: string;
  events: RoomMeshEvent[];
  lastSeenAt: number;
}

export interface RoomMeshCoordinatorOptions {
  roomId: string;
  host: ParticipantState;
  now?: () => number;
  random?: (size: number) => Uint8Array;
  reconnectGraceMs?: number;
  onHostEvent?: (event: RoomMeshEvent) => void;
}

export type MeshAdmission =
  | { accepted: true; result: RoomMeshJoinResult }
  | { accepted: false; reason: MeshAdmissionRejection };

export type MeshSignalDelivery =
  | { accepted: true; duplicate: boolean }
  | { accepted: false; reason: MeshSignalRejection };

const cloneParticipant = (participant: ParticipantState): ParticipantState => ({ ...participant });
const cloneSnapshot = (snapshot: RoomMembershipSnapshot): RoomMembershipSnapshot => ({
  roomId: snapshot.roomId,
  revision: snapshot.revision,
  participants: snapshot.participants.map(cloneParticipant),
});

const cloneQueuedSignal = (signal: RoomMeshQueuedSignal): RoomMeshQueuedSignal => ({
  ...signal,
  description: {
    ...signal.description,
    candidates: signal.description.candidates.map((candidate) => ({ ...candidate })),
  },
});

const cloneEvent = (event: RoomMeshEvent): RoomMeshEvent => event.type === 'membership'
  ? { sequence: event.sequence, type: 'membership', snapshot: cloneSnapshot(event.snapshot) }
  : { sequence: event.sequence, type: 'signal', signal: cloneQueuedSignal(event.signal) };

/**
 * In-memory coordinator for one room listener. It deliberately never owns an
 * RTCPeerConnection: it only serializes authoritative membership and routes
 * signaling descriptions between direct peer pairs.
 */
export class RoomMeshCoordinator {
  private readonly members = new Map<string, MeshMember>();
  private readonly seenSignalIds = new Set<string>();
  private readonly now: () => number;
  private readonly random: (size: number) => Uint8Array;
  private readonly reconnectGraceMs: number;
  private revision = 1;
  private eventSequence = 0;

  constructor(private readonly options: RoomMeshCoordinatorOptions) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? randomBytes;
    this.reconnectGraceMs = options.reconnectGraceMs ?? roomMeshReconnectGraceMs;
    this.members.set(options.host.id, {
      participant: cloneParticipant(options.host),
      // Host signaling goes through a privileged local IPC method, so this
      // token intentionally never leaves the main process.
      resumeToken: this.newToken(),
      events: [],
      lastSeenAt: this.now(),
    });
  }

  get hostParticipantId(): string {
    return this.options.host.id;
  }

  get membershipRevision(): number {
    return this.revision;
  }

  hasParticipant(participantId: string): boolean {
    return this.members.has(participantId);
  }

  snapshot(): RoomMembershipSnapshot {
    return {
      roomId: this.options.roomId,
      revision: this.revision,
      participants: Array.from(this.members.values(), (member) => cloneParticipant(member.participant))
        .sort((first, second) => first.joinedAt.localeCompare(second.joinedAt) || first.id.localeCompare(second.id)),
    };
  }

  admit(participant: ParticipantState, resumeToken?: string): MeshAdmission {
    this.expireInactive();
    const previous = this.members.get(participant.id);
    if (previous) {
      if (!resumeToken || resumeToken !== previous.resumeToken) return { accepted: false, reason: resumeToken ? 'invalid-resume-token' : 'already-member' };
      const reconnected = previous.participant.presence === 'reconnecting';
      previous.lastSeenAt = this.now();
      if (reconnected) {
        previous.participant = { ...previous.participant, presence: 'connected', reconnectDeadlineAt: undefined };
        this.publishMembership();
      }
      return {
        accepted: true,
        result: {
          membership: this.snapshot(),
          resumeToken: previous.resumeToken,
          reconnected,
        },
      };
    }
    if (this.members.size >= roomMaxCapacity) return { accepted: false, reason: 'room-full' };
    const token = this.newToken();
    this.members.set(participant.id, { participant: cloneParticipant(participant), resumeToken: token, events: [], lastSeenAt: this.now() });
    this.publishMembership();
    return {
      accepted: true,
      result: {
        membership: this.snapshot(),
        resumeToken: token,
        reconnected: false,
      },
    };
  }

  poll(auth: RoomMeshClientAuth, afterSequence = 0): RoomMeshPollResult | undefined {
    this.expireInactive();
    const member = this.authorize(auth);
    if (!member) return undefined;
    member.lastSeenAt = this.now();
    const cursor = Number.isSafeInteger(afterSequence) && afterSequence >= 0 ? afterSequence : 0;
    return {
      membership: this.snapshot(),
      events: member.events.filter((event) => event.sequence > cursor).slice(0, maxPollEvents).map(cloneEvent),
    };
  }

  leave(auth: RoomMeshClientAuth): boolean {
    this.expireInactive();
    const member = this.authorize(auth);
    if (!member || auth.participantId === this.hostParticipantId) return false;
    this.members.delete(auth.participantId);
    this.publishMembership();
    return true;
  }

  deliverFromMember(auth: RoomMeshClientAuth, signal: RoomMeshSignal): MeshSignalDelivery {
    this.expireInactive();
    const member = this.authorize(auth);
    if (!member) return { accepted: false, reason: 'not-member' };
    member.lastSeenAt = this.now();
    if (signal.fromParticipantId !== auth.participantId) return { accepted: false, reason: 'not-member' };
    return this.deliver(signal);
  }

  deliverFromHost(signal: RoomMeshSignal): MeshSignalDelivery {
    this.expireInactive();
    if (signal.fromParticipantId !== this.hostParticipantId) return { accepted: false, reason: 'not-host' };
    return this.deliver(signal);
  }

  private deliver(signal: RoomMeshSignal): MeshSignalDelivery {
    if (!this.members.has(signal.toParticipantId) || !this.members.has(signal.fromParticipantId)) return { accepted: false, reason: 'unknown-target' };
    if (signal.membershipRevision !== this.revision) return { accepted: false, reason: 'stale-membership' };
    const key = `${signal.fromParticipantId}\u0000${signal.id}`;
    if (this.seenSignalIds.has(key)) return { accepted: true, duplicate: true };
    this.rememberSignal(key);
    const queued: RoomMeshQueuedSignal = {
      ...signal,
      description: {
        ...signal.description,
        candidates: signal.description.candidates.map((candidate) => ({ ...candidate })),
      },
      sequence: this.nextSequence(),
      createdAt: new Date(this.now()).toISOString(),
    };
    const event: RoomMeshEvent = { sequence: queued.sequence, type: 'signal', signal: queued };
    this.deliverTo(signal.toParticipantId, event);
    return { accepted: true, duplicate: false };
  }

  private authorize(auth: RoomMeshClientAuth): MeshMember | undefined {
    if (auth.roomId !== this.options.roomId) return undefined;
    const member = this.members.get(auth.participantId);
    return member && member.resumeToken === auth.resumeToken ? member : undefined;
  }

  /**
   * A guest keeps its admission and resume token for 30 seconds without a
   * heartbeat. Returning in that window does not publish a leave/join pair;
   * after it ends the member is removed in one authoritative revision.
   */
  expireInactive(atMs = this.now()): readonly string[] {
    const expired: string[] = [];
    for (const [participantId, member] of this.members) {
      if (participantId === this.hostParticipantId) continue;
      if (atMs - member.lastSeenAt < this.reconnectGraceMs) continue;
      this.members.delete(participantId);
      expired.push(participantId);
    }
    if (expired.length > 0) this.publishMembership();
    return expired.sort();
  }

  private publishMembership(): void {
    this.revision += 1;
    const event: RoomMeshEvent = {
      sequence: this.nextSequence(),
      type: 'membership',
      snapshot: this.snapshot(),
    };
    for (const participantId of this.members.keys()) this.deliverTo(participantId, event);
  }

  private deliverTo(participantId: string, event: RoomMeshEvent): void {
    if (participantId === this.hostParticipantId) {
      this.options.onHostEvent?.(cloneEvent(event));
      return;
    }
    const member = this.members.get(participantId);
    if (!member) return;
    member.events.push(cloneEvent(event));
    if (member.events.length > maxQueuedEvents) member.events.splice(0, member.events.length - maxQueuedEvents);
  }

  private nextSequence(): number {
    this.eventSequence += 1;
    return this.eventSequence;
  }

  private rememberSignal(key: string): void {
    this.seenSignalIds.add(key);
    if (this.seenSignalIds.size <= maxQueuedEvents * 2) return;
    const oldest = this.seenSignalIds.values().next().value;
    if (oldest) this.seenSignalIds.delete(oldest);
  }

  private newToken(): string {
    // Test generators sometimes return a fixed shorter buffer, while the
    // production generator is `randomBytes(32)`. Accumulate until the token
    // always has the same minimum entropy budget and wire length.
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < 32) {
      const chunk = this.random(32 - size);
      if (chunk.length === 0) throw new Error('O gerador de token da sala retornou vazio.');
      chunks.push(chunk);
      size += chunk.length;
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).subarray(0, 32).toString('base64url');
  }
}
