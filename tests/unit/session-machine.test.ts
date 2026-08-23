import { describe, expect, it } from 'vitest';
import { initialSessionState, normalizeUserName, sessionReducer } from '../../src/renderer/session/session-machine';

const ready = { state: 'ready' as const, selfIp: '100.90.1.2', peers: [] };

describe('session machine', () => {
  it('uses Usuario instead of legacy Você profile names', () => {
    expect(normalizeUserName()).toBe('Usuario');
    expect(normalizeUserName('Você')).toBe('Usuario');
    expect(normalizeUserName('Você (Você)')).toBe('Usuario');
    expect(normalizeUserName('Rafael')).toBe('Rafael');
  });

  it('moves a hosted session through verification to connected', () => {
    const idle = sessionReducer(initialSessionState, { type: 'status', status: ready });
    const hosting = sessionReducer(idle, { type: 'begin', role: 'host', phase: 'hosting', message: 'Preparando' });
    const hosted = sessionReducer(hosting, { type: 'hosted', hosted: { code: 'K7P-4MX-Q', expiresAt: '2026-08-21T12:00:00.000Z' } });
    const verifying = sessionReducer(hosted, { type: 'verifying', message: 'Compare', securityCode: '123456' });
    const locallyConfirmed = sessionReducer(verifying, { type: 'local-confirmed' });
    const remotelyConfirmed = sessionReducer(locallyConfirmed, { type: 'remote-confirmed' });
    const connected = sessionReducer(remotelyConfirmed, { type: 'connected', route: 'relay' });
    expect(connected).toMatchObject({ phase: 'connected', securityCode: '123456', localConfirmed: true, remoteConfirmed: true, route: 'relay' });
  });

  it('clears transient data when a session is closed', () => {
    const active = { ...initialSessionState, phase: 'verifying' as const, hosted: { code: 'K7P-4MX-Q', expiresAt: '2026-08-21T12:00:00.000Z' }, securityCode: '123456' };
    const closed = sessionReducer(active, { type: 'closed' });
    expect(closed.phase).toBe('idle');
    expect(closed.hosted).toBeUndefined();
    expect(closed.securityCode).toBeUndefined();
  });


  it('keeps media state independent from the verified connection', () => {
    const source = { id: 'screen:1', name: 'Monitor 1', thumbnailDataUrl: 'data:image/png;base64,' };
    const selected = sessionReducer(initialSessionState, { type: 'source-selected', source, includeSystemAudio: false });
    const connected = sessionReducer(selected, { type: 'connected' });
    const sharing = sessionReducer(connected, { type: 'media', phase: 'sharing' });
    const stopped = sessionReducer(sharing, { type: 'media', phase: 'stopped' });
    expect(stopped.phase).toBe('connected');
    expect(stopped.mediaPhase).toBe('stopped');
  });

  it('tracks optional system audio independently of video', () => {
    const selected = sessionReducer(initialSessionState, { type: 'source-selected', source: { id: 'screen:1', name: 'Monitor 1', thumbnailDataUrl: 'data:image/png;base64,' }, includeSystemAudio: true });
    const active = sessionReducer(selected, { type: 'audio', phase: 'active' });
    const stopped = sessionReducer(active, { type: 'audio', phase: 'stopped' });
    expect(stopped).toMatchObject({ includeSystemAudio: true, audioPhase: 'stopped', mediaPhase: 'selected' });
  });

  it('updates local and remote user profiles and handles chat messages', () => {
    const withLocal = sessionReducer(initialSessionState, { type: 'set-local-user-name', userName: 'Lucas' });
    expect(withLocal.localUserName).toBe('Lucas');

    const withRemote = sessionReducer(withLocal, { type: 'set-remote-user-name', userName: 'Rafael' });
    expect(withRemote.remoteUserName).toBe('Rafael');

    const chatMsg = { id: 'msg-1', senderName: 'Lucas', text: 'E aí!', timestamp: 123456 };
    const withChat = sessionReducer(withRemote, { type: 'add-chat-message', message: chatMsg });
    expect(withChat.chatMessages).toHaveLength(1);
    expect(withChat.chatMessages[0]).toEqual(chatMsg);

    const toggledChat = sessionReducer(withChat, { type: 'toggle-chat-panel', open: true });
    expect(toggledChat.chatPanelOpen).toBe(true);

    const toggledModal = sessionReducer(toggledChat, { type: 'toggle-session-modal', open: true });
    expect(toggledModal.sessionModalOpen).toBe(true);

    const withAvatar = sessionReducer(withLocal, { type: 'set-local-user-avatar', avatar: 'data:image/png;base64,localPic' });
    expect(withAvatar.localUserAvatar).toBe('data:image/png;base64,localPic');

    const withRemoteProfile = sessionReducer(withAvatar, { type: 'set-remote-user-profile', userName: 'Rafael', userAvatar: 'data:image/png;base64,remotePic' });
    expect(withRemoteProfile.remoteUserName).toBe('Rafael');
    expect(withRemoteProfile.remoteUserAvatar).toBe('data:image/png;base64,remotePic');

    const deletedChat = sessionReducer(withChat, { type: 'delete-chat-message', id: 'msg-1' });
    expect(deletedChat.chatMessages).toHaveLength(0);
  });
});



