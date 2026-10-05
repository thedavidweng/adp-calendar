import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ShiftCalendar, ShiftCalendarEvent, StateStore, SyncDiagnostics } from '@adp-calendar/core';
import { describe, expect, it } from 'vitest';
import { extensionCommand, ONBOARDING_MESSAGE_KEYS, ONBOARDING_PAGE, onboardingStep } from '../src/onboarding.ts';
import { runExtensionSync } from '../src/run-sync.ts';
import {
  disconnectExtension,
  maybeOpenInstallPage,
  readOnboardingProgress,
  revokeGoogleAccessToken,
  saveTimeZone,
  timeZoneForSync,
  TIME_ZONE_KEY,
} from '../src/settings.ts';
import {
  GOOGLE_ACCESS_TOKEN_EXPIRES_KEY,
  GOOGLE_ACCESS_TOKEN_KEY,
  LAST_SUCCESS_AT_KEY,
  LAST_SUCCESS_SUMMARY_KEY,
  POSITION_KEY,
  createTokenStore,
  type KeyValueStorage,
} from '../src/storage.ts';
import { PAGE_LOAD_MESSAGE, SYNC_NOW_MESSAGE } from '../src/sync-trigger.ts';

const now = '2026-10-03T17:00:00.000Z';
const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../parser/test/fixtures');
const october = JSON.parse(readFileSync(resolve(fixtureDir, 'monthlyview-2026-10.redacted.json'), 'utf8')) as unknown;
const messages = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../public/_locales/en/messages.json'), 'utf8'),
) as Record<string, { message?: string }>;

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

function state(positionId: string): StateStore {
  return {
    async getPositionId() {
      return positionId;
    },
    async setPositionId() {},
    async clearPositionId() {},
  };
}

function diagnostics(): SyncDiagnostics {
  let attempts: Awaited<ReturnType<SyncDiagnostics['getAttempts']>> = [];
  return {
    async getSignInNotified() {
      return false;
    },
    async setSignInNotified() {},
    async getAttempts() {
      return attempts;
    },
    async setAttempts(next) {
      attempts = [...next];
    },
  };
}

describe('install page', () => {
  it('opens once on install and stays closed on update or a second install', async () => {
    const storage = memoryStorage();
    const opened: string[] = [];
    const open = async (url: string) => {
      opened.push(url);
    };

    expect(await maybeOpenInstallPage('update', { storage, pageUrl: ONBOARDING_PAGE, open })).toBe(false);
    expect(await maybeOpenInstallPage('install', { storage, pageUrl: ONBOARDING_PAGE, open })).toBe(true);
    expect(await maybeOpenInstallPage('install', { storage, pageUrl: ONBOARDING_PAGE, open })).toBe(false);
    expect(opened).toEqual([ONBOARDING_PAGE]);
  });
});

describe('onboarding steps', () => {
  it('walks signed-in, then a detected My Schedule visit, then Google, then the first Sync', () => {
    const fresh = {
      signedInAcknowledged: false,
      positionCaptured: false,
      googleConnected: false,
      firstSyncDone: false,
    };
    expect(onboardingStep(fresh)).toBe('adp-signed-in');
    expect(onboardingStep({ ...fresh, positionCaptured: true, googleConnected: true, firstSyncDone: true })).toBe(
      'adp-signed-in',
    );
    expect(onboardingStep({ ...fresh, signedInAcknowledged: true })).toBe('my-schedule');
    expect(onboardingStep({ ...fresh, signedInAcknowledged: true, positionCaptured: true })).toBe('google');
    expect(
      onboardingStep({ ...fresh, signedInAcknowledged: true, positionCaptured: true, googleConnected: true }),
    ).toBe('first-sync');
    expect(
      onboardingStep({
        signedInAcknowledged: true,
        positionCaptured: true,
        googleConnected: true,
        firstSyncDone: true,
      }),
    ).toBe('done');
  });

  it('reads each step from stored Position, Google token, and Sync success', async () => {
    const storage = memoryStorage();
    expect(await readOnboardingProgress(storage, 'America/Vancouver')).toMatchObject({
      signedInAcknowledged: false,
      positionCaptured: false,
      googleConnected: false,
      firstSyncDone: false,
      timeZoneOverride: '',
      syncTimeZone: 'America/Vancouver',
    });

    storage.items.onboardingSignedIn = true;
    storage.items[POSITION_KEY] = 'POS-0001';
    storage.items[GOOGLE_ACCESS_TOKEN_KEY] = 'ya29.token';
    storage.items[GOOGLE_ACCESS_TOKEN_EXPIRES_KEY] = 1;
    storage.items[LAST_SUCCESS_AT_KEY] = now;
    storage.items[LAST_SUCCESS_SUMMARY_KEY] = { created: 1, updated: 0, restored: 0, deleted: 0 };

    expect(await readOnboardingProgress(storage, 'America/Vancouver')).toMatchObject({
      signedInAcknowledged: true,
      positionCaptured: true,
      googleConnected: true,
      firstSyncDone: true,
    });
  });

  it('keeps Connect Google separate from a forced Sync now', () => {
    expect(extensionCommand({ type: 'connect-google' })).toEqual({ type: 'connect-google' });
    expect(extensionCommand({ type: SYNC_NOW_MESSAGE })).toEqual({ type: 'sync', forced: true });
    expect(extensionCommand({ type: PAGE_LOAD_MESSAGE })).toEqual({ type: 'sync', forced: false });
    expect(extensionCommand({ type: 'unknown' })).toBeNull();
  });
});

