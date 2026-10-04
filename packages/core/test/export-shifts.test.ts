import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { exportSchedule, type AdpSource, type StateStore } from '../src/index.ts';

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

function fixtureSource(): { source: AdpSource; requested: Array<{ positionId: string; startDate: string; endDate: string }> } {
  const requested: Array<{ positionId: string; startDate: string; endDate: string }> = [];
  return {
    requested,
    source: {
      async fetchMonthlyView(positionId, startDate, endDate) {
        requested.push({ positionId, startDate, endDate });
        return { kind: 'json', body: octoberFixture };
      },
    },
  };
}

describe('Export of Shifts', () => {
  it('writes seven Shifts and two all-day Holidays with local wall times and stable UIDs', async () => {
    const { source, requested } = fixtureSource();
    const result = await exportSchedule({
      adp: source,
      clock: { now: () => new Date('2026-10-03T17:00:00.000Z') },
      state: memoryState('POS-0001'),
      timeZone,
    });

    expect(requested).toEqual([
      { positionId: 'POS-0001', startDate: '2026-09-27', endDate: '2027-01-01' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.ics).toContain('BEGIN:VTIMEZONE');
    expect(result.ics).toContain('TZID:America/Vancouver');

    const events = [...result.ics.matchAll(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g)].map((match) => match[0]);
    const shiftEvents = events.filter((event) => event.includes('UID:adps'));
    const holidayEvents = events.filter((event) => event.includes('UID:adph'));
    expect(shiftEvents).toHaveLength(7);
    expect(holidayEvents).toHaveLength(2);
    expect(result.ics).not.toMatch(/position/i);

    const expected = [
      ['adpsshiftobj-1@adp-schedule-export', '20260927T153000', '20260927T213000'],
      ['adpsshiftobj-2@adp-schedule-export', '20260929T170000', '20260929T223000'],
      ['adpsshiftobj-3@adp-schedule-export', '20261002T153000', '20261002T223000'],
      ['adpsshiftobj-4@adp-schedule-export', '20261005T170000', '20261005T223000'],
      ['adpsshiftobj-5@adp-schedule-export', '20261006T170000', '20261006T223000'],
      ['adpsshiftobj-6@adp-schedule-export', '20261008T170000', '20261008T223000'],
      ['adpsshiftobj-7@adp-schedule-export', '20261009T153000', '20261009T223000'],
    ] as const;

    for (const [uid, start, end] of expected) {
      const event = events.find((block) => block.includes(`UID:${uid}`));
      expect(event, uid).toBeDefined();
      expect(event).toContain(`DTSTART;TZID=${timeZone}:${start}`);
      expect(event).toContain(`DTEND;TZID=${timeZone}:${end}`);
      expect(event).toContain('SUMMARY:Shift');
      expect(event).toContain('STATUS:CONFIRMED');
      expect(event).not.toContain('DESCRIPTION:');
      expect(event).not.toContain('TRANSP:TRANSPARENT');
      expect(event).not.toMatch(/DTSTART[^:]*:\d{8}T\d{6}Z/);
    }

    const holidays = [
      ['adph20260930@adp-schedule-export', '20260930', '20261001', 'Truth & Reconciliation Day'],
      ['adph20261012@adp-schedule-export', '20261012', '20261013', 'Thanksgiving Day'],
    ] as const;
    for (const [uid, start, end, summary] of holidays) {
      const event = holidayEvents.find((block) => block.includes(`UID:${uid}`));
      expect(event, uid).toBeDefined();
      expect(event).toContain(`DTSTART;VALUE=DATE:${start}`);
      expect(event).toContain(`DTEND;VALUE=DATE:${end}`);
      expect(event).toContain(`SUMMARY:${summary}`);
      expect(event).toContain('TRANSP:TRANSPARENT');
      expect(event).toContain('STATUS:CONFIRMED');
      expect(event).not.toContain('TZID=');
    }

    for (const secret of [
      'Redacted',
      'EMP-0001',
      'user@example.invalid',
      'POS-0001',
      'PF-0001',
      'AOID-0001',
      'employeeId',
      'loginId',
      'firstName',
    ]) {
      expect(result.ics).not.toContain(secret);
    }
  });

  it('does not call ADP when no Position is cached', async () => {
    const { source, requested } = fixtureSource();
    const result = await exportSchedule({
      adp: source,
      clock: { now: () => new Date('2026-10-03T17:00:00.000Z') },
      state: memoryState(null),
      timeZone,
    });

    expect(result).toEqual({ ok: false, reason: 'no-position' });
    expect(requested).toEqual([]);
  });

  it('uses the Shift Definition template name, then the pay code, before Shift', async () => {
    const named = mutate(octoberFixture, ({ shiftDefinitions }) => {
      const closing = shiftDefinitions.find((definition) => definition.shiftReferenceId === 'shiftref-2');
      const opening = shiftDefinitions.find((definition) => definition.shiftReferenceId === 'shiftref-1');
      if (!closing || !opening) {
        throw new Error('fixture is missing Shift Definitions');
      }
      closing.templateName = 'Closing';
      closing.payCodeDesc = 'Regular';
      opening.templateName = '  ';
      opening.payCodeDesc = 'Regular';
    });
    const result = await exportSchedule({
      adp: {
        async fetchMonthlyView() {
          return { kind: 'json', body: named };
        },
      },
      clock: { now: () => new Date('2026-10-03T17:00:00.000Z') },
      state: memoryState('POS-0001'),
      timeZone,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const events = [...result.ics.matchAll(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g)].map((match) => match[0]);
    expect(events.find((event) => event.includes('UID:adpsshiftobj-1@adp-schedule-export'))).toContain(
      'SUMMARY:Closing',
    );
    expect(events.find((event) => event.includes('UID:adpsshiftobj-2@adp-schedule-export'))).toContain(
      'SUMMARY:Regular',
    );
  });

  it('ends an overnight Shift on the next day when the end wall time is not later', async () => {
    const overnight = mutate(octoberFixture, ({ shiftDefinitions }) => {
      const closing = shiftDefinitions.find((definition) => definition.shiftReferenceId === 'shiftref-2');
      if (!closing) {
        throw new Error('fixture is missing Shift Definitions');
      }
      closing.outTime = '01:00:00';
    });
    const result = await exportSchedule({
      adp: {
        async fetchMonthlyView() {
          return { kind: 'json', body: overnight };
        },
      },
      clock: { now: () => new Date('2026-10-03T17:00:00.000Z') },
      state: memoryState('POS-0001'),
      timeZone,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const event = [...result.ics.matchAll(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g)]
      .map((match) => match[0])
      .find((block) => block.includes('UID:adpsshiftobj-1@adp-schedule-export'));
    expect(event).toContain(`DTSTART;TZID=${timeZone}:20260927T153000`);
    expect(event).toContain(`DTEND;TZID=${timeZone}:20260928T010000`);
  });

  it('falls back to inTimeHour and worked seconds when the Shift Definition is missing', async () => {
    const missing = mutate(octoberFixture, ({ shiftDefinitions }) => {
      const index = shiftDefinitions.findIndex((definition) => definition.shiftReferenceId === 'shiftref-2');
      if (index < 0) {
        throw new Error('fixture is missing Shift Definitions');
      }
      shiftDefinitions.splice(index, 1);
    });
    const result = await exportSchedule({
      adp: {
        async fetchMonthlyView() {
          return { kind: 'json', body: missing };
        },
      },
      clock: { now: () => new Date('2026-10-03T17:00:00.000Z') },
      state: memoryState('POS-0001'),
      timeZone,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const event = [...result.ics.matchAll(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g)]
      .map((match) => match[0])
      .find((block) => block.includes('UID:adpsshiftobj-1@adp-schedule-export'));
    expect(event).toContain(`DTSTART;TZID=${timeZone}:20260927T153000`);
    expect(event).toContain(`DTEND;TZID=${timeZone}:20260927T213000`);
    expect(event).toContain('SUMMARY:Shift');
  });

  it('keeps a Shift that already ends on a later date', async () => {
    const overnight = mutate(octoberFixture, ({ shifts }) => {
      const first = shifts.find((shift) => shift.shiftObjectId === 'shiftobj-1');
      if (!first) {
        throw new Error('fixture is missing a Shift');
      }
      first.shiftEndDate = '2026-09-28';
    });
    const event = await shiftEvent(overnight, 'adpsshiftobj-1@adp-schedule-export');
    expect(event).toContain(`DTSTART;TZID=${timeZone}:20260927T153000`);
    expect(event).toContain(`DTEND;TZID=${timeZone}:20260928T213000`);
  });

  it('does not subtract mealDeductSeconds when the Shift Definition is missing', async () => {
    const missing = mutate(octoberFixture, ({ shiftDefinitions, shifts }) => {
      const index = shiftDefinitions.findIndex((definition) => definition.shiftReferenceId === 'shiftref-2');
      const first = shifts.find((shift) => shift.shiftObjectId === 'shiftobj-1');
      if (index < 0 || !first) {
        throw new Error('fixture is missing a Shift');
      }
      shiftDefinitions.splice(index, 1);
      first.mealDeductSeconds = 1800;
      first.shiftWorkedTotalSeconds = 36000;
    });
    const event = await shiftEvent(missing, 'adpsshiftobj-1@adp-schedule-export');
    expect(event).toContain(`DTSTART;TZID=${timeZone}:20260927T153000`);
    expect(event).toContain(`DTEND;TZID=${timeZone}:20260928T013000`);
  });

  it('lists department, job, location, and pay code, and keeps a non-P status', async () => {
    const described = mutate(octoberFixture, ({ shiftDefinitions, shifts }) => {
      const closing = shiftDefinitions.find((definition) => definition.shiftReferenceId === 'shiftref-2');
      const first = shifts.find((shift) => shift.shiftObjectId === 'shiftobj-1');
      if (!closing || !first) {
        throw new Error('fixture is missing a Shift');
      }
      closing.templateName = 'Close';
      closing.departmentDesc = 'D';
      closing.workedJobDesc = 'J';
      closing.locationDesc = 'L';
      closing.payCodeDesc = 'P';
      first.status = 'ZZ';
    });
    const event = await shiftEvent(described, 'adpsshiftobj-1@adp-schedule-export');
    expect(event).toContain('SUMMARY:Close');
    expect(event).toContain('DESCRIPTION:Department: D\\nJob: J\\nLocation: L\\nPay code: P\\nStatus: ZZ');
  });

  it('emits each Holiday once when Positions repeat it, including unobserved days', async () => {
    const duplicated = mutate(octoberFixture, ({ holidays, assignments }) => {
      for (const holiday of holidays) {
        holiday.observed = true;
      }
      assignments.push({
        shifts: [],
        holidays: holidays.map((holiday) => ({ ...holiday, observed: false })),
      });
    });
    const result = await exportBody(duplicated);
    const events = vevents(result.ics).filter((event) => event.includes('UID:adph'));
    expect(events.map((event) => event.match(/UID:([^\r\n]+)/)?.[1])).toEqual([
      'adph20260930@adp-schedule-export',
      'adph20261012@adp-schedule-export',
    ]);
    expect(result.ics.match(/SUMMARY:Thanksgiving Day/g)).toHaveLength(1);
    expect(result.ics).not.toMatch(/position/i);
  });

  it('keeps distinct ids when two Holidays share a date but not a description', async () => {
    const shared = mutate(octoberFixture, ({ holidays }) => {
      holidays.push({ date: '2026-09-30', description: 'Extra', observed: false });
    });
    const result = await exportBody(shared);
    const uids = vevents(result.ics)
      .map((event) => event.match(/UID:([^\r\n]+)/)?.[1])
      .filter((uid) => uid?.includes('20260930'));
    expect(uids).toEqual([
      'adph20260930@adp-schedule-export',
      'adph20260930-2@adp-schedule-export',
    ]);
  });

  it('changes TZID and VTIMEZONE when the time zone override changes', async () => {
    const vancouver = await exportBody(octoberFixture, 'America/Vancouver');
    const toronto = await exportBody(octoberFixture, 'America/Toronto');
    expect(vtimezone(vancouver.ics)).toContain('TZID:America/Vancouver');
    expect(vtimezone(toronto.ics)).toContain('TZID:America/Toronto');
    expect(vtimezone(vancouver.ics)).not.toBe(vtimezone(toronto.ics));
    expect(vancouver.ics).toContain('DTSTART;TZID=America/Vancouver:20260927T153000');
    expect(toronto.ics).toContain('DTSTART;TZID=America/Toronto:20260927T153000');
  });
});

async function exportBody(body: unknown, zone = timeZone) {
  const result = await exportSchedule({
    adp: {
      async fetchMonthlyView() {
        return { kind: 'json', body };
      },
    },
    clock: { now: () => new Date('2026-10-03T17:00:00.000Z') },
    state: memoryState('POS-0001'),
    timeZone: zone,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error('expected an ICS export');
  }
  return result;
}

async function shiftEvent(body: unknown, uid: string): Promise<string> {
  const result = await exportBody(body);
  const event = vevents(result.ics).find((block) => block.includes(`UID:${uid}`));
  expect(event, uid).toBeDefined();
  if (!event) {
    throw new Error(`missing ${uid}`);
  }
  return event;
}

function vevents(ics: string): string[] {
  return [...ics.matchAll(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g)].map((match) => match[0]);
}

function vtimezone(ics: string): string {
  const match = ics.match(/BEGIN:VTIMEZONE[\s\S]*?END:VTIMEZONE/);
  expect(match).not.toBeNull();
  if (!match) {
    throw new Error('missing VTIMEZONE');
  }
  return match[0];
}

function mutate(
  body: unknown,
  change: (detail: {
    shiftDefinitions: Array<Record<string, unknown>>;
    shifts: Array<Record<string, unknown>>;
    holidays: Array<Record<string, unknown>>;
    assignments: Array<{
      shifts: Array<Record<string, unknown>>;
      holidays?: Array<Record<string, unknown>>;
    }>;
  }) => void,
): unknown {
  const copy = structuredClone(body) as {
    data: {
      details: Array<{
        shiftDefinitions: Array<Record<string, unknown>>;
        positionShiftAssignments: Array<{
          shifts: Array<Record<string, unknown>>;
          holidays?: Array<Record<string, unknown>>;
        }>;
      }>;
    };
  };
  const detail = copy.data.details[0];
  const assignment = detail?.positionShiftAssignments[0];
  if (!detail || !assignment || !assignment.holidays) {
    throw new Error('fixture is missing schedule details');
  }
  change({
    shiftDefinitions: detail.shiftDefinitions,
    shifts: assignment.shifts,
    holidays: assignment.holidays,
    assignments: detail.positionShiftAssignments,
  });
  return copy;
}
