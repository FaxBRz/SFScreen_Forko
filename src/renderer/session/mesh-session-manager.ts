import {
  roomMaxCapacity,
  sessionProtocolVersion,
  type MediaSlot,
  type ParticipantState,
  type RoomMembershipSnapshot,
  type ScreenSubscriptionTier,
} from '../../shared/session/types';

/**
 * The room coordinator owns signaling and membership, but media never travels
 * through it. This manager is the renderer-side ownership boundary for the
 * resulting direct peer sessions. It deliberately has no transport knowledge:
 * callers create WebRTC controllers and feed authoritative membership updates
 * into it.
 */
export const meshProtocolVersion = sessionProtocolVersion;
export const meshMaxParticipants = roomMaxCapacity;
export const meshMaxPeerConnections = meshMaxParticipants - 1;
export const meshReconnectGraceMs = 30_000;

const orderedMediaSlots: readonly MediaSlot[] = [
  'screen-video',
  'camera-video',
  'voice-audio',
  'screen-audio',
];

/**
 * The part of WebRtcSession used by the mesh. Keeping this interface small
 * lets the signaling layer construct one controller per participant without
 * making LocalMediaManager own any RTCPeerConnection instances.
 */
export interface MeshPeerController {
  replaceVideoTrack(track: MediaStreamTrack): Promise<void>;
  removeVideoTrack(): Promise<void>;
  replaceCameraTrack(track: MediaStreamTrack): Promise<void>;
  removeCameraTrack(): Promise<void>;
  replaceVoiceTrack(track: MediaStreamTrack): Promise<void>;
  removeVoiceTrack(): Promise<void>;
  replaceSystemAudioTrack(track: MediaStreamTrack): Promise<void>;
  removeSystemAudioTrack(): Promise<void>;
  close(): void;
}

export interface MeshSessionManagerEvents {
  /** Fired only when an already granted control session becomes ineligible. */
  onRemoteControlRevoked?: () => void;
}

export interface MeshSessionManagerOptions {
  localParticipantId: string;
  /** Once set, snapshots for a different room are rejected. */
  roomId?: string;
  reconnectGraceMs?: number;
  now?: () => number;
  events?: MeshSessionManagerEvents;
}

export type MembershipApplyRejection =
  | 'stale-revision'
  | 'room-mismatch'
  | 'capacity-exceeded'
  | 'duplicate-participant'
  | 'local-participant-missing';

export interface MembershipApplyResult {
  applied: boolean;
  reason?: MembershipApplyRejection;
  revision: number;
  peerIds: readonly string[];
}

export type ControllerAttachRejection =
  | 'unknown-participant'
  | 'local-participant'
  | 'participant-left'
  | 'connection-limit';

export interface ControllerAttachResult {
  accepted: boolean;
  reason?: ControllerAttachRejection;
  peerIds: readonly string[];
}

export interface ControllerEnsureResult {
  created: readonly string[];
  failed: readonly string[];
  peerIds: readonly string[];
}

export interface MediaFanoutResult {
  updatedPeerIds: readonly string[];
  failedPeerIds: readonly string[];
}

export type MeshPeerControllerFactory = (
  participant: Readonly<ParticipantState>,
) => MeshPeerController | Promise<MeshPeerController>;

const cloneParticipant = (participant: ParticipantState): ParticipantState => ({ ...participant });

const slotMethods: Record<MediaSlot, readonly [keyof MeshPeerController, keyof MeshPeerController]> = {
  'screen-video': ['replaceVideoTrack', 'removeVideoTrack'],
  'camera-video': ['replaceCameraTrack', 'removeCameraTrack'],
  'voice-audio': ['replaceVoiceTrack', 'removeVoiceTrack'],
  'screen-audio': ['replaceSystemAudioTrack', 'removeSystemAudioTrack'],
};

/**
 * A bounded, participant-indexed collection of direct peer sessions.
 *
 * It does not stop MediaStreamTracks. Captures belong to LocalMediaManager;
 * retaining a source here means a later peer can receive it after another
 * peer disconnects. `removeLocalTrack` only detaches that track from senders.
 */
