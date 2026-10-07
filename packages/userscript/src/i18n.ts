const messages = {
  exportButton: 'Export .ics',
  exporting: 'Exporting…',
  exportMenu: 'Export schedule (.ics)',
  close: 'Dismiss',
  openCalendar: 'Open Calendar in ADP (top right) once so this script can find your work schedule, then export.',
  openCalendarAgain: 'ADP no longer accepts the saved schedule. Open Calendar in ADP again, then export.',
  signIn: 'Sign in to ADP, then export again.',
  noSchedule: 'No schedule for this period yet.',
  shapeDrift: 'ADP changed its data format. Nothing was downloaded.',
  reportIssue: 'Report an issue',
  reportIssueUrl: 'https://github.com/thedavidweng/adp-calendar/issues/new',
  exportFailed: 'Could not export the schedule. Check the time zone in the Tampermonkey menu, or reload ADP and try again.',
  timeZoneMenu: 'Set time zone',
  timeZonePrompt: 'IANA time zone for exported events. Leave blank to use the browser zone.',
} as const;

export function adpErrorMessage(description: string): string {
  return `ADP could not return the schedule: ${description}`;
}

export function exportedMessage(filename: string, shiftCount: number): string {
  const shifts = shiftCount === 1 ? '1 shift' : `${shiftCount} shifts`;
  return `Downloaded ${filename} with ${shifts}. Import it into any calendar app.`;
}

export type MessageKey = keyof typeof messages;

export function t(key: MessageKey): string {
  return messages[key];
}
