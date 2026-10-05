import { browser } from 'wxt/browser';
import { extensionStorage } from '../browser/extension-storage.ts';
import { CONNECT_GOOGLE_MESSAGE, SIGN_OUT_GOOGLE_MESSAGE, onboardingStep, type OnboardingMessageKey, type OnboardingStep } from '../onboarding.ts';
import { ADP_MY_SCHEDULE_URL } from '../reauth.ts';
import {
  disconnectExtension,
  readOnboardingProgress,
  revokeGoogleAccessToken,
  saveTimeZone,
  type OnboardingProgress,
} from '../settings.ts';
import { createTokenStore } from '../storage.ts';
import { isPopupSyncResult, syncStatusText, type MessageKey } from '../sync-status.ts';
import { openSyncPopup } from '../open-sync-popup.ts';

const title = required('#title');
const adpTitle = required('#adp-title');
const adpBody = required('#adp-body');
const openAdp = requiredButton('#open-adp');
const adpConfirmed = required('#adp-confirmed');
const googleSignOut = requiredButton('#google-sign-out');
const useBrowserTimeZone = requiredButton('#use-browser-time-zone');
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
const timeZoneInput = requiredSelect('#time-zone');
const timeZoneHelp = required('#time-zone-help');
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
openAdp.textContent = translate('openAdpSignIn');
adpConfirmed.textContent = translate('adpAccessConfirmed');
googleSignOut.textContent = translate('googleSignOut');
useBrowserTimeZone.textContent = translate('useBrowserTimeZone');
required('#calendar-guide').setAttribute('aria-label', translate('calendarGuide'));
required('#calendar-guide-caption').textContent = translate('calendarGuideCaption');
required('#calendar-nav').textContent = translate('calendarNav');
required('#things-to-do-nav').textContent = translate('thingsToDoNav');
scheduleTitle.textContent = translate('myScheduleTitle');
scheduleBody.textContent = translate('myScheduleBody');
openSchedule.textContent = translate('openWorkforceNow');
positionCaptured.textContent = translate('positionCaptured');
googleTitle.textContent = translate('connectGoogleTitle');
googleBody.textContent = translate('connectGoogleBody');
connectGoogle.textContent = translate('connectGoogle');
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

openAdp.addEventListener('click', () => {
  void browser.tabs.create({ url: 'https://workforcenow.adp.com/' });
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
        googleStatus.textContent = '';
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

googleSignOut.addEventListener('click', () => {
  googleSignOut.disabled = true;
  void browser.runtime.sendMessage({ type: SIGN_OUT_GOOGLE_MESSAGE })
    .then((result: { ok: boolean }) => {
      googleStatus.textContent = translate(result.ok ? 'googleSignedOut' : 'googleSignOutFailed');
    })
    .catch(() => { googleStatus.textContent = translate('googleSignOutFailed'); })
    .finally(() => { googleSignOut.disabled = false; void refresh(); });
});

firstSync.addEventListener('click', () => {
  firstSync.disabled = true;
  syncStatus.textContent = translate('syncing');
  void openSyncPopup(browser.action)
    .then(() => { syncStatus.textContent = ''; })
    .catch(() => { syncStatus.textContent = syncStatusText(failed(), translate); })
    .finally(() => { firstSync.disabled = false; void refresh(); });
});

const zones = new Set([browserZone(), ...Intl.supportedValuesOf('timeZone')]);
for (const zone of [...zones].sort()) {
  timeZoneInput.add(new Option(zone.replaceAll('_', ' '), zone));
}

useBrowserTimeZone.addEventListener('click', () => {
  void saveTimeZone(storage, '').then(() => {
    timeZoneDirty = false;
    timeZoneStatus.textContent = translate('timeZoneSaved');
    return refresh();
  });
});

timeZoneInput.addEventListener('change', () => {
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
  openAdp.hidden = progress.positionCaptured;
  adpConfirmed.hidden = !progress.positionCaptured;
  openSchedule.hidden = progress.positionCaptured;
  positionCaptured.hidden = !progress.positionCaptured;
  googleConnected.hidden = !progress.googleConnected;
  googleConnected.textContent = progress.googleEmail ? translate('googleConnected', progress.googleEmail) : translate('googleReconnect');
  googleSignOut.hidden = !progress.googleConnected;
  connectGoogle.hidden = progress.googleConnected && progress.googleEmail !== '';
  firstSync.hidden = !progress.positionCaptured || !progress.googleConnected || progress.googleEmail === '';
  syncDone.hidden = !progress.firstSyncDone;
  done.hidden = step !== 'done';
  if (!timeZoneDirty) {
    if (!zones.has(progress.syncTimeZone)) {
      zones.add(progress.syncTimeZone);
      timeZoneInput.add(new Option(progress.syncTimeZone.replaceAll('_', ' '), progress.syncTimeZone));
    }
    timeZoneInput.value = progress.syncTimeZone;
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

function requiredSelect(selector: string): HTMLSelectElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error(`Onboarding page is missing ${selector}`);
  }
  return element;
}
