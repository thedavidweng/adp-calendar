import { createPageAdpSource } from '@adp-calendar/core/adp-source';
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { extensionStorage } from '../browser/extension-storage.ts';
import { createGoogleShiftCalendar } from '../google-calendar.ts';
import { runExtensionSync } from '../run-sync.ts';
import { createStoredState, createSyncHistory, createTokenStore } from '../storage.ts';
import { ensureDailySyncAlarm, syncRequestFor } from '../sync-trigger.ts';

export default defineBackground(() => {
  void ensureDailySyncAlarm(browser.alarms);

  browser.alarms.onAlarm.addListener((alarm) => {
    const request = syncRequestFor({ alarmName: alarm.name });
    if (!request) {
      return;
    }
    void runExtensionSync(syncDeps(request.forced)).catch(() => undefined);
  });

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const request = syncRequestFor({ message });
    if (!request) {
      return;
    }
    const pending = runExtensionSync(syncDeps(request.forced));
    if (!request.forced) {
      void pending.catch(() => undefined);
      return;
    }
    void pending.then(
      (result) => {
        sendResponse(result);
      },
      () => {
        sendResponse({ ok: false, reason: 'sync-failed' });
      },
    );
    return true;
  });
});

function syncDeps(forced: boolean) {
  const storage = extensionStorage();
  return {
    forced,
    clientId: googleClientId(),
    redirectUri: browser.identity.getRedirectURL(),
    now: () => new Date(),
    tokens: createTokenStore(storage),
    launch: (url: string, interactive: boolean) => browser.identity.launchWebAuthFlow({ url, interactive }),
    state: createStoredState(storage),
    history: createSyncHistory(storage),
    adp: createPageAdpSource(async (url) => {
      const response = await fetch(url, { credentials: 'include' });
      return { redirected: response.redirected, url: response.url, text: await response.text() };
    }),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    openCalendar: (accessToken: string) => createGoogleShiftCalendar(fetch, accessToken),
  };
}

function googleClientId(): string {
  const value = import.meta.env.WXT_GOOGLE_OAUTH_CLIENT_ID;
  return typeof value === 'string' ? value.trim() : '';
}
