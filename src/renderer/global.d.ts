import type { SFScreenApi } from '../shared/session/types';
import type { RuntimeWindowApi } from '../shared/ipc';

declare global {
  interface Window {
    sfscreen: SFScreenApi & RuntimeWindowApi;
  }
}

export {};
