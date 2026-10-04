export const SYNC_ALARM_NAME = 'sync-due';
export const SYNC_ALARM_PERIOD_MINUTES = 24 * 60;

export const PAGE_LOAD_MESSAGE = 'page-load';
export const SYNC_NOW_MESSAGE = 'sync-now';

export async function ensureDailySyncAlarm(alarms: {
  get(name: string): Promise<unknown>;
  create(name: string, info: { periodInMinutes: number }): Promise<void>;
}): Promise<void> {
  const existing = await alarms.get(SYNC_ALARM_NAME);
  if (existing) {
    return;
  }
  await alarms.create(SYNC_ALARM_NAME, { periodInMinutes: SYNC_ALARM_PERIOD_MINUTES });
}

/** One Sync at a time, so overlapping triggers cannot both treat a dead ADP Session as new. */
export function createSyncQueue(): <T>(job: () => Promise<T>) => Promise<T> {
  let tail: Promise<void> = Promise.resolve();
  return (job) => {
    const run = tail.then(job, job);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

/** Page load and the daily alarm sync only when one is due. Sync now is forced. */
export function syncRequestFor(event: { message?: unknown; alarmName?: string }): { forced: boolean } | null {
  if (event.alarmName !== undefined) {
    return event.alarmName === SYNC_ALARM_NAME ? { forced: false } : null;
  }
  if (typeof event.message !== 'object' || event.message === null) {
    return null;
  }
  const type = (event.message as { type?: unknown }).type;
  if (type === SYNC_NOW_MESSAGE) {
    return { forced: true };
  }
  if (type === PAGE_LOAD_MESSAGE) {
    return { forced: false };
  }
  return null;
}
