import type { StateStore, SyncHistory } from '@adp-calendar/core';
import { describe, expect, it } from 'vitest';
import { runExtensionSync } from '../src/run-sync.ts';
import {
  createSyncHistory,
  LAST_SUCCESS_AT_KEY,
  LAST_SUCCESS_SUMMARY_KEY,
  type KeyValueStorage,
} from '../src/storage.ts';
import { lastSuccessText, type MessageKey } from '../src/sync-status.ts';
import {
  ensureDailySyncAlarm,
  PAGE_LOAD_MESSAGE,
  SYNC_ALARM_NAME,
  SYNC_NOW_MESSAGE,
  syncRequestFor,
} from '../src/sync-trigger.ts';

const now = '2026-10-03T17:00:00.000Z';
const recent = {
  at: '2026-09-30T07:24:00.000Z',
  summary: { created: 1, updated: 2, restored: 3, deleted: 4 },
};

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

function historyFrom(initial: typeof recent | null): SyncHistory & { reads: number } {
  return {
    reads: 0,
    async getLastSuccess() {
      this.reads += 1;
      return initial;
    },
    async setLastSuccess() {
      throw new Error('last success should stay stored only inside Sync');
    },
  };
}

function idleState(): StateStore {
  return {
    async getPositionId() {
      throw new Error('position should not be read when Sync is not due');
    },
    async setPositionId() {},
    async clearPositionId() {},
  };
}

function translate(key: MessageKey, substitution?: string | string[]): string {
  const values = substitution === undefined ? '' : Array.isArray(substitution) ? substitution.join('|') : substitution;
  return `${key}:${values}`;
}

describe('Sync triggers', () => {
  it('runs a page load and the daily alarm only when due, and always runs Sync now', () => {
    expect(syncRequestFor({ message: { type: PAGE_LOAD_MESSAGE } })).toEqual({ forced: false });
    expect(syncRequestFor({ alarmName: SYNC_ALARM_NAME })).toEqual({ forced: false });
    expect(syncRequestFor({ message: { type: SYNC_NOW_MESSAGE } })).toEqual({ forced: true });
    expect(syncRequestFor({ alarmName: 'other' })).toBeNull();
    expect(syncRequestFor({ message: { type: 'nope' } })).toBeNull();
  });

  it('creates one daily alarm and does not reset it once it exists', async () => {
    const created: Array<{ name: string; periodInMinutes: number }> = [];
    await ensureDailySyncAlarm({
      async get() {
        return undefined;
      },
      async create(name, info) {
        created.push({ name, ...info });
      },
    });
    await ensureDailySyncAlarm({
      async get(name) {
        return { name };
      },
      async create() {
        throw new Error('alarm should not be recreated');
      },
    });

    expect(created).toEqual([{ name: SYNC_ALARM_NAME, periodInMinutes: 1440 }]);
  });

  it('does not touch Google or ADP when a non-forced trigger is not due', async () => {
    let launches = 0;
    const history = historyFrom(recent);
    const result = await runExtensionSync({
      clientId: 'client.apps.googleusercontent.com',
      redirectUri: 'https://abcdefghijklmnop.chromiumapp.org/',
      now: () => new Date(now),
      tokens: { async load() { return null; }, async save() {} },
      launch() {
        launches += 1;
        return Promise.resolve(null);
      },
      state: idleState(),
      history,
      adp: {
        async fetchMonthlyView() {
          throw new Error('ADP should not be fetched');
        },
      },
      timeZone: 'America/Vancouver',
      openCalendar() {
        throw new Error('calendar should not open');
      },
      forced: false,
    });

    expect(result).toEqual({ ok: true, skipped: 'not-due' });
    expect(launches).toBe(0);
    expect(history.reads).toBe(1);
  });

  it('starts Google sign-in for Sync now even when a success is only 3.4 days old', async () => {
    let launches = 0;
    const result = await runExtensionSync({
      clientId: 'client.apps.googleusercontent.com',
      redirectUri: 'https://abcdefghijklmnop.chromiumapp.org/',
      now: () => new Date(now),
      tokens: { async load() { return null; }, async save() {} },
      launch() {
        launches += 1;
        return Promise.resolve(null);
      },
      state: idleState(),
      history: historyFrom(recent),
      adp: {
        async fetchMonthlyView() {
          throw new Error('ADP should wait until Google signs in');
        },
      },
      timeZone: 'America/Vancouver',
      openCalendar() {
        throw new Error('calendar should not open');
      },
      forced: true,
    });

    expect(result).toEqual({ ok: false, reason: 'google-auth' });
    expect(launches).toBe(2);
  });
});

describe('last successful Sync', () => {
  it('shows the stored time and counts, or that none has succeeded', () => {
    expect(lastSuccessText(null, translate, (at) => at)).toBe('noLastSync:');
    expect(lastSuccessText(recent, translate, (at) => `local ${at}`)).toBe(
      'lastSync:local 2026-09-30T07:24:00.000Z|1|2|3|4',
    );
  });

  it('stores the instant and summary only as those two keys', async () => {
    const storage = memoryStorage();
    const history = createSyncHistory(storage);
    expect(await history.getLastSuccess()).toBeNull();

    await history.setLastSuccess(recent);
    expect(storage.items).toEqual({
      [LAST_SUCCESS_AT_KEY]: recent.at,
      [LAST_SUCCESS_SUMMARY_KEY]: recent.summary,
    });
    expect(await history.getLastSuccess()).toEqual(recent);

    storage.items[LAST_SUCCESS_AT_KEY] = 'not-a-time';
    expect(await history.getLastSuccess()).toBeNull();
  });
});
