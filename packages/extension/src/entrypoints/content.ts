import { defineContentScript } from 'wxt/utils/define-content-script';
import { capturePosition } from '../capture-position.ts';
import { createStoredState } from '../storage.ts';
import { extensionStorage } from '../browser/extension-storage.ts';

export default defineContentScript({
  matches: ['https://workforcenow.adp.com/*'],
  runAt: 'document_idle',
  main() {
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
