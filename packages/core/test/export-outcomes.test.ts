import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { exportSchedule, type AdpFetchResult, type StateStore } from '../src/index.ts';

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), '../../parser/test/fixtures');
const october = load('monthlyview-2026-10.redacted.json');
const nonTimeEmployee = load('monthlyview-non-time-employee.redacted.json');
const invertedRange = load('monthlyview-inverted-range.redacted.json');

function load(name: string): unknown {
  return JSON.parse(readFileSync(resolve(fixtures, name), 'utf8'));
}

function memoryState(positionId: string | null): StateStore & { position(): string | null } {
  let stored = positionId;
  return {
    position: () => stored,
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

async function exportBody(body: AdpFetchResult, positionId: string | null = 'POS-0001') {
  const state = memoryState(positionId);
  let calls = 0;
  const result = await exportSchedule({
    adp: {
      async fetchMonthlyView() {
        calls += 1;
        return body;
      },
    },
    clock: { now: () => new Date('2026-10-03T17:00:00.000Z') },
    state,
    timeZone: 'America/Vancouver',
  });
  return { result, state, calls };
}

describe('Export ADP outcomes', () => {
  it('exports an ICS when statusCode is 200 and the schedule assignments are an array', async () => {
    const { result, calls } = await exportBody({ kind: 'json', body: october });

    expect(calls).toBe(1);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.ics).toContain('BEGIN:VCALENDAR');
    expect(result.ics).toContain('UID:adpsshiftobj-1@adp-schedule-export');
    expect(result.filename).toBe('adp-shifts.ics');
  });

  it('treats a redirect to the ADP sign-in host as a dead session and does not build an ICS', async () => {
    const { result, state, calls } = await exportBody({ kind: 'redirected' });

    expect(result).toEqual({ ok: false, reason: 'session-dead' });
    expect(calls).toBe(1);
    expect(state.position()).toBe('POS-0001');
  });

  it('treats an HTML body as a dead session and does not build an ICS', async () => {
    const { result, calls } = await exportBody({ kind: 'non-json' });

    expect(result).toEqual({ ok: false, reason: 'session-dead' });
    expect(calls).toBe(1);
    expect(result).not.toHaveProperty('ics');
  });

  it('reports no schedule for err_nonTimeEmployee without building an ICS', async () => {
    const { result, state } = await exportBody({ kind: 'json', body: nonTimeEmployee });

    expect(result).toEqual({ ok: false, reason: 'no-schedule' });
    expect(state.position()).toBe('POS-0001');
  });

  it('clears the cached Position when a failure message names positionId', async () => {
    const body = {
      status: 'success',
      data: {
        status: 'failure',
        statusCode: 400,
        statusDescription: 'err_InvalidRequest',
        details: [
          {
            messages: [{ message: 'The position is not valid', severity: 'ERROR', field: 'positionId' }],
          },
        ],
      },
    };
    const { result, state } = await exportBody({ kind: 'json', body });

    expect(result).toEqual({ ok: false, reason: 'position-invalid' });
    expect(state.position()).toBeNull();
  });

  it('clears the cached Position when the failure text refers to positionId', async () => {
    const body = {
      status: 'success',
      data: {
        status: 'failure',
        statusCode: 400,
        statusDescription: 'err_UnexpectedError_Business_Validation',
        details: [{ err_msg: 'positionId is not associated with the employee' }],
      },
    };
    const { result, state } = await exportBody({ kind: 'json', body });

    expect(result).toEqual({ ok: false, reason: 'position-invalid' });
    expect(state.position()).toBeNull();
  });

  it('reports the raw statusDescription for any other ADP failure and does not build an ICS', async () => {
    const { result, state } = await exportBody({ kind: 'json', body: invertedRange });

    expect(result).toEqual({
      ok: false,
      reason: 'adp-error',
      description: 'err_UnexpectedError_Business_Validation',
    });
    expect(state.position()).toBe('POS-0001');
  });

  it('reports shape drift when a success body is missing shiftDefinitions', async () => {
    const body = structuredClone(october) as {
      data: { details: Array<Record<string, unknown>> };
    };
    delete body.data.details[0]?.shiftDefinitions;
    const { result } = await exportBody({ kind: 'json', body });

    expect(result).toEqual({ ok: false, reason: 'shape-drift' });
  });

  it('reports shape drift when a success body is missing shifts', async () => {
    const body = structuredClone(october) as {
      data: { details: Array<{ positionShiftAssignments: Array<Record<string, unknown>> }> };
    };
    delete body.data.details[0]?.positionShiftAssignments[0]?.shifts;
    const { result } = await exportBody({ kind: 'json', body });

    expect(result).toEqual({ ok: false, reason: 'shape-drift' });
  });

  it('reports shape drift when inTime is not HH:MM:SS', async () => {
    const body = structuredClone(october) as {
      data: { details: Array<{ shiftDefinitions: Array<Record<string, unknown>> }> };
    };
    const definition = body.data.details[0]?.shiftDefinitions[0];
    if (!definition) {
      throw new Error('fixture is missing a Shift Definition');
    }
    definition.inTime = '3:30 PM';
    const { result } = await exportBody({ kind: 'json', body });

    expect(result).toEqual({ ok: false, reason: 'shape-drift' });
  });

  it('reports shape drift when a Shift is missing shiftObjectId', async () => {
    const body = structuredClone(october) as {
      data: {
        details: Array<{ positionShiftAssignments: Array<{ shifts: Array<Record<string, unknown>> }> }>;
      };
    };
    const shift = body.data.details[0]?.positionShiftAssignments[0]?.shifts[0];
    if (!shift) {
      throw new Error('fixture is missing a Shift');
    }
    delete shift.shiftObjectId;
    const { result } = await exportBody({ kind: 'json', body });

    expect(result).toEqual({ ok: false, reason: 'shape-drift' });
  });
});
