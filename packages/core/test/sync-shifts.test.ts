import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { addDays } from '../src/schedule-range.ts';
import {
  SHIFT_CALENDAR_DESCRIPTION,
  SHIFT_CALENDAR_NAME,
  ShiftCalendarError,
  syncSchedule,
  type AdpSource,
  type ShiftCalendar,
  type ShiftCalendarEvent,
  type ShiftCalendarRange,
  type ShiftCalendarRecord,
  type StateStore,
  type SyncInput,
} from '../src/index.ts';

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../parser/test/fixtures');
const octoberFixture: unknown = JSON.parse(
  readFileSync(resolve(fixtureDir, 'monthlyview-2026-10.redacted.json'), 'utf8'),
);
const noScheduleFixture: unknown = JSON.parse(
  readFileSync(resolve(fixtureDir, 'monthlyview-non-time-employee.redacted.json'), 'utf8'),
);

const timeZone = 'America/Vancouver';
const now = '2026-10-03T17:00:00.000Z';

type StoredEvent = ShiftCalendarEvent & { status: 'confirmed' | 'cancelled' };
type MemoryCalendar = ShiftCalendar & {
  calendars: Array<ShiftCalendarRecord & { events: StoredEvent[] }>;
  writes: Array<{ op: 'insert' | 'update' | 'delete'; id: string }>;
  conflicts: number;
};

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

function source(body: unknown): AdpSource {
  return {
    async fetchMonthlyView() {
      return { kind: 'json', body };
    },
  };
}

function memoryCalendar(): MemoryCalendar {
  const calendars: MemoryCalendar['calendars'] = [];
  const writes: MemoryCalendar['writes'] = [];
  const calendar: MemoryCalendar = {
    calendars,
    writes,
    conflicts: 0,
    async findByName(name) {
      return calendars.find((item) => item.name === name) ?? null;
    },
    async create(input) {
      const created = { id: `cal-${calendars.length + 1}`, events: [], ...input };
      calendars.push(created);
      return created;
    },
    async list(calendarId, range) {
      return requireCalendar(calendars, calendarId).events.filter((event) => overlaps(event, range)).map(cloneEvent);
    },
    async insert(calendarId, event) {
      const stored = requireCalendar(calendars, calendarId);
      if (stored.events.some((item) => item.id === event.id)) {
        calendar.conflicts += 1;
        throw new ShiftCalendarError('conflict');
      }
      stored.events.push({ ...cloneEvent(event), status: 'confirmed' });
      writes.push({ op: 'insert', id: event.id });
    },
    async update(calendarId, event) {
      const stored = requireCalendar(calendars, calendarId);
      const index = stored.events.findIndex((item) => item.id === event.id);
      if (index < 0) {
        throw new ShiftCalendarError('google-error');
      }
      stored.events[index] = { ...cloneEvent(event), status: 'confirmed' };
      writes.push({ op: 'update', id: event.id });
    },
    async delete(calendarId, eventId) {
      const stored = requireCalendar(calendars, calendarId);
      const event = stored.events.find((item) => item.id === eventId);
      if (!event) {
        throw new ShiftCalendarError('google-error');
      }
      event.status = 'cancelled';
      writes.push({ op: 'delete', id: eventId });
    },
  };
  return calendar;
}

function requireCalendar(calendars: MemoryCalendar['calendars'], calendarId: string) {
  const found = calendars.find((item) => item.id === calendarId);
  if (!found) {
    throw new ShiftCalendarError('calendar-missing');
  }
  return found;
}

function cloneEvent(event: ShiftCalendarEvent): ShiftCalendarEvent {
  return {
    id: event.id,
    title: event.title,
    ...(event.description ? { description: event.description } : {}),
    start: { ...event.start },
    end: { ...event.end },
    ...(event.transparency ? { transparency: event.transparency } : {}),
    ...(event.status ? { status: event.status } : {}),
  };
}

function overlaps(event: StoredEvent, range: ShiftCalendarRange): boolean {
  const start = whenStamp(event.start);
  const end = whenStamp(event.end);
  return end > `${range.startDate}T00:00:00` && start < `${addDays(range.endDate, 1)}T00:00:00`;
}

function whenStamp(when: ShiftCalendarEvent['start']): string {
  return 'date' in when ? `${when.date}T00:00:00` : when.dateTime;
}

function syncInput(calendar: ShiftCalendar, body: unknown = octoberFixture, instant = now): SyncInput {
  return {
    adp: source(body),
    clock: { now: () => new Date(instant) },
    state: memoryState('POS-0001'),
    timeZone,
    calendar,
  };
}

function storedEvents(calendar: MemoryCalendar): StoredEvent[] {
  return calendar.calendars[0]?.events ?? [];
}

function event(calendar: MemoryCalendar, id: string): StoredEvent | undefined {
  return storedEvents(calendar).find((item) => item.id === id);
}

