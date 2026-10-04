import { SHIFT_CALENDAR_DESCRIPTION, SHIFT_CALENDAR_NAME, ShiftCalendarError } from '@adp-calendar/core';
import { describe, expect, it } from 'vitest';
import { createGoogleShiftCalendar } from '../src/google-calendar.ts';

const timeZone = 'America/Vancouver';

function mockFetch(routes: Array<{ path: string; status: number; body?: unknown }>) {
  const calls: Array<{ url: string; method: string; authorization: string; body: unknown }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const raw = typeof init?.body === 'string' ? init.body : '';
    calls.push({
      url,
      method: init?.method ?? 'GET',
      authorization: new Headers(init?.headers).get('Authorization') ?? '',
      body: raw ? (JSON.parse(raw) as unknown) : null,
    });
    const path = new URL(url).pathname;
    const route = routes.find((item) => path === item.path);
    if (!route) {
      throw new Error(`unexpected ${path}`);
    }
    return new Response(route.body === undefined ? '' : JSON.stringify(route.body), { status: route.status });
  };
  return { fetchImpl, calls };
}

describe('Google Shift Calendar', () => {
  it('creates a private calendar and inserts a Shift with local dateTime plus timeZone', async () => {
    const { fetchImpl, calls } = mockFetch([
      { path: '/calendar/v3/users/me/calendarList', status: 200, body: { items: [] } },
      { path: '/calendar/v3/calendars', status: 200, body: { id: 'cal-1' } },
      { path: '/calendar/v3/calendars/cal-1/events', status: 200, body: { id: 'adpsshiftobj-4' } },
    ]);
    const calendar = createGoogleShiftCalendar(fetchImpl, 'ya29.token');

    expect(await calendar.findByName(SHIFT_CALENDAR_NAME)).toBeNull();
    const created = await calendar.create({
      name: SHIFT_CALENDAR_NAME,
      description: SHIFT_CALENDAR_DESCRIPTION,
      timeZone,
      private: true,
    });
    await calendar.insert(created.id, {
      id: 'adpsshiftobj-4',
      title: 'Shift',
      start: { dateTime: '2026-10-05T17:00:00', timeZone },
      end: { dateTime: '2026-10-05T22:30:00', timeZone },
    });

    expect(created).toEqual({
      id: 'cal-1',
      name: SHIFT_CALENDAR_NAME,
      description: SHIFT_CALENDAR_DESCRIPTION,
      timeZone,
      private: true,
    });
    expect(calls.map((call) => `${call.method} ${new URL(call.url).pathname}`)).toEqual([
      'GET /calendar/v3/users/me/calendarList',
      'POST /calendar/v3/calendars',
      'POST /calendar/v3/calendars/cal-1/events',
    ]);
    expect(calls.every((call) => call.authorization === 'Bearer ya29.token')).toBe(true);
    expect(calls[1]?.body).toEqual({
      summary: SHIFT_CALENDAR_NAME,
      description: SHIFT_CALENDAR_DESCRIPTION,
      timeZone,
    });
    expect(calls[2]?.body).toEqual({
      id: 'adpsshiftobj-4',
      summary: 'Shift',
      start: { dateTime: '2026-10-05T17:00:00', timeZone },
      end: { dateTime: '2026-10-05T22:30:00', timeZone },
    });
    expect(JSON.stringify(calls)).not.toContain('/acl');
    expect(JSON.stringify(calls[2]?.body)).not.toMatch(/Z"|[+-]\d{2}:\d{2}/);
  });

  it('finds an existing Shift Calendar by name without creating another', async () => {
    const { fetchImpl, calls } = mockFetch([
      {
        path: '/calendar/v3/users/me/calendarList',
        status: 200,
        body: { items: [{ id: 'existing', summary: SHIFT_CALENDAR_NAME, description: SHIFT_CALENDAR_DESCRIPTION, timeZone }] },
      },
    ]);
    const calendar = createGoogleShiftCalendar(fetchImpl, 'ya29.token');
    await expect(calendar.findByName(SHIFT_CALENDAR_NAME)).resolves.toMatchObject({ id: 'existing', private: true });
    expect(calls).toHaveLength(1);
  });

  it('maps a revoked token to google-auth', async () => {
    const { fetchImpl } = mockFetch([{ path: '/calendar/v3/users/me/calendarList', status: 401, body: {} }]);
    const calendar = createGoogleShiftCalendar(fetchImpl, 'ya29.expired');
    await expect(calendar.findByName(SHIFT_CALENDAR_NAME)).rejects.toEqual(new ShiftCalendarError('google-auth'));
  });
});
