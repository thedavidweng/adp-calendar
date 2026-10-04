import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  SHIFT_CALENDAR_DESCRIPTION,
  SHIFT_CALENDAR_NAME,
  syncSchedule,
  type AdpSource,
  type ShiftCalendar,
  type ShiftCalendarEvent,
  type ShiftCalendarRecord,
  type StateStore,
} from '../src/index.ts';

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../parser/test/fixtures/monthlyview-2026-10.redacted.json',
);
const octoberFixture: unknown = JSON.parse(readFileSync(fixturePath, 'utf8'));

const timeZone = 'America/Vancouver';

function memoryState(positionId: string | null): StateStore {
  let stored = positionId;
  return {
    async getPositionId() {
      return stored;
    },
    async setPositionId(next) {
      stored = next;
    },
    async clearPositionId() {
      stored = null;
    },
  };
}

function fixtureSource(): AdpSource {
  return {
    async fetchMonthlyView() {
      return { kind: 'json', body: octoberFixture };
    },
  };
}

function memoryCalendar(): ShiftCalendar & { calendars: Array<ShiftCalendarRecord & { events: ShiftCalendarEvent[] }> } {
  const calendars: Array<ShiftCalendarRecord & { events: ShiftCalendarEvent[] }> = [];
  return {
    calendars,
    async findByName(name) {
      return calendars.find((calendar) => calendar.name === name) ?? null;
    },
    async create(input) {
      const calendar = { id: `cal-${calendars.length + 1}`, events: [], ...input };
      calendars.push(calendar);
      return calendar;
    },
    async insert(calendarId, event) {
      const calendar = calendars.find((item) => item.id === calendarId);
      if (!calendar) {
        throw new Error(`missing calendar ${calendarId}`);
      }
      calendar.events.push(event);
    },
  };
}

describe('first Sync', () => {
  it('creates a private Shift Calendar and inserts every future Shift with local wall times', async () => {
    const calendar = memoryCalendar();
    const result = await syncSchedule({
      adp: fixtureSource(),
      clock: { now: () => new Date('2026-10-03T17:00:00.000Z') },
      state: memoryState('POS-0001'),
      timeZone,
      calendar,
    });

    expect(result).toEqual({ ok: true, calendarId: 'cal-1', createdCalendar: true, inserted: 4 });
    expect(calendar.calendars).toHaveLength(1);
    const created = calendar.calendars[0];
    expect(created).toMatchObject({
      name: SHIFT_CALENDAR_NAME,
      description: SHIFT_CALENDAR_DESCRIPTION,
      timeZone,
      private: true,
    });

    expect(created?.events.map((event) => event.id)).toEqual([
      'adpsshiftobj-4',
      'adpsshiftobj-5',
      'adpsshiftobj-6',
      'adpsshiftobj-7',
    ]);

    const expected = [
      ['adpsshiftobj-4', '2026-10-05T17:00:00', '2026-10-05T22:30:00'],
      ['adpsshiftobj-5', '2026-10-06T17:00:00', '2026-10-06T22:30:00'],
      ['adpsshiftobj-6', '2026-10-08T17:00:00', '2026-10-08T22:30:00'],
      ['adpsshiftobj-7', '2026-10-09T15:30:00', '2026-10-09T22:30:00'],
    ] as const;
    for (const [id, start, end] of expected) {
      const event = created?.events.find((item) => item.id === id);
      expect(event, id).toMatchObject({
        title: 'Shift',
        start: { dateTime: start, timeZone },
        end: { dateTime: end, timeZone },
      });
      expect(event?.start.dateTime.endsWith('Z')).toBe(false);
      expect(event?.end.dateTime.endsWith('Z')).toBe(false);
      expect(event?.start.dateTime).not.toMatch(/[+-]\d{2}:\d{2}$/);
      expect(event?.end.dateTime).not.toMatch(/[+-]\d{2}:\d{2}$/);
    }

    const serialized = JSON.stringify(created?.events);
    expect(serialized).not.toContain('adpsshiftobj-1');
    expect(serialized).not.toContain('adpsshiftobj-2');
    expect(serialized).not.toContain('adpsshiftobj-3');
    expect(serialized).not.toContain('adph');
    expect(serialized).not.toMatch(/position/i);
  });

  it('does not create a Shift Calendar when the ADP Session is dead', async () => {
    const calendar = memoryCalendar();
    const result = await syncSchedule({
      adp: { async fetchMonthlyView() { return { kind: 'redirected' }; } },
      clock: { now: () => new Date('2026-10-03T17:00:00.000Z') },
      state: memoryState('POS-0001'),
      timeZone,
      calendar,
    });

    expect(result).toEqual({ ok: false, reason: 'session-dead' });
    expect(calendar.calendars).toEqual([]);
  });
});
