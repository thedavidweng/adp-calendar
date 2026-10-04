import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ShiftCalendar, StateStore, SyncDiagnostics } from '@adp-calendar/core';
import { ShiftCalendarError } from '@adp-calendar/core';
import { describe, expect, it } from 'vitest';
import { SIGN_IN_NOTIFICATION_ID } from '../src/reauth.ts';
import { runExtensionSync } from '../src/run-sync.ts';
import { createTokenStore, GOOGLE_ACCESS_TOKEN_EXPIRES_KEY, GOOGLE_ACCESS_TOKEN_KEY, type KeyValueStorage } from '../src/storage.ts';
import {
  noticeForClick,
  noticeForSyncResult,
  REPORT_ISSUE_URL,
  showsReportIssue,
  syncStatusText,
  type MessageKey,
  type PopupSyncResult,
} from '../src/sync-status.ts';

const now = '2026-10-03T17:00:00.000Z';
const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../parser/test/fixtures');
const october = JSON.parse(readFileSync(resolve(fixtureDir, 'monthlyview-2026-10.redacted.json'), 'utf8')) as unknown;
const noSchedule = JSON.parse(
  readFileSync(resolve(fixtureDir, 'monthlyview-non-time-employee.redacted.json'), 'utf8'),
) as unknown;
const adpError = JSON.parse(
  readFileSync(resolve(fixtureDir, 'monthlyview-inverted-range.redacted.json'), 'utf8'),
) as unknown;
const positionInvalid = {
  data: {
    status: 'failure',
    statusCode: 400,
    statusDescription: 'err_InvalidRequest',
    details: [{ messages: [{ field: 'positionId', message: 'The position is not valid' }] }],
  },
};

const messages = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../public/_locales/en/messages.json'), 'utf8'),
) as Record<string, { message: string }>;

function translate(key: MessageKey, substitution?: string | string[]): string {
  const template = messages[key]?.message ?? key;
  if (substitution === undefined) {
    return template;
  }
  const values = Array.isArray(substitution) ? [...substitution] : [substitution];
  return template.replace(/\$[A-Z0-9]+\$/g, () => values.shift() ?? '');
}

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

function diagnostics(): SyncDiagnostics {
  let notified = false;
  let attempts: Awaited<ReturnType<SyncDiagnostics['getAttempts']>> = [];
  return {
    async getSignInNotified() {
      return notified;
    },
    async setSignInNotified(next) {
      notified = next;
    },
    async getAttempts() {
      return attempts;
    },
    async setAttempts(next) {
      attempts = [...next];
    },
  };
}

function state(positionId: string | null): StateStore & { position: () => string | null } {
  let current = positionId;
  return {
    position: () => current,
    async getPositionId() {
      return current;
    },
    async setPositionId(next) {
      current = next;
    },
    async clearPositionId() {
      current = null;
    },
  };
}

function blockingCalendar(): ShiftCalendar {
  const fail = () => {
    throw new Error('Shift Calendar must not be opened');
  };
  return { findByName: fail, create: fail, list: fail, insert: fail, update: fail, delete: fail };
}

describe('popup Sync outcomes', () => {
  it('shows a distinct message for every outcome, and no error for an empty schedule', () => {
    const results: PopupSyncResult[] = [
      { ok: true, calendarId: 'cal-1', createdCalendar: true, created: 1, updated: 0, restored: 0, deleted: 0 },
      { ok: true, calendarId: 'cal-1', createdCalendar: false, created: 0, updated: 1, restored: 0, deleted: 0 },
      { ok: true, skipped: 'not-due' },
      { ok: false, reason: 'no-position' },
      { ok: false, reason: 'needs-sign-in' },
      { ok: false, reason: 'session-dead' },
      { ok: false, reason: 'no-schedule' },
      { ok: false, reason: 'position-invalid' },
      { ok: false, reason: 'shape-drift' },
      { ok: false, reason: 'adp-error', description: 'err_UnexpectedError_Business_Validation' },
      { ok: false, reason: 'google-auth' },
      { ok: false, reason: 'calendar-missing' },
      { ok: false, reason: 'conflict' },
      { ok: false, reason: 'google-error' },
      { ok: false, reason: 'missing-client' },
      { ok: false, reason: 'sync-failed' },
    ];
    const texts = results.map((result) => syncStatusText(result, translate));
    expect(new Set(texts).size).toBe(texts.length);
    expect(syncStatusText({ ok: false, reason: 'no-schedule' }, translate)).toBe('No schedule for this period yet.');
    expect(syncStatusText({ ok: false, reason: 'no-schedule' }, translate)).not.toMatch(/error|fail/i);
    expect(syncStatusText({ ok: false, reason: 'position-invalid' }, translate)).toContain('Open My Schedule again');
    expect(syncStatusText({ ok: false, reason: 'shape-drift' }, translate)).toContain('ADP changed its data format');
    expect(syncStatusText({ ok: false, reason: 'google-auth' }, translate)).toContain('reconnect Google');
    expect(messages.reportIssue?.message).toBe('Report an issue');
    expect(REPORT_ISSUE_URL).toBe('https://github.com/thedavidweng/adp-calendar/issues/new');
    for (const result of results) {
      expect(showsReportIssue(result)).toBe(!result.ok && result.reason === 'shape-drift');
    }
  });

  it('notifies only for outcomes that need the employee, and not for an empty schedule', () => {
    expect(noticeForSyncResult({ ok: false, reason: 'no-schedule' })).toBeNull();
    expect(noticeForSyncResult({ ok: false, reason: 'adp-error' })).toBeNull();
    expect(noticeForSyncResult({ ok: false, reason: 'session-dead' })).toBeNull();
    expect(noticeForSyncResult({ ok: true })).toBeNull();

    expect(noticeForSyncResult({ ok: false, reason: 'needs-sign-in' })).toEqual({
      id: SIGN_IN_NOTIFICATION_ID,
      messageKey: 'needsSignIn',
      click: 'remember-sign-in',
    });
    expect(noticeForSyncResult({ ok: false, reason: 'position-invalid' })).toEqual({
      id: 'adp-position-invalid',
      messageKey: 'positionInvalid',
      click: 'open-workforce',
    });
    expect(noticeForSyncResult({ ok: false, reason: 'shape-drift' })).toEqual({
      id: 'adp-shape-drift',
      messageKey: 'shapeDrift',
      click: 'report-issue',
    });
    expect(noticeForSyncResult({ ok: false, reason: 'google-auth' })).toEqual({
      id: 'adp-google-auth',
      messageKey: 'googleAuth',
      click: null,
    });
    expect(noticeForClick(SIGN_IN_NOTIFICATION_ID)?.click).toBe('remember-sign-in');
    expect(noticeForClick('adp-position-invalid')?.click).toBe('open-workforce');
    expect(noticeForClick('adp-shape-drift')?.click).toBe('report-issue');
    expect(noticeForClick('adp-google-auth')?.click).toBeNull();
    expect(noticeForClick('other')).toBeNull();
  });
});

