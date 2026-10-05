import type { AdpSource, ShiftCalendar, StateStore, SyncDiagnostics, SyncHistory, SyncResult } from '@adp-calendar/core';
import { syncIsDue, syncSchedule } from '@adp-calendar/core/sync';
import { authorizeGoogle, type TokenStore } from './google-auth.ts';

export async function runExtensionSync(deps: {
  clientId: string;
  redirectUri: string;
  now: () => Date;
  tokens: TokenStore;
  readEmail(accessToken: string): Promise<string>;
  launch(url: string, interactive: boolean): Promise<string | null | undefined>;
  state: StateStore;
  history: SyncHistory;
  diagnostics: SyncDiagnostics;
  adp: AdpSource;
  timeZone: string;
  openCalendar(accessToken: string): ShiftCalendar;
  forced: boolean;
  signedOut?: boolean;
}): Promise<SyncResult | { ok: false; reason: 'missing-client' }> {
  if (deps.signedOut) return { ok: false, reason: 'google-auth' };
  const now = deps.now();
  if (!deps.forced) {
    const last = await deps.history.getLastSuccess();
    if (!syncIsDue(last?.at ?? null, now)) {
      return { ok: true, skipped: 'not-due' };
    }
  }

  const auth = await authorizeGoogle({
    clientId: deps.clientId,
    redirectUri: deps.redirectUri,
    now: now.getTime(),
    tokens: deps.tokens,
    readEmail: deps.readEmail,
    launch: deps.launch,
  });
  if (!auth.ok) {
    return auth;
  }
  const result = await syncSchedule({
    adp: deps.adp,
    clock: { now: () => now },
    state: deps.state,
    timeZone: deps.timeZone,
    calendar: deps.openCalendar(auth.accessToken),
    history: deps.history,
    diagnostics: deps.diagnostics,
    forced: deps.forced,
  });
  if (!result.ok && result.reason === 'google-auth') {
    await deps.tokens.clear();
  }
  return result;
}
