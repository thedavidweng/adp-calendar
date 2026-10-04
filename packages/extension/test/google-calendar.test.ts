import { SHIFT_CALENDAR_DESCRIPTION, SHIFT_CALENDAR_NAME, ShiftCalendarError } from '@adp-calendar/core';
import { describe, expect, it } from 'vitest';
import { createGoogleShiftCalendar } from '../src/google-calendar.ts';

const timeZone = 'America/Vancouver';

function wallClock(instant: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const hour = value('hour') === '24' ? '00' : value('hour');
  return `${value('year')}-${value('month')}-${value('day')}T${hour}:${value('minute')}:${value('second')}`;
}

function mockFetch(routes: Array<{ path: string; status: number; body?: unknown }>) {
  const calls: Array<{ url: string; method: string; authorization: string; body: unknown }> = [];
  const remaining = routes.map((route) => ({ ...route }));
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
    const index = remaining.findIndex((item) => path === item.path);
    const route = index < 0 ? undefined : remaining.splice(index, 1)[0];
    if (!route) {
      throw new Error(`unexpected ${path}`);
    }
    const body = route.body === undefined ? null : JSON.stringify(route.body);
    return new Response(body, { status: route.status });
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

  it('lists deleted events in the window and restores, updates, or deletes them', async () => {
    const { fetchImpl, calls } = mockFetch([
      {
        path: '/calendar/v3/calendars/cal-1/events',
        status: 200,
        body: {
          items: [
            {
              id: 'adpsshiftobj-4',
              status: 'cancelled',
              summary: 'Shift',
              start: { dateTime: '2026-10-05T17:00:00-07:00', timeZone },
              end: { dateTime: '2026-10-06T05:30:00Z', timeZone },
            },
            {
              id: 'adph20261012',
              status: 'confirmed',
              summary: 'Thanksgiving Day',
              start: { date: '2026-10-12' },
              end: { date: '2026-10-13' },
              transparency: 'transparent',
            },
          ],
          nextPageToken: 'page-2',
        },
      },
      { path: '/calendar/v3/calendars/cal-1/events', status: 200, body: { items: [] } },
      { path: '/calendar/v3/calendars/cal-1/events/adpsshiftobj-4', status: 200, body: {} },
      { path: '/calendar/v3/calendars/cal-1/events/adph20261012', status: 200, body: {} },
      { path: '/calendar/v3/calendars/cal-1/events/manual-1', status: 204 },
    ]);
    const calendar = createGoogleShiftCalendar(fetchImpl, 'ya29.token');

    await expect(
      calendar.list('cal-1', { startDate: '2026-10-03', endDate: '2027-01-01', timeZone }),
    ).resolves.toEqual([
      {
        id: 'adpsshiftobj-4',
        title: 'Shift',
        status: 'cancelled',
        start: { dateTime: '2026-10-05T17:00:00', timeZone },
        end: { dateTime: '2026-10-05T22:30:00', timeZone },
      },
      {
        id: 'adph20261012',
        title: 'Thanksgiving Day',
        status: 'confirmed',
        transparency: 'transparent',
        start: { date: '2026-10-12' },
        end: { date: '2026-10-13' },
      },
    ]);

    const listUrl = new URL(calls[0]?.url ?? '');
    expect(listUrl.searchParams.get('showDeleted')).toBe('true');
    expect(listUrl.searchParams.get('singleEvents')).toBe('true');
    expect(listUrl.searchParams.get('timeMin')).toBe('2026-10-03T00:00:00-07:00');
    const timeMax = listUrl.searchParams.get('timeMax');
    expect(timeMax?.startsWith('2027-01-02T00:00:00')).toBe(true);
    expect(wallClock(new Date(timeMax ?? ''), timeZone)).toBe('2027-01-02T00:00:00');
    expect(calls[1] && new URL(calls[1].url).searchParams.get('pageToken')).toBe('page-2');

    await calendar.update('cal-1', {
      id: 'adpsshiftobj-4',
      title: 'Shift',
      start: { dateTime: '2026-10-05T17:00:00', timeZone },
      end: { dateTime: '2026-10-05T22:30:00', timeZone },
    });
    await calendar.update('cal-1', {
      id: 'adph20261012',
      title: 'Thanksgiving Day',
      start: { date: '2026-10-12' },
      end: { date: '2026-10-13' },
      transparency: 'transparent',
    });
    await calendar.delete('cal-1', 'manual-1');

    expect(calls[2]?.method).toBe('PUT');
    expect(calls[2]?.body).toEqual({
      summary: 'Shift',
      description: '',
      transparency: 'opaque',
      status: 'confirmed',
      start: { dateTime: '2026-10-05T17:00:00', timeZone },
      end: { dateTime: '2026-10-05T22:30:00', timeZone },
    });
    expect(calls[3]?.body).toMatchObject({
      summary: 'Thanksgiving Day',
      transparency: 'transparent',
      status: 'confirmed',
      start: { date: '2026-10-12' },
      end: { date: '2026-10-13' },
    });
    expect(calls[4]?.method).toBe('DELETE');
  });

  it('sends an all-day Holiday as a transparent date event', async () => {
    const { fetchImpl, calls } = mockFetch([
      { path: '/calendar/v3/calendars/cal-1/events', status: 200, body: { id: 'adph20261012' } },
    ]);
    const calendar = createGoogleShiftCalendar(fetchImpl, 'ya29.token');
    await calendar.insert('cal-1', {
      id: 'adph20261012',
      title: 'Thanksgiving Day',
      start: { date: '2026-10-12' },
      end: { date: '2026-10-13' },
      transparency: 'transparent',
    });
    expect(calls[0]?.body).toEqual({
      id: 'adph20261012',
      summary: 'Thanksgiving Day',
      start: { date: '2026-10-12' },
      end: { date: '2026-10-13' },
      transparency: 'transparent',
    });
  });

  it('maps a revoked token to google-auth', async () => {
    const { fetchImpl } = mockFetch([{ path: '/calendar/v3/users/me/calendarList', status: 401, body: {} }]);
    const calendar = createGoogleShiftCalendar(fetchImpl, 'ya29.expired');
    await expect(calendar.findByName(SHIFT_CALENDAR_NAME)).rejects.toEqual(new ShiftCalendarError('google-auth'));
  });
});
