import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPageAdpSource } from '@adp-calendar/core/adp-source';
import type { StateStore } from '@adp-calendar/core';
import { describe, expect, it } from 'vitest';
import { exportShowsReportIssue, exportStatusText, runExtensionExport, type ExportMessageKey } from '../src/export-ics.ts';

const testDir = dirname(fileURLToPath(import.meta.url));
const october = JSON.parse(
  readFileSync(resolve(testDir, '../../parser/test/fixtures/monthlyview-2026-10.redacted.json'), 'utf8'),
) as unknown;
const messages = JSON.parse(readFileSync(resolve(testDir, '../public/_locales/en/messages.json'), 'utf8')) as Record<
  string,
  { message: string }
>;

function translate(key: ExportMessageKey, substitution?: string | string[]): string {
  const values = substitution === undefined ? [] : [substitution].flat();
  let index = 0;
  return (messages[key]?.message ?? key).replace(/\$[A-Z]+\$/g, () => values[index++] ?? '');
}

function memoryState(positionId: string | null): StateStore {
  let saved = positionId;
  return {
    async getPositionId() {
      return saved;
    },
    async setPositionId(next) {
      saved = next;
    },
    async clearPositionId() {
      saved = null;
    },
  };
}

function adp(response: { redirected?: boolean; url?: string; text: string }) {
  return createPageAdpSource(async () => ({
    redirected: response.redirected ?? false,
    url: response.url ?? 'https://workforcenow.adp.com/mascsr/wfntlm/schedule/v1/monthlyview',
    text: response.text,
  }));
}

const now = () => new Date('2026-10-03T17:00:00.000Z');

describe('extension ICS export', () => {
  it('builds an ICS from the cached Position without Google', async () => {
    const result = await runExtensionExport({
      adp: adp({ text: JSON.stringify(october) }),
      state: memoryState('POS-0001'),
      now,
      timeZone: async () => 'America/Vancouver',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ics).toContain('BEGIN:VCALENDAR');
    expect(result.shiftCount).toBeGreaterThan(0);
    expect(exportStatusText(result, translate)).toBe(
      `Downloaded adp-shifts.ics with your schedule (${result.shiftCount} shifts). Import it into any calendar app.`,
    );
  });

  it('asks the user to open Calendar when no Position is cached', async () => {
    const result = await runExtensionExport({
      adp: adp({ text: '{}' }),
      state: memoryState(null),
      now,
      timeZone: async () => 'America/Vancouver',
    });

    expect(exportStatusText(result, translate)).toBe(messages.noPosition?.message);
  });

  it('asks the user to sign in to ADP when the session is dead', async () => {
    const result = await runExtensionExport({
      adp: adp({ redirected: true, url: 'https://online.adp.com/olp/olplanding.html', text: '<html></html>' }),
      state: memoryState('POS-0001'),
      now,
      timeZone: async () => 'America/Vancouver',
    });

    expect(result).toEqual({ ok: false, reason: 'session-dead' });
    expect(exportStatusText(result, translate)).toBe('Sign in to ADP, then try Export .ics again.');
  });

  it('turns an unexpected error, such as an unknown time zone, into a retryable failure', async () => {
    const result = await runExtensionExport({
      adp: adp({ text: JSON.stringify(october) }),
      state: memoryState('POS-0001'),
      now,
      timeZone: async () => 'Not/AZone',
    });

    expect(result).toEqual({ ok: false, reason: 'export-failed' });
    expect(exportStatusText(result, translate)).toBe('Could not export. Try again.');
  });

  it('offers an issue link only when ADP changed its data format', () => {
    expect(exportShowsReportIssue({ ok: false, reason: 'shape-drift' })).toBe(true);
    expect(exportShowsReportIssue({ ok: false, reason: 'session-dead' })).toBe(false);
  });

  it('has every export string in the English catalog', () => {
    for (const key of ['exportIcs', 'exporting', 'exportDone', 'exportSessionDead', 'exportFailed'] as const) {
      expect(messages[key]?.message, key).toBeTruthy();
    }
  });
});
