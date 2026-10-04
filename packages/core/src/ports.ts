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

export interface SyncSummary {
  created: number;
  updated: number;
  restored: number;
  deleted: number;
}

/** Instant and change counts from the last Sync that succeeded. */
export interface LastSuccess {
  at: string;
  summary: SyncSummary;
}

export interface SyncHistory {
  getLastSuccess(): Promise<LastSuccess | null>;
  setLastSuccess(record: LastSuccess): Promise<void>;
}

/** Local Sync attempt log size. Oldest entries are dropped. Never uploaded. */
export const SYNC_ATTEMPT_CAP = 50;

export type SyncAttemptOutcome =
  | 'success'
  | 'no-position'
  | 'needs-sign-in'
  | 'session-dead'
  | 'no-schedule'
  | 'position-invalid'
  | 'shape-drift'
  | 'adp-error'
  | 'google-auth'
  | 'calendar-missing'
  | 'conflict'
  | 'google-error';

/** One Sync that got past the due check. `sinceLastSuccessMs` is null when none has succeeded. */
export interface SyncAttempt {
  at: string;
  sinceLastSuccessMs: number | null;
  outcome: SyncAttemptOutcome;
}

/** Session-expired flag and the capped local attempt log. Both stay on the machine. */
export interface SyncDiagnostics {
  getSignInNotified(): Promise<boolean>;
  setSignInNotified(notified: boolean): Promise<void>;
  getAttempts(): Promise<SyncAttempt[]>;
  setAttempts(attempts: readonly SyncAttempt[]): Promise<void>;
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

export type ShiftCalendarWhen = { dateTime: string; timeZone: string } | { date: string };

export interface ShiftCalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: ShiftCalendarWhen;
  end: ShiftCalendarWhen;
  transparency?: 'transparent' | 'opaque';
  /** Set on events read back from the Shift Calendar. Cancelled events stay listed. */
  status?: 'confirmed' | 'cancelled';
}

export interface ShiftCalendarRange {
  /** Inclusive local dates. Events that only overlap this range are included. */
  startDate: string;
  endDate: string;
  timeZone: string;
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
  list(calendarId: string, range: ShiftCalendarRange): Promise<ShiftCalendarEvent[]>;
  insert(calendarId: string, event: ShiftCalendarEvent): Promise<void>;
  update(calendarId: string, event: ShiftCalendarEvent): Promise<void>;
  delete(calendarId: string, eventId: string): Promise<void>;
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
  | {
      ok: true;
      calendarId: string;
      createdCalendar: boolean;
      created: number;
      updated: number;
      restored: number;
      deleted: number;
    }
  | { ok: true; skipped: 'not-due' }
  | { ok: false; reason: 'no-position' }
  | { ok: false; reason: 'needs-sign-in' }
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
  history: SyncHistory;
  diagnostics: SyncDiagnostics;
  /** When true, run even if the last success is newer than 3.5 days. */
  forced?: boolean;
}
