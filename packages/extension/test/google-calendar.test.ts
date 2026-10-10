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

function memoryIds(initial: string | null = null) {
  let value = initial;
  return {
    get value() {
      return value;
    },
    async load() {
      return value;
    },
    async save(calendarId: string) {
      value = calendarId;
    },
    async clear() {
      value = null;
    },
  };
}

describe('Google Shift Calendar', () => {
  it('recovers an existing calendar after local storage is lost, including hidden calendars on later pages', async () => {
    const { fetchImpl, calls } = mockFetch([
      { path: '/calendar/v3/users/me/calendarList', status: 200, body: {
        items: [{ id: 'personal', summary: SHIFT_CALENDAR_NAME }], nextPageToken: 'next',
      } },
      { path: '/calendar/v3/users/me/calendarList', status: 200, body: { items: [
        { id: 'existing', summary: SHIFT_CALENDAR_NAME, description: SHIFT_CALENDAR_DESCRIPTION, timeZone },
      ] } },
      { path: '/calendar/v3/calendars/existing', status: 200, body: {
        id: 'existing', summary: SHIFT_CALENDAR_NAME, description: SHIFT_CALENDAR_DESCRIPTION, timeZone,
      } },
      { path: '/calendar/v3/calendars/existing', status: 200, body: {
        id: 'existing', summary: SHIFT_CALENDAR_NAME, description: SHIFT_CALENDAR_DESCRIPTION, timeZone,
      } },
    ]);
    const ids = memoryIds();
    const calendar = createGoogleShiftCalendar(fetchImpl, 'token', ids);
    expect((await calendar.findByName(SHIFT_CALENDAR_NAME))?.id).toBe('existing');
    expect(ids.value).toBe('existing');
    expect((await createGoogleShiftCalendar(fetchImpl, 'token', ids).findByName(SHIFT_CALENDAR_NAME))?.id).toBe('existing');
    expect(new URL(calls[0]!.url).searchParams.get('showHidden')).toBe('true');
    expect(new URL(calls[0]!.url).searchParams.get('minAccessRole')).toBe('owner');
    expect(new URL(calls[1]!.url).searchParams.get('pageToken')).toBe('next');
    expect(calls.every((call) => call.method === 'GET')).toBe(true);
  });

  it('stops on a lookup permission error instead of treating it as no calendar', async () => {
    const { fetchImpl } = mockFetch([{ path: '/calendar/v3/users/me/calendarList', status: 403 }]);
    await expect(createGoogleShiftCalendar(fetchImpl, 'token', memoryIds()).findByName(SHIFT_CALENDAR_NAME))
      .rejects.toMatchObject({ reason: 'google-auth' });
  });

  it('chooses the same existing calendar when duplicates are returned in different orders', async () => {
    for (const order of [['b', 'a'], ['a', 'b']]) {
      const { fetchImpl, calls } = mockFetch([
        { path: '/calendar/v3/users/me/calendarList', status: 200, body: { items: order.map((id) => ({
          id, summary: SHIFT_CALENDAR_NAME, description: SHIFT_CALENDAR_DESCRIPTION, timeZone,
        })) } },
        { path: '/calendar/v3/calendars/a', status: 200, body: { id: 'a', summary: SHIFT_CALENDAR_NAME, timeZone } },
      ]);
      expect((await createGoogleShiftCalendar(fetchImpl, 'token', memoryIds()).findByName(SHIFT_CALENDAR_NAME))?.id).toBe('a');
      expect(calls.every((call) => call.method === 'GET')).toBe(true);
    }
  });

  it.each([403, 404])('does not adopt or replace a matching calendar that app.created cannot access (%s)', async (status) => {
    const { fetchImpl } = mockFetch([
      { path: '/calendar/v3/users/me/calendarList', status: 200, body: { items: [{
        id: 'unrelated', summary: SHIFT_CALENDAR_NAME, description: SHIFT_CALENDAR_DESCRIPTION,
      }] } },
      { path: '/calendar/v3/calendars/unrelated', status },
    ]);
    const ids = memoryIds();
    await expect(createGoogleShiftCalendar(fetchImpl, 'token', ids).findByName(SHIFT_CALENDAR_NAME))
      .rejects.toMatchObject({ reason: status === 403 ? 'google-auth' : 'calendar-missing' });
    expect(ids.value).toBeNull();
  });

  it('creates a private calendar and inserts a Shift with local dateTime plus timeZone', async () => {
    const { fetchImpl, calls } = mockFetch([
      { path: '/calendar/v3/users/me/calendarList', status: 200, body: { items: [] } },
      { path: '/calendar/v3/calendars', status: 200, body: { id: 'cal-1' } },
      { path: '/calendar/v3/calendars/cal-1/events', status: 200, body: { id: 'adpsshiftobj-4' } },
    ]);
    const ids = memoryIds();
    const calendar = createGoogleShiftCalendar(fetchImpl, 'ya29.token', ids);

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
    expect(ids.value).toBe('cal-1');
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

  it('finds the remembered Shift Calendar by id without listing calendars', async () => {
    const { fetchImpl, calls } = mockFetch([
      {
        path: '/calendar/v3/calendars/existing',
        status: 200,
        body: { id: 'existing', summary: SHIFT_CALENDAR_NAME, description: SHIFT_CALENDAR_DESCRIPTION, timeZone },
      },
    ]);
    const calendar = createGoogleShiftCalendar(fetchImpl, 'ya29.token', memoryIds('existing'));
    await expect(calendar.findByName(SHIFT_CALENDAR_NAME)).resolves.toEqual({
      id: 'existing',
      name: SHIFT_CALENDAR_NAME,
      description: SHIFT_CALENDAR_DESCRIPTION,
      timeZone,
      private: true,
    });
    expect(calls).toHaveLength(1);
  });

  it('forgets a remembered Shift Calendar that the user deleted', async () => {
    const { fetchImpl } = mockFetch([
      { path: '/calendar/v3/calendars/gone', status: 404, body: {} },
      { path: '/calendar/v3/users/me/calendarList', status: 200, body: { items: [] } },
    ]);
    const ids = memoryIds('gone');
    const calendar = createGoogleShiftCalendar(fetchImpl, 'ya29.token', ids);
    await expect(calendar.findByName(SHIFT_CALENDAR_NAME)).resolves.toBeNull();
    expect(ids.value).toBeNull();
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
    const calendar = createGoogleShiftCalendar(fetchImpl, 'ya29.token', memoryIds());

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
    const calendar = createGoogleShiftCalendar(fetchImpl, 'ya29.token', memoryIds());
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
    const { fetchImpl } = mockFetch([{ path: '/calendar/v3/calendars/cal-1', status: 401, body: {} }]);
    const calendar = createGoogleShiftCalendar(fetchImpl, 'ya29.expired', memoryIds('cal-1'));
    await expect(calendar.findByName(SHIFT_CALENDAR_NAME)).rejects.toEqual(new ShiftCalendarError('google-auth'));
  });
});
