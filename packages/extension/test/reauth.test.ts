import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ADP_MY_SCHEDULE_URL, ADP_SIGN_IN_URL, SIGN_IN_NOTIFICATION_ID, openSignInFromNotification, reauthSyncRequest } from '../src/reauth.ts';
import {
  REAUTH_TAB_ID_KEY,
  SIGN_IN_NOTIFIED_KEY,
  SYNC_ATTEMPTS_KEY,
  createReauthTabs,
  createSyncDiagnostics,
  type KeyValueStorage,
} from '../src/storage.ts';
import { PAGE_LOAD_MESSAGE, syncRequestFor } from '../src/sync-trigger.ts';

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

describe('ADP sign-in notification', () => {
  it('uses the one sentence asking the employee to sign in again', () => {
    const path = resolve(dirname(fileURLToPath(import.meta.url)), '../public/_locales/en/messages.json');
    const messages = JSON.parse(readFileSync(path, 'utf8')) as { needsSignIn: { message: string } };
    expect(messages.needsSignIn.message).toBe('ADP needs you to sign in again');
  });

  it('opens the ADP sign-in page from that notification and ignores other ids', async () => {
    const opened: string[] = [];
    const remembered: number[] = [];
    const openedFromSignIn = await openSignInFromNotification(SIGN_IN_NOTIFICATION_ID, {
      async createTab(url) {
        opened.push(url);
        return 42;
      },
      async rememberTab(tabId) {
        remembered.push(tabId);
      },
    });
    const ignored = await openSignInFromNotification('other', {
      async createTab() {
        throw new Error('other notifications must not open a tab');
      },
      async rememberTab() {
        throw new Error('other notifications must not remember a tab');
      },
    });

    expect(openedFromSignIn).toBe(true);
    expect(ignored).toBe(false);
    expect(opened).toEqual([ADP_SIGN_IN_URL]);
    expect(ADP_SIGN_IN_URL).toBe('https://workforcenow.adp.com/theme/index.html');
    expect(remembered).toEqual([42]);
  });

  it('points My Schedule at the route that embeds the Position', () => {
    expect(ADP_MY_SCHEDULE_URL).toBe(
      'https://workforcenow.adp.com/theme/index.html#/Myself/MyselfTabTimecardsAttendanceSchCategoryMonthlySchedule',
    );
  });

  it('forces Sync when the sign-in tab reaches Workforce Now, and only that tab', () => {
    const pageLoad = syncRequestFor({ message: { type: PAGE_LOAD_MESSAGE } });
    expect(reauthSyncRequest(pageLoad, 42, 42)).toEqual({ forced: true, clearReauthTab: true });
    expect(reauthSyncRequest(pageLoad, 7, 42)).toEqual({ forced: false, clearReauthTab: false });
    expect(reauthSyncRequest(pageLoad, undefined, 42)).toEqual({ forced: false, clearReauthTab: false });
    expect(reauthSyncRequest(null, 42, 42)).toBeNull();
  });

  it('stores the sign-in flag, the attempt log, and the return tab locally', async () => {
    const storage = memoryStorage({
      [SYNC_ATTEMPTS_KEY]: [{ at: 'not-a-time', sinceLastSuccessMs: 1, outcome: 'success' }, 'nope'],
      [REAUTH_TAB_ID_KEY]: 1.5,
    });
    const diagnostics = createSyncDiagnostics(storage);
    const tabs = createReauthTabs(storage);

    expect(await diagnostics.getSignInNotified()).toBe(false);
    expect(await diagnostics.getAttempts()).toEqual([]);
    expect(await tabs.get()).toBeNull();

    await diagnostics.setSignInNotified(true);
    await diagnostics.setAttempts([
      { at: '2026-10-03T17:00:00.000Z', sinceLastSuccessMs: 1000, outcome: 'needs-sign-in' },
    ]);
    await tabs.set(42);

    expect(storage.items[SIGN_IN_NOTIFIED_KEY]).toBe(true);
    expect(storage.items[SYNC_ATTEMPTS_KEY]).toEqual([
      { at: '2026-10-03T17:00:00.000Z', sinceLastSuccessMs: 1000, outcome: 'needs-sign-in' },
    ]);
    expect(storage.items[REAUTH_TAB_ID_KEY]).toBe(42);
    expect(await tabs.get()).toBe(42);

    await tabs.clear();
    expect(await tabs.get()).toBeNull();
  });
});
