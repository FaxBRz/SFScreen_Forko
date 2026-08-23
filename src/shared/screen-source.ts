export interface ScreenSource {
  id: string;
  name: string;
  thumbnailDataUrl: string;
}

export interface ScreenSelection {
  sourceId: string;
  includeSystemAudio: boolean;
  allowWithoutGesture?: boolean;
}

export type CaptureAuthorizationState = 'idle' | 'selected' | 'request-received' | 'authorized' | 'rejected-frame' | 'rejected-origin' | 'rejected-gesture' | 'rejected-video' | 'rejected-selection' | 'rejected-audio' | 'source-unavailable';