export class MeshSessionManager {
  private readonly controllers = new Map<string, MeshPeerController>();
  private readonly localTracks = new Map<MediaSlot, MediaStreamTrack>();
  private readonly subscriptions = new Map<string, ScreenSubscriptionTier>();
  private readonly participants = new Map<string, ParticipantState>();
  private readonly now: () => number;
  private readonly reconnectGraceMs: number;
  private roomId?: string;
  private revision = -1;
  private remoteControlGranted = false;

  constructor(private readonly options: MeshSessionManagerOptions) {
    if (!options.localParticipantId.trim()) throw new Error('A malha precisa de um identificador local.');
    this.roomId = options.roomId;
    this.now = options.now ?? Date.now;
    this.reconnectGraceMs = options.reconnectGraceMs ?? meshReconnectGraceMs;
  }

  get membershipRevision(): number {
    return this.revision;
  }

  get activeRoomId(): string | undefined {
    return this.roomId;
  }

  get peerCount(): number {
    return this.controllers.size;
  }

  getParticipant(participantId: string): ParticipantState | undefined {
    const participant = this.participants.get(participantId);
    return participant ? cloneParticipant(participant) : undefined;
  }

  getParticipants(): readonly ParticipantState[] {
    return Array.from(this.participants.values(), cloneParticipant).sort((first, second) => first.id.localeCompare(second.id));
  }

  getPeerIds(): readonly string[] {
    return Array.from(this.controllers.keys()).sort();
  }

  getDesiredPeerIds(): readonly string[] {
    return this.desiredPeerIds();
  }

  getLocalTrack(slot: MediaSlot): MediaStreamTrack | undefined {
    return this.localTracks.get(slot);
  }

  getScreenSubscription(participantId: string): ScreenSubscriptionTier {
    return this.subscriptions.get(participantId) ?? 'grid';
  }

  /**
   * Accepts only increasing, authoritative revisions. An invalid snapshot is
   * rejected atomically, leaving both current connections and membership
   * untouched.
   */
  applyMembership(snapshot: RoomMembershipSnapshot, atMs = this.now()): MembershipApplyResult {
    if (this.roomId && snapshot.roomId !== this.roomId) return this.membershipResult(false, 'room-mismatch');
    if (snapshot.revision <= this.revision) return this.membershipResult(false, 'stale-revision');
    if (snapshot.participants.length > meshMaxParticipants) return this.membershipResult(false, 'capacity-exceeded');

    const nextParticipants = new Map<string, ParticipantState>();
    for (const candidate of snapshot.participants) {
      if (nextParticipants.has(candidate.id)) return this.membershipResult(false, 'duplicate-participant');
      nextParticipants.set(candidate.id, this.normalizeParticipant(candidate, atMs));
    }
    if (!nextParticipants.has(this.options.localParticipantId)) return this.membershipResult(false, 'local-participant-missing');

    this.roomId ??= snapshot.roomId;
    this.revision = snapshot.revision;
    this.participants.clear();
    nextParticipants.forEach((participant, id) => this.participants.set(id, participant));
    this.pruneControllersOutsideMembership();
    this.reconcileRemoteControl();
    this.expireReconnects(atMs);
    return this.membershipResult(true);
  }

  /**
   * Registers an already-negotiated direct peer session. Controllers are
   * indexed by participant ID and only admitted for deterministic desired
   * peers. A rejected controller is closed to avoid leaking a connection that
   * the room can never use.
   */
  async attachPeerController(participantId: string, controller: MeshPeerController): Promise<ControllerAttachResult> {
    const rejection = this.controllerRejection(participantId);
    if (rejection) {
      controller.close();
      return { accepted: false, reason: rejection, peerIds: this.getPeerIds() };
    }

    const previous = this.controllers.get(participantId);
    if (previous && previous !== controller) previous.close();
    this.controllers.set(participantId, controller);
    await this.fanOutToPeer(participantId, controller);
    return { accepted: true, peerIds: this.getPeerIds() };
  }

