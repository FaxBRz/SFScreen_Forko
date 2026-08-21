import type { SFScreenApi } from '../shared/session/types';

declare global {
  interface Window {
    sfscreen: SFScreenApi;
  }
}

export {};
