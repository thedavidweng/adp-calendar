import { syncRequestFor } from './sync-trigger.ts';

export const ONBOARDING_PAGE = '/onboarding.html';
export const CONNECT_GOOGLE_MESSAGE = 'connect-google';

export type OnboardingStep = 'adp-signed-in' | 'my-schedule' | 'google' | 'first-sync' | 'done';

export interface OnboardingFlags {
  signedInAcknowledged: boolean;
  positionCaptured: boolean;
  googleConnected: boolean;
  firstSyncDone: boolean;
}

export function onboardingStep(flags: OnboardingFlags): OnboardingStep {
  if (!flags.signedInAcknowledged) {
    return 'adp-signed-in';
  }
  if (!flags.positionCaptured) {
    return 'my-schedule';
  }
  if (!flags.googleConnected) {
    return 'google';
  }
  if (!flags.firstSyncDone) {
    return 'first-sync';
  }
  return 'done';
}

export type ExtensionCommand = { type: 'connect-google' } | { type: 'sync'; forced: boolean };

function isConnectGoogle(message: unknown): boolean {
  return typeof message === 'object' && message !== null && (message as { type?: unknown }).type === CONNECT_GOOGLE_MESSAGE;
}

export function extensionCommand(message: unknown): ExtensionCommand | null {
  if (isConnectGoogle(message)) {
    return { type: 'connect-google' };
  }
  const sync = syncRequestFor({ message });
  if (!sync) {
    return null;
  }
  return { type: 'sync', forced: sync.forced };
}

export const ONBOARDING_MESSAGE_KEYS = [
  'onboardingTitle',
  'adpSignedInTitle',
  'adpSignedInBody',
  'ackSignedIn',
  'myScheduleTitle',
  'myScheduleBody',
  'openWorkforceNow',
  'positionCaptured',
  'connectGoogleTitle',
  'connectGoogleBody',
  'connectGoogle',
  'connectGoogleFailed',
  'googleConnected',
  'firstSyncTitle',
  'firstSyncBody',
  'runFirstSync',
  'firstSyncDone',
  'onboardingDone',
  'settingsTitle',
  'timeZoneLabel',
  'timeZoneHelp',
  'timeZoneUsing',
  'saveTimeZone',
  'timeZoneSaved',
  'timeZoneInvalid',
  'disconnect',
  'disconnectHelp',
  'disconnectConfirm',
  'disconnected',
  'disconnectFailed',
  'settings',
] as const;

export type OnboardingMessageKey = (typeof ONBOARDING_MESSAGE_KEYS)[number];
