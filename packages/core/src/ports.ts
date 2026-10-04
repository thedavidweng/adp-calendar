export type AdpFetchResult =
  | { kind: 'json'; body: unknown }
  | { kind: 'redirected' }
  | { kind: 'non-json' };

export interface AdpSource {
  fetchMonthlyView(
    positionId: string,
    startDate: string,
    endDate: string,
  ): Promise<AdpFetchResult>;
}

export interface Clock {
  now(): Date;
}

export interface StateStore {
  getPositionId(): Promise<string | null>;
  setPositionId(positionId: string): Promise<void>;
  clearPositionId(): Promise<void>;
}

export type ExportResult =
  | { ok: true; ics: string; filename: string }
  | { ok: false; reason: 'no-position' }
  | { ok: false; reason: 'session-dead' }
  | { ok: false; reason: 'no-schedule' }
  | { ok: false; reason: 'position-invalid' }
  | { ok: false; reason: 'shape-drift' }
  | { ok: false; reason: 'adp-error'; description: string };

export interface ExportInput {
  adp: AdpSource;
  clock: Clock;
  state: StateStore;
  timeZone: string;
}

export const SHIFT_CALENDAR_NAME = 'ADP Shifts';
export const SHIFT_CALENDAR_DESCRIPTION = "Managed automatically, don't edit";

export interface ShiftCalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
}

export interface NewShiftCalendar {
  name: string;
  description: string;
  timeZone: string;
  private: true;
}

export interface ShiftCalendarRecord {
  id: string;
  name: string;
  description: string;
  timeZone: string;
  private: true;
}

export interface ShiftCalendar {
  findByName(name: string): Promise<ShiftCalendarRecord | null>;
  create(calendar: NewShiftCalendar): Promise<ShiftCalendarRecord>;
  insert(calendarId: string, event: ShiftCalendarEvent): Promise<void>;
}

export class ShiftCalendarError extends Error {
  readonly reason: 'google-auth' | 'calendar-missing' | 'conflict' | 'google-error';

  constructor(reason: ShiftCalendarError['reason']) {
    super(reason);
    this.name = 'ShiftCalendarError';
    this.reason = reason;
  }
}

export type SyncResult =
  | { ok: true; calendarId: string; createdCalendar: boolean; inserted: number }
  | { ok: false; reason: 'no-position' }
  | { ok: false; reason: 'session-dead' }
  | { ok: false; reason: 'no-schedule' }
  | { ok: false; reason: 'position-invalid' }
  | { ok: false; reason: 'shape-drift' }
  | { ok: false; reason: 'adp-error'; description: string }
  | { ok: false; reason: ShiftCalendarError['reason'] };

export interface SyncInput {
  adp: AdpSource;
  clock: Clock;
  state: StateStore;
  timeZone: string;
  calendar: ShiftCalendar;
}
