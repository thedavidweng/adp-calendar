import { browser } from 'wxt/browser';
import { extensionStorage } from '../browser/extension-storage.ts';
import { CONNECT_GOOGLE_MESSAGE, onboardingStep, type OnboardingMessageKey, type OnboardingStep } from '../onboarding.ts';
import { ADP_MY_SCHEDULE_URL } from '../reauth.ts';
import {
  acknowledgeAdpSignedIn,
  disconnectExtension,
  readOnboardingProgress,
  revokeGoogleAccessToken,
  saveTimeZone,
  type OnboardingProgress,
} from '../settings.ts';
import { createTokenStore } from '../storage.ts';
import { isPopupSyncResult, syncStatusText, type MessageKey } from '../sync-status.ts';
import { SYNC_NOW_MESSAGE } from '../sync-trigger.ts';

const title = required('#title');
const adpTitle = required('#adp-title');
const adpBody = required('#adp-body');
const ackSignedIn = requiredButton('#ack-signed-in');
const scheduleTitle = required('#schedule-title');
const scheduleBody = required('#schedule-body');
const openSchedule = requiredButton('#open-schedule');
const positionCaptured = required('#position-captured');
const googleTitle = required('#google-title');
const googleBody = required('#google-body');
const connectGoogle = requiredButton('#connect-google');
const googleConnected = required('#google-connected');
const googleStatus = required('#google-status');
const syncTitle = required('#sync-title');
const syncBody = required('#sync-body');
const firstSync = requiredButton('#first-sync');
const syncDone = required('#sync-done');
const syncStatus = required('#sync-status');
const done = required('#done');
const settingsTitle = required('#settings-title');
const timeZoneLabel = required('#time-zone-label');
const timeZoneInput = requiredInput('#time-zone');
const timeZoneHelp = required('#time-zone-help');
const timeZoneUsing = required('#time-zone-using');
const saveTimeZoneButton = requiredButton('#save-time-zone');
const timeZoneStatus = required('#time-zone-status');
const disconnectHelp = required('#disconnect-help');
const disconnectButton = requiredButton('#disconnect');
const disconnectStatus = required('#disconnect-status');

const storage = extensionStorage();
let timeZoneDirty = false;

function translate(key: OnboardingMessageKey | MessageKey, substitution?: string | string[]): string {
  return substitution === undefined ? browser.i18n.getMessage(key) : browser.i18n.getMessage(key, substitution);
}

function browserZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

document.title = translate('onboardingTitle');
title.textContent = document.title;
adpTitle.textContent = translate('adpSignedInTitle');
adpBody.textContent = translate('adpSignedInBody');
ackSignedIn.textContent = translate('ackSignedIn');
scheduleTitle.textContent = translate('myScheduleTitle');
scheduleBody.textContent = translate('myScheduleBody');
openSchedule.textContent = translate('openWorkforceNow');
positionCaptured.textContent = translate('positionCaptured');
googleTitle.textContent = translate('connectGoogleTitle');
googleBody.textContent = translate('connectGoogleBody');
connectGoogle.textContent = translate('connectGoogle');
googleConnected.textContent = translate('googleConnected');
syncTitle.textContent = translate('firstSyncTitle');
syncBody.textContent = translate('firstSyncBody');
firstSync.textContent = translate('runFirstSync');
syncDone.textContent = translate('firstSyncDone');
done.textContent = translate('onboardingDone');
settingsTitle.textContent = translate('settingsTitle');
timeZoneLabel.textContent = translate('timeZoneLabel');
timeZoneHelp.textContent = translate('timeZoneHelp');
saveTimeZoneButton.textContent = translate('saveTimeZone');
disconnectHelp.textContent = translate('disconnectHelp');
disconnectButton.textContent = translate('disconnect');

ackSignedIn.addEventListener('click', () => {
  void acknowledgeAdpSignedIn(storage).then(refresh);
});

openSchedule.addEventListener('click', () => {
  void browser.tabs.create({ url: ADP_MY_SCHEDULE_URL });
});

