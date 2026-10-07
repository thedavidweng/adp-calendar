import { browser } from 'wxt/browser';
import { extensionStorage } from '../browser/extension-storage.ts';
import { createSyncHistory } from '../storage.ts';
import {
  lastSuccessText,
  isPopupSyncResult,
  REPORT_ISSUE_URL,
  showsReportIssue,
  syncStatusText,
  type MessageKey,
  type PopupSyncResult,
} from '../sync-status.ts';
import { ONBOARDING_PAGE } from '../onboarding.ts';
import { SYNC_NOW_MESSAGE } from '../sync-trigger.ts';

document.title = browser.i18n.getMessage('extName');
const name = document.querySelector('#name');
if (name) name.textContent = document.title;

const button = document.querySelector('#sync');
const status = document.querySelector('#status');
const lastSync = document.querySelector('#last-sync');
const settings = document.querySelector('#settings');
if (
  !(button instanceof HTMLButtonElement) ||
  !(status instanceof HTMLElement) ||
  !(lastSync instanceof HTMLElement) ||
  !(settings instanceof HTMLButtonElement)
) {
  throw new Error('Sync popup is missing its controls');
}

const history = createSyncHistory(extensionStorage());

function translate(key: MessageKey, substitution?: string | string[]): string {
  return substitution === undefined ? browser.i18n.getMessage(key) : browser.i18n.getMessage(key, substitution);
}

function formatWhen(at: string): string {
  return new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const showLastSuccess = async (): Promise<void> => {
  const recorded = await history.getLastSuccess();
  lastSync.textContent = lastSuccessText(recorded, translate, formatWhen);
};

const renderStatus = (result: PopupSyncResult): void => {
  status.textContent = syncStatusText(result, translate);
  if (!showsReportIssue(result)) {
    return;
  }
  const link = document.createElement('a');
  link.href = REPORT_ISSUE_URL;
  link.textContent = translate('reportIssue');
  link.addEventListener('click', (event) => {
    event.preventDefault();
    void browser.tabs.create({ url: REPORT_ISSUE_URL });
  });
  status.append(document.createTextNode(' '), link);
};

button.textContent = translate('syncNow');
settings.textContent = translate('settings');
settings.addEventListener('click', () => {
  void browser.tabs.create({ url: browser.runtime.getURL(ONBOARDING_PAGE) });
});
void showLastSuccess();
const syncNow = (): void => {
  button.disabled = true;
  status.textContent = translate('syncing');
  void browser.runtime
    .sendMessage({ type: SYNC_NOW_MESSAGE })
    .then((result: unknown) => {
      renderStatus(isPopupSyncResult(result) ? result : failed());
    })
    .catch(() => {
      status.textContent = syncStatusText(failed(), translate);
    })
    .finally(() => {
      button.disabled = false;
      void showLastSuccess();
    });
};

button.addEventListener('click', syncNow);
if (new URL(location.href).searchParams.get('sync') === '1') syncNow();

function failed(): PopupSyncResult {
  return { ok: false, reason: 'sync-failed' };
}
