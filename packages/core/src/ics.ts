import ical, { ICalEventStatus } from 'ical-generator';
import { tzlib_get_ical_block } from 'timezones-ical-library';
import type { ShiftEvent } from './shifts.ts';

export function shiftsToIcs(shifts: readonly ShiftEvent[], timeZone: string): string {
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
      status: ICalEventStatus.CONFIRMED,
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
