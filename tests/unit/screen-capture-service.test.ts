import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ desktopCapturer: { getSources: vi.fn() } }));

import { ScreenCaptureService } from '../../src/main/capture/screen-capture-service';

const source = { id: 'screen:1', name: 'Monitor 1', thumbnail: { toDataURL: () => 'data:image/png;base64,test' } };
const frame = {};
const request = (overrides: Record<string, unknown> = {}): never => ({ frame, videoRequested: true, audioRequested: false, userGesture: true, ...overrides }) as never;

describe('screen capture authorization', () => {
  it('authorizes the selected monitor once and only for the expected frame', async () => {
    const service = new ScreenCaptureService(vi.fn(async () => [source]) as never);
    await service.selectSource(9, source.id);
    const first = vi.fn();
    await service.handleDisplayRequest(request(), first, frame as never, 9);
    expect(first).toHaveBeenCalledWith({ video: source });
    const second = vi.fn();
    await service.handleDisplayRequest(request(), second, frame as never, 9);
    expect(second).toHaveBeenCalledWith({});
  });

  it('rejects audio, a missing selection, and a request from another frame', async () => {
    const service = new ScreenCaptureService(vi.fn(async () => [source]) as never);
    await service.selectSource(9, source.id);
    const deniedAudio = vi.fn();
    await service.handleDisplayRequest(request({ audioRequested: true }), deniedAudio, frame as never, 9);
    expect(deniedAudio).toHaveBeenCalledWith({});
    const deniedFrame = vi.fn();
    await service.handleDisplayRequest(request({ frame: {} }), deniedFrame, frame as never, 9);
    expect(deniedFrame).toHaveBeenCalledWith({});
  });
});
