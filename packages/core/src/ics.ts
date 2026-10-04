import ical, { ICalEventStatus, ICalEventTransparency } from 'ical-generator';
import { tzlib_get_ical_block } from 'timezones-ical-library';
import { addDays } from './schedule-range.ts';
import type { HolidayEvent, ShiftEvent } from './shifts.ts';

export function shiftsToIcs(
  shifts: readonly ShiftEvent[],
  holidays: readonly HolidayEvent[],
  timeZone: string,
): string {
  const calendar = ical({
    name: 'ADP Shifts',
    prodId: { company: 'adp-calendar', product: 'schedule-export' },
  });
  calendar.timezone({
    name: timeZone,
    generator: vtimezone,
  });
  for (const shift of shifts) {
    calendar.createEvent({
      id: shift.uid,
      start: shift.start,
      end: shift.end,
      timezone: timeZone,
      summary: shift.title,
      ...(shift.description ? { description: shift.description } : {}),
      status: ICalEventStatus.CONFIRMED,
    });
  }
  for (const holiday of holidays) {
    // Noon, not a date-only string: `new Date('YYYY-MM-DD')` is UTC and would move the day.
    calendar.createEvent({
      id: holiday.uid,
      start: `${holiday.date}T12:00:00`,
      end: `${addDays(holiday.date, 1)}T12:00:00`,
      allDay: true,
      timezone: timeZone,
      summary: holiday.title,
      status: ICalEventStatus.CONFIRMED,
      transparency: ICalEventTransparency.TRANSPARENT,
    });
  }
  return calendar.toString();
}

function vtimezone(timeZone: string): string {
  const block = tzlib_get_ical_block(timeZone);
  const text = Array.isArray(block) ? block[0] : block;
  if (!text || !text.includes('BEGIN:VTIMEZONE')) {
    throw new Error(`No VTIMEZONE for ${timeZone}`);
  }
  return text;
}
