import type { ClikApi } from '../../preload/index.js';

declare global {
  interface Window {
    clik: ClikApi;
  }
}

export {};
