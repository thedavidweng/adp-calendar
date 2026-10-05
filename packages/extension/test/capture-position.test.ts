import type { StateStore } from '@adp-calendar/core';
import { describe, expect, it } from 'vitest';
import { capturePosition } from '../src/capture-position.ts';
import { createStoredState, createTokenStore, POSITION_KEY, type KeyValueStorage } from '../src/storage.ts';

const encoded = `https://workforcenow.adp.com/theme/legacyAppShell.html?href=${encodeURIComponent(
  '/TLMWeb/MDFHost?pg=430&TLM_POSID=POS-0001',
)}`;

function memoryStorage(initial: Record<string, unknown> = {}): KeyValueStorage & { items: Record<string, unknown> } {
  const items = { ...initial };
  return {
    items,
    async get(keys) {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (key in items) {
          result[key] = items[key];
        }
      }
      return result;
    },
    async set(next) {
      Object.assign(items, next);
    },
  };
}

function stateSpy(): StateStore & { writes: string[] } {
  let stored: string | null = null;
  const writes: string[] = [];
  return {
    writes,
    async getPositionId() {
      return stored;
    },
    async setPositionId(positionId) {
      stored = positionId;
      writes.push(positionId);
    },
    async clearPositionId() {
      stored = null;
      writes.push('cleared');
    },
  };
}

describe('Position capture', () => {
  it('caches the Position from My Schedule and ignores other pages', async () => {
    const state = stateSpy();
    expect(await capturePosition(['https://workforcenow.adp.com/theme/index.html'], state)).toBeNull();
    expect(state.writes).toEqual([]);

    await expect(capturePosition([encoded], state)).resolves.toBe('POS-0001');
    await capturePosition([encoded], state);
    expect(state.writes).toEqual(['POS-0001']);
  });

  it('stores the Position id and the Google access token, and nothing else', async () => {
    const storage = memoryStorage();
    const state = createStoredState(storage);
    await state.setPositionId('POS-0001');
    await createTokenStore(storage).save({ accessToken: 'ya29.token', expiresAt: 10 });

    expect(storage.items).toEqual({
      [POSITION_KEY]: 'POS-0001',
      googleAccessToken: 'ya29.token',
      googleAccessTokenExpiresAt: 10,
      googleAccountEmail: null,
    });
    expect(JSON.stringify(storage.items)).not.toMatch(/cookie|password|SMSESSION/i);
  });
});
