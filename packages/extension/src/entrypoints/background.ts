import { createPageAdpSource } from '@adp-calendar/core/adp-source';
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { extensionStorage } from '../browser/extension-storage.ts';
import { createGoogleShiftCalendar } from '../google-calendar.ts';
import { openSignInFromNotification, reauthSyncRequest, SIGN_IN_NOTIFICATION_ID } from '../reauth.ts';
import { runExtensionSync } from '../run-sync.ts';
import { createReauthTabs, createStoredState, createSyncDiagnostics, createSyncHistory, createTokenStore } from '../storage.ts';
import { createSyncQueue, ensureDailySyncAlarm, syncRequestFor } from '../sync-trigger.ts';

export default defineBackground(() => {
  const enqueue = createSyncQueue();
  void ensureDailySyncAlarm(browser.alarms);
  // Tab ids do not survive a browser restart, and a reused id must not force Sync.
  browser.runtime.onStartup.addListener(() => {
    void createReauthTabs(extensionStorage()).clear();
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    const request = syncRequestFor({ alarmName: alarm.name });
    if (!request) {
      return;
    }
    void enqueue(() => runExtensionSync(syncDeps(request.forced)).then(notifyIfNeedsSignIn)).catch(() => undefined);
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const request = syncRequestFor({ message });
    if (!request) {
      return;
    }
    const pending = enqueue(() => runSignaledSync(request, sender.tab?.id));
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

  browser.notifications.onClicked.addListener((notificationId) => {
    void openSignInFromNotification(notificationId, {
      async createTab(url) {
        const tab = await browser.tabs.create({ url });
        if (typeof tab.id !== 'number') {
          throw new Error('missing tab id');
        }
        return tab.id;
      },
      rememberTab(tabId) {
        return createReauthTabs(extensionStorage()).set(tabId);
      },
    });
  });
});

async function runSignaledSync(request: { forced: boolean }, senderTabId: number | undefined) {
  const tabs = createReauthTabs(extensionStorage());
  const decision = reauthSyncRequest(request, senderTabId, await tabs.get());
  if (decision?.clearReauthTab) {
    await tabs.clear();
  }
  const result = await runExtensionSync(syncDeps(decision?.forced ?? request.forced));
  await notifyIfNeedsSignIn(result);
  return result;
}

async function notifyIfNeedsSignIn(result: { ok: boolean; reason?: string }): Promise<void> {
  if (result.ok || result.reason !== 'needs-sign-in') {
    return;
  }
  try {
    await browser.notifications.create(SIGN_IN_NOTIFICATION_ID, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon.png'),
      title: browser.i18n.getMessage('extName'),
      message: browser.i18n.getMessage('needsSignIn'),
    });
  } catch {
    // The Sync outcome is already decided. A notification failure must not hide it.
  }
}

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
    diagnostics: createSyncDiagnostics(storage),
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
