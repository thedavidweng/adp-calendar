import { createPageAdpSource } from '@adp-calendar/core/adp-source';
import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { extensionStorage } from '../browser/extension-storage.ts';
import { authorizeGoogle, readGoogleEmail } from '../google-auth.ts';
import { createGoogleShiftCalendar } from '../google-calendar.ts';
import { extensionCommand, ONBOARDING_PAGE } from '../onboarding.ts';
import { ADP_MY_SCHEDULE_URL, openSignInFromNotification, reauthSyncRequest } from '../reauth.ts';
import { runExtensionSync } from '../run-sync.ts';
import { GOOGLE_SIGNED_OUT_KEY, maybeOpenInstallPage, revokeGoogleAccessToken, signOutGoogle, timeZoneForSync } from '../settings.ts';
import {
  LAST_SUCCESS_AT_KEY,
  LAST_SUCCESS_SUMMARY_KEY,
  createCalendarIdStore,
  createReauthTabs,
  createStoredState,
  createSyncDiagnostics,
  createSyncHistory,
  createTokenStore,
} from '../storage.ts';
import { noticeForClick, noticeForSyncResult, REPORT_ISSUE_URL } from '../sync-status.ts';
import { createSyncQueue, ensureDailySyncAlarm, syncRequestFor } from '../sync-trigger.ts';

export default defineBackground(() => {
  const enqueue = createSyncQueue();
  void ensureDailySyncAlarm(browser.alarms);
  browser.runtime.onInstalled.addListener((details) => {
    void maybeOpenInstallPage(details.reason, {
      storage: extensionStorage(),
      pageUrl: browser.runtime.getURL(ONBOARDING_PAGE),
      open(url) {
        return browser.tabs.create({ url });
      },
    });
  });
  // Tab ids do not survive a browser restart, and a reused id must not force Sync.
  browser.runtime.onStartup.addListener(() => {
    void createReauthTabs(extensionStorage()).clear();
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    const request = syncRequestFor({ alarmName: alarm.name });
    if (!request) {
      return;
    }
    void enqueue(() => syncDeps(request.forced).then((deps) => runExtensionSync(deps)).then(notifyOutcome)).catch(
      () => undefined,
    );
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const command = extensionCommand(message);
    if (!command) {
      return;
    }
    if (command.type === 'sign-out-google') {
      void enqueue(() => signOutGoogle(extensionStorage(), (token) => revokeGoogleAccessToken(fetch, token)))
        .then((revoked) => sendResponse({ ok: revoked }), () => sendResponse({ ok: false }));
      return true;
    }
    if (command.type === 'connect-google') {
      void enqueue(() => connectGoogle()).then(sendResponse, () => {
        sendResponse({ ok: false, reason: 'google-auth' });
      });
      return true;
    }
    const request = { forced: command.forced };
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
    const notice = noticeForClick(notificationId);
    if (!notice) {
      return;
    }
    if (notice.click === 'remember-sign-in') {
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
      return;
    }
    if (notice.click === 'open-workforce') {
      void browser.tabs.create({ url: ADP_MY_SCHEDULE_URL });
      return;
    }
    if (notice.click === 'report-issue') {
      void browser.tabs.create({ url: REPORT_ISSUE_URL });
    }
  });
});

async function runSignaledSync(request: { forced: boolean }, senderTabId: number | undefined) {
  const tabs = createReauthTabs(extensionStorage());
  const decision = reauthSyncRequest(request, senderTabId, await tabs.get());
  if (decision?.clearReauthTab) {
    await tabs.clear();
  }
  const result = await runExtensionSync(await syncDeps(decision?.forced ?? request.forced));
  await notifyOutcome(result);
  return result;
}

async function notifyOutcome(result: { ok: boolean; reason?: string }): Promise<void> {
  const notice = noticeForSyncResult(result);
  if (!notice) {
    return;
  }
  try {
    await browser.notifications.create(notice.id, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon-128.png'),
      title: browser.i18n.getMessage('extName'),
      message: browser.i18n.getMessage(notice.messageKey),
    });
  } catch {
    // The Sync outcome is already decided. A notification failure must not hide it.
  }
}

async function connectGoogle() {
  const storage = extensionStorage();
  const previous = await createTokenStore(storage).load();
  const result = await authorizeGoogle({
    ...googleSession(storage),
    now: Date.now(),
    interactive: true,
  });
  if (result.ok) {
    const connected = await createTokenStore(storage).load();
    if (previous && previous.email !== connected?.email) {
      await createCalendarIdStore(storage).clear();
      await storage.set({ [LAST_SUCCESS_AT_KEY]: null, [LAST_SUCCESS_SUMMARY_KEY]: null });
    }
    await storage.set({ [GOOGLE_SIGNED_OUT_KEY]: false });
  }
  return result;
}

function googleSession(storage: ReturnType<typeof extensionStorage>) {
  return {
    clientId: googleClientId(),
    redirectUri: browser.identity.getRedirectURL(),
    tokens: createTokenStore(storage),
    readEmail: (token: string) => readGoogleEmail(fetch, token),
    launch: (url: string, interactive: boolean) => browser.identity.launchWebAuthFlow({ url, interactive }),
  };
}

async function syncDeps(forced: boolean) {
  const storage = extensionStorage();
  return {
    forced,
    signedOut: (await storage.get([GOOGLE_SIGNED_OUT_KEY]))[GOOGLE_SIGNED_OUT_KEY] === true,
    ...googleSession(storage),
    now: () => new Date(),
    state: createStoredState(storage),
    history: createSyncHistory(storage),
    diagnostics: createSyncDiagnostics(storage),
    adp: createPageAdpSource(async (url) => {
      const response = await fetch(url, { credentials: 'include' });
      return { redirected: response.redirected, url: response.url, text: await response.text() };
    }),
    timeZone: await timeZoneForSync(storage, Intl.DateTimeFormat().resolvedOptions().timeZone),
    openCalendar: (accessToken: string) =>
      createGoogleShiftCalendar(fetch, accessToken, createCalendarIdStore(storage)),
  };
}

function googleClientId(): string {
  const value = import.meta.env.WXT_GOOGLE_OAUTH_CLIENT_ID;
  return typeof value === 'string' ? value.trim() : '';
}