describe('extension Sync entry', () => {
  it('does not open the Shift Calendar for no schedule, an invalid Position, shape drift, or any other ADP error', async () => {
    const drifted = structuredClone(october) as { data: { details: Array<Record<string, unknown>> } };
    delete drifted.data.details[0]?.shiftDefinitions;
    const cases: Array<{ body: unknown; reason: string; position: string | null }> = [
      { body: noSchedule, reason: 'no-schedule', position: 'POS-0001' },
      { body: positionInvalid, reason: 'position-invalid', position: null },
      { body: drifted, reason: 'shape-drift', position: 'POS-0001' },
      { body: adpError, reason: 'adp-error', position: 'POS-0001' },
    ];

    for (const item of cases) {
      const stored = state('POS-0001');
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
        state: stored,
        history: { async getLastSuccess() { return null; }, async setLastSuccess() {} },
        diagnostics: diagnostics(),
        adp: { async fetchMonthlyView() { return { kind: 'json', body: item.body }; } },
        timeZone: 'America/Vancouver',
        openCalendar() {
          return blockingCalendar();
        },
        forced: true,
      });

      expect(result).toMatchObject({ ok: false, reason: item.reason });
      expect(stored.position()).toBe(item.position);
    }
  });

  it('forgets a revoked Google token so the next Sync can reconnect, and does not write', async () => {
    const storage = memoryStorage({
      [GOOGLE_ACCESS_TOKEN_KEY]: 'ya29.revoked',
      [GOOGLE_ACCESS_TOKEN_EXPIRES_KEY]: Date.parse(now) + 3_600_000,
    });
    const tokens = createTokenStore(storage);
    let writes = 0;
    const calendar: ShiftCalendar = {
      async findByName() {
        throw new ShiftCalendarError('google-auth');
      },
      async create() {
        writes += 1;
        throw new ShiftCalendarError('google-auth');
      },
      async list() {
        writes += 1;
        throw new ShiftCalendarError('google-auth');
      },
      async insert() {
        writes += 1;
        throw new ShiftCalendarError('google-auth');
      },
      async update() {
        writes += 1;
        throw new ShiftCalendarError('google-auth');
      },
      async delete() {
        writes += 1;
        throw new ShiftCalendarError('google-auth');
      },
    };

    const result = await runExtensionSync({
      clientId: 'client.apps.googleusercontent.com',
      redirectUri: 'https://abcdefghijklmnop.chromiumapp.org/',
      now: () => new Date(now),
      tokens,
      launch() {
        throw new Error('stored Google token should be reused until Calendar rejects it');
      },
      state: state('POS-0001'),
      history: { async getLastSuccess() { return null; }, async setLastSuccess() {} },
      diagnostics: diagnostics(),
      adp: { async fetchMonthlyView() { return { kind: 'json', body: october }; } },
      timeZone: 'America/Vancouver',
      openCalendar() {
        return calendar;
      },
      forced: true,
    });

    expect(result).toEqual({ ok: false, reason: 'google-auth' });
    expect(writes).toBe(0);
    expect(await tokens.load()).toBeNull();
    expect(storage.items[GOOGLE_ACCESS_TOKEN_KEY]).toBeNull();
  });
});
