import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { extensionStorage } from '../browser/extension-storage.ts';
import { capturePosition } from '../capture-position.ts';
import { calendarPositionRequest, captureCalendarPosition } from '../capture-calendar-position.ts';
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
    const seenRequests = new Set<string>();
    let capture = Promise.resolve();
    const observeCalendar = (entries: readonly PerformanceEntry[]) => {
      for (const entry of entries) {
        if (!calendarPositionRequest(entry.name) || seenRequests.has(entry.name)) continue;
        seenRequests.add(entry.name);
        capture = capture.then(async () => {
          const position = await captureCalendarPosition(entry.name, state, fetch);
          if (position) await browser.runtime.sendMessage({ type: PAGE_LOAD_MESSAGE });
        }).catch((error: unknown) => { console.error('ADP Shifts: Calendar Position capture failed', error); });
      }
    };
    const resources = new PerformanceObserver((list) => observeCalendar(list.getEntries()));
    resources.observe({ type: 'resource', buffered: true });
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
