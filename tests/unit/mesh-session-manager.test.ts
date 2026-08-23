import { describe, expect, it, vi } from 'vitest';
import {
  MeshSessionManager,
  meshMaxPeerConnections,
  meshReconnectGraceMs,
  type MeshPeerController,
} from '../../src/renderer/session/mesh-session-manager';
import type { ParticipantState, RoomMembershipSnapshot } from '../../src/shared/session/types';

const participant = (
  id: string,
  callState: ParticipantState['callState'] = 'in-call',
  presence: ParticipantState['presence'] = 'connected',
): ParticipantState => ({
  id,
  displayName: id,
  joinedAt: '2026-08-23T12:00:00.000Z',
  callState,
  presence,
});

const membership = (revision: number, participants: ParticipantState[]): RoomMembershipSnapshot => ({
  roomId: 'room-v6',
  revision,
  participants,
});

type FakeController = MeshPeerController & {
  readonly calls: Array<{ method: string; track?: MediaStreamTrack }>;
  readonly closeSpy: ReturnType<typeof vi.fn>;
};

const controller = (): FakeController => {
  const calls: Array<{ method: string; track?: MediaStreamTrack }> = [];
  const update = (method: string) => vi.fn(async (track: MediaStreamTrack) => {
    calls.push({ method, track });
  });
  const remove = (method: string) => vi.fn(async () => {
    calls.push({ method });
  });
  const closeSpy = vi.fn();
  return {
    calls,
    closeSpy,
    replaceVideoTrack: update('replaceVideoTrack'),
    removeVideoTrack: remove('removeVideoTrack'),
    replaceCameraTrack: update('replaceCameraTrack'),
    removeCameraTrack: remove('removeCameraTrack'),
    replaceVoiceTrack: update('replaceVoiceTrack'),
    removeVoiceTrack: remove('removeVoiceTrack'),
    replaceSystemAudioTrack: update('replaceSystemAudioTrack'),
    removeSystemAudioTrack: remove('removeSystemAudioTrack'),
    close: closeSpy,
  };
};

const track = (id: string): MediaStreamTrack & { stop: ReturnType<typeof vi.fn> } => ({
  id,
  kind: 'audio',
  stop: vi.fn(),
} as unknown as MediaStreamTrack & { stop: ReturnType<typeof vi.fn> });

