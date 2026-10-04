import type { LastSuccess, SyncResult } from '@adp-calendar/core';
import { SIGN_IN_NOTIFICATION_ID } from './reauth.ts';

export type PopupSyncResult = SyncResult | { ok: false; reason: 'missing-client' | 'sync-failed' };

export const REPORT_ISSUE_URL = 'https://github.com/thedavidweng/adp-calendar/issues/new';

export type NoticeClick = 'remember-sign-in' | 'open-workforce' | 'report-issue';

export interface SyncNotice {
  id: string;
  messageKey: MessageKey;
  click: NoticeClick | null;
}

const NOTICES: readonly (SyncNotice & { reason: string })[] = [
  { reason: 'needs-sign-in', id: SIGN_IN_NOTIFICATION_ID, messageKey: 'needsSignIn', click: 'remember-sign-in' },
  { reason: 'position-invalid', id: 'adp-position-invalid', messageKey: 'positionInvalid', click: 'open-workforce' },
  { reason: 'shape-drift', id: 'adp-shape-drift', messageKey: 'shapeDrift', click: 'report-issue' },
  { reason: 'google-auth', id: 'adp-google-auth', messageKey: 'googleAuth', click: null },
];

const FAILURES = new Set([
  'no-position',
  'needs-sign-in',
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
  | 'needsSignIn'
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
  | 'reportIssue'
  | 'syncing'
  | 'syncNow'
  | 'notDue'
  | 'lastSync'
  | 'noLastSync';

type Translator = (key: MessageKey, substitution?: string | string[]) => string;

export function showsReportIssue(result: PopupSyncResult): boolean {
  return !result.ok && result.reason === 'shape-drift';
}

export function noticeForSyncResult(result: { ok: boolean; reason?: string }): SyncNotice | null {
  if (result.ok || !result.reason) {
    return null;
  }
  const notice = NOTICES.find((item) => item.reason === result.reason);
  if (!notice) {
    return null;
  }
  return { id: notice.id, messageKey: notice.messageKey, click: notice.click };
}

export function noticeForClick(notificationId: string): SyncNotice | null {
  const notice = NOTICES.find((item) => item.id === notificationId);
  if (!notice) {
    return null;
  }
  return { id: notice.id, messageKey: notice.messageKey, click: notice.click };
}

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
    case 'needs-sign-in':
      return translate('needsSignIn');
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
