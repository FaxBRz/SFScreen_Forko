// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/app';
import { initialSessionState, type SessionUiState } from '../../src/renderer/session/session-machine';
import { useSession, type SessionModel } from '../../src/renderer/session/use-session';

vi.mock('../../src/renderer/session/use-session', () => ({ useSession: vi.fn() }));

const readyState = (overrides: Partial<SessionUiState> = {}): SessionUiState => ({
  ...initialSessionState,
  phase: 'idle',
  tailscale: { state: 'ready', selfIp: '100.90.1.2', peers: [] },
  message: 'Tailscale pronto. Sala ativa.',
  ...overrides,
});

const model = (state = readyState({ selectedSource: { id: 'screen:1', name: 'Monitor 1', thumbnailDataUrl: 'data:image/png;base64,' }, mediaPhase: 'selected' })): SessionModel => ({
  state,
  joinCode: '',
  sources: [],
  sourcePickerOpen: false,
  resolution: '1080p',
  fps: 60,
  localStream: undefined,
  remoteStream: undefined,
  localCameraStream: undefined,
  remoteCameraStream: undefined,
  cameraActive: false,
  voiceActive: false,
  voiceMuted: false,
  roomCallActive: false,
  remoteRoomCallActive: false,
  setJoinCode: vi.fn(),
  setResolution: vi.fn(),
  setFps: vi.fn(),
  toggleSystemAudio: vi.fn(async () => undefined),
  toggleCamera: vi.fn(async () => undefined),
  toggleVoice: vi.fn(async () => undefined),
  toggleVoiceMute: vi.fn(),
  joinRoomCall: vi.fn(async () => undefined),
  leaveRoomCall: vi.fn(async () => undefined),
  refresh: vi.fn(async () => state.tailscale),
  openSourcePicker: vi.fn(async () => undefined),
  closeSourcePicker: vi.fn(),
  selectSource: vi.fn(async () => undefined),
  host: vi.fn(async () => undefined),
  join: vi.fn(async () => undefined),
  hostRoom: vi.fn(async () => undefined),
  discoverRooms: vi.fn(async () => []),
  joinRoom: vi.fn(async () => undefined),
  confirmSecurity: vi.fn(),
  startSharing: vi.fn(async () => undefined),
  stopSharing: vi.fn(async () => undefined),
  stopAudio: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
  copyCode: vi.fn(async () => true),
  exportDiagnostics: vi.fn(async () => true),
  isSimulatedPeer: false,
  testNetworkEnabled: false,

  setUserName: vi.fn(),
  setUserAvatar: vi.fn(),
  sendChatMessage: vi.fn(),
  deleteChatMessage: vi.fn(),
  toggleSessionModal: vi.fn(),
  toggleChatPanel: vi.fn(),
  simulatePeer: vi.fn(),
  setTestNetworkEnabled: vi.fn(async () => undefined),
  getMetrics: vi.fn(async () => ({})),
  remoteControlConfig: { enabled: false, allowMouse: true, allowKeyboard: true, allowClipboard: true },
  remotePeerControlConfig: { enabled: false, allowMouse: false, allowKeyboard: false, allowClipboard: false },
  remoteControlStatus: 'idle',
  remoteControlOverrideTimeoutMs: undefined,
  updateRemoteControlConfig: vi.fn(async () => undefined),
  sendRemoteInput: vi.fn(),
  sendRemoteClipboard: vi.fn(),
  sendSelectMonitor: vi.fn(),
  resumeRemoteControlOverride: vi.fn(async () => undefined),
});



