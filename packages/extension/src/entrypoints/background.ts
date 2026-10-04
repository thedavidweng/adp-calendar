import { createPageAdpSource } from '@adp-calendar/core/adp-source';
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { createGoogleShiftCalendar } from '../google-calendar.ts';
import { runPopupSync } from '../run-sync.ts';
import { createStoredState, createTokenStore } from '../storage.ts';
import { extensionStorage } from '../browser/extension-storage.ts';

const SYNC_NOW = 'sync-now';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== 'object' || (message as { type?: unknown }).type !== SYNC_NOW) {
      return;
    }
    const storage = extensionStorage();
    void runPopupSync({
      clientId: googleClientId(),
      redirectUri: browser.identity.getRedirectURL(),
      now: () => new Date(),
      tokens: createTokenStore(storage),
      launch: (url, interactive) => browser.identity.launchWebAuthFlow({ url, interactive }),
      state: createStoredState(storage),
      adp: createPageAdpSource(async (url) => {
        const response = await fetch(url, { credentials: 'include' });
        return { redirected: response.redirected, url: response.url, text: await response.text() };
      }),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      openCalendar: (accessToken) => createGoogleShiftCalendar(fetch, accessToken),
    }).then(
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

function googleClientId(): string {
  const value = import.meta.env.WXT_GOOGLE_OAUTH_CLIENT_ID;
  return typeof value === 'string' ? value.trim() : '';
}
