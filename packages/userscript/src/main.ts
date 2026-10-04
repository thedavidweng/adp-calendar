import { exportSchedule } from '@adp-calendar/core';
import { GM_getValue, GM_setValue } from 'vite-plugin-monkey/dist/client';
import { createPageAdpSource } from './adp-source.ts';
import { fetchInPage } from './browser-fetch.ts';
import { downloadText, iframeSrcs, mountButton } from './dom.ts';
import { startUserscript } from './shell.ts';
import { createGmState } from './state.ts';

const state = createGmState({
  getValue: (key) => GM_getValue(key, null),
  setValue: (key, value) => {
    GM_setValue(key, value);
  },
});

const ui = startUserscript({
  dom: {
    iframeSrcs: () => iframeSrcs(document),
    mountButton,
    download: downloadText,
  },
  state,
  runExport: () =>
    exportSchedule({
      adp: createPageAdpSource((url) => fetchInPage(url)),
      clock: { now: () => new Date() },
      state,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
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
