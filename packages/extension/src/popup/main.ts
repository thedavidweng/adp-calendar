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
import { SYNC_NOW_MESSAGE } from '../sync-trigger.ts';

const button = document.querySelector('#sync');
const status = document.querySelector('#status');
const lastSync = document.querySelector('#last-sync');
if (!(button instanceof HTMLButtonElement) || !(status instanceof HTMLElement) || !(lastSync instanceof HTMLElement)) {
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
void showLastSuccess();
button.addEventListener('click', () => {
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
});

function failed(): PopupSyncResult {
  return { ok: false, reason: 'sync-failed' };
}
