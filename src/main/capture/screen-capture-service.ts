import { desktopCapturer, type DesktopCapturerSource, type DisplayMediaRequestHandlerHandlerRequest, type WebFrameMain } from 'electron';
import { fault } from '../../shared/session/errors';
import type { ScreenSource } from '../../shared/screen-source';
import type { ScreenSelection } from '../../shared/screen-source';

type DisplayCallback = (streams: { video?: DesktopCapturerSource; audio?: 'loopback' }) => void;

const sourceOptions = { types: ['screen'] as ('screen' | 'window')[], thumbnailSize: { width: 480, height: 270 } };
const validationOptions = { types: ['screen'] as ('screen' | 'window')[], thumbnailSize: { width: 0, height: 0 } };

export class ScreenCaptureService {
  private readonly selections = new Map<number, ScreenSelection>();

  constructor(private readonly getSources: typeof desktopCapturer.getSources = desktopCapturer.getSources.bind(desktopCapturer)) {}

  async listSources(): Promise<ScreenSource[]> {
    const sources = await this.getSources(sourceOptions);
    return sources.map((source) => ({ id: source.id, name: source.name, thumbnailDataUrl: source.thumbnail.toDataURL() }));
  }

  async selectSource(webContentsId: number, selection: ScreenSelection): Promise<void> {
    const source = await this.findSource(selection.sourceId);
    if (!source) throw fault('source-unavailable', 'O monitor selecionado não está mais disponível.', true);
    this.selections.set(webContentsId, { sourceId: source.id, includeSystemAudio: selection.includeSystemAudio });
  }

  clearSource(webContentsId: number): void {
    this.selections.delete(webContentsId);
  }

  async handleDisplayRequest(
    request: DisplayMediaRequestHandlerHandlerRequest,
    callback: DisplayCallback,
    expectedFrame: WebFrameMain | null | undefined,
    expectedWebContentsId: number | undefined,
  ): Promise<void> {
    if (!request.frame || request.frame !== expectedFrame || expectedWebContentsId === undefined || !request.videoRequested || !request.userGesture || !this.hasExpectedOrigin(request.securityOrigin, expectedFrame)) return callback({});
    const selection = this.selections.get(expectedWebContentsId);
    this.selections.delete(expectedWebContentsId);
    if (!selection || request.audioRequested !== selection.includeSystemAudio) return callback({});
    try {
      const source = await this.findSource(selection.sourceId);
      callback(source ? { video: source, ...(selection.includeSystemAudio ? { audio: 'loopback' as const } : {}) } : {});
    } catch {
      callback({});
    }
  }

  private async findSource(sourceId: string): Promise<DesktopCapturerSource | undefined> {
    const sources = await this.getSources(validationOptions);
    return sources.find((source) => source.id === sourceId);
  }

  private hasExpectedOrigin(origin: string, frame: WebFrameMain | null | undefined): boolean {
    if (!frame) return false;
    if (frame.url.startsWith('file:')) return origin === 'file://';
    try {
      return new URL(frame.url).origin === origin;
    } catch {
      return false;
    }
  }
}