describe('Shift Calendar fake', () => {
  it('keeps a deleted event and rejects inserting that id again', async () => {
    const calendar = memoryCalendar();
    const created = await calendar.create({
      name: SHIFT_CALENDAR_NAME,
      description: SHIFT_CALENDAR_DESCRIPTION,
      timeZone,
      private: true,
    });
    const shift: ShiftCalendarEvent = {
      id: 'adpsshiftobj-4',
      title: 'Shift',
      start: { dateTime: '2026-10-05T17:00:00', timeZone },
      end: { dateTime: '2026-10-05T22:30:00', timeZone },
    };
    await calendar.insert(created.id, shift);
    await calendar.delete(created.id, shift.id);

    await expect(calendar.insert(created.id, shift)).rejects.toEqual(new ShiftCalendarError('conflict'));
    await expect(
      calendar.list(created.id, { startDate: '2026-10-05', endDate: '2026-10-05', timeZone }),
    ).resolves.toEqual([{ ...shift, status: 'cancelled' }]);
    expect(calendar.conflicts).toBe(1);
  });
});

describe('first Sync', () => {
  it('creates a private Shift Calendar and inserts future Shifts and the future Holiday', async () => {
    const calendar = memoryCalendar();
    const result = await syncSchedule(syncInput(calendar));

    expect(result).toEqual({
      ok: true,
      calendarId: 'cal-1',
      createdCalendar: true,
      created: 5,
      updated: 0,
      restored: 0,
      deleted: 0,
    });
    expect(calendar.calendars).toHaveLength(1);
    const created = calendar.calendars[0];
    expect(created).toMatchObject({
      name: SHIFT_CALENDAR_NAME,
      description: SHIFT_CALENDAR_DESCRIPTION,
      timeZone,
      private: true,
    });

    expect(created?.events.map((item) => item.id)).toEqual([
      'adpsshiftobj-4',
      'adpsshiftobj-5',
      'adpsshiftobj-6',
      'adpsshiftobj-7',
      'adph20261012',
    ]);

    const expected = [
      ['adpsshiftobj-4', '2026-10-05T17:00:00', '2026-10-05T22:30:00'],
      ['adpsshiftobj-5', '2026-10-06T17:00:00', '2026-10-06T22:30:00'],
      ['adpsshiftobj-6', '2026-10-08T17:00:00', '2026-10-08T22:30:00'],
      ['adpsshiftobj-7', '2026-10-09T15:30:00', '2026-10-09T22:30:00'],
    ] as const;
    for (const [id, start, end] of expected) {
      const item = created?.events.find((entry) => entry.id === id);
      expect(item, id).toMatchObject({
        title: 'Shift',
        status: 'confirmed',
        start: { dateTime: start, timeZone },
        end: { dateTime: end, timeZone },
      });
      expect(item?.transparency).toBeUndefined();
      expect(item?.start).not.toHaveProperty('date');
    }

    expect(event(calendar, 'adph20261012')).toEqual({
      id: 'adph20261012',
      title: 'Thanksgiving Day',
      status: 'confirmed',
      start: { date: '2026-10-12' },
      end: { date: '2026-10-13' },
      transparency: 'transparent',
    });

    const serialized = JSON.stringify(created?.events);
    expect(serialized).not.toContain('adpsshiftobj-1');
    expect(serialized).not.toContain('adpsshiftobj-2');
    expect(serialized).not.toContain('adpsshiftobj-3');
    expect(serialized).not.toContain('adph20260930');
    expect(serialized).not.toContain('Truth & Reconciliation Day');
    expect(serialized).not.toMatch(/position/i);
  });

  it('does not create a Shift Calendar when the ADP Session is dead', async () => {
    const calendar = memoryCalendar();
    const result = await syncSchedule({
      ...syncInput(calendar),
      adp: { async fetchMonthlyView() { return { kind: 'redirected' }; } },
    });

    expect(result).toEqual({ ok: false, reason: 'session-dead' });
    expect(calendar.calendars).toEqual([]);
    expect(calendar.writes).toEqual([]);
  });
});

