import type { AdpSource, ShiftCalendar, StateStore, SyncHistory, SyncResult } from '@adp-calendar/core';
import { syncIsDue, syncSchedule } from '@adp-calendar/core/sync';
import { authorizeGoogle, type TokenStore } from './google-auth.ts';

export async function runExtensionSync(deps: {
  clientId: string;
  redirectUri: string;
  now: () => Date;
  tokens: TokenStore;
  launch(url: string, interactive: boolean): Promise<string | null | undefined>;
  state: StateStore;
  history: SyncHistory;
  adp: AdpSource;
  timeZone: string;
  openCalendar(accessToken: string): ShiftCalendar;
  forced: boolean;
}): Promise<SyncResult | { ok: false; reason: 'missing-client' }> {
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
    launch: deps.launch,
  });
  if (!auth.ok) {
    return auth;
  }
  return syncSchedule({
    adp: deps.adp,
    clock: { now: () => now },
    state: deps.state,
    timeZone: deps.timeZone,
    calendar: deps.openCalendar(auth.accessToken),
    history: deps.history,
    forced: deps.forced,
  });
}