describe('time zone override', () => {
  it('uses the browser zone until a valid override is saved', async () => {
    const storage = memoryStorage();
    expect(await timeZoneForSync(storage, 'America/Vancouver')).toBe('America/Vancouver');

    expect(await saveTimeZone(storage, '  America/Toronto  ')).toBe('saved');
    expect(storage.items[TIME_ZONE_KEY]).toBe('America/Toronto');
    expect(await timeZoneForSync(storage, 'America/Vancouver')).toBe('America/Toronto');

    expect(await saveTimeZone(storage, '   ')).toBe('saved');
    expect(await timeZoneForSync(storage, 'America/Vancouver')).toBe('America/Vancouver');

    expect(await saveTimeZone(storage, 'Not/AZone')).toBe('invalid');
    expect(storage.items[TIME_ZONE_KEY]).toBe('');
    storage.items[TIME_ZONE_KEY] = 'Not/AZone';
    expect(await timeZoneForSync(storage, 'America/Vancouver')).toBe('America/Vancouver');
  });

  it('passes the override to Sync so the next Sync writes that zone on the Shift', async () => {
    const vancouver = await syncedZone('America/Vancouver');
    const toronto = await syncedZone('America/Toronto');
    const wall = { dateTime: '2026-10-05T17:00:00' };

    expect(vancouver.createdZone).toBe('America/Vancouver');
    expect(toronto.createdZone).toBe('America/Toronto');
    expect(vancouver.shift).toMatchObject({ start: { ...wall, timeZone: 'America/Vancouver' } });
    expect(toronto.shift).toMatchObject({
      start: { ...wall, timeZone: 'America/Toronto' },
      end: { dateTime: '2026-10-05T22:30:00', timeZone: 'America/Toronto' },
    });
    expect(wallClock('2026-10-06T00:00:00Z', 'America/Vancouver')).toBe('2026-10-05 17:00');
    expect(wallClock('2026-10-06T00:00:00Z', 'America/Toronto')).toBe('2026-10-05 20:00');
  });
});

