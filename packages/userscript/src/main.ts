import { calendarPositionRequest, captureCalendarPosition, exportSchedule } from '@adp-calendar/core';
import { GM_getValue, GM_registerMenuCommand, GM_setValue, unsafeWindow } from 'vite-plugin-monkey/dist/client';
import { createPageAdpSource } from './adp-source.ts';
import { fetchInPage } from './browser-fetch.ts';
import { downloadText, iframeSrcs, mountPanel } from './dom.ts';
import { t } from './i18n.ts';
import { startUserscript } from './shell.ts';
import { createGmState, registerTimeZoneMenu } from './state.ts';

const state = createGmState({
  getValue: (key) => GM_getValue(key, null),
  setValue: (key, value) => {
    GM_setValue(key, value);
  },
});

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const ui = startUserscript({
  dom: {
    iframeSrcs: () => iframeSrcs(document),
    mountPanel: (view, onExport) => mountPanel(view, onExport, t('close')),
    download: downloadText,
  },
  state,
  runExport: async () =>
    exportSchedule({
      adp: createPageAdpSource((url) => fetchInPage(url)),
      clock: { now: () => new Date() },
      state,
      timeZone: await state.getTimeZone(browserTimeZone()),
    }),
});

GM_registerMenuCommand(t('exportMenu'), () => {
  void ui.exportNow();
});

registerTimeZoneMenu({
  caption: t('timeZoneMenu'),
  prompt: t('timeZonePrompt'),
  registerCommand(caption, onClick) {
    GM_registerMenuCommand(caption, onClick);
  },
  getStored: () => state.getTimeZone(browserTimeZone()),
  setStored: (value) => state.setTimeZone(value),
  ask: (message, current) => window.prompt(message, current),
  browserZone: browserTimeZone,
});

void ui.rescan();

let rescanQueued = false;
const observer = new MutationObserver(() => {
  if (rescanQueued) {
    return;
  }
  rescanQueued = true;
  window.setTimeout(() => {
    rescanQueued = false;
    void ui.rescan();
  }, 200);
});
const root = document.documentElement;
if (root) {
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src'],
  });
}

// The current ADP Calendar has no schedule iframe. Its own Position lookup names the selected Position.
const pageFetch = unsafeWindow.fetch.bind(unsafeWindow);
const seenRequests = new Set<string>();
let capture = Promise.resolve();
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (!calendarPositionRequest(entry.name) || seenRequests.has(entry.name)) continue;
    seenRequests.add(entry.name);
    capture = capture
      .then(async () => {
        if (await captureCalendarPosition(entry.name, state, pageFetch)) await ui.positionObserved();
      })
      .catch((error: unknown) => {
        console.error('ADP Schedule Export: Calendar Position capture failed', error);
      });
  }
}).observe({ type: 'resource', buffered: true });
