import type { ShiftCalendarEvent, SyncInput, SyncResult } from './ports.ts';
import { SHIFT_CALENDAR_DESCRIPTION, SHIFT_CALENDAR_NAME, ShiftCalendarError } from './ports.ts';
import { localToday, scheduleWindow } from './schedule-range.ts';
import type { ShiftEvent } from './shifts.ts';
import { parseShifts } from './shifts.ts';

const ICS_SUFFIX = '@adp-schedule-export';

export async function syncSchedule(input: SyncInput): Promise<SyncResult> {
  const positionId = await input.state.getPositionId();
  if (!positionId) {
    return { ok: false, reason: 'no-position' };
  }

  const now = input.clock.now();
  const today = localToday(now, input.timeZone);
  const range = scheduleWindow(now, input.timeZone);
  const fetched = await input.adp.fetchMonthlyView(positionId, range.startDate, range.endDate);
  if (fetched.kind !== 'json') {
    return { ok: false, reason: 'session-dead' };
  }

  const parsed = parseShifts(fetched.body);
  if (!parsed.ok) {
    if (parsed.reason === 'position-invalid') {
      await input.state.clearPositionId();
    }
    return parsed;
  }

  const events = parsed.shifts
    .filter((shift) => shift.start.slice(0, 10) >= today)
    .map((shift) => toGoogleShift(shift, input.timeZone));

  try {
    const existing = await input.calendar.findByName(SHIFT_CALENDAR_NAME);
    const calendar =
      existing ??
      (await input.calendar.create({
        name: SHIFT_CALENDAR_NAME,
        description: SHIFT_CALENDAR_DESCRIPTION,
        timeZone: input.timeZone,
        private: true,
      }));
    for (const event of events) {
      await input.calendar.insert(calendar.id, event);
    }
    return {
      ok: true,
      calendarId: calendar.id,
      createdCalendar: existing === null,
      inserted: events.length,
    };
  } catch (error) {
    if (error instanceof ShiftCalendarError) {
      return { ok: false, reason: error.reason };
    }
    throw error;
  }
}

function toGoogleShift(shift: ShiftEvent, timeZone: string): ShiftCalendarEvent {
  return {
    id: googleEventId(shift.uid),
    title: shift.title,
    ...(shift.description ? { description: shift.description } : {}),
    start: { dateTime: shift.start, timeZone },
    end: { dateTime: shift.end, timeZone },
  };
}

function googleEventId(uid: string): string {
  return uid.endsWith(ICS_SUFFIX) ? uid.slice(0, -ICS_SUFFIX.length) : uid;
}
