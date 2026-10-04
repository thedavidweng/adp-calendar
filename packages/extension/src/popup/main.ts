import { browser } from 'wxt/browser';
import { isPopupSyncResult, syncStatusText, type MessageKey, type PopupSyncResult } from '../sync-status.ts';

const button = document.querySelector('#sync');
const status = document.querySelector('#status');
if (!(button instanceof HTMLButtonElement) || !(status instanceof HTMLElement)) {
  throw new Error('Sync popup is missing its controls');
}

function translate(key: MessageKey, substitution?: string | string[]): string {
  return substitution === undefined ? browser.i18n.getMessage(key) : browser.i18n.getMessage(key, substitution);
}

button.textContent = translate('syncNow');
button.addEventListener('click', () => {
  button.disabled = true;
  status.textContent = translate('syncing');
  void browser.runtime
    .sendMessage({ type: 'sync-now' })
    .then((result: unknown) => {
      status.textContent = syncStatusText(isPopupSyncResult(result) ? result : failed(), translate);
    })
    .catch(() => {
      status.textContent = syncStatusText(failed(), translate);
    })
    .finally(() => {
      button.disabled = false;
    });
});

function failed(): PopupSyncResult {
  return { ok: false, reason: 'sync-failed' };
}
