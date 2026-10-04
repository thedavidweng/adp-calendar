import type { AdpSource, ShiftCalendar, StateStore, SyncResult } from '@adp-calendar/core';
import { syncSchedule } from '@adp-calendar/core/sync';
import { authorizeGoogle, type TokenStore } from './google-auth.ts';

export async function runPopupSync(deps: {
  clientId: string;
  redirectUri: string;
  now: () => Date;
  tokens: TokenStore;
  launch(url: string, interactive: boolean): Promise<string | null | undefined>;
  state: StateStore;
  adp: AdpSource;
  timeZone: string;
  openCalendar(accessToken: string): ShiftCalendar;
}): Promise<SyncResult | { ok: false; reason: 'missing-client' }> {
  const auth = await authorizeGoogle({
    clientId: deps.clientId,
    redirectUri: deps.redirectUri,
    now: deps.now().getTime(),
    tokens: deps.tokens,
    launch: deps.launch,
  });
  if (!auth.ok) {
    return auth;
  }
  return syncSchedule({
    adp: deps.adp,
    clock: { now: deps.now },
    state: deps.state,
    timeZone: deps.timeZone,
    calendar: deps.openCalendar(auth.accessToken),
  });
}
