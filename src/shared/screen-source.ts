export interface ScreenSource {
  id: string;
  name: string;
  thumbnailDataUrl: string;
}

export interface SFScreenApi {
  listScreenSources: () => Promise<ScreenSource[]>;
  exportSignalFile: (kind: 'invite' | 'answer', contents: string) => Promise<boolean>;
  importSignalFile: () => Promise<string | null>;
}
