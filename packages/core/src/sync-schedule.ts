import type {
  LastSuccess,
  ShiftCalendarEvent,
  ShiftCalendarWhen,
  SyncAttempt,
  SyncAttemptOutcome,
  SyncInput,
  SyncResult,
  SyncSummary,
} from './ports.ts';
import { SHIFT_CALENDAR_DESCRIPTION, SHIFT_CALENDAR_NAME, SYNC_ATTEMPT_CAP, ShiftCalendarError } from './ports.ts';
import { addDays, localToday, scheduleWindow } from './schedule-range.ts';
import type { HolidayEvent, ShiftEvent } from './shifts.ts';
import { parseShifts } from './shifts.ts';

const ICS_SUFFIX = '@adp-schedule-export';
const THREE_AND_A_HALF_DAYS_MS = 3.5 * 24 * 60 * 60 * 1000;

export function syncIsDue(lastSuccessAt: string | null, now: Date): boolean {
  if (lastSuccessAt === null) {
    return true;
  }
  const then = Date.parse(lastSuccessAt);
  if (Number.isNaN(then)) {
    return true;
  }
  return now.getTime() - then > THREE_AND_A_HALF_DAYS_MS;
}

type AttemptResult = Exclude<SyncResult, { ok: true; skipped: 'not-due' }>;

export async function syncSchedule(input: SyncInput): Promise<SyncResult> {
  const now = input.clock.now();
  const last = await input.history.getLastSuccess();
  if (!input.forced && !syncIsDue(last?.at ?? null, now)) {
    return { ok: true, skipped: 'not-due' };
  }

  const finish = (result: AttemptResult) => recordSyncAttempt(input, now, last, result);

  const positionId = await input.state.getPositionId();
  if (!positionId) {
    return finish({ ok: false, reason: 'no-position' });
  }

  const today = localToday(now, input.timeZone);
  const range = scheduleWindow(now, input.timeZone);
  const fetched = await input.adp.fetchMonthlyView(positionId, range.startDate, range.endDate);
  if (fetched.kind !== 'json') {
    const notified = await input.diagnostics.getSignInNotified();
    if (!notified) {
      await input.diagnostics.setSignInNotified(true);
      return finish({ ok: false, reason: 'needs-sign-in' });
    }
    return finish({ ok: false, reason: 'session-dead' });
  }

  const parsed = parseShifts(fetched.body);
  if (!parsed.ok) {
    if (parsed.reason === 'position-invalid') {
      await input.state.clearPositionId();
    }
    return finish(parsed);
  }

  const desired = [
    ...parsed.shifts
      .filter((shift) => shift.start.slice(0, 10) >= today)
      .map((shift) => toGoogleShift(shift, input.timeZone)),
    ...parsed.holidays.filter((holiday) => holiday.date >= today).map((holiday) => toGoogleHoliday(holiday)),
  ];

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
    const counts = await reconcile(input, calendar.id, today, range.endDate, desired);
    const summary: SyncSummary = {
      created: counts.created,
      updated: counts.updated,
      restored: counts.restored,
      deleted: counts.deleted,
    };
    await input.history.setLastSuccess({ at: now.toISOString(), summary });
    return finish({
      ok: true,
      calendarId: calendar.id,
      createdCalendar: existing === null,
      ...summary,
    });
  } catch (error) {
    if (error instanceof ShiftCalendarError) {
      return finish({ ok: false, reason: error.reason });
    }
    throw error;
  }
}

async function recordSyncAttempt(
  input: SyncInput,
  now: Date,
  last: LastSuccess | null,
  result: AttemptResult,
): Promise<AttemptResult> {
  if (result.ok) {
    await input.diagnostics.setSignInNotified(false);
  }
  const outcome: SyncAttemptOutcome = result.ok ? 'success' : result.reason;
  const attempt: SyncAttempt = {
    at: now.toISOString(),
    sinceLastSuccessMs: sinceLastSuccess(last, now),
    outcome,
  };
  const prior = await input.diagnostics.getAttempts();
  await input.diagnostics.setAttempts([...prior.slice(-(SYNC_ATTEMPT_CAP - 1)), attempt]);
  return result;
}

function sinceLastSuccess(last: LastSuccess | null, now: Date): number | null {
  if (!last) {
    return null;
  }
  const then = Date.parse(last.at);
  return Number.isNaN(then) ? null : now.getTime() - then;
}

async function reconcile(
  input: SyncInput,
  calendarId: string,
  today: string,
  endDate: string,
  desired: ShiftCalendarEvent[],
): Promise<SyncSummary> {
  const listed = await input.calendar.list(calendarId, { startDate: today, endDate, timeZone: input.timeZone });
  const wanted = new Map(desired.map((event) => [event.id, event]));
  const seen = new Set<string>();
  const counts: SyncSummary = { created: 0, updated: 0, restored: 0, deleted: 0 };

  for (const event of listed) {
    if (startDate(event) < today) {
      continue;
    }
    const want = wanted.get(event.id);
    if (!want) {
      if (event.status !== 'cancelled') {
        await input.calendar.delete(calendarId, event.id);
        counts.deleted += 1;
      }
      continue;
    }
    seen.add(event.id);
    if (event.status === 'cancelled') {
      await input.calendar.update(calendarId, want);
      counts.restored += 1;
    } else if (!sameEvent(event, want)) {
      await input.calendar.update(calendarId, want);
      counts.updated += 1;
    }
  }

  for (const event of desired) {
    if (seen.has(event.id)) {
      continue;
    }
    try {
      await input.calendar.insert(calendarId, event);
      counts.created += 1;
    } catch (error) {
      if (!(error instanceof ShiftCalendarError) || error.reason !== 'conflict') {
        throw error;
      }
      await input.calendar.update(calendarId, event);
      counts.restored += 1;
    }
  }

  return counts;
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

function toGoogleHoliday(holiday: HolidayEvent): ShiftCalendarEvent {
  return {
    id: googleEventId(holiday.uid),
    title: holiday.title,
    start: { date: holiday.date },
    end: { date: addDays(holiday.date, 1) },
    transparency: 'transparent',
  };
}

function googleEventId(uid: string): string {
  return uid.endsWith(ICS_SUFFIX) ? uid.slice(0, -ICS_SUFFIX.length) : uid;
}

function startDate(event: ShiftCalendarEvent): string {
  return 'date' in event.start ? event.start.date : event.start.dateTime.slice(0, 10);
}

function sameEvent(existing: ShiftCalendarEvent, desired: ShiftCalendarEvent): boolean {
  return (
    existing.title === desired.title &&
    (existing.description ?? '') === (desired.description ?? '') &&
    sameWhen(existing.start, desired.start) &&
    sameWhen(existing.end, desired.end) &&
    transparency(existing) === transparency(desired)
  );
}

function sameWhen(existing: ShiftCalendarWhen, desired: ShiftCalendarWhen): boolean {
  if ('date' in existing || 'date' in desired) {
    return 'date' in existing && 'date' in desired && existing.date === desired.date;
  }
  return existing.dateTime === desired.dateTime && existing.timeZone === desired.timeZone;
}

function transparency(event: ShiftCalendarEvent): 'transparent' | 'opaque' {
  return event.transparency === 'transparent' ? 'transparent' : 'opaque';
}