describe('Shift Calendar reconciliation', () => {
  it('makes no writes on a second Sync when ADP has not changed', async () => {
    const calendar = memoryCalendar();
    await syncSchedule(syncInput(calendar));
    calendar.writes.length = 0;

    const result = await syncSchedule(syncInput(calendar));

    expect(result).toEqual({
      ok: true,
      calendarId: 'cal-1',
      createdCalendar: false,
      created: 0,
      updated: 0,
      restored: 0,
      deleted: 0,
    });
    expect(calendar.writes).toEqual([]);
  });

  it('adopts an existing Shift Calendar on reinstall instead of duplicating events', async () => {
    const first = memoryCalendar();
    await syncSchedule(syncInput(first));
    const reinstall = memoryCalendar();
    reinstall.calendars.push({
      id: 'existing',
      name: SHIFT_CALENDAR_NAME,
      description: SHIFT_CALENDAR_DESCRIPTION,
      timeZone,
      private: true,
      events: storedEvents(first).map((item) => ({ ...item, start: { ...item.start }, end: { ...item.end } })),
    });

    const result = await syncSchedule(syncInput(reinstall));

    expect(result).toMatchObject({
      ok: true,
      calendarId: 'existing',
      createdCalendar: false,
      created: 0,
      updated: 0,
      restored: 0,
      deleted: 0,
    });
    expect(reinstall.writes).toEqual([]);
    expect(reinstall.calendars).toHaveLength(1);
    expect(storedEvents(reinstall).map((item) => item.id)).toEqual(storedEvents(first).map((item) => item.id));
  });

  it('adds, moves, and removes Shifts so the Shift Calendar matches ADP', async () => {
    const calendar = memoryCalendar();
    await syncSchedule(syncInput(calendar));
    calendar.writes.length = 0;
    const changed = mutate(octoberFixture, ({ shifts, shiftDefinitions }) => {
      const moved = shifts.find((item) => item.shiftObjectId === 'shiftobj-4');
      if (!moved) {
        throw new Error('missing shiftobj-4');
      }
      moved.shiftReferenceId = 'shiftref-new';
      shiftDefinitions.push({ shiftReferenceId: 'shiftref-new', inTime: '09:00:00', outTime: '13:00:00' });
      const removed = shifts.findIndex((item) => item.shiftObjectId === 'shiftobj-7');
      shifts.splice(removed, 1);
      shifts.push({
        shiftReferenceId: 'shiftref-1',
        shiftObjectId: 'shiftobj-8',
        shiftDate: '2026-10-10',
        shiftEndDate: '2026-10-10',
        inTimeHour: 170000,
        shiftWorkedTotalSeconds: 19800,
        status: 'P',
      });
    });

    const result = await syncSchedule(syncInput(calendar, changed));

    expect(result).toMatchObject({ ok: true, created: 1, updated: 1, restored: 0, deleted: 1 });
    expect(event(calendar, 'adpsshiftobj-4')).toMatchObject({
      title: 'Shift',
      status: 'confirmed',
      start: { dateTime: '2026-10-05T09:00:00', timeZone },
      end: { dateTime: '2026-10-05T13:00:00', timeZone },
    });
    expect(event(calendar, 'adpsshiftobj-7')?.status).toBe('cancelled');
    expect(event(calendar, 'adpsshiftobj-8')).toMatchObject({
      status: 'confirmed',
      start: { dateTime: '2026-10-10T17:00:00', timeZone },
      end: { dateTime: '2026-10-10T22:30:00', timeZone },
    });
    expect(event(calendar, 'adph20261012')?.status).toBe('confirmed');

    calendar.writes.length = 0;
    const again = await syncSchedule(syncInput(calendar, changed));
    expect(again).toMatchObject({ created: 0, updated: 0, restored: 0, deleted: 0 });
    expect(calendar.writes).toEqual([]);
  });

  it('overwrites a hand-edited future Shift with ADP', async () => {
    const calendar = memoryCalendar();
    await syncSchedule(syncInput(calendar));
    const edited = event(calendar, 'adpsshiftobj-4');
    if (!edited) {
      throw new Error('missing shift');
    }
    edited.title = 'Night shift';
    edited.start = { dateTime: '2026-10-05T18:00:00', timeZone };
    edited.description = 'Edited by hand';
    calendar.writes.length = 0;

    const result = await syncSchedule(syncInput(calendar));

    expect(result).toMatchObject({ created: 0, updated: 1, restored: 0, deleted: 0 });
    expect(event(calendar, 'adpsshiftobj-4')).toMatchObject({
      title: 'Shift',
      status: 'confirmed',
      start: { dateTime: '2026-10-05T17:00:00', timeZone },
      end: { dateTime: '2026-10-05T22:30:00', timeZone },
    });
    expect(event(calendar, 'adpsshiftobj-4')?.description).toBeUndefined();
    expect(calendar.writes).toEqual([{ op: 'update', id: 'adpsshiftobj-4' }]);
  });

  it('restores a future Shift that was deleted by hand', async () => {
    const calendar = memoryCalendar();
    await syncSchedule(syncInput(calendar));
    const deleted = event(calendar, 'adpsshiftobj-5');
    if (!deleted) {
      throw new Error('missing shift');
    }
    deleted.status = 'cancelled';
    calendar.writes.length = 0;

    const result = await syncSchedule(syncInput(calendar));

    expect(result).toMatchObject({ created: 0, updated: 0, restored: 1, deleted: 0 });
    expect(event(calendar, 'adpsshiftobj-5')).toMatchObject({
      title: 'Shift',
      status: 'confirmed',
      start: { dateTime: '2026-10-06T17:00:00', timeZone },
      end: { dateTime: '2026-10-06T22:30:00', timeZone },
    });
    expect(calendar.writes).toEqual([{ op: 'update', id: 'adpsshiftobj-5' }]);
    expect(calendar.conflicts).toBe(0);
  });

  it('updates when re-inserting a deleted id returns a conflict', async () => {
    const calendar = memoryCalendar();
    await syncSchedule(syncInput(calendar));
    const deleted = event(calendar, 'adpsshiftobj-6');
    if (!deleted) {
      throw new Error('missing shift');
    }
    deleted.status = 'cancelled';
    calendar.writes.length = 0;
    const hidden = hideFromList(calendar, 'adpsshiftobj-6');

    const result = await syncSchedule(syncInput(hidden));

    expect(result).toMatchObject({ created: 0, updated: 0, restored: 1, deleted: 0 });
    expect(calendar.conflicts).toBe(1);
    expect(event(calendar, 'adpsshiftobj-6')).toMatchObject({
      status: 'confirmed',
      start: { dateTime: '2026-10-08T17:00:00', timeZone },
      end: { dateTime: '2026-10-08T22:30:00', timeZone },
    });
    expect(calendar.writes).toEqual([{ op: 'update', id: 'adpsshiftobj-6' }]);
  });

  it('leaves events that start before today untouched when the window rolls forward', async () => {
    const calendar = memoryCalendar();
    await syncSchedule(syncInput(calendar));
    const past = structuredClone(event(calendar, 'adpsshiftobj-4'));
    calendar.calendars[0]?.events.push({
      id: 'adpsovernight-past',
      title: 'Past overnight',
      status: 'confirmed',
      start: { dateTime: '2026-10-05T22:00:00', timeZone },
      end: { dateTime: '2026-10-06T06:00:00', timeZone },
    });
    calendar.writes.length = 0;

    const result = await syncSchedule(syncInput(calendar, octoberFixture, '2026-10-06T17:00:00.000Z'));

    expect(result).toMatchObject({ ok: true, created: 0, updated: 0, restored: 0, deleted: 0 });
    expect(calendar.writes).toEqual([]);
    expect(event(calendar, 'adpsshiftobj-4')).toEqual(past);
    expect(event(calendar, 'adpsovernight-past')).toMatchObject({
      title: 'Past overnight',
      status: 'confirmed',
      start: { dateTime: '2026-10-05T22:00:00', timeZone },
      end: { dateTime: '2026-10-06T06:00:00', timeZone },
    });
    expect(event(calendar, 'adpsshiftobj-5')?.status).toBe('confirmed');
  });

  it('does not change the Shift Calendar when ADP does not return a schedule', async () => {
    const calendar = memoryCalendar();
    await syncSchedule(syncInput(calendar));
    const before = JSON.stringify(storedEvents(calendar));
    calendar.writes.length = 0;

    const dead = await syncSchedule({
      ...syncInput(calendar),
      adp: { async fetchMonthlyView() { return { kind: 'non-json' }; } },
    });
    const empty = await syncSchedule(syncInput(calendar, noScheduleFixture));

    expect(dead).toEqual({ ok: false, reason: 'session-dead' });
    expect(empty).toEqual({ ok: false, reason: 'no-schedule' });
    expect(calendar.writes).toEqual([]);
    expect(JSON.stringify(storedEvents(calendar))).toBe(before);
  });
});

function hideFromList(calendar: MemoryCalendar, id: string): ShiftCalendar {
  return {
    findByName: (name) => calendar.findByName(name),
    create: (input) => calendar.create(input),
    list: async (calendarId, range) => (await calendar.list(calendarId, range)).filter((item) => item.id !== id),
    insert: (calendarId, event) => calendar.insert(calendarId, event),
    update: (calendarId, event) => calendar.update(calendarId, event),
    delete: (calendarId, eventId) => calendar.delete(calendarId, eventId),
  };
}

function mutate(
  body: unknown,
  change: (detail: {
    shiftDefinitions: Array<Record<string, unknown>>;
    shifts: Array<Record<string, unknown>>;
  }) => void,
): unknown {
  const copy = structuredClone(body) as {
    data: {
      details: Array<{
        shiftDefinitions: Array<Record<string, unknown>>;
        positionShiftAssignments: Array<{ shifts: Array<Record<string, unknown>> }>;
      }>;
    };
  };
  const detail = copy.data.details[0];
  const assignment = detail?.positionShiftAssignments[0];
  if (!detail || !assignment) {
    throw new Error('fixture is missing schedule details');
  }
  change({ shiftDefinitions: detail.shiftDefinitions, shifts: assignment.shifts });
  return copy;
}
