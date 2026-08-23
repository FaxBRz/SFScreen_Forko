import type { RoomCallState, RoomChatRequest, SessionControlMessage } from '../../shared/session/media-control';
import {
  type ChatItem,
  type MediaSlot,
  type ParticipantState,
  type RoomMembershipSnapshot,
  type RoomMeshClientAuth,
  type RoomMeshEvent,
  type RoomMeshJoinRequest,
  type RoomMeshSignal,
  type SFScreenApi,
} from '../../shared/session/types';
import { MeshSessionManager, type MeshPeerController } from './mesh-session-manager';
import { WebRtcSession } from './webrtc-session';

const pollIntervalMs = 750;
const reconnectAttemptDelayMs = 1_500;

const newOpaqueId = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return `mesh-${Date.now()}-${Math.random().toString(36).slice(2, 18)}`;
  }
};

const isInitiator = (localParticipantId: string, peerParticipantId: string): boolean => (
  localParticipantId.localeCompare(peerParticipantId) < 0
);

export interface RoomMeshPeerEvents {
  onChannelOpen?: (participant: Readonly<ParticipantState>) => void;
  onControlMessage?: (participant: Readonly<ParticipantState>, message: SessionControlMessage) => void;
  onConnectionState?: (participant: Readonly<ParticipantState>, state: RTCPeerConnectionState) => void;
  onRemoteStream?: (participant: Readonly<ParticipantState>, stream: MediaStream, trackKind: 'video' | 'audio') => void;
  onRemoteCameraStream?: (participant: Readonly<ParticipantState>, stream: MediaStream) => void;
  onRemoteVoiceStream?: (participant: Readonly<ParticipantState>, stream: MediaStream) => void;
  onRemoteSystemAudioStream?: (participant: Readonly<ParticipantState>, stream: MediaStream) => void;
}

export interface RoomMeshClientEvents extends RoomMeshPeerEvents {
  onMembership?: (snapshot: RoomMembershipSnapshot, peerCount: number) => void;
  onError?: (error: Error) => void;
}

export interface RoomMeshClientOptions {
  api: Pick<
    SFScreenApi,
    'joinRoomMesh' | 'pollRoomMesh' | 'sendRoomMeshSignal' | 'leaveRoomMesh'
    | 'sendHostedRoomMeshSignal' | 'onRoomMeshEvent'
  >;
  localParticipant: ParticipantState;
  localUserAvatar?: string;
  selfIps: readonly string[];
  stunServerIp: string;
  isHost: boolean;
  /** Required by guests; the local owner sends privileged signals by IPC. */
  hostIp?: string;
  events?: RoomMeshClientEvents;
  pollIntervalMs?: number;
  reconnectAttemptDelayMs?: number;
}

/**
 * Concrete renderer-side implementation of the V6 room mesh. The room owner
 * remains the coordinator for membership/signaling only: every
 * `WebRtcSession` below is a direct participant-to-participant connection.
 *
 * This class owns neither captures nor browser tracks. `setLocalTrack` fans a
 * track owned by the local media manager to all current peer senders, and
 * detaching a peer never calls `MediaStreamTrack.stop()`.
 */
export class RoomMeshClient {
  private readonly manager: MeshSessionManager;
  private readonly pollEveryMs: number;
  private readonly reconnectDelayMs: number;
  private readonly pendingOffers = new Map<string, WebRtcSession>();
  private readonly retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private unsubscribeHostEvents?: () => void;
  private pollTimer?: ReturnType<typeof setInterval>;
  private polling = false;
  private disposed = false;
  private lastSequence = 0;
  private hostIp?: string;
  private auth?: RoomMeshClientAuth;
  private latestSnapshot?: RoomMembershipSnapshot;
  private localCallState: RoomCallState;

  constructor(private readonly options: RoomMeshClientOptions) {
    if (!options.localParticipant.id.trim()) throw new Error('A malha da sala precisa de um participante local.');
    if (options.selfIps.length === 0 || !options.stunServerIp) throw new Error('A malha da sala precisa de um endereço Tailscale local.');
    if (!options.isHost && !options.hostIp) throw new Error('O convidado precisa do endereço Tailscale do anfitrião.');
    this.hostIp = options.hostIp;
    this.pollEveryMs = options.pollIntervalMs ?? pollIntervalMs;
    this.reconnectDelayMs = options.reconnectAttemptDelayMs ?? reconnectAttemptDelayMs;
    this.localCallState = options.localParticipant.callState === 'in-call' ? 'joined' : 'left';
    this.manager = new MeshSessionManager({
      localParticipantId: options.localParticipant.id,
      events: {
        onRemoteControlRevoked: () => {
          // The caller observes the updated membership/peer count and removes
          // a control grant. No remote-control action is performed here.
        },
      },
    });
  }

