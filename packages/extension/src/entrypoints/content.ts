import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { extensionStorage } from '../browser/extension-storage.ts';
import { capturePosition } from '../capture-position.ts';
import { createStoredState } from '../storage.ts';
import { PAGE_LOAD_MESSAGE } from '../sync-trigger.ts';

export default defineContentScript({
  matches: ['https://workforcenow.adp.com/*'],
  runAt: 'document_idle',
  main() {
    void browser.runtime.sendMessage({ type: PAGE_LOAD_MESSAGE }).catch(() => undefined);
    const state = createStoredState(extensionStorage());
    const scan = () => {
      const srcs = [...document.querySelectorAll('iframe')].map((frame) => frame.src);
      void capturePosition(srcs, state);
    };
    scan();
    const root = document.documentElement;
    if (!root) {
      return;
    }
    new MutationObserver(scan).observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src'],
    });
  },
});
