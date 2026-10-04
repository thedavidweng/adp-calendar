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
}

export type ExportResult =
  | { ok: true; ics: string; filename: string }
  | { ok: false; reason: 'no-position' }
  | { ok: false; reason: 'session-dead' }
  | { ok: false; reason: 'no-schedule' }
  | { ok: false; reason: 'shape-drift' }
  | { ok: false; reason: 'adp-error'; description: string };

export interface ExportInput {
  adp: AdpSource;
  clock: Clock;
  state: StateStore;
  timeZone: string;
}