  get membership(): RoomMembershipSnapshot | undefined {
    return this.latestSnapshot ? cloneSnapshot(this.latestSnapshot) : undefined;
  }

  get peerCount(): number {
    return this.manager.peerCount;
  }

  get membershipRevision(): number {
    return this.manager.membershipRevision;
  }

  get peers(): readonly ParticipantState[] {
    return this.manager.getParticipants();
  }

  /** Starts a local owner's coordinator subscription after host IPC succeeds. */
  startHosted(snapshot: RoomMembershipSnapshot): void {
    this.assertActive();
    if (!this.options.isHost) throw new Error('Somente o anfitrião pode iniciar a malha hospedada.');
    this.unsubscribeHostEvents?.();
    this.unsubscribeHostEvents = this.options.api.onRoomMeshEvent((event) => {
      void this.consumeEvent(event);
    });
    this.applyMembership(snapshot);
  }

  /** Admits a guest, persists only its memory token, then begins ordered polls. */
  async join(request: Omit<RoomMeshJoinRequest, 'participant'>): Promise<RoomMembershipSnapshot> {
    this.assertActive();
    if (this.options.isHost) throw new Error('O anfitrião já pertence à sala.');
    const hostIp = this.hostIp;
    if (!hostIp) throw new Error('O endereço do anfitrião não está disponível.');
    const result = await this.options.api.joinRoomMesh(hostIp, {
      ...request,
      participant: this.options.localParticipant,
    });
    if (!result.ok) throw new Error(result.error.message);
    this.auth = {
      roomId: result.value.membership.roomId,
      participantId: this.options.localParticipant.id,
      resumeToken: result.value.resumeToken,
    };
    this.applyMembership(result.value.membership);
    this.startPolling();
    return cloneSnapshot(result.value.membership);
  }

  /** Reuses the opaque memory-only token after a transient network outage. */
  async resume(): Promise<RoomMembershipSnapshot> {
    this.assertActive();
    if (this.options.isHost) {
      const membership = this.membership;
      if (!membership) throw new Error('A malha hospedada ainda não está pronta.');
      return membership;
    }
    if (!this.auth || !this.hostIp) throw new Error('Não há uma retomada de sala disponível neste aplicativo.');
    const result = await this.options.api.joinRoomMesh(this.hostIp, {
      roomId: this.auth.roomId,
      participant: this.options.localParticipant,
      resumeToken: this.auth.resumeToken,
    });
    if (!result.ok) throw new Error(result.error.message);
    this.auth = { ...this.auth, resumeToken: result.value.resumeToken };
    this.applyMembership(result.value.membership);
    this.startPolling();
    return cloneSnapshot(result.value.membership);
  }

  async setLocalTrack(slot: MediaSlot, track: MediaStreamTrack): Promise<void> {
    this.assertActive();
    await this.manager.setLocalTrack(slot, track);
  }

  async removeLocalTrack(slot: MediaSlot): Promise<void> {
    this.assertActive();
    await this.manager.removeLocalTrack(slot);
  }

  sendRoomCallState(state: RoomCallState): void {
    this.localCallState = state;
    this.broadcast((controller) => controller.sendRoomCallState?.(state));
  }

  sendCameraState(state: 'starting' | 'active' | 'stopped' | 'failed'): void {
    this.broadcast((controller) => controller.sendCameraState?.(state));
  }

  sendUserProfile(userName: string, userAvatar?: string): void {
    this.broadcast((controller) => controller.sendUserProfile?.(userName, userAvatar, this.options.localParticipant.id));
  }

  sendRoomChatRequest(request: RoomChatRequest): void {
    this.broadcast((controller) => controller.sendRoomChatRequest?.(request));
  }

  sendRoomChatItem(item: ChatItem): void {
    this.broadcast((controller) => controller.sendRoomChatItem?.(item));
  }

  sendRoomLeave(): void {
    this.broadcast((controller) => controller.sendRoomLeave?.());
  }

  /** Explicit room exit. It is intentionally separate from leaving a call. */
  async leave(): Promise<void> {
    if (this.disposed) return;
    if (!this.options.isHost && this.auth && this.hostIp) {
      const result = await this.options.api.leaveRoomMesh(this.hostIp, this.auth);
      if (!result.ok) throw new Error(result.error.message);
    }
    this.dispose();
  }