connectGoogle.addEventListener('click', () => {
  connectGoogle.disabled = true;
  googleStatus.textContent = '';
  void browser.runtime
    .sendMessage({ type: CONNECT_GOOGLE_MESSAGE })
    .then((result: unknown) => {
      if (isConnected(result)) {
        googleStatus.textContent = translate('googleConnected');
        return;
      }
      googleStatus.textContent = connectFailureText(result);
    })
    .catch(() => {
      googleStatus.textContent = translate('connectGoogleFailed');
    })
    .finally(() => {
      connectGoogle.disabled = false;
      void refresh();
    });
});

firstSync.addEventListener('click', () => {
  firstSync.disabled = true;
  syncStatus.textContent = translate('syncing');
  void browser.runtime
    .sendMessage({ type: SYNC_NOW_MESSAGE })
    .then((result: unknown) => {
      syncStatus.textContent = syncStatusText(isPopupSyncResult(result) ? result : failed(), translate);
    })
    .catch(() => {
      syncStatus.textContent = syncStatusText(failed(), translate);
    })
    .finally(() => {
      firstSync.disabled = false;
      void refresh();
    });
});

timeZoneInput.addEventListener('input', () => {
  timeZoneDirty = true;
});

saveTimeZoneButton.addEventListener('click', () => {
  void saveTimeZone(storage, timeZoneInput.value).then((outcome) => {
    timeZoneStatus.textContent = translate(outcome === 'saved' ? 'timeZoneSaved' : 'timeZoneInvalid');
    if (outcome === 'saved') {
      timeZoneDirty = false;
    }
    return refresh();
  });
});

disconnectButton.addEventListener('click', () => {
  if (!window.confirm(translate('disconnectConfirm'))) {
    return;
  }
  disconnectButton.disabled = true;
  void disconnectExtension({
    async loadToken() {
      return (await createTokenStore(extensionStorage()).load())?.accessToken ?? null;
    },
    revoke(token) {
      return revokeGoogleAccessToken(fetch, token);
    },
    clearAll() {
      return browser.storage.local.clear();
    },
  })
    .then((outcome) => {
      timeZoneDirty = false;
      timeZoneInput.value = '';
      disconnectStatus.textContent = translate(outcome === 'forgotten' ? 'disconnectFailed' : 'disconnected');
    })
    .catch(() => {
      disconnectStatus.textContent = translate('disconnectFailed');
    })
    .finally(() => {
      disconnectButton.disabled = false;
      void refresh();
    });
});

browser.storage.onChanged.addListener(() => {
  void refresh();
});

void refresh();

async function refresh(): Promise<void> {
  const progress = await readOnboardingProgress(storage, browserZone());
  render(onboardingStep(progress), progress);
}

function render(step: OnboardingStep, progress: OnboardingProgress): void {
  for (const item of document.querySelectorAll<HTMLElement>('#steps > li')) {
    const current = item.dataset.step === step;
    item.classList.toggle('current', current);
    if (current) {
      item.setAttribute('aria-current', 'step');
    } else {
      item.removeAttribute('aria-current');
    }
  }
  ackSignedIn.hidden = step !== 'adp-signed-in';
  openSchedule.hidden = step !== 'my-schedule';
  connectGoogle.hidden = step !== 'google';
  firstSync.hidden = step !== 'first-sync';
  positionCaptured.hidden = !progress.positionCaptured;
  googleConnected.hidden = !progress.googleConnected;
  syncDone.hidden = !progress.firstSyncDone;
  done.hidden = step !== 'done';
  timeZoneUsing.textContent = translate('timeZoneUsing', progress.syncTimeZone);
  if (!timeZoneDirty) {
    timeZoneInput.value = progress.timeZoneOverride;
  }
}

function connectFailureText(result: unknown): string {
  if (isPopupSyncResult(result) && !result.ok && result.reason === 'missing-client') {
    return syncStatusText(result, translate);
  }
  return translate('connectGoogleFailed');
}

function isConnected(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { ok?: unknown }).ok === true && 'accessToken' in value;
}

function failed() {
  return { ok: false as const, reason: 'sync-failed' as const };
}

function required(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Onboarding page is missing ${selector}`);
  }
  return element;
}

function requiredButton(selector: string): HTMLButtonElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Onboarding page is missing ${selector}`);
  }
  return element;
}

function requiredInput(selector: string): HTMLInputElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Onboarding page is missing ${selector}`);
  }
  return element;
}
