import type { StateStore } from '@adp-calendar/core';

export const POSITION_KEY = 'positionId';
export const TIME_ZONE_KEY = 'timeZone';

export interface GmValueStore {
  getValue(key: string): unknown | Promise<unknown>;
  setValue(key: string, value: unknown): void | Promise<void>;
}

export interface GmState extends StateStore {
  getTimeZone(browserZone: string): Promise<string>;
  setTimeZone(timeZone: string): Promise<void>;
}

export function configuredTimeZone(stored: unknown, browserZone: string): string {
  if (typeof stored !== 'string') {
    return browserZone;
  }
  const trimmed = stored.trim();
  return trimmed.length > 0 ? trimmed : browserZone;
}

export function createGmState(gm: GmValueStore): GmState {
  return {
    async getPositionId() {
      const value = await gm.getValue(POSITION_KEY);
      return typeof value === 'string' && value.length > 0 ? value : null;
    },
    async setPositionId(positionId) {
      await gm.setValue(POSITION_KEY, positionId);
    },
    async clearPositionId() {
      await gm.setValue(POSITION_KEY, null);
    },
    async getTimeZone(browserZone) {
      return configuredTimeZone(await gm.getValue(TIME_ZONE_KEY), browserZone);
    },
    async setTimeZone(timeZone) {
      await gm.setValue(TIME_ZONE_KEY, timeZone.trim());
    },
  };
}

export function registerTimeZoneMenu(deps: {
  caption: string;
  prompt: string;
  registerCommand(caption: string, onClick: () => void): void;
  getStored(): unknown | Promise<unknown>;
  setStored(value: string): void | Promise<void>;
  ask(message: string, current: string): string | null;
  browserZone(): string;
}): void {
  deps.registerCommand(deps.caption, () => {
    void (async () => {
      const browserZone = deps.browserZone();
      const current = configuredTimeZone(await deps.getStored(), browserZone);
      const next = deps.ask(deps.prompt, current === browserZone ? '' : current);
      if (next === null) {
        return;
      }
      await deps.setStored(next.trim());
    })();
  });
}