  /** Closes peer sessions and timers, retaining no tokens or membership. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeHostEvents?.();
    this.unsubscribeHostEvents = undefined;
    if (this.pollTimer !== undefined) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
    for (const timer of this.retryTimers.values()) clearTimeout(timer);
    this.retryTimers.clear();
    this.pendingOffers.clear();
    this.manager.close();
    this.auth = undefined;
    this.latestSnapshot = undefined;
  }

  private startPolling(): void {
    if (this.pollTimer !== undefined || this.options.isHost || this.disposed) return;
    this.pollTimer = setInterval(() => { void this.poll(); }, this.pollEveryMs);
    void this.poll();
  }

  private async poll(): Promise<void> {
    if (this.disposed || this.options.isHost || this.polling || !this.auth || !this.hostIp) return;
    this.polling = true;
    try {
      const result = await this.options.api.pollRoomMesh(this.hostIp, this.auth, this.lastSequence);
      if (!result.ok) throw new Error(result.error.message);
      this.applyMembership(result.value.membership);
      for (const event of result.value.events) await this.consumeEvent(event);
    } catch (error) {
      this.report(error);
    } finally {
      this.polling = false;
    }
  }

  private async consumeEvent(event: RoomMeshEvent): Promise<void> {
    if (this.disposed || event.sequence <= this.lastSequence) return;
    this.lastSequence = event.sequence;
    if (event.type === 'membership') {
      this.applyMembership(event.snapshot);
      return;
    }
    await this.consumeSignal(event.signal);
  }

  private applyMembership(snapshot: RoomMembershipSnapshot): void {
    const applied = this.manager.applyMembership(snapshot);
    if (!applied.applied && applied.reason !== 'stale-revision') {
      this.report(new Error(`A lista de participantes da sala foi recusada: ${applied.reason ?? 'desconhecido'}.`));
      return;
    }
    if (!applied.applied) return;
    this.latestSnapshot = cloneSnapshot(snapshot);
    this.prunePendingOffers();
    this.options.events?.onMembership?.(cloneSnapshot(snapshot), this.manager.peerCount);
    void this.ensureDeterministicOffers();
  }

  private async ensureDeterministicOffers(): Promise<void> {
    if (this.disposed || this.manager.membershipRevision < 1) return;
    const localId = this.options.localParticipant.id;
    for (const peerId of this.manager.getDesiredPeerIds()) {
      if (!isInitiator(localId, peerId)) continue;
      if (this.pendingOffers.has(peerId) || this.manager.getPeerIds().includes(peerId)) continue;
      const peer = this.manager.getParticipant(peerId);
      if (!peer) continue;
      await this.createAndSendOffer(peer);
    }
  }

  private async createAndSendOffer(peer: ParticipantState): Promise<void> {
    const controller = this.createController(peer);
    this.pendingOffers.set(peer.id, controller);
    try {
      const offer = await controller.createOffer(
        this.options.selfIps,
        this.options.stunServerIp,
        newOpaqueId(),
        newOpaqueId(),
      );
      const attached = await this.manager.attachPeerController(peer.id, controller);
      if (!attached.accepted) return;
      await this.sendSignal(peer.id, 'offer', offer);
    } catch (error) {
      this.manager.detachPeerController(peer.id);
      this.report(error);
    } finally {
      // Keep the controller indexed by MeshSessionManager. This ledger merely
      // determines whether a received answer belongs to an outstanding offer.
      if (!this.manager.getPeerIds().includes(peer.id)) this.pendingOffers.delete(peer.id);
    }
  }

  private async consumeSignal(signal: RoomMeshSignal): Promise<void> {
    if (signal.toParticipantId !== this.options.localParticipant.id) return;
    if (signal.roomId !== this.manager.activeRoomId || signal.membershipRevision > this.manager.membershipRevision) {
      // The coordinator validates a signal at its stated revision before it
      // queues it. A later membership event may reach this client first, so a
      // still-present peer may safely finish an older direct negotiation. A
      // future revision, however, has not been authenticated locally yet.
      return;
    }
    const peer = this.manager.getParticipant(signal.fromParticipantId);
    if (!peer || peer.presence === 'left') return;
    const localId = this.options.localParticipant.id;

    if (signal.kind === 'offer') {
      if (!isInitiator(signal.fromParticipantId, localId)) return;
      if (this.manager.getPeerIds().includes(peer.id)) {
        if (this.manager.getParticipant(peer.id)?.presence !== 'reconnecting') return;
        this.manager.detachPeerController(peer.id);
      }
      const controller = this.createController(peer);
      try {
        const { answer } = await controller.createAnswer(signal.description, this.options.selfIps, this.options.stunServerIp);
        const attached = await this.manager.attachPeerController(peer.id, controller);
        if (!attached.accepted) return;
        await this.sendSignal(peer.id, 'answer', answer);
      } catch (error) {
        this.manager.detachPeerController(peer.id);
        this.report(error);
      }
      return;
    }

    if (!isInitiator(localId, signal.fromParticipantId)) return;
    const pending = this.pendingOffers.get(peer.id);
    if (!pending) return;
    this.pendingOffers.delete(peer.id);
    try {
      await pending.applyAnswer(signal.description);
    } catch (error) {
      this.manager.detachPeerController(peer.id);
      this.report(error);
    }
  }

  private async sendSignal(toParticipantId: string, kind: 'offer' | 'answer', description: RoomMeshSignal['description']): Promise<void> {
    const roomId = this.manager.activeRoomId;
    if (!roomId || this.manager.membershipRevision < 1) throw new Error('A malha ainda não possui uma lista de participantes válida.');
    const signal: RoomMeshSignal = {
      id: newOpaqueId(),
      roomId,
      membershipRevision: this.manager.membershipRevision,
      fromParticipantId: this.options.localParticipant.id,
      toParticipantId,
      kind,
      description,
    };
    const result = this.options.isHost
      ? await this.options.api.sendHostedRoomMeshSignal(signal)
      : this.auth && this.hostIp
        ? await this.options.api.sendRoomMeshSignal(this.hostIp, this.auth, signal)
        : undefined;
    if (!result) throw new Error('A autenticação temporária da malha não está disponível.');
    if (!result.ok) throw new Error(result.error.message);
  }

  private createController(participant: ParticipantState): WebRtcSession {
    const snapshotParticipant = { ...participant };
    const controller = new WebRtcSession({
      onChannelOpen: () => {
        controller.sendUserProfile(this.options.localParticipant.displayName, this.options.localUserAvatar, this.options.localParticipant.id);
        controller.sendRoomCallState(this.localCallState);
        this.options.events?.onChannelOpen?.(snapshotParticipant);
      },
      onControlMessage: (message) => this.options.events?.onControlMessage?.(snapshotParticipant, message),
      onConnectionState: (state) => {
        if (state === 'connected') {
          this.manager.markPeerReconnected(snapshotParticipant.id);
        } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          this.manager.markPeerDisconnected(snapshotParticipant.id);
          this.scheduleReconnect(snapshotParticipant.id);
        }
        this.options.events?.onConnectionState?.(snapshotParticipant, state);
      },
      onRemoteStream: (stream, trackKind) => this.options.events?.onRemoteStream?.(snapshotParticipant, stream, trackKind),
      onRemoteCameraStream: (stream) => this.options.events?.onRemoteCameraStream?.(snapshotParticipant, stream),
      onRemoteVoiceStream: (stream) => this.options.events?.onRemoteVoiceStream?.(snapshotParticipant, stream),
      onRemoteSystemAudioStream: (stream) => this.options.events?.onRemoteSystemAudioStream?.(snapshotParticipant, stream),
    });
    return controller;
  }

  private broadcast(callback: (controller: MeshPeerController) => void): void {
    for (const controller of this.manager.getPeerControllers()) callback(controller);
  }

  private scheduleReconnect(participantId: string): void {
    if (this.disposed || !isInitiator(this.options.localParticipant.id, participantId) || this.retryTimers.has(participantId)) return;
    const timer = setTimeout(() => {
      this.retryTimers.delete(participantId);
      if (this.disposed || !this.manager.getDesiredPeerIds().includes(participantId)) return;
      this.manager.detachPeerController(participantId);
      void this.ensureDeterministicOffers();
    }, this.reconnectDelayMs);
    this.retryTimers.set(participantId, timer);
  }

  private prunePendingOffers(): void {
    const desired = new Set(this.manager.getDesiredPeerIds());
    for (const [participantId] of this.pendingOffers) {
      if (desired.has(participantId)) continue;
      this.pendingOffers.delete(participantId);
    }
  }

  private report(error: unknown): void {
    const normalized = error instanceof Error ? error : new Error('A negociação da malha falhou.');
    this.options.events?.onError?.(normalized);
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('A malha da sala já foi encerrada.');
  }
}

const cloneSnapshot = (snapshot: RoomMembershipSnapshot): RoomMembershipSnapshot => ({
  roomId: snapshot.roomId,
  revision: snapshot.revision,
  participants: snapshot.participants.map((participant) => ({ ...participant })),
});

/** The public track contract makes it easy to unit-test and mock fanout. */
export type RoomMeshPeerController = MeshPeerController;
