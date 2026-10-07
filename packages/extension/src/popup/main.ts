import { createPageAdpSource } from '@adp-calendar/core/adp-source';
import { browser } from 'wxt/browser';
import { extensionStorage } from '../browser/extension-storage.ts';
import { exportShowsReportIssue, exportStatusText, runExtensionExport, type ExportMessageKey } from '../export-ics.ts';
import { timeZoneForSync } from '../settings.ts';
import { createStoredState, createSyncHistory } from '../storage.ts';
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
const exportButton = document.querySelector('#export');
if (
  !(button instanceof HTMLButtonElement) ||
  !(exportButton instanceof HTMLButtonElement) ||
  !(status instanceof HTMLElement) ||
  !(lastSync instanceof HTMLElement) ||
  !(settings instanceof HTMLButtonElement)
) {
  throw new Error('Sync popup is missing its controls');
}

const history = createSyncHistory(extensionStorage());

function translate(key: MessageKey | ExportMessageKey, substitution?: string | string[]): string {
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
  showStatus(syncStatusText(result, translate), showsReportIssue(result));
};

const showStatus = (text: string, reportIssue: boolean): void => {
  status.textContent = text;
  if (!reportIssue) {
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
exportButton.textContent = translate('exportIcs');
exportButton.addEventListener('click', () => {
  exportButton.disabled = true;
  exportButton.textContent = translate('exporting');
  const storage = extensionStorage();
  void runExtensionExport({
    adp: createPageAdpSource(async (url) => {
      const response = await fetch(url, { credentials: 'include' });
      return { redirected: response.redirected, url: response.url, text: await response.text() };
    }),
    state: createStoredState(storage),
    now: () => new Date(),
    timeZone: () => timeZoneForSync(storage, Intl.DateTimeFormat().resolvedOptions().timeZone),
  })
    .then((result) => {
      if (result.ok) downloadText(result.filename, result.ics);
      showStatus(exportStatusText(result, translate), exportShowsReportIssue(result));
    })
    .finally(() => {
      exportButton.disabled = false;
      exportButton.textContent = translate('exportIcs');
    });
});
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

function downloadText(filename: string, body: string): void {
  const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
