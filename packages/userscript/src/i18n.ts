const messages = {
  exportButton: 'Export schedule (.ics)',
  openMySchedule: 'Open My Schedule once so this script can learn your Position.',
  signIn: 'Please sign in to ADP first.',
  exportFailed: 'Could not export the schedule. Open My Schedule and try again.',
} as const;

export type MessageKey = keyof typeof messages;

export function t(key: MessageKey): string {
  return messages[key];
}
