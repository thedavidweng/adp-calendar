import { describe, expect, it } from 'vitest';
import { exportSchedule, type ExportResult, type StateStore } from '@adp-calendar/core';
import { createPageAdpSource } from '../src/adp-source.ts';
import { startUserscript, type ShellDom } from '../src/shell.ts';

const encoded = `https://workforcenow.adp.com/theme/legacyAppShell.html?href=${encodeURIComponent(
  '/TLMWeb/MDFHost?pg=430&TLM_POSID=POS-0001',
)}`;

function memoryState(positionId: string | null): StateStore & { saved: string | null } {
  const state = { saved: positionId };
  return {
    get saved() {
      return state.saved;
    },
    set saved(value: string | null) {
      state.saved = value;
    },
    async getPositionId() {
      return state.saved;
    },
    async setPositionId(next) {
      state.saved = next;
    },
    async clearPositionId() {
      state.saved = null;
    },
  };
}

function fakeDom(srcs: string[]): {
  dom: ShellDom;
  label: () => string;
  reportLink: () => { href: string; label: string } | null;
  click: () => Promise<void>;
  downloads: Array<{ filename: string; body: string }>;
  setSrcs: (next: string[]) => void;
  mountCount: () => number;
} {
  let label = '';
  let onClick: (() => void) | null = null;
  let mounts = 0;
  let report: { href: string; label: string } | null = null;
  const downloads: Array<{ filename: string; body: string }> = [];
  let current = srcs;
  return {
    downloads,
    label: () => label,
    reportLink: () => report,
    mountCount: () => mounts,
    setSrcs(next) {
      current = next;
    },
    async click() {
      onClick?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    dom: {
      iframeSrcs: () => current,
      mountButton(initial, click) {
        mounts += 1;
        label = initial;
        onClick = click;
        return {
          setLabel(next) {
            label = next;
          },
          setReportLink(href, linkLabel) {
            report = href ? { href, label: linkLabel ?? '' } : null;
          },
        };
      },
      download(filename, body) {
        downloads.push({ filename, body });
      },
    },
  };
}

describe('userscript Export button', () => {
  it('caches the Position from My Schedule and offers Export', async () => {
    const state = memoryState(null);
    const ui = fakeDom([encoded]);
    const shell = startUserscript({
      dom: ui.dom,
      state,
      runExport: async () => ({ ok: true, ics: 'BEGIN:VCALENDAR', filename: 'adp-shifts.ics' }),
    });

    await shell.rescan();

    expect(state.saved).toBe('POS-0001');
    expect(ui.label()).toBe('Export schedule (.ics)');
  });

  it('tells the user to open My Schedule once when no Position is cached', async () => {
    const state = memoryState(null);
    const ui = fakeDom([]);
    let exports = 0;
    const shell = startUserscript({
      dom: ui.dom,
      state,
      runExport: async () => {
        exports += 1;
        return { ok: true, ics: '', filename: 'adp-shifts.ics' };
      },
    });

    await shell.rescan();
    await ui.click();

    expect(ui.label()).toBe('Open My Schedule once so this script can learn your Position.');
    expect(exports).toBe(0);
    expect(ui.downloads).toEqual([]);
  });

  it('shows Export on another Workforce Now page after the Position was cached', async () => {
    const state = memoryState('POS-0001');
    const ui = fakeDom([]);
    const shell = startUserscript({
      dom: ui.dom,
      state,
      runExport: async () => ({ ok: true, ics: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR', filename: 'adp-shifts.ics' }),
    });

    await shell.rescan();
    expect(ui.label()).toBe('Export schedule (.ics)');
    await ui.click();

    expect(ui.downloads).toEqual([
      { filename: 'adp-shifts.ics', body: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR' },
    ]);
  });

  it('switches the button to Export after the schedule iframe appears', async () => {
    const state = memoryState(null);
    const ui = fakeDom([]);
    const shell = startUserscript({
      dom: ui.dom,
      state,
      runExport: async () => ({ ok: false, reason: 'no-position' }) satisfies ExportResult,
    });

    await shell.rescan();
    ui.setSrcs([encoded]);
    await shell.rescan();

    expect(state.saved).toBe('POS-0001');
    expect(ui.label()).toBe('Export schedule (.ics)');
    expect(ui.mountCount()).toBe(1);
  });

  it('asks the user to sign in when the ADP Session is dead', async () => {
    const state = memoryState('POS-0001');
    const ui = fakeDom([]);
    const shell = startUserscript({
      dom: ui.dom,
      state,
      runExport: async () => ({ ok: false, reason: 'session-dead' }),
    });

    await shell.rescan();
    await ui.click();

    expect(ui.label()).toBe('Please sign in to ADP first.');
    expect(ui.downloads).toEqual([]);
  });

  it('shows the sign-in message after one redirected ADP response and does not request again', async () => {
    let calls = 0;
    const state = memoryState('POS-0001');
    const ui = fakeDom([]);
    const shell = startUserscript({
      dom: ui.dom,
      state,
      runExport: () =>
        exportSchedule({
          adp: createPageAdpSource(async () => {
            calls += 1;
            return {
              redirected: true,
              url: 'https://online.adp.com/olp/olplanding.html',
              text: '<html><title>Federation Redirector</title></html>',
            };
          }),
          clock: { now: () => new Date('2026-10-03T17:00:00.000Z') },
          state,
          timeZone: 'America/Vancouver',
        }),
    });

    await shell.rescan();
    await ui.click();

    expect(ui.label()).toBe('Please sign in to ADP first.');
    expect(calls).toBe(1);
    expect(ui.downloads).toEqual([]);
  });

  it('shows the sign-in message when the ADP body is HTML and does not request again', async () => {
    let calls = 0;
    const state = memoryState('POS-0001');
    const ui = fakeDom([]);
    const shell = startUserscript({
      dom: ui.dom,
      state,
      runExport: () =>
        exportSchedule({
          adp: createPageAdpSource(async () => {
            calls += 1;
            return {
              redirected: false,
              url: 'https://workforcenow.adp.com/mascsr/wfntlm/schedule/v1/monthlyview',
              text: '<html>Please sign in</html>',
            };
          }),
          clock: { now: () => new Date('2026-10-03T17:00:00.000Z') },
          state,
          timeZone: 'America/Vancouver',
        }),
    });

    await shell.rescan();
    await ui.click();

    expect(ui.label()).toBe('Please sign in to ADP first.');
    expect(calls).toBe(1);
    expect(ui.downloads).toEqual([]);
  });

  it('shows a failure when Export throws, including an unknown time zone', async () => {
    const state = memoryState('POS-0001');
    const ui = fakeDom([]);
    const shell = startUserscript({
      dom: ui.dom,
      state,
      runExport: async () => {
        throw new Error('No VTIMEZONE for Not/AZone');
      },
    });

    await shell.rescan();
    await ui.click();

    expect(ui.label()).toBe('Could not export the schedule. Open My Schedule and try again.');
    expect(ui.downloads).toEqual([]);
  });

  it('says there is no schedule yet and does not download an ICS', async () => {
    const state = memoryState('POS-0001');
    const ui = fakeDom([]);
    const shell = startUserscript({
      dom: ui.dom,
      state,
      runExport: async () => ({ ok: false, reason: 'no-schedule' }),
    });

    await shell.rescan();
    await ui.click();

    expect(ui.label()).toBe('No schedule for this period yet.');
    expect(state.saved).toBe('POS-0001');
    expect(ui.downloads).toEqual([]);
    expect(ui.reportLink()).toBeNull();
  });

  it('clears the cached Position and asks the user to open My Schedule again', async () => {
    const state = memoryState('POS-0001');
    const ui = fakeDom([]);
    let exports = 0;
    const shell = startUserscript({
      dom: ui.dom,
      state,
      runExport: async () => {
        exports += 1;
        return { ok: false, reason: 'position-invalid' };
      },
    });

    await shell.rescan();
    await ui.click();
    await ui.click();

    expect(ui.label()).toBe('Open My Schedule again so this script can learn your Position.');
    expect(state.saved).toBeNull();
    expect(exports).toBe(1);
    expect(ui.downloads).toEqual([]);

    ui.setSrcs([encoded]);
    await shell.rescan();
    await ui.click();

    expect(state.saved).toBeNull();
    expect(exports).toBe(1);
    expect(ui.label()).toBe('Open My Schedule again so this script can learn your Position.');

    ui.setSrcs([]);
    await shell.rescan();
    ui.setSrcs([encoded]);
    await shell.rescan();

    expect(state.saved).toBe('POS-0001');
    expect(ui.label()).toBe('Export schedule (.ics)');
    await ui.click();

    expect(state.saved).toBeNull();
    expect(exports).toBe(2);
    expect(ui.downloads).toEqual([]);
  });

  it('says ADP changed its data format and links to a new issue', async () => {
    const state = memoryState('POS-0001');
    const ui = fakeDom([]);
    const shell = startUserscript({
      dom: ui.dom,
      state,
      runExport: async () => ({ ok: false, reason: 'shape-drift' }),
    });

    await shell.rescan();
    await ui.click();

    expect(ui.label()).toBe('ADP changed its data format.');
    expect(ui.reportLink()).toEqual({
      href: 'https://github.com/thedavidweng/adp-calendar/issues/new',
      label: 'Report an issue',
    });
    expect(state.saved).toBe('POS-0001');
    expect(ui.downloads).toEqual([]);
  });

  it('shows the raw ADP statusDescription for any other failure', async () => {
    const state = memoryState('POS-0001');
    const ui = fakeDom([]);
    const shell = startUserscript({
      dom: ui.dom,
      state,
      runExport: async () => ({
        ok: false,
        reason: 'adp-error',
        description: 'err_UnexpectedError_Business_Validation',
      }),
    });

    await shell.rescan();
    await ui.click();

    expect(ui.label()).toBe('ADP could not return the schedule: err_UnexpectedError_Business_Validation');
    expect(state.saved).toBe('POS-0001');
    expect(ui.downloads).toEqual([]);
    expect(ui.reportLink()).toBeNull();
  });
});
