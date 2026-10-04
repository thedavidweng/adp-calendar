import { browser } from 'wxt/browser';
import type { KeyValueStorage } from '../storage.ts';

export function extensionStorage(): KeyValueStorage {
  return {
    async get(keys) {
      return (await browser.storage.local.get([...keys])) as Record<string, unknown>;
    },
    async set(items) {
      await browser.storage.local.set(items);
    },
  };
}
