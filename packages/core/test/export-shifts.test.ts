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
  it('writes seven Shift events with local wall times, TZID, and stable UIDs', async () => {
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
    expect(events).toHaveLength(7);

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
      expect(event).not.toMatch(/DTSTART[^:]*:\d{8}T\d{6}Z/);
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
});

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