describe('disconnect', () => {
  it('revokes the Google token and then clears every stored key', async () => {
    const storage = memoryStorage({
      [GOOGLE_ACCESS_TOKEN_KEY]: 'ya29.token',
      [GOOGLE_ACCESS_TOKEN_EXPIRES_KEY]: Date.parse(now) + 3_600_000,
      [POSITION_KEY]: 'POS-0001',
      [TIME_ZONE_KEY]: 'America/Toronto',
      custom: 'other',
    });
    let tokenDuringRevoke: string | null = null;
    const outcome = await disconnectExtension({
      async loadToken() {
        return (await createTokenStore(storage).load())?.accessToken ?? null;
      },
      async revoke() {
        tokenDuringRevoke = (await createTokenStore(storage).load())?.accessToken ?? null;
      },
      async clearAll() {
        for (const key of Object.keys(storage.items)) {
          delete storage.items[key];
        }
      },
    });

    expect(outcome).toBe('revoked');
    expect(tokenDuringRevoke).toBe('ya29.token');
    expect(storage.items).toEqual({});
  });

  it('still clears every stored key when Google cannot revoke or there is no token', async () => {
    const storage = memoryStorage({
      [GOOGLE_ACCESS_TOKEN_KEY]: 'ya29.token',
      [GOOGLE_ACCESS_TOKEN_EXPIRES_KEY]: Date.parse(now) + 3_600_000,
      custom: 'other',
    });
    const failed = await disconnectExtension({
      async loadToken() {
        return (await createTokenStore(storage).load())?.accessToken ?? null;
      },
      async revoke() {
        throw new Error('offline');
      },
      async clearAll() {
        for (const key of Object.keys(storage.items)) {
          delete storage.items[key];
        }
      },
    });
    expect(failed).toBe('forgotten');
    expect(storage.items).toEqual({});

    const empty = memoryStorage({ custom: 'other' });
    let revoked = 0;
    const noToken = await disconnectExtension({
      async loadToken() {
        return null;
      },
      async revoke() {
        revoked += 1;
      },
      async clearAll() {
        for (const key of Object.keys(empty.items)) {
          delete empty.items[key];
        }
      },
    });
    expect(noToken).toBe('cleared');
    expect(revoked).toBe(0);
    expect(empty.items).toEqual({});
  });

  it('posts the access token to Google revoke', async () => {
    let posted: { url: string; method: string; body: string; contentType: string } | null = null;
    await revokeGoogleAccessToken(async (url, init) => {
      const headers = new Headers(init?.headers);
      posted = {
        url: String(url),
        method: init?.method ?? '',
        body: String(init?.body ?? ''),
        contentType: headers.get('Content-Type') ?? '',
      };
      return new Response(null, { status: 200 });
    }, 'ya29.token');

    expect(posted).toEqual({
      url: 'https://oauth2.googleapis.com/revoke',
      method: 'POST',
      body: 'token=ya29.token',
      contentType: 'application/x-www-form-urlencoded',
    });
    await expect(
      revokeGoogleAccessToken(async () => new Response(null, { status: 400 }), 'ya29.token'),
    ).rejects.toThrow('Google revoke failed');
  });
});

describe('onboarding copy', () => {
  it('puts every new string in the English catalog, including the password promise', () => {
    for (const key of ONBOARDING_MESSAGE_KEYS) {
      expect(messages[key]?.message, key).toBeTruthy();
    }
    expect(messages.adpSignedInBody?.message).toContain('already be signed in');
    expect(messages.adpSignedInBody?.message).toContain('never asks for your ADP password');
    expect(messages.myScheduleBody?.message).toContain('My Schedule');
    expect(messages.positionCaptured?.message).toContain('Position');
    expect(messages.connectGoogleBody?.message).toContain('calendar.app.created');
    expect(messages.timeZoneHelp?.message).toContain('browser');
    expect(messages.disconnectHelp?.message).toContain('Google');

    const html = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../src/entrypoints/onboarding.html'),
      'utf8',
    );
    expect(html).toContain('<title>Set up ADP Shifts</title>');
    expect(html).toContain('../onboarding/main.ts');
    expect(html).not.toMatch(/password|My Schedule|Connect Google/);
  });
});

async function syncedZone(override: string): Promise<{ createdZone: string; shift: ShiftCalendarEvent | undefined }> {
  const storage = memoryStorage();
  expect(await saveTimeZone(storage, override)).toBe('saved');
  const timeZone = await timeZoneForSync(storage, 'America/Vancouver');
  const inserted: ShiftCalendarEvent[] = [];
  let createdZone = '';
  const calendar: ShiftCalendar = {
    async findByName() {
      return null;
    },
    async create(input) {
      createdZone = input.timeZone;
      return { id: 'cal-1', name: input.name, description: input.description, timeZone: input.timeZone, private: true };
    },
    async list() {
      return [];
    },
    async insert(_calendarId, event) {
      inserted.push(event);
    },
    async update() {},
    async delete() {},
  };

  const result = await runExtensionSync({
    clientId: 'client.apps.googleusercontent.com',
    redirectUri: 'https://abcdefghijklmnop.chromiumapp.org/',
    now: () => new Date(now),
    tokens: {
      async load() {
        return { accessToken: 'ya29.token', expiresAt: Date.parse(now) + 120_000 };
      },
      async save() {},
      async clear() {},
    },
    launch() {
      throw new Error('stored Google token should be reused');
    },
    state: state('POS-0001'),
    history: { async getLastSuccess() { return null; }, async setLastSuccess() {} },
    diagnostics: diagnostics(),
    adp: { async fetchMonthlyView() { return { kind: 'json', body: october }; } },
    timeZone,
    openCalendar() {
      return calendar;
    },
    forced: true,
  });

  expect(result.ok).toBe(true);
  return {
    createdZone,
    shift: inserted.find((event) => 'dateTime' in event.start && event.start.dateTime === '2026-10-05T17:00:00'),
  };
}

function wallClock(utc: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(utc));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}`;
}
