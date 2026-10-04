import {
  LAST_SUCCESS_AT_KEY,
  LAST_SUCCESS_SUMMARY_KEY,
  POSITION_KEY,
  createTokenStore,
  parseLastSuccess,
  type KeyValueStorage,
} from './storage.ts';

export const TIME_ZONE_KEY = 'timeZone';
export const INSTALL_PAGE_OPENED_KEY = 'installPageOpened';
export const ONBOARDING_SIGNED_IN_KEY = 'onboardingSignedIn';

export interface OnboardingProgress {
  signedInAcknowledged: boolean;
  positionCaptured: boolean;
  googleConnected: boolean;
  firstSyncDone: boolean;
  timeZoneOverride: string;
  syncTimeZone: string;
}

export function isIanaTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function effectiveTimeZone(stored: unknown, browserZone: string): string {
  if (typeof stored !== 'string') {
    return browserZone;
  }
  const trimmed = stored.trim();
  if (!isIanaTimeZone(trimmed)) {
    return browserZone;
  }
  return trimmed;
}

export async function timeZoneForSync(storage: KeyValueStorage, browserZone: string): Promise<string> {
  const items = await storage.get([TIME_ZONE_KEY]);
  return effectiveTimeZone(items[TIME_ZONE_KEY], browserZone);
}

export async function saveTimeZone(storage: KeyValueStorage, value: string): Promise<'saved' | 'invalid'> {
  const trimmed = value.trim();
  if (trimmed !== '' && !isIanaTimeZone(trimmed)) {
    return 'invalid';
  }
  await storage.set({ [TIME_ZONE_KEY]: trimmed });
  return 'saved';
}

export async function acknowledgeAdpSignedIn(storage: KeyValueStorage): Promise<void> {
  await storage.set({ [ONBOARDING_SIGNED_IN_KEY]: true });
}

export async function readOnboardingProgress(storage: KeyValueStorage, browserZone: string): Promise<OnboardingProgress> {
  const items = await storage.get([
    ONBOARDING_SIGNED_IN_KEY,
    POSITION_KEY,
    TIME_ZONE_KEY,
    LAST_SUCCESS_AT_KEY,
    LAST_SUCCESS_SUMMARY_KEY,
  ]);
  const positionId = items[POSITION_KEY];
  const override = items[TIME_ZONE_KEY];
  return {
    signedInAcknowledged: items[ONBOARDING_SIGNED_IN_KEY] === true,
    positionCaptured: typeof positionId === 'string' && positionId.length > 0,
    googleConnected: (await createTokenStore(storage).load()) !== null,
    firstSyncDone: parseLastSuccess(items[LAST_SUCCESS_AT_KEY], items[LAST_SUCCESS_SUMMARY_KEY]) !== null,
    timeZoneOverride: typeof override === 'string' ? override : '',
    syncTimeZone: effectiveTimeZone(override, browserZone),
  };
}

export async function maybeOpenInstallPage(
  reason: string,
  deps: {
    storage: KeyValueStorage;
    pageUrl: string;
    open(url: string): Promise<unknown>;
  },
): Promise<boolean> {
  const items = await deps.storage.get([INSTALL_PAGE_OPENED_KEY]);
  if (reason !== 'install' || items[INSTALL_PAGE_OPENED_KEY] === true) {
    return false;
  }
  await deps.storage.set({ [INSTALL_PAGE_OPENED_KEY]: true });
  await deps.open(deps.pageUrl);
  return true;
}

export async function disconnectExtension(deps: {
  loadToken(): Promise<string | null>;
  revoke(accessToken: string): Promise<void>;
  clearAll(): Promise<void>;
}): Promise<'revoked' | 'cleared' | 'forgotten'> {
  const token = await deps.loadToken();
  let outcome: 'revoked' | 'cleared' | 'forgotten' = token ? 'forgotten' : 'cleared';
  if (token) {
    try {
      await deps.revoke(token);
      outcome = 'revoked';
    } catch {
      outcome = 'forgotten';
    }
  }
  await deps.clearAll();
  return outcome;
}

export async function revokeGoogleAccessToken(
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
  accessToken: string,
): Promise<void> {
  const response = await fetchImpl('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: accessToken }),
  });
  if (!response.ok) {
    throw new Error(`Google revoke failed: ${response.status}`);
  }
}
