import { desktopCapturer, type DesktopCapturerSource, type DisplayMediaRequestHandlerHandlerRequest, type WebFrameMain } from 'electron';
import { fault } from '../../shared/session/errors';
import type { ScreenSource } from '../../shared/screen-source';

type DisplayCallback = (streams: { video?: DesktopCapturerSource }) => void;

const sourceOptions = { types: ['screen'] as ('screen' | 'window')[], thumbnailSize: { width: 480, height: 270 } };
const validationOptions = { types: ['screen'] as ('screen' | 'window')[], thumbnailSize: { width: 0, height: 0 } };

export class ScreenCaptureService {
  private readonly selections = new Map<number, string>();

  constructor(private readonly getSources: typeof desktopCapturer.getSources = desktopCapturer.getSources.bind(desktopCapturer)) {}

  async listSources(): Promise<ScreenSource[]> {
    const sources = await this.getSources(sourceOptions);
    return sources.map((source) => ({ id: source.id, name: source.name, thumbnailDataUrl: source.thumbnail.toDataURL() }));
  }

  async selectSource(webContentsId: number, sourceId: string): Promise<void> {
    const source = await this.findSource(sourceId);
    if (!source) throw fault('source-unavailable', 'O monitor selecionado não está mais disponível.', true);
    this.selections.set(webContentsId, source.id);
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
    if (!request.frame || request.frame !== expectedFrame || expectedWebContentsId === undefined || !request.videoRequested || request.audioRequested || !request.userGesture) return callback({});
    const sourceId = this.selections.get(expectedWebContentsId);
    this.selections.delete(expectedWebContentsId);
    if (!sourceId) return callback({});
    try {
      const source = await this.findSource(sourceId);
      callback(source ? { video: source } : {});
    } catch {
      callback({});
    }
  }

  private async findSource(sourceId: string): Promise<DesktopCapturerSource | undefined> {
    const sources = await this.getSources(validationOptions);
    return sources.find((source) => source.id === sourceId);
  }
}
