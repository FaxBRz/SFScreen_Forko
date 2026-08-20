import type { SFScreenApi } from '../shared/screen-source';

declare global {
  interface Window {
    sfscreen: SFScreenApi;
  }
}

export {};
