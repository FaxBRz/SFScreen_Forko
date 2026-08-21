import { desktopCapturer, type DesktopCapturerSource, type DisplayMediaRequestHandlerHandlerRequest, type WebFrameMain } from 'electron';
import { fault } from '../../shared/session/errors';
import type { CaptureAuthorizationState, ScreenSource, ScreenSelection } from '../../shared/screen-source';

type DisplayCallback = (streams: { video?: DesktopCapturerSource; audio?: 'loopback' }) => void;

const sourceOptions = { types: ['screen'] as ('screen' | 'window')[], thumbnailSize: { width: 480, height: 270 } };
const validationOptions = { types: ['screen'] as ('screen' | 'window')[], thumbnailSize: { width: 0, height: 0 } };

export class ScreenCaptureService {
  private readonly selections = new Map<number, ScreenSelection>();
  private readonly authorizationStates = new Map<number, CaptureAuthorizationState>();

  constructor(private readonly getSources: typeof desktopCapturer.getSources = desktopCapturer.getSources.bind(desktopCapturer)) {}

  async listSources(): Promise<ScreenSource[]> {
    const sources = await this.getSources(sourceOptions);
    return sources.map((source) => ({ id: source.id, name: source.name, thumbnailDataUrl: source.thumbnail.toDataURL() }));
  }

  async selectSource(webContentsId: number, selection: ScreenSelection): Promise<void> {
    const source = await this.findSource(selection.sourceId);
    if (!source) throw fault('source-unavailable', 'O monitor selecionado não está mais disponível.', true);
    this.selections.set(webContentsId, { sourceId: source.id, includeSystemAudio: selection.includeSystemAudio });
    this.authorizationStates.set(webContentsId, 'selected');
  }

  clearSource(webContentsId: number): void {
    this.selections.delete(webContentsId);
    this.authorizationStates.set(webContentsId, 'idle');
  }

  getAuthorizationState(webContentsId: number): CaptureAuthorizationState {
    return this.authorizationStates.get(webContentsId) ?? 'idle';
  }

  hasSelection(webContentsId: number): boolean {
    return this.selections.has(webContentsId);
  }

  async handleDisplayRequest(
    request: DisplayMediaRequestHandlerHandlerRequest,
    callback: DisplayCallback,
    expectedFrame: WebFrameMain | null | undefined,
    expectedWebContentsId: number | undefined,
  ): Promise<void> {
    if (expectedWebContentsId === undefined || !this.isExpectedFrame(request.frame, expectedFrame)) return this.reject(expectedWebContentsId, 'rejected-frame');
    if (!request.videoRequested) return this.reject(expectedWebContentsId, 'rejected-video');
    if (!request.userGesture) return this.reject(expectedWebContentsId, 'rejected-gesture');
    const selection = this.selections.get(expectedWebContentsId);
    this.selections.delete(expectedWebContentsId);
    if (!selection) {
      this.authorizationStates.set(expectedWebContentsId, 'rejected-selection');
      return;
    }
    if (request.audioRequested !== selection.includeSystemAudio) {
      this.authorizationStates.set(expectedWebContentsId, 'rejected-audio');
      return;
    }
    this.authorizationStates.set(expectedWebContentsId, 'request-received');
    try {
      const source = await this.findSource(selection.sourceId);
      this.authorizationStates.set(expectedWebContentsId, source ? 'authorized' : 'source-unavailable');
      callback(source ? { video: source, ...(selection.includeSystemAudio ? { audio: 'loopback' as const } : {}) } : {});
    } catch {
      this.authorizationStates.set(expectedWebContentsId, 'source-unavailable');
    }
  }

  private async findSource(sourceId: string): Promise<DesktopCapturerSource | undefined> {
    const sources = await this.getSources(validationOptions);
    return sources.find((source) => source.id === sourceId);
  }

  private isExpectedFrame(requestFrame: WebFrameMain | null, expectedFrame: WebFrameMain | null | undefined): boolean {
    if (requestFrame === null || expectedFrame === null || expectedFrame === undefined) return false;
    if (requestFrame === expectedFrame) return true;
    return typeof requestFrame.processId === 'number'
      && typeof requestFrame.routingId === 'number'
      && requestFrame.processId === expectedFrame.processId
      && requestFrame.routingId === expectedFrame.routingId;
  }

  private reject(webContentsId: number | undefined, state: Extract<CaptureAuthorizationState, `rejected-${string}`>): void {
    if (webContentsId !== undefined) this.authorizationStates.set(webContentsId, state);
  }
}
