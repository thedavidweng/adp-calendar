import type { LastSuccess, SyncResult } from '@adp-calendar/core';

export type PopupSyncResult = SyncResult | { ok: false; reason: 'missing-client' | 'sync-failed' };

const FAILURES = new Set([
  'no-position',
  'session-dead',
  'no-schedule',
  'position-invalid',
  'shape-drift',
  'google-auth',
  'calendar-missing',
  'conflict',
  'google-error',
  'missing-client',
  'sync-failed',
]);

export type MessageKey =
  | 'syncCreatedSummary'
  | 'syncSummary'
  | 'noPosition'
  | 'sessionDead'
  | 'noSchedule'
  | 'positionInvalid'
  | 'shapeDrift'
  | 'adpError'
  | 'googleAuth'
  | 'calendarMissing'
  | 'conflict'
  | 'googleError'
  | 'missingClient'
  | 'syncFailed'
  | 'syncing'
  | 'syncNow'
  | 'notDue'
  | 'lastSync'
  | 'noLastSync';

type Translator = (key: MessageKey, substitution?: string | string[]) => string;

export function isPopupSyncResult(value: unknown): value is PopupSyncResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  if (record.ok === true) {
    return (
      typeof record.calendarId === 'string' &&
      typeof record.createdCalendar === 'boolean' &&
      typeof record.created === 'number' &&
      typeof record.updated === 'number' &&
      typeof record.restored === 'number' &&
      typeof record.deleted === 'number'
    );
  }
  if (record.ok !== false || typeof record.reason !== 'string') {
    return false;
  }
  if (record.reason === 'adp-error') {
    return typeof record.description === 'string';
  }
  return FAILURES.has(record.reason);
}

export function lastSuccessText(
  last: LastSuccess | null,
  translate: Translator,
  formatWhen: (at: string) => string,
): string {
  if (!last) {
    return translate('noLastSync');
  }
  return translate('lastSync', [
    formatWhen(last.at),
    String(last.summary.created),
    String(last.summary.updated),
    String(last.summary.restored),
    String(last.summary.deleted),
  ]);
}

export function syncStatusText(result: PopupSyncResult, translate: Translator): string {
  if (result.ok) {
    if (!('created' in result)) {
      return translate('notDue');
    }
    const counts = [String(result.created), String(result.updated), String(result.restored), String(result.deleted)];
    return translate(result.createdCalendar ? 'syncCreatedSummary' : 'syncSummary', counts);
  }
  switch (result.reason) {
    case 'no-position':
      return translate('noPosition');
    case 'session-dead':
      return translate('sessionDead');
    case 'no-schedule':
      return translate('noSchedule');
    case 'position-invalid':
      return translate('positionInvalid');
    case 'shape-drift':
      return translate('shapeDrift');
    case 'adp-error':
      return translate('adpError', result.description);
    case 'google-auth':
      return translate('googleAuth');
    case 'calendar-missing':
      return translate('calendarMissing');
    case 'conflict':
      return translate('conflict');
    case 'google-error':
      return translate('googleError');
    case 'missing-client':
      return translate('missingClient');
    case 'sync-failed':
      return translate('syncFailed');
    default:
      return translate('syncFailed');
  }
}
