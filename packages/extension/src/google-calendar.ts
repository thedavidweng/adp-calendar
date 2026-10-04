import type { ShiftCalendar, ShiftCalendarRecord } from '@adp-calendar/core';
import { ShiftCalendarError } from '@adp-calendar/core/ports';

const API = 'https://www.googleapis.com/calendar/v3';

interface CalendarListItem {
  id?: string;
  summary?: string;
  description?: string;
  timeZone?: string;
}

interface CalendarListResponse {
  items?: CalendarListItem[];
  nextPageToken?: string;
}

export function createGoogleShiftCalendar(fetchImpl: typeof fetch, accessToken: string): ShiftCalendar {
  return {
    async findByName(name) {
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({ maxResults: '250' });
        if (pageToken) {
          params.set('pageToken', pageToken);
        }
        const body = (await requestJson(
          fetchImpl,
          accessToken,
          `/users/me/calendarList?${params}`,
        )) as CalendarListResponse;
        for (const item of body.items ?? []) {
          if (item.summary === name && item.id) {
            return record(item.id, name, item.description ?? '', item.timeZone ?? '');
          }
        }
        pageToken = body.nextPageToken;
      } while (pageToken);
      return null;
    },
    async create(calendar) {
      const body = (await requestJson(fetchImpl, accessToken, '/calendars', {
        method: 'POST',
        body: JSON.stringify({
          summary: calendar.name,
          description: calendar.description,
          timeZone: calendar.timeZone,
        }),
      })) as { id?: string };
      if (!body.id) {
        throw new ShiftCalendarError('google-error');
      }
      return record(body.id, calendar.name, calendar.description, calendar.timeZone);
    },
    async insert(calendarId, event) {
      await requestJson(fetchImpl, accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        body: JSON.stringify({
          id: event.id,
          summary: event.title,
          ...(event.description ? { description: event.description } : {}),
          start: event.start,
          end: event.end,
        }),
      });
    },
  };
}

function record(id: string, name: string, description: string, timeZone: string): ShiftCalendarRecord {
  return { id, name, description, timeZone, private: true };
}

async function requestJson(
  fetchImpl: typeof fetch,
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetchImpl(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (response.status === 401 || response.status === 403) {
    throw new ShiftCalendarError('google-auth');
  }
  if (response.status === 404) {
    throw new ShiftCalendarError('calendar-missing');
  }
  if (response.status === 409) {
    throw new ShiftCalendarError('conflict');
  }
  if (!response.ok) {
    throw new ShiftCalendarError('google-error');
  }
  const text = await response.text();
  if (!text) {
    return null;
  }
  return JSON.parse(text) as unknown;
}
