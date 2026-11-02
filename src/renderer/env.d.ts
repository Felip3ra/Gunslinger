import type { GunslingerApi } from '../shared/ipc-contract';

declare global {
  interface Window {
    gunslinger: GunslingerApi;
  }
}

export {};
