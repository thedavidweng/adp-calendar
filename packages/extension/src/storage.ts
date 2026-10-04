import type { StateStore } from '@adp-calendar/core';
import type { TokenStore } from './google-auth.ts';

export const POSITION_KEY = 'positionId';
export const GOOGLE_ACCESS_TOKEN_KEY = 'googleAccessToken';
export const GOOGLE_ACCESS_TOKEN_EXPIRES_KEY = 'googleAccessTokenExpiresAt';

export interface KeyValueStorage {
  get(keys: readonly string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export function createStoredState(storage: KeyValueStorage): StateStore {
  return {
    async getPositionId() {
      const items = await storage.get([POSITION_KEY]);
      const value = items[POSITION_KEY];
      return typeof value === 'string' && value.length > 0 ? value : null;
    },
    async setPositionId(positionId) {
      await storage.set({ [POSITION_KEY]: positionId });
    },
    async clearPositionId() {
      await storage.set({ [POSITION_KEY]: null });
    },
  };
}

export function createTokenStore(storage: KeyValueStorage): TokenStore {
  return {
    async load() {
      const items = await storage.get([GOOGLE_ACCESS_TOKEN_KEY, GOOGLE_ACCESS_TOKEN_EXPIRES_KEY]);
      const accessToken = items[GOOGLE_ACCESS_TOKEN_KEY];
      const expiresAt = items[GOOGLE_ACCESS_TOKEN_EXPIRES_KEY];
      if (typeof accessToken !== 'string' || accessToken.length === 0 || typeof expiresAt !== 'number') {
        return null;
      }
      return { accessToken, expiresAt };
    },
    async save(token) {
      await storage.set({
        [GOOGLE_ACCESS_TOKEN_KEY]: token.accessToken,
        [GOOGLE_ACCESS_TOKEN_EXPIRES_KEY]: token.expiresAt,
      });
    },
  };
}