describe('MeshSessionManager', () => {
  it('accepts only monotonic v6 membership and creates at most three peers in deterministic order', async () => {
    const manager = new MeshSessionManager({ localParticipantId: 'local' });
    const first = manager.applyMembership(membership(8, [
      participant('local'),
      participant('charlie'),
      participant('alpha'),
      participant('bravo'),
    ]));

    expect(first).toMatchObject({ applied: true, revision: 8 });
    expect(manager.getDesiredPeerIds()).toEqual(['alpha', 'bravo', 'charlie']);
    expect(meshMaxPeerConnections).toBe(3);

    const factory = vi.fn(async (factoryParticipant: Readonly<ParticipantState>) => {
      void factoryParticipant;
      return controller();
    });
    const ensured = await manager.ensurePeerControllers(factory);
    expect(factory.mock.calls.map(([value]) => value.id)).toEqual(['alpha', 'bravo', 'charlie']);
    expect(ensured.peerIds).toEqual(['alpha', 'bravo', 'charlie']);
    expect(manager.peerCount).toBe(3);

    const stale = manager.applyMembership(membership(8, [participant('local'), participant('only-peer')]));
    expect(stale).toMatchObject({ applied: false, reason: 'stale-revision', revision: 8 });
    expect(manager.getDesiredPeerIds()).toEqual(['alpha', 'bravo', 'charlie']);

    const overflow = manager.applyMembership(membership(9, [
      participant('local'),
      participant('alpha'),
      participant('bravo'),
      participant('charlie'),
      participant('delta'),
    ]));
    expect(overflow).toMatchObject({ applied: false, reason: 'capacity-exceeded', revision: 8 });
    expect(manager.getPeerIds()).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('rejects controllers outside the current participant-indexed mesh and closes them', async () => {
    const manager = new MeshSessionManager({ localParticipantId: 'local' });
    manager.applyMembership(membership(1, [participant('local'), participant('peer')]));

    const localController = controller();
    const local = await manager.attachPeerController('local', localController);
    expect(local).toMatchObject({ accepted: false, reason: 'local-participant' });
    expect(localController.closeSpy).toHaveBeenCalledOnce();

    const unknownController = controller();
    const unknown = await manager.attachPeerController('unknown', unknownController);
    expect(unknown).toMatchObject({ accepted: false, reason: 'unknown-participant' });
    expect(unknownController.closeSpy).toHaveBeenCalledOnce();

    manager.applyMembership(membership(2, [participant('local'), participant('peer', 'in-call', 'left')]));
    const leftController = controller();
    const left = await manager.attachPeerController('peer', leftController);
    expect(left).toMatchObject({ accepted: false, reason: 'participant-left' });
    expect(leftController.closeSpy).toHaveBeenCalledOnce();
  });

  it('fans one local capture out to peers without stopping it when a peer leaves', async () => {
    const manager = new MeshSessionManager({ localParticipantId: 'local' });
    manager.applyMembership(membership(1, [participant('local'), participant('alpha'), participant('bravo'), participant('charlie')]));
    const voiceTrack = track('voice');
    const alpha = controller();
    const bravo = controller();
    const charlie = controller();

    await manager.setLocalTrack('voice-audio', voiceTrack);
    await manager.attachPeerController('alpha', alpha);
    await manager.attachPeerController('bravo', bravo);

    expect(alpha.replaceVoiceTrack).toHaveBeenCalledWith(voiceTrack);
    expect(bravo.replaceVoiceTrack).toHaveBeenCalledWith(voiceTrack);

    expect(manager.detachPeerController('alpha')).toBe(true);
    expect(alpha.closeSpy).toHaveBeenCalledOnce();
    expect(voiceTrack.stop).not.toHaveBeenCalled();
    expect(manager.getLocalTrack('voice-audio')).toBe(voiceTrack);

    await manager.attachPeerController('charlie', charlie);
    expect(charlie.replaceVoiceTrack).toHaveBeenCalledWith(voiceTrack);
    expect(voiceTrack.stop).not.toHaveBeenCalled();

    await manager.removeLocalTrack('voice-audio');
    expect(bravo.removeVoiceTrack).toHaveBeenCalledOnce();
    expect(charlie.removeVoiceTrack).toHaveBeenCalledOnce();
    expect(voiceTrack.stop).not.toHaveBeenCalled();
  });

  it('keeps a peer controller through the 30-second reconnect window and expires it afterward', async () => {
    const onRemoteControlRevoked = vi.fn();
    const manager = new MeshSessionManager({ localParticipantId: 'local', events: { onRemoteControlRevoked } });
    manager.applyMembership(membership(1, [participant('local'), participant('peer')]));
    const peerController = controller();
    await manager.attachPeerController('peer', peerController);
    expect(manager.grantRemoteControl()).toBe(true);

    const disconnectedAt = 5_000;
    expect(manager.markPeerDisconnected('peer', disconnectedAt)).toBe(new Date(disconnectedAt + meshReconnectGraceMs).toISOString());
    expect(peerController.closeSpy).not.toHaveBeenCalled();
    expect(manager.expireReconnects(disconnectedAt + meshReconnectGraceMs - 1)).toEqual([]);
    expect(manager.markPeerReconnected('peer')).toBe(true);
    expect(peerController.closeSpy).not.toHaveBeenCalled();

    const secondDisconnectAt = 10_000;
    manager.markPeerDisconnected('peer', secondDisconnectAt);
    expect(manager.expireReconnects(secondDisconnectAt + meshReconnectGraceMs)).toEqual(['peer']);
    expect(peerController.closeSpy).toHaveBeenCalledOnce();
    expect(manager.isRemoteControlGranted()).toBe(false);
    expect(onRemoteControlRevoked).toHaveBeenCalledOnce();
  });

  it('revokes remote control immediately for a third member and requires a fresh grant after they leave', () => {
    const onRemoteControlRevoked = vi.fn();
    const manager = new MeshSessionManager({ localParticipantId: 'local', events: { onRemoteControlRevoked } });
    manager.applyMembership(membership(1, [participant('local'), participant('peer')]));
    expect(manager.canUseRemoteControl()).toBe(true);
    expect(manager.grantRemoteControl()).toBe(true);

    manager.applyMembership(membership(2, [participant('local'), participant('peer'), participant('third', 'outside-call')]));
    expect(manager.canUseRemoteControl()).toBe(false);
    expect(manager.isRemoteControlGranted()).toBe(false);
    expect(onRemoteControlRevoked).toHaveBeenCalledOnce();

    manager.applyMembership(membership(3, [participant('local'), participant('peer')]));
    expect(manager.canUseRemoteControl()).toBe(true);
    expect(manager.isRemoteControlGranted()).toBe(false);
  });
});
