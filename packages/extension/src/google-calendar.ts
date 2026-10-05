import {
  addDays,
  type ShiftCalendar,
  type ShiftCalendarEvent,
  type ShiftCalendarRecord,
  type ShiftCalendarWhen,
} from '@adp-calendar/core';
import { ShiftCalendarError } from '@adp-calendar/core/ports';

const API = 'https://www.googleapis.com/calendar/v3';

interface GoogleWhen {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

interface GoogleEvent {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  transparency?: string;
  start?: GoogleWhen;
  end?: GoogleWhen;
}

interface GoogleEventList {
  items?: GoogleEvent[];
  nextPageToken?: string;
}

export interface CalendarIdStore {
  load(): Promise<string | null>;
  save(calendarId: string): Promise<void>;
  clear(): Promise<void>;
}

interface CalendarResource {
  id?: string;
  summary?: string;
  description?: string;
  timeZone?: string;
}

/**
 * calendar.app.created cannot list the user's calendars, so the Shift Calendar is found again by the id
 * remembered when it was created, not by searching for its name.
 */
export function createGoogleShiftCalendar(
  fetchImpl: typeof fetch,
  accessToken: string,
  calendarIds: CalendarIdStore,
): ShiftCalendar {
  return {
    async findByName(name) {
      const calendarId = await calendarIds.load();
      if (!calendarId) {
        return null;
      }
      let body: CalendarResource;
      try {
        body = (await requestJson(
          fetchImpl,
          accessToken,
          `/calendars/${encodeURIComponent(calendarId)}`,
        )) as CalendarResource;
      } catch (error) {
        if (error instanceof ShiftCalendarError && error.reason === 'calendar-missing') {
          await calendarIds.clear();
          return null;
        }
        throw error;
      }
      return record(calendarId, body.summary ?? name, body.description ?? '', body.timeZone ?? '');
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
      await calendarIds.save(body.id);
      return record(body.id, calendar.name, calendar.description, calendar.timeZone);
    },
    async list(calendarId, range) {
      const events: ShiftCalendarEvent[] = [];
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          maxResults: '2500',
          singleEvents: 'true',
          showDeleted: 'true',
          orderBy: 'startTime',
          timeMin: rfc3339At(range.startDate, '00:00:00', range.timeZone),
          timeMax: rfc3339At(addDays(range.endDate, 1), '00:00:00', range.timeZone),
        });
        if (pageToken) {
          params.set('pageToken', pageToken);
        }
        const body = (await requestJson(
          fetchImpl,
          accessToken,
          `/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
        )) as GoogleEventList;
        for (const item of body.items ?? []) {
          events.push(readEvent(item, range.timeZone));
        }
        pageToken = body.nextPageToken;
      } while (pageToken);
      return events;
    },
    async insert(calendarId, event) {
      await requestJson(fetchImpl, accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        body: JSON.stringify(toPayload(event, 'insert')),
      });
    },
    async update(calendarId, event) {
      await requestJson(
        fetchImpl,
        accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.id)}`,
        {
          method: 'PUT',
          body: JSON.stringify(toPayload(event, 'update')),
        },
      );
    },
    async delete(calendarId, eventId) {
      await requestJson(
        fetchImpl,
        accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        { method: 'DELETE' },
      );
    },
  };
}

function toPayload(event: ShiftCalendarEvent, mode: 'insert' | 'update'): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    summary: event.title,
    start: event.start,
    end: event.end,
  };
  if (mode === 'insert') {
    payload.id = event.id;
    if (event.description) {
      payload.description = event.description;
    }
    if (event.transparency) {
      payload.transparency = event.transparency;
    }
    return payload;
  }
  payload.description = event.description ?? '';
  payload.transparency = event.transparency ?? 'opaque';
  payload.status = 'confirmed';
  return payload;
}

function readEvent(item: GoogleEvent, fallbackZone: string): ShiftCalendarEvent {
  if (!item.id || !item.start || !item.end) {
    throw new ShiftCalendarError('google-error');
  }
  const transparency =
    item.transparency === 'transparent' || item.transparency === 'opaque' ? item.transparency : undefined;
  return {
    id: item.id,
    title: item.summary ?? '',
    ...(item.description ? { description: item.description } : {}),
    start: readWhen(item.start, fallbackZone),
    end: readWhen(item.end, fallbackZone),
    ...(transparency ? { transparency } : {}),
    status: item.status === 'cancelled' ? 'cancelled' : 'confirmed',
  };
}

function readWhen(value: GoogleWhen, fallbackZone: string): ShiftCalendarWhen {
  if (value.date) {
    return { date: value.date };
  }
  if (!value.dateTime) {
    throw new ShiftCalendarError('google-error');
  }
  const timeZone = value.timeZone || fallbackZone;
  return { dateTime: localDateTime(value.dateTime, timeZone), timeZone };
}

function localDateTime(dateTime: string, timeZone: string): string {
  const bare = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})$/.exec(dateTime);
  if (bare?.[1]) {
    return bare[1];
  }
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(dateTime)) {
    throw new ShiftCalendarError('google-error');
  }
  const instant = new Date(dateTime);
  if (Number.isNaN(instant.getTime())) {
    throw new ShiftCalendarError('google-error');
  }
  const wall = wallClock(instant, timeZone);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}T${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}`;
}

function rfc3339At(date: string, time: string, timeZone: string): string {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) {
    throw new ShiftCalendarError('google-error');
  }
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3]);
  const desired = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = desired;
  for (let pass = 0; pass < 3; pass += 1) {
    const wall = wallClock(new Date(utc), timeZone);
    const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
    const next = utc - (asUtc - desired);
    if (next === utc) {
      break;
    }
    utc = next;
  }
  const wall = wallClock(new Date(utc), timeZone);
  const offsetMinutes = Math.round(
    (Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second) - utc) / 60000,
  );
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date}T${time}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function wallClock(instant: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const year = value('year');
  const month = value('month');
  const day = value('day');
  let hour = value('hour');
  const minute = value('minute');
  const second = value('second');
  if ([year, month, day, hour, minute, second].some((part) => Number.isNaN(part))) {
    throw new ShiftCalendarError('google-error');
  }
  if (hour === 24) {
    hour = 0;
  }
  return { year, month, day, hour, minute, second };
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