  /**
   * Creates missing peer controllers in sorted participant-ID order. The
   * factory can perform signaling asynchronously; a controller completed after
   * a newer membership update is safely rejected and closed.
   */
  async ensurePeerControllers(factory: MeshPeerControllerFactory): Promise<ControllerEnsureResult> {
    this.pruneControllersOutsideMembership();
    const created: string[] = [];
    const failed: string[] = [];

    for (const participantId of this.desiredPeerIds()) {
      if (this.controllers.has(participantId)) continue;
      const participant = this.participants.get(participantId);
      if (!participant) continue;
      try {
        const controller = await factory(cloneParticipant(participant));
        const attached = await this.attachPeerController(participantId, controller);
        if (attached.accepted) created.push(participantId);
        else failed.push(participantId);
      } catch {
        failed.push(participantId);
      }
    }

    return { created, failed, peerIds: this.getPeerIds() };
  }

  detachPeerController(participantId: string): boolean {
    const controller = this.controllers.get(participantId);
    if (!controller) return false;
    this.controllers.delete(participantId);
    controller.close();
    // Deliberately do not stop local tracks: other peers (and future peers)
    // still own the same capture source through LocalMediaManager.
    return true;
  }

  /** Shares one already-captured source with every current direct peer. */
  async setLocalTrack(slot: MediaSlot, track: MediaStreamTrack): Promise<MediaFanoutResult> {
    this.localTracks.set(slot, track);
    return this.fanOutSlot(slot, track);
  }

  /** Detaches a source from each sender without stopping the capture track. */
  async removeLocalTrack(slot: MediaSlot): Promise<MediaFanoutResult> {
    this.localTracks.delete(slot);
    return this.fanOutSlot(slot);
  }

  /**
   * Selects the delivery tier for one viewer. The caller translates this state
   * into sender parameters; keeping it here makes membership and focus changes
   * deterministic without coupling the manager to WebRTC implementation APIs.
   */
  setScreenSubscription(participantId: string, tier: ScreenSubscriptionTier): boolean {
    if (!this.desiredPeerIds().includes(participantId)) return false;
    this.subscriptions.set(participantId, tier);
    return true;
  }

  /** Marks a transient peer loss, retaining its direct controller for 30 s. */
  markPeerDisconnected(participantId: string, atMs = this.now()): string | undefined {
    const participant = this.participants.get(participantId);
    if (!participant || participant.id === this.options.localParticipantId || participant.presence === 'left') return undefined;
    if (participant.presence === 'reconnecting' && participant.reconnectDeadlineAt) return participant.reconnectDeadlineAt;

    const deadline = new Date(atMs + this.reconnectGraceMs).toISOString();
    this.participants.set(participantId, { ...participant, presence: 'reconnecting', reconnectDeadlineAt: deadline });
    this.reconcileRemoteControl();
    return deadline;
  }

  /** Restores a peer before its reconnect deadline without creating a new room event. */
  markPeerReconnected(participantId: string): boolean {
    const participant = this.participants.get(participantId);
    if (!participant || participant.presence !== 'reconnecting') return false;
    this.participants.set(participantId, { ...participant, presence: 'connected', reconnectDeadlineAt: undefined });
    this.reconcileRemoteControl();
    return true;
  }

  /** Removes expired reconnecting peers and closes only their peer controller. */
  expireReconnects(atMs = this.now()): readonly string[] {
    const expired: string[] = [];
    for (const [participantId, participant] of this.participants) {
      // The local app owns its own lifecycle. This manager only prunes remote
      // controllers, never its local participant based on a network timer.
      if (participantId === this.options.localParticipantId) continue;
      if (participant.presence !== 'reconnecting' || !participant.reconnectDeadlineAt) continue;
      const deadline = Date.parse(participant.reconnectDeadlineAt);
      if (!Number.isFinite(deadline) || deadline > atMs) continue;
      this.participants.delete(participantId);
      this.subscriptions.delete(participantId);
      this.detachPeerController(participantId);
      expired.push(participantId);
    }
    if (expired.length > 0) this.reconcileRemoteControl();
    return expired.sort();
  }

  /** Control is allowed only for two active room members who are in the call. */
  canUseRemoteControl(): boolean {
    const active = Array.from(this.participants.values()).filter((participant) => participant.presence !== 'left');
    return active.length === 2 && active.every((participant) => participant.callState === 'in-call');
  }

  grantRemoteControl(): boolean {
    if (!this.canUseRemoteControl()) return false;
    this.remoteControlGranted = true;
    return true;
  }