describe('SFScreen Discord layout', () => {
  afterEach(cleanup);
  beforeEach(() => vi.mocked(useSession).mockReturnValue(model()));

  it('renders Discord-style header and participants sidebar', () => {
    const current = model();
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    expect(screen.getByText('SFScreen')).toBeTruthy();
    expect(screen.getByText('Sua Sala Privada')).toBeTruthy();
    expect(screen.getByText(/Pessoas na sala \(1\)/)).toBeTruthy();
    expect(screen.getByText('Convidar pessoa')).toBeTruthy();
  });

  it('collapses and expands the sidebar with toggle button', () => {
    const current = model();
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    expect(screen.getByText(/Pessoas na sala \(1\)/)).toBeTruthy();

    // Click toggle button to collapse
    const toggleBtns = screen.getAllByRole('button', { name: /recolher barra lateral/i });
    fireEvent.click(toggleBtns[0]);

    expect(screen.queryByText(/Pessoas na sala \(1\)/)).toBeNull();

    // Click toggle button again to expand
    const expandBtn = screen.getByRole('button', { name: /expandir barra lateral/i });
    fireEvent.click(expandBtn);

    expect(screen.getByText(/Pessoas na sala \(1\)/)).toBeTruthy();
  });



  it('opens and interacts with session modal for invite code and verification', () => {
    const current = model(readyState({
      phase: 'verifying',
      sessionModalOpen: true,
      hosted: { code: 'K7P-4MX-Q', expiresAt: new Date(Date.now() + 60_000).toISOString() },
      securityCode: '123456',
    }));
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    expect(screen.getByText('123456')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'O código confere' }));
    expect(current.confirmSecurity).toHaveBeenCalledOnce();
  });

  it('allows copying invite code via button and clicking the code value directly', () => {
    const current = model(readyState({
      phase: 'idle',
      sessionModalOpen: true,
      hosted: { code: 'K7P-4MX-Q', expiresAt: new Date(Date.now() + 60_000).toISOString() },
    }));
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    // Click "Copiar código" button
    const copyBtn = screen.getByRole('button', { name: /copiar código/i });
    fireEvent.click(copyBtn);
    expect(current.copyCode).toHaveBeenCalledOnce();

    // Click code text directly
    const codeSpan = screen.getByText('K7P-4MX-Q');
    fireEvent.click(codeSpan);
    expect(current.copyCode).toHaveBeenCalledTimes(2);
  });

  it('displays connection status and Tailscale peers count in topbar', () => {
    const current = model(readyState({
      tailscale: {
        state: 'ready',
        selfIp: '100.64.0.1',
        peers: [
          { id: '1', name: 'device-1', ip: '100.64.0.2', online: true, route: 'direct' },
          { id: '2', name: 'device-2', ip: '100.64.0.3', online: false, route: 'relay' },
        ],
      },
    }));
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    // Should display peers count in topbar pill
    expect(screen.getByText(/Conexão excelente · 18 ms · 2 peers/i)).toBeTruthy();
  });


  it('shows the monitor picker and starts sharing upon selection', () => {
    const current = model();
    current.sourcePickerOpen = true;
    current.sources = [{ id: 'screen:1', name: 'Monitor principal', thumbnailDataUrl: 'data:image/png;base64,' }];
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    expect(screen.getByRole('dialog', { name: 'Escolha o que compartilhar' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Monitor principal' }));
    expect(current.selectSource).toHaveBeenCalledOnce();
  });

  it('requires visible resolution and FPS configuration before normal screen sharing', () => {
    const current = model();
    current.sourcePickerOpen = true;
    current.sources = [{ id: 'screen:1', name: 'Monitor principal', thumbnailDataUrl: 'data:image/png;base64,' }];
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    expect(screen.getByLabelText(/configuração obrigatória da transmissão/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: '1080p' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '60 FPS' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: '720p' }));
    fireEvent.click(screen.getByRole('button', { name: '30 FPS' }));

    expect(current.setResolution).toHaveBeenCalledWith('720p');
    expect(current.setFps).toHaveBeenCalledWith(30);
  });

  it('shows measured outgoing screen FPS instead of presenting the configured target as real', () => {
    const fakeStream = { getTracks: () => [], getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;
    const current = model(readyState({ phase: 'connected', mediaPhase: 'sharing', remoteUserName: 'Alex' }));
    current.localStream = fakeStream;
    current.captureFps = 60;
    current.outgoingFps = 57;
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    expect(screen.getByText(/1080p · 57 FPS reais/i)).toBeTruthy();
  });

  it('supports opting in to system audio in source picker', () => {
    const current = model();
    current.sourcePickerOpen = true;
    current.sources = [{ id: 'screen:1', name: 'Monitor principal', thumbnailDataUrl: 'data:image/png;base64,' }];
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    const option = screen.getByRole('checkbox', { name: /compartilhar áudio do sistema/i });
    expect((option as HTMLInputElement).checked).toBe(false);
    fireEvent.click(option);
    fireEvent.click(screen.getByRole('button', { name: 'Monitor principal' }));
    expect(current.selectSource).toHaveBeenCalledWith(
      current.sources[0],
      true,
      { enabled: false, allowMouse: true, allowKeyboard: true, allowClipboard: true }
    );
  });

  it('renders chat drawer and allows sending messages', () => {
    const current = model(readyState({
      chatPanelOpen: true,
      chatMessages: [
        { id: 'msg-1', senderName: 'Você', text: 'Mensagem de teste', timestamp: Date.now() },
      ],
    }));
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    expect(screen.getByText('Chat da Chamada')).toBeTruthy();
    expect(screen.getByText('Mensagem de teste')).toBeTruthy();

    const input = screen.getByPlaceholderText('Conversar no canal…');
    fireEvent.change(input, { target: { value: 'Olá!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(current.sendChatMessage).toHaveBeenCalledWith('Olá!');
  });

  it('allows deleting a message from the chat drawer', () => {
    const current = model(readyState({
      chatPanelOpen: true,
      chatMessages: [
        { id: 'msg-123', senderName: 'Você', text: 'Mensagem para apagar', timestamp: Date.now() },
      ],
    }));
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    const deleteBtn = screen.getByRole('button', { name: /excluir mensagem/i });
    fireEvent.click(deleteBtn);
    expect(current.deleteChatMessage).toHaveBeenCalledWith('msg-123');
  });

  it('does not display unread badge when chat is opened', () => {
    const current = model(readyState({
      chatPanelOpen: true,
      chatMessages: [
        { id: 'msg-1', senderName: 'Alex', text: 'Oi', timestamp: Date.now() },
      ],
    }));
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    // When chatPanelOpen is true, badge should NOT be displayed
    expect(screen.queryByText('1', { selector: '.dock-badge' })).toBeNull();
  });

  it('renders alone notice at the bottom of message list when chat has messages and user is alone', () => {
    const current = model(readyState({
      phase: 'idle',
      chatPanelOpen: true,
      chatMessages: [
        { id: 'msg-1', senderName: 'Alex', text: 'Mensagem antiga', timestamp: Date.now() - 5000 },
        { id: 'msg-2', senderName: 'Você', text: 'Resposta', timestamp: Date.now() },
      ],
    }));
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    const notice = screen.getByText(/Você está sozinho na chamada/i);
    expect(notice).toBeTruthy();
    expect(notice.classList.contains('is-bottom-notice')).toBe(true);
  });

  it('automatically opens chat panel when window is widescreen/maximized', () => {
    const current = model(readyState({ chatPanelOpen: false }));
    vi.mocked(useSession).mockReturnValue(current);

    // Mock widescreen (e.g. 1440px)
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1440 });
    render(<App />);

    expect(current.toggleChatPanel).toHaveBeenCalledWith(true);
  });


  it('opens and navigates settings tabs', () => {
    const current = model();
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    // Open settings from topbar or sidebar
    const settingsBtns = screen.getAllByRole('button', { name: /configurações/i });
    fireEvent.click(settingsBtns[0]);

    expect(screen.getByRole('dialog', { name: 'Configurações' })).toBeTruthy();
    expect(screen.getByText('Perfil de Usuário')).toBeTruthy();

    // Switch to Network tab
    fireEvent.click(screen.getByRole('button', { name: /rede & tailscale/i }));
    expect(screen.getByText('Status Tailscale')).toBeTruthy();

    // Switch to Media tab
    fireEvent.click(screen.getByRole('button', { name: /vídeo & áudio/i }));
    expect(screen.getByText('Qualidade & Parâmetros de Mídia')).toBeTruthy();
  });

  it('lists audio outputs and saves the selected headset', async () => {
    const originalMediaDevices = navigator.mediaDevices;
    const enumerateDevices = vi.fn(async () => [
      { deviceId: 'microphone-1', groupId: 'group-1', kind: 'audioinput', label: 'Microfone USB', toJSON: () => ({}) },
      { deviceId: 'headset-1', groupId: 'group-1', kind: 'audiooutput', label: 'Fone USB', toJSON: () => ({}) },
    ] as MediaDeviceInfo[]);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { enumerateDevices, addEventListener: vi.fn(), removeEventListener: vi.fn() },
    });
    localStorage.removeItem('sfscreen_preferred_audio_output');

    try {
      const current = model();
      vi.mocked(useSession).mockReturnValue(current);
      render(<App />);

      fireEvent.click(screen.getAllByRole('button', { name: /configurações/i })[0]);
      fireEvent.click(screen.getByRole('button', { name: /vídeo & áudio/i }));

      const outputSelector = screen.getByRole('combobox', { name: /saída de áudio/i });
      expect((outputSelector as HTMLSelectElement).value).toBe('default');
      expect(await screen.findByRole('option', { name: 'Fone USB' })).toBeTruthy();

      fireEvent.change(outputSelector, { target: { value: 'headset-1' } });
      expect(localStorage.getItem('sfscreen_preferred_audio_output')).toBe('headset-1');
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: originalMediaDevices });
    }
  });

  it('tests the selected microphone and stops its capture', async () => {
    const originalMediaDevices = navigator.mediaDevices;
    const originalAudioContext = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    const originalCancelAnimationFrame = window.cancelAnimationFrame;
    const stopTrack = vi.fn();
    const testStream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
    const getUserMedia = vi.fn(async () => testStream);
    const close = vi.fn(async () => undefined);

    class FakeAudioContext {
      state: AudioContextState = 'running';
      close = close;
      resume = vi.fn(async () => undefined);
      createAnalyser = vi.fn(() => ({
        fftSize: 256,
        smoothingTimeConstant: 0,
        getByteTimeDomainData: vi.fn((samples: Uint8Array) => samples.fill(128)),
      }));
      createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
    }

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { enumerateDevices: vi.fn(async () => []), getUserMedia, addEventListener: vi.fn(), removeEventListener: vi.fn() },
    });
    Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: FakeAudioContext });
    Object.defineProperty(window, 'requestAnimationFrame', { configurable: true, value: vi.fn(() => 1) });
    Object.defineProperty(window, 'cancelAnimationFrame', { configurable: true, value: vi.fn() });

    try {
      const current = model();
      vi.mocked(useSession).mockReturnValue(current);
      render(<App />);

      fireEvent.click(screen.getAllByRole('button', { name: /configurações/i })[0]);
      fireEvent.click(screen.getByRole('button', { name: /vídeo & áudio/i }));
      fireEvent.click(screen.getByRole('button', { name: /testar microfone/i }));

      await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: expect.any(Object), video: false })));
      const stopButton = await screen.findByRole('button', { name: /parar teste/i });
      expect(screen.getByRole('meter', { name: /nível do microfone/i })).toBeTruthy();

      fireEvent.click(stopButton);
      expect(stopTrack).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: originalMediaDevices });
      if (originalAudioContext) Object.defineProperty(globalThis, 'AudioContext', originalAudioContext);
      else Reflect.deleteProperty(globalThis, 'AudioContext');
      Object.defineProperty(window, 'requestAnimationFrame', { configurable: true, value: originalRequestAnimationFrame });
      Object.defineProperty(window, 'cancelAnimationFrame', { configurable: true, value: originalCancelAnimationFrame });
    }
  });

  it('shows stream popover menu when sharing and allows stopping directly or via menu', () => {
    const fakeStream = { getTracks: () => [], getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;
    const current = model(readyState({
      mediaPhase: 'sharing',
      selectedSource: { id: 'screen:1', name: 'Monitor 1', thumbnailDataUrl: 'data:image/png;base64,' },
    }));
    current.localStream = fakeStream;
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    // Click left split button (Parar de transmitir directly)
    const stopDirectBtn = screen.getByRole('button', { name: /parar de transmitir/i });
    fireEvent.click(stopDirectBtn);
    expect(current.stopSharing).toHaveBeenCalledOnce();

    // Click the stream split chevron to open popover
    const chevronBtn = screen.getByRole('button', { name: /opções de transmissão/i });
    fireEvent.click(chevronBtn);

    expect(screen.getByText('Alterar a Transmissão')).toBeTruthy();
    expect(screen.getByText(/Qualidade da transmissão/i)).toBeTruthy();
  });

  it('allows starting simulated peer session from settings and omits it from sidebar', () => {
    const current = model();
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    // Sidebar should NOT contain the simulation button
    expect(screen.queryByRole('button', { name: /simular chamada/i })).toBeNull();

    // Open Settings Modal
    const settingsBtn = screen.getAllByRole('button', { name: /configurações/i })[0];
    fireEvent.click(settingsBtn);

    // Switch to Modo de Teste (Testing) tab
    const testingTab = screen.getByRole('button', { name: /modo de teste/i });
    fireEvent.click(testingTab);


    // Click "Iniciar Participante Simulado (Alex)" button
    const simStartBtn = screen.getByRole('button', { name: /iniciar participante simulado/i });
    fireEvent.click(simStartBtn);
    expect(current.simulatePeer).toHaveBeenCalledWith(expect.objectContaining({
      enableScreen: true,
      enableCamera: true,
      screenResolution: '1080p',
      sendChatMessage: true,
    }));
  });

  it('enables the simulated Tailscale network from test mode', () => {
    const current = model();
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    fireEvent.click(screen.getAllByRole('button', { name: /configurações/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /modo de teste/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /simular rede tailscale/i }));

    expect(current.setTestNetworkEnabled).toHaveBeenCalledWith(true);
  });

  it('keeps a room in chat lobby until the user explicitly joins the call', () => {
    const current = model(readyState({ phase: 'connected', remoteUserName: 'Alex' }));
    current.activeRoom = {
      room: { id: 'room-1', name: 'Sala privada', hasPassword: true },
      expiresAt: '2026-08-23T01:00:00.000Z',
    };
    vi.mocked(useSession).mockReturnValue(current);
    const { container } = render(<App />);

    expect(container.querySelector('.discord-body.is-room-chat-mode')).toBeTruthy();
    expect(screen.getByPlaceholderText(/conversar em sala privada/i)).toBeTruthy();
    expect(screen.queryByText('Voz conectada')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /iniciar chamada/i }));
    expect(current.joinRoomCall).toHaveBeenCalledOnce();
  });

  it('allows customizing simulated peer options (screen, camera, chat message)', () => {
    const current = model();
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    // Open Settings Modal -> Modo de Teste
    const settingsBtn = screen.getAllByRole('button', { name: /configurações/i })[0];
    fireEvent.click(settingsBtn);
    const testingTab = screen.getByRole('button', { name: /modo de teste/i });
    fireEvent.click(testingTab);

    // Disable camera, select 720p screen, disable screen audio, change chat text
    const cameraToggle = screen.getByRole('checkbox', { name: /alex câmera ligada/i });
    fireEvent.click(cameraToggle);

    const screen720pBtn = screen.getByRole('button', { name: /720p \(hd\)/i });
    fireEvent.click(screen720pBtn);

    const screenAudioToggle = screen.getByRole('checkbox', { name: /a tela de alex vai emitir som/i });
    fireEvent.click(screenAudioToggle);

    const chatInput = screen.getByPlaceholderText(/digite a mensagem de teste/i);
    fireEvent.change(chatInput, { target: { value: 'Mensagem customizada do Alex' } });

    // Start simulation
    const simStartBtn = screen.getByRole('button', { name: /iniciar participante simulado/i });
    fireEvent.click(simStartBtn);

    expect(current.simulatePeer).toHaveBeenCalledWith(expect.objectContaining({
      enableScreen: true,
      screenResolution: '720p',
      enableScreenAudio: false,
      enableCamera: false,
      sendChatMessage: true,
      chatMessageText: 'Mensagem customizada do Alex',
    }));
  });


  it('opens Discord-style context menu on right click on the stage', () => {
    const fakeStream = { getTracks: () => [], getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;
    const current = model(readyState({
      mediaPhase: 'sharing',
      selectedSource: { id: 'screen:1', name: 'Monitor 1', thumbnailDataUrl: 'data:image/png;base64,' },
    }));
    current.localStream = fakeStream;
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    const mainStage = screen.getByRole('main');
    fireEvent.contextMenu(mainStage, { clientX: 200, clientY: 200 });

    expect(screen.getByText('Alterar a Transmissão')).toBeTruthy();
    expect(screen.getByText(/Zoom da tela/i)).toBeTruthy();
    expect(screen.getByText(/Tela cheia/i)).toBeTruthy();
  });

  it('renders draggable PiP thumbnail when both local and remote are active', () => {
    const fakeStream = { getTracks: () => [], getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;
    const current = model(readyState({
      phase: 'connected',
      mediaPhase: 'sharing',
      remoteUserName: 'Alex (Simulado)',
      selectedSource: { id: 'screen:1', name: 'Monitor 1', thumbnailDataUrl: 'data:image/png;base64,' },
    }));
    current.localStream = fakeStream;
    current.remoteStream = fakeStream;
    current.remoteMediaPhase = 'sharing';
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    expect(screen.getByText('AO VIVO')).toBeTruthy();
    expect(screen.getByTitle(/Arraste para qualquer um dos 4 cantos/i)).toBeTruthy();
  });

  it('allows stopping and resuming watching the friend stream with the "Ver tela" button and shows viewer badge', () => {
    const fakeStream = { getTracks: () => [], getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;
    const current = model(readyState({
      phase: 'connected',
      mediaPhase: 'selected',
      remoteUserName: 'Alex (Simulado)',
    }));
    current.remoteStream = fakeStream;
    current.remoteMediaPhase = 'sharing';
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    // Check viewer badge
    expect(screen.getAllByText('Usuario').length).toBeGreaterThanOrEqual(1);

    // Click "Parar de ver"

    const stopWatchingBtn = screen.getByRole('button', { name: /parar de ver/i });
    fireEvent.click(stopWatchingBtn);

    // Live video replaced by hero CTA "Ver tela" (and sidebar watch button appears)
    const watchButtons = screen.getAllByRole('button', { name: /ver tela/i });
    expect(watchButtons.length).toBe(2);

    // Clicking "Ver tela" resumes stream
    fireEvent.click(watchButtons[1]);
    expect(screen.getByText(/Alex \(Simulado\) está apresentando/i)).toBeTruthy();
  });

  it('supports Grid mode with side-by-side screens and focuses on clicked stream', () => {
    const fakeStream = { getTracks: () => [], getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;
    const current = model(readyState({
      phase: 'connected',
      mediaPhase: 'sharing',
      remoteUserName: 'Alex (Simulado)',
      selectedSource: { id: 'screen:1', name: 'Monitor 1', thumbnailDataUrl: 'data:image/png;base64,' },
    }));
    current.localStream = fakeStream;
    current.remoteStream = fakeStream;
    current.remoteMediaPhase = 'sharing';
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    // Switch to Grid Mode
    const gridBtn = screen.getAllByRole('button', { name: /modo grade/i })[0];
    fireEvent.click(gridBtn);


    // Both tiles rendered side by side
    expect(screen.getAllByText(/Clique para focar/i).length).toBe(2);
    expect(screen.getAllByText(/Usuario/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Alex (Simulado)').length).toBeGreaterThanOrEqual(1);

    // Click on Alex's screenshare tile to focus
    const tiles = document.querySelectorAll('.tile-screenshare-box');
    fireEvent.click(tiles[1]);

    // Focuses on Alex
    expect(screen.getByText(/Alex \(Simulado\) está apresentando/i)).toBeTruthy();
  });

  it('shows power-saving paused rendering message when window loses focus during local stream sharing', () => {
    const fakeStream = { getTracks: () => [], getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;
    const current = model(readyState({
      phase: 'connected',
      mediaPhase: 'sharing',
      remoteUserName: 'Alex (Simulado)',
      selectedSource: { id: 'screen:1', name: 'Monitor 1', thumbnailDataUrl: 'data:image/png;base64,' },
    }));
    current.localStream = fakeStream;
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    // Initially window is focused, showing normal stream video
    expect(screen.getByText(/Usuario está apresentando/i)).toBeTruthy();

    // Window loses focus (blur event)
    fireEvent.blur(window);

    // Paused rendering state is shown with clear explanation
    expect(screen.getByText(/Sua transmissão está ligada/i)).toBeTruthy();
    expect(screen.getByText(/Pausamos a renderização para reduzir consumos/i)).toBeTruthy();

    // Window regains focus (focus event)
    fireEvent.focus(window);
    expect(screen.queryByText(/Pausamos a renderização para reduzir consumos/i)).toBeNull();
  });

  it('renders Discord-style Zoom Navigator with interactive mini-map preview and blue viewfinder box when zoomed in', () => {
    const fakeStream = { getTracks: () => [], getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;
    const current = model(readyState({
      phase: 'connected',
      mediaPhase: 'sharing',
      remoteUserName: 'Alex (Simulado)',
      selectedSource: { id: 'screen:1', name: 'Monitor 1', thumbnailDataUrl: 'data:image/png;base64,' },
    }));
    current.localStream = fakeStream;
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    // Double click viewport to zoom in to 1.5x (150%)
    const viewport = screen.getByText(/Usuario está apresentando/i).closest('.stage-video-viewport')!;
    fireEvent.doubleClick(viewport);

    // Zoom Navigator Card is rendered with title, minimap preview and blue viewfinder box
    const minimap = screen.getByTitle(/Arraste a caixa azul ou clique para mover o zoom de lugar/i);
    expect(minimap).toBeTruthy();

    const slider = screen.getByTitle(/Zoom: 150%/i);
    expect(slider).toBeTruthy();

    // Drag on minimap to pan
    fireEvent.pointerDown(minimap, { button: 0, clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(minimap, { clientX: 80, clientY: 70, pointerId: 1 });
    fireEvent.pointerUp(minimap, { pointerId: 1 });

    // Reset button resets zoom back to 100%
    const resetBtn = screen.getByRole('button', { name: /150% ✕/i });
    fireEvent.click(resetBtn);

    expect(screen.queryByTitle(/Arraste a caixa azul/i)).toBeNull();
  });

  it('disables wheel, double-click and menu zoom while viewing a remote-control stream', () => {
    const fakeStream = { getTracks: () => [], getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;
    const current = model(readyState({
      phase: 'connected',
      mediaPhase: 'selected',
      remoteUserName: 'Alex',
    }));
    current.remoteStream = fakeStream;
    current.remoteMediaPhase = 'sharing';
    current.remotePeerControlConfig = { enabled: true, allowMouse: true, allowKeyboard: true, allowClipboard: true };
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    const viewport = screen.getByText(/Alex está apresentando/i).closest('.stage-video-viewport')!;
    fireEvent.doubleClick(viewport);
    fireEvent.wheel(viewport, { ctrlKey: true, deltaY: -100 });
    fireEvent.contextMenu(viewport, { clientX: 100, clientY: 100 });

    expect(screen.queryByTitle(/Arraste a caixa azul ou clique para mover o zoom/i)).toBeNull();
    expect(screen.queryByText(/Zoom da tela/i)).toBeNull();
  });

  it('does not display speaker button or context menu audio option when viewing own screen share', () => {
    const fakeStream = { getTracks: () => [], getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;
    const current = model(readyState({
      phase: 'connected',
      mediaPhase: 'sharing',
      remoteUserName: 'Alex (Simulado)',
      selectedSource: { id: 'screen:1', name: 'Monitor 1', thumbnailDataUrl: 'data:image/png;base64,' },
    }));
    current.localStream = fakeStream;
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    // Viewing own screen: corner speaker volume button should NOT exist
    expect(screen.queryByTitle(/Silenciar áudio/i)).toBeNull();
    expect(screen.queryByTitle(/Ativar som/i)).toBeNull();

    // Right click stage to open context menu
    const stage = screen.getByRole('main');
    fireEvent.contextMenu(stage, { clientX: 200, clientY: 200 });

    // Context menu should NOT contain "Silenciar áudio" or "Ativar som"
    expect(screen.queryByText(/Silenciar áudio/i)).toBeNull();
    expect(screen.queryByText(/Ativar som/i)).toBeNull();
  });

  it('strictly isolates context menu options when right clicking on remote vs local screen in grid mode', () => {
    const fakeStream = { getTracks: () => [], getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;
    const current = model(readyState({
      phase: 'connected',
      mediaPhase: 'sharing',
      remoteUserName: 'Alex (Simulado)',
      selectedSource: { id: 'screen:1', name: 'Monitor 1', thumbnailDataUrl: 'data:image/png;base64,' },
    }));
    current.localStream = fakeStream;
    current.remoteStream = fakeStream;
    current.remoteMediaPhase = 'sharing';

    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    // Switch to Grid Mode
    const gridBtn = screen.getAllByRole('button', { name: /modo grade/i })[0];
    fireEvent.click(gridBtn);

    const tiles = document.querySelectorAll('.tile-screenshare-box');

    // Right-click on Tile 2 (Alex / Remote screen)
    fireEvent.contextMenu(tiles[1], { clientX: 300, clientY: 300 });

    // Remote menu MUST contain viewer options:
    expect(screen.getByText(/Parar de ver a tela/i)).toBeTruthy();
    expect(screen.getByText(/Zoom da tela/i)).toBeTruthy();
    expect(screen.getByText(/Preencher tela/i)).toBeTruthy();
    expect(screen.getByText(/Ativar som|Silenciar áudio/i)).toBeTruthy();
    expect(screen.getByText(/Tela cheia/i)).toBeTruthy();

    // Remote menu MUST NOT contain local broadcast options:
    expect(screen.queryByText(/Parar de transmitir/i)).toBeNull();
    expect(screen.queryByText(/Alterar a Transmissão/i)).toBeNull();
    expect(screen.queryByText(/Qualidade da transmissão/i)).toBeNull();
    expect(screen.queryByText(/Compartilhar áudio da transmissão/i)).toBeNull();

    // Right-click on Tile 1 (Local screen)
    fireEvent.contextMenu(tiles[0], { clientX: 100, clientY: 100 });

    // Local menu MUST contain broadcast options:
    expect(screen.getByText(/Parar de transmitir/i)).toBeTruthy();
    expect(screen.getByText(/Alterar a Transmissão/i)).toBeTruthy();
    expect(screen.getByText(/Qualidade da transmissão/i)).toBeTruthy();
    expect(screen.getByText(/Compartilhar áudio da transmissão/i)).toBeTruthy();

    // Local menu MUST NOT contain remote viewer options:
    expect(screen.queryByText(/Parar de ver a tela/i)).toBeNull();
    expect(screen.queryByText(/Ativar som/i)).toBeNull();
    expect(screen.queryByText(/Silenciar áudio/i)).toBeNull();
  });

  it('toggles between Focus and Grid mode with a single click on the screen', () => {
    const fakeStream = { getTracks: () => [], getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;
    const current = model(readyState({
      phase: 'connected',
      mediaPhase: 'sharing',
      remoteUserName: 'Alex (Simulado)',
      selectedSource: { id: 'screen:1', name: 'Monitor 1', thumbnailDataUrl: 'data:image/png;base64,' },
    }));
    current.localStream = fakeStream;
    current.remoteStream = fakeStream;
    current.remoteMediaPhase = 'sharing';
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    // Initially in Focus Mode, stage video switches to grid on click
    const stageViewport = document.querySelector('.stage-video-viewport')!;
    expect(stageViewport).toBeTruthy();

    // 1 click on stage video -> switches to Grid Mode
    fireEvent.click(stageViewport);

    // Now in Grid Mode, both screenshare boxes exist
    const screenshares = document.querySelectorAll('.tile-screenshare-box');
    expect(screenshares).toHaveLength(2);

    // 1 click on Tile 2 Screenshare -> switches back to Focus Mode focusing Tile 2 (Alex)
    fireEvent.click(screenshares[1]);

    expect(screen.getByText(/Alex \(Simulado\) está apresentando/i)).toBeTruthy();
  });

  it('does not toggle to Grid mode when clicking and dragging or holding mouse down during zoom', () => {
    const fakeStream = { getTracks: () => [], getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;
    const current = model(readyState({
      phase: 'connected',
      mediaPhase: 'sharing',
      remoteUserName: 'Alex (Simulado)',
      selectedSource: { id: 'screen:1', name: 'Monitor 1', thumbnailDataUrl: 'data:image/png;base64,' },
    }));
    current.localStream = fakeStream;
    current.remoteStream = fakeStream;
    current.remoteMediaPhase = 'sharing';
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    const viewport = screen.getByText(/Alex \(Simulado\) está apresentando/i).closest('.stage-video-viewport')!;

    // Double click to zoom in to 150%
    fireEvent.doubleClick(viewport);

    // Zoom navigator is visible
    expect(screen.getByTitle(/Arraste a caixa azul ou clique para mover o zoom de lugar/i)).toBeTruthy();

    // Mouse down, move (pan drag), mouse up, and click event
    fireEvent.mouseDown(viewport, { clientX: 300, clientY: 300, button: 0 });
    fireEvent.mouseMove(viewport, { clientX: 340, clientY: 350 });
    fireEvent.mouseUp(viewport);
    fireEvent.click(viewport);

    // Should STILL be in Focus mode, NOT switched to Grid mode
    expect(document.querySelectorAll('.tile-screenshare-box')).toHaveLength(0);
    expect(screen.getByText(/Alex \(Simulado\) está apresentando/i)).toBeTruthy();
  });

  it('allows focusing on camera and screenshare independently in grid mode', () => {
    const fakeStream = { getTracks: () => [], getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;
    const current = model(readyState({
      phase: 'connected',
      mediaPhase: 'sharing',
      remoteUserName: 'Alex (Simulado)',
      selectedSource: { id: 'screen:1', name: 'Monitor 1', thumbnailDataUrl: 'data:image/png;base64,' },
    }));
    current.localStream = fakeStream;
    current.remoteStream = fakeStream;
    current.localCameraStream = fakeStream;
    current.remoteCameraStream = fakeStream;
    current.cameraActive = true;
    current.remoteMediaPhase = 'sharing';
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    // Switch to Grid Mode
    const gridBtn = screen.getAllByRole('button', { name: /modo grade/i })[0];
    fireEvent.click(gridBtn);

    // Click on camera/avatar box of local user
    const cameraBoxes = document.querySelectorAll('.tile-side-avatar-box.is-camera-active');
    expect(cameraBoxes).toHaveLength(2);

    fireEvent.click(cameraBoxes[0]);

    // Focuses local camera
    expect(screen.getByText(/Usuario \(Câmera\) está apresentando/i)).toBeTruthy();
  });

  it('toggles camera via dock button and opens Discord-style network telemetry popover', async () => {
    const current = model(readyState({
      phase: 'connected',
      remoteUserName: 'Alex (Simulado)',
    }));
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    // Camera toggle button exists in dock
    const camBtn = screen.getByLabelText(/Ativar câmera/i);
    expect(camBtn).toBeTruthy();

    fireEvent.click(camBtn);
    expect(current.toggleCamera).toHaveBeenCalled();

    // Click on "Voz conectada" widget in sidebar
    const voiceWidget = screen.getByText(/Voz conectada/i);
    expect(voiceWidget).toBeTruthy();

    fireEvent.click(voiceWidget);

    // Popover is open
    expect(screen.getByText(/Ping médio:/i)).toBeTruthy();
    expect(screen.getByText(/Último ping:/i)).toBeTruthy();
    expect(screen.getByText(/Taxa de perda de pacotes:/i)).toBeTruthy();
    expect(screen.getByText(/(p2p-webrtc-direct|p2p-dtls-srtp-local|relay-tailnet-p2p)/i)).toBeTruthy();
  });

  it('allows dismissing the PiP floating preview card by clicking its close button', () => {
    const fakeStream = { getTracks: () => [], getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;
    const current = model(readyState({
      phase: 'connected',
      mediaPhase: 'sharing',
      remoteUserName: 'Alex (Simulado)',
      selectedSource: { id: 'screen:1', name: 'Monitor 1', thumbnailDataUrl: 'data:image/png;base64,' },
    }));
    current.localStream = fakeStream;
    current.remoteStream = fakeStream;
    current.remoteMediaPhase = 'sharing';
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    // In focus mode with dual sharing, PiP card is shown with close button
    const closeBtn = screen.getByTitle(/Fechar miniatura flutuante/i);
    expect(closeBtn).toBeTruthy();

    // Click close button -> PiP card is dismissed
    fireEvent.click(closeBtn);
    expect(screen.queryByTitle(/Fechar miniatura flutuante/i)).toBeNull();
  });

  it('enables Grid Mode and PiP when local camera is active and remote is sharing screen', () => {
    const fakeCamStream = { getTracks: () => [], getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;
    const fakeScreenStream = { getTracks: () => [], getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;
    const current = model(readyState({
      phase: 'connected',
      remoteUserName: 'Alex (Simulado)',
    }));
    current.cameraActive = true;
    current.localCameraStream = fakeCamStream;
    current.remoteStream = fakeScreenStream;
    current.remoteMediaPhase = 'sharing';
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    // PiP should display showing local camera while viewing remote screen
    expect(screen.getByText(/Usuario \(Câmera\)/i)).toBeTruthy();
    expect(screen.getByTitle(/Fechar miniatura flutuante/i)).toBeTruthy();

    // Grid Mode button should be available
    const gridBtn = screen.getAllByRole('button', { name: /modo grade/i })[0];
    expect(gridBtn).toBeTruthy();

    // Clicking grid button enters grid mode
    fireEvent.click(gridBtn);
    expect(screen.getByRole('button', { name: /alternar para modo foco/i })).toBeTruthy();
  });

  it('hides the disconnect / hangup button when alone in the room, and shows it when connected', () => {
    // 1. Alone in the room
    const aloneSession = model(readyState({ phase: 'idle' }));
    vi.mocked(useSession).mockReturnValue(aloneSession);
    const { unmount } = render(<App />);

    expect(screen.queryByRole('button', { name: /desconectar|sair/i })).toBeNull();
    expect(screen.queryByTitle(/sair da chamada|desconectar/i)).toBeNull();

    unmount();

    // 2. Connected with a peer
    const connectedSession = model(readyState({ phase: 'connected', remoteUserName: 'Alex' }));
    vi.mocked(useSession).mockReturnValue(connectedSession);
    render(<App />);

    const hangupBtns = screen.getAllByRole('button', { name: /desconectar/i });
    expect(hangupBtns.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(hangupBtns[0]);
    expect(connectedSession.close).toHaveBeenCalledOnce();
  });

  it('renders local screenshare in full stage when alone or when peer disconnects', () => {
    const fakeStream = { getTracks: () => [], getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;
    const current = model(readyState({
      phase: 'idle',
      mediaPhase: 'sharing',
      selectedSource: { id: 'screen:1', name: 'Monitor 1', thumbnailDataUrl: 'data:image/png;base64,' },
    }));
    current.localStream = fakeStream;
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    // Should state that the default local user is presenting.
    expect(screen.getByText(/Usuario está apresentando/i)).toBeTruthy();

    // No PiP and no "Parar de ver" remote viewer button
    expect(screen.queryByText(/Parar de ver/i)).toBeNull();
    expect(screen.queryByTitle(/Fechar miniatura flutuante/i)).toBeNull();
  });

  it('supports selecting Acesso Remoto in source picker modal', async () => {
    const current = model(readyState({ phase: 'connected', remoteUserName: 'Alex' }));
    current.sourcePickerOpen = true;
    current.sources = [{ id: 'screen:1', name: 'Monitor Principal', thumbnailDataUrl: 'data:image/png;base64,' }];
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    // Check mode tabs exist
    expect(screen.getByRole('tab', { name: /transmissão padrão/i })).toBeTruthy();
    const remoteAccessTab = screen.getByRole('tab', { name: /^acesso remoto$/i });
    expect(remoteAccessTab).toBeTruthy();

    // Switch to Remote Access tab
    fireEvent.click(remoteAccessTab);
    expect(screen.getByText(/Permissões do Convidado no seu PC/i)).toBeTruthy();
    expect(screen.getByText(/Mouse e Cliques/i)).toBeTruthy();
    expect(screen.getByText(/Teclado e Digitação/i)).toBeTruthy();

    // Click monitor card
    const monitorCard = screen.getByLabelText('Monitor Principal');
    fireEvent.click(monitorCard);

    expect(current.selectSource).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'screen:1' }),
      expect.any(Boolean),
      { enabled: true, allowMouse: true, allowKeyboard: true, allowClipboard: true }
    );
  });

  it('renders Host Remote Control floating banner with pause & override controls', () => {
    const fakeStream = { getTracks: () => [], getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;
    const current = model(readyState({
      phase: 'connected',
      mediaPhase: 'sharing',
      remoteUserName: 'Alex',
    }));
    current.localStream = fakeStream;
    current.remoteControlConfig = { enabled: true, allowMouse: true, allowKeyboard: true, allowClipboard: true };
    current.remoteControlStatus = 'active';
    vi.mocked(useSession).mockReturnValue(current);
    const { rerender } = render(<App />);

    expect(screen.getByText(/Alex pode controlar seu PC/i)).toBeTruthy();
    const stopBtn = screen.getByRole('button', { name: /encerrar/i });
    expect(stopBtn).toBeTruthy();

    // Test Host Paused by local physical mouse
    current.remoteControlStatus = 'paused-by-host';
    current.remoteControlOverrideTimeoutMs = 5000;
    rerender(<App />);

    expect(screen.getByText(/Você assumiu o controle · Retomando em 5s/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /devolver agora/i })).toBeTruthy();
  });

  it('renders Viewer Remote Control floating action bar and toggles interactive control', () => {
    const fakeStream = { getTracks: () => [], getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;
    const current = model(readyState({
      phase: 'connected',
      remoteUserName: 'Alex',
    }));
    current.remoteStream = fakeStream;
    current.remoteMediaPhase = 'sharing';
    current.remotePeerControlConfig = { enabled: true, allowMouse: true, allowKeyboard: true, allowClipboard: true };
    vi.mocked(useSession).mockReturnValue(current);
    const { container } = render(<App />);

    // Floating action bar
    expect(screen.getByRole('button', { name: /ativar controle/i })).toBeTruthy();
    expect((container.querySelector('.stage-video-viewport') as HTMLElement).style.cursor).toBe('default');

    // Click to lock
    fireEvent.click(screen.getByRole('button', { name: /ativar controle/i }));
    expect(screen.getByRole('button', { name: /lock ativo/i })).toBeTruthy();
    expect((container.querySelector('.stage-video-viewport') as HTMLElement).style.cursor).toBe('crosshair');
    expect(screen.getByRole('button', { name: /clipboard/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /win/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ctrl\+alt\+del/i })).toBeTruthy();

    // Click Win button
    fireEvent.click(screen.getByRole('button', { name: /win/i }));
    expect(current.sendRemoteInput).toHaveBeenCalledWith({ kind: 'special', action: 'win' });
  });

  it('toggles Remote Control Lock Mode with Ctrl+Alt+A shortcut, captures Ctrl+W and switches monitor with Ctrl+Alt+2', () => {
    const fakeStream = { getTracks: () => [], getVideoTracks: () => [{ readyState: 'live' }] } as unknown as MediaStream;
    const current = model(readyState({
      phase: 'connected',
      remoteUserName: 'Alex',
    }));
    current.remoteStream = fakeStream;
    current.remoteMediaPhase = 'sharing';
    current.remotePeerControlConfig = { enabled: true, allowMouse: true, allowKeyboard: true, allowClipboard: true };
    vi.mocked(useSession).mockReturnValue(current);
    render(<App />);

    // Press Ctrl+Alt+A to lock
    fireEvent.keyDown(window, { key: 'a', code: 'KeyA', ctrlKey: true, altKey: true });

    // Should show lock active button
    expect(screen.getByRole('button', { name: /lock ativo/i })).toBeTruthy();

    // Now press Ctrl+W — should be sent to remote instead of closing local window
    fireEvent.keyDown(window, { key: 'w', code: 'KeyW', ctrlKey: true });
    expect(current.sendRemoteInput).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'key-down', code: 'KeyW', key: 'w', ctrlKey: true })
    );

    // Switch monitor with Ctrl+Alt+2
    fireEvent.keyDown(window, { key: '2', code: 'Digit2', ctrlKey: true, altKey: true });
    expect(current.sendSelectMonitor).toHaveBeenCalledWith(1);

    // Press Ctrl+Alt+A again to unlock
    fireEvent.keyDown(window, { key: 'a', code: 'KeyA', ctrlKey: true, altKey: true });
    expect(screen.getByRole('button', { name: /ativar controle/i })).toBeTruthy();
  });
});



















