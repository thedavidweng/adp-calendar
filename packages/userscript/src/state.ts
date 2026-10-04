import type { StateStore } from '@adp-calendar/core';

export const POSITION_KEY = 'positionId';

export interface GmValueStore {
  getValue(key: string): unknown | Promise<unknown>;
  setValue(key: string, value: unknown): void | Promise<void>;
}

export function createGmState(gm: GmValueStore): StateStore {
  return {
    async getPositionId() {
      const value = await gm.getValue(POSITION_KEY);
      return typeof value === 'string' && value.length > 0 ? value : null;
    },
    async setPositionId(positionId) {
      await gm.setValue(POSITION_KEY, positionId);
    },
  };
}
