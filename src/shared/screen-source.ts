export interface ScreenSource {
  id: string;
  name: string;
  thumbnailDataUrl: string;
}

export interface ScreenSelection {
  sourceId: string;
  includeSystemAudio: boolean;
}
