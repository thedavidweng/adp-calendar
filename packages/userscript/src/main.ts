import { exportSchedule } from '@adp-calendar/core';
import { GM_getValue, GM_registerMenuCommand, GM_setValue } from 'vite-plugin-monkey/dist/client';
import { createPageAdpSource } from './adp-source.ts';
import { fetchInPage } from './browser-fetch.ts';
import { downloadText, iframeSrcs, mountButton } from './dom.ts';
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

const ui = startUserscript({
  dom: {
    iframeSrcs: () => iframeSrcs(document),
    mountButton,
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