  isRemoteControlGranted(): boolean {
    return this.remoteControlGranted;
  }

  /** Closes peer sessions but intentionally never calls MediaStreamTrack.stop(). */
  close(): void {
    for (const controller of this.controllers.values()) controller.close();
    this.controllers.clear();
    this.subscriptions.clear();
    this.participants.clear();
    this.localTracks.clear();
    this.remoteControlGranted = false;
  }

  private membershipResult(applied: boolean, reason?: MembershipApplyRejection): MembershipApplyResult {
    return { applied, reason, revision: this.revision, peerIds: this.getPeerIds() };
  }

  private normalizeParticipant(participant: ParticipantState, atMs: number): ParticipantState {
    if (participant.presence !== 'reconnecting') return cloneParticipant(participant);
    const maxDeadline = atMs + this.reconnectGraceMs;
    const suppliedDeadline = participant.reconnectDeadlineAt ? Date.parse(participant.reconnectDeadlineAt) : Number.NaN;
    const deadline = Number.isFinite(suppliedDeadline) ? Math.min(suppliedDeadline, maxDeadline) : maxDeadline;
    return { ...participant, reconnectDeadlineAt: new Date(deadline).toISOString() };
  }

  private desiredPeerIds(): string[] {
    return Array.from(this.participants.values())
      .filter((participant) => participant.id !== this.options.localParticipantId && participant.presence !== 'left')
      .map((participant) => participant.id)
      .sort()
      .slice(0, meshMaxPeerConnections);
  }

  private controllerRejection(participantId: string): ControllerAttachRejection | undefined {
    if (participantId === this.options.localParticipantId) return 'local-participant';
    const participant = this.participants.get(participantId);
    if (!participant) return 'unknown-participant';
    if (participant.presence === 'left') return 'participant-left';
    if (!this.desiredPeerIds().includes(participantId)) return 'connection-limit';
    return undefined;
  }

  private pruneControllersOutsideMembership(): void {
    const desired = new Set(this.desiredPeerIds());
    for (const participantId of this.controllers.keys()) {
      if (!desired.has(participantId)) this.detachPeerController(participantId);
    }
    for (const participantId of this.subscriptions.keys()) {
      if (!desired.has(participantId)) this.subscriptions.delete(participantId);
    }
  }

  private async fanOutToPeer(participantId: string, controller: MeshPeerController): Promise<MediaFanoutResult> {
    const updatedPeerIds: string[] = [];
    const failedPeerIds: string[] = [];
    try {
      for (const slot of orderedMediaSlots) {
        const track = this.localTracks.get(slot);
        if (track) await this.callSlotMethod(controller, slot, track);
      }
      updatedPeerIds.push(participantId);
    } catch {
      failedPeerIds.push(participantId);
    }
    return { updatedPeerIds, failedPeerIds };
  }

  private async fanOutSlot(slot: MediaSlot, track?: MediaStreamTrack): Promise<MediaFanoutResult> {
    const peerIds = this.getPeerIds();
    const settled = await Promise.all(peerIds.map(async (participantId) => {
      const controller = this.controllers.get(participantId);
      if (!controller) return { participantId, ok: false };
      try {
        await this.callSlotMethod(controller, slot, track);
        return { participantId, ok: true };
      } catch {
        return { participantId, ok: false };
      }
    }));
    return {
      updatedPeerIds: settled.filter((result) => result.ok).map((result) => result.participantId),
      failedPeerIds: settled.filter((result) => !result.ok).map((result) => result.participantId),
    };
  }

  private async callSlotMethod(controller: MeshPeerController, slot: MediaSlot, track?: MediaStreamTrack): Promise<void> {
    const [replaceMethod, removeMethod] = slotMethods[slot];
    if (track) {
      const replace = controller[replaceMethod] as (value: MediaStreamTrack) => Promise<void>;
      await replace.call(controller, track);
      return;
    }
    const remove = controller[removeMethod] as () => Promise<void>;
    await remove.call(controller);
  }

  private reconcileRemoteControl(): void {
    if (!this.remoteControlGranted || this.canUseRemoteControl()) return;
    this.remoteControlGranted = false;
    this.options.events?.onRemoteControlRevoked?.();
  }
}
