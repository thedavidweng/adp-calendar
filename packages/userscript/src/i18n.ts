const messages = {
  exportButton: 'Export schedule (.ics)',
  openMySchedule: 'Open My Schedule once so this script can learn your Position.',
  openMyScheduleAgain: 'Open My Schedule again so this script can learn your Position.',
  signIn: 'Please sign in to ADP first.',
  noSchedule: 'No schedule for this period yet.',
  shapeDrift: 'ADP changed its data format.',
  reportIssue: 'Report an issue',
  reportIssueUrl: 'https://github.com/thedavidweng/adp-calendar/issues/new',
  exportFailed: 'Could not export the schedule. Open My Schedule and try again.',
  timeZoneMenu: 'Set time zone',
  timeZonePrompt: 'IANA time zone for exported events. Leave blank to use the browser zone.',
} as const;

export function adpErrorMessage(description: string): string {
  return `ADP could not return the schedule: ${description}`;
}

export type MessageKey = keyof typeof messages;

export function t(key: MessageKey): string {
  return messages[key];
}
