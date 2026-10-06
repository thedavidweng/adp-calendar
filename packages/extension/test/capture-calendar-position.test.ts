import type { StateStore } from '@adp-calendar/core';
import { describe, expect, it } from 'vitest';
import { calendarPositionRequest, captureCalendarPosition } from '../src/capture-calendar-position.ts';

const request = 'https://workforcenow.adp.com/mascsr/timeoffrequest/ess/metaservices/emppositions/getemployeepositions/?pfid=PF-SELECTED&requestoid=R-1&preventcache=1';

function stateSpy() {
  let position: string | null = null;
  const writes: string[] = [];
  const state: StateStore = {
    async getPositionId() { return position; },
    async setPositionId(value) { position = value; writes.push(value); },
    async clearPositionId() { position = null; },
  };
  return { state, writes };
}

const response = () => new Response(JSON.stringify({
  employeePositinDto: {
    empName: 'not stored',
    positionList: [
      { pFid: 'PF-PRIMARY', positionId: 'POS-PRIMARY', primaryPosition: true },
      { pFid: 'PF-SELECTED', positionId: 'POS-SELECTED', primaryPosition: false },
    ],
  },
}));

describe('the current ADP Calendar without legacy iframes', () => {
  it('recognizes only Calendar position requests on ADP', () => {
    expect(calendarPositionRequest(request)).toBe(true);
    expect(calendarPositionRequest(request.replace('workforcenow.adp.com', 'example.com'))).toBe(false);
    expect(calendarPositionRequest('https://workforcenow.adp.com/theme/index.html')).toBe(false);
    expect(calendarPositionRequest(request.replace('pfid=PF-SELECTED', 'pfid='))).toBe(false);
  });

  it('stores the selected Position rather than another primary job, without storing employee data', async () => {
    const { state, writes } = stateSpy();
    const fetchImpl: typeof fetch = async (url, options) => {
      expect(url).toBe(request);
      expect(options).toEqual({ credentials: 'same-origin' });
      return response();
    };
    expect(await captureCalendarPosition(request, state, fetchImpl)).toBe('POS-SELECTED');
    await captureCalendarPosition(request, state, fetchImpl);
    expect(writes).toEqual(['POS-SELECTED']);
    expect(await captureCalendarPosition(request.replace('PF-SELECTED', 'PF-PRIMARY'), state, async () => response())).toBe('POS-PRIMARY');
    expect(writes).toEqual(['POS-SELECTED', 'POS-PRIMARY']);
  });

  it('never guesses a Position if the selected job is absent', async () => {
    const { state, writes } = stateSpy();
    expect(await captureCalendarPosition(request.replace('PF-SELECTED', 'PF-MISSING'), state, async () => response())).toBeNull();
    expect(writes).toEqual([]);
  });

  it('reports an unsuccessful lookup', async () => {
    const { state, writes } = stateSpy();
    await expect(captureCalendarPosition(request, state, async () => new Response('', { status: 403 }))).rejects.toThrow('403');
    expect(writes).toEqual([]);
  });
});
