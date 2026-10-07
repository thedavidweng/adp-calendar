import { describe, expect, it } from 'vitest';
import { exportSchedule, type ExportResult, type StateStore } from '@adp-calendar/core';
import { createPageAdpSource } from '../src/adp-source.ts';
import { startUserscript, type PanelView, type ShellDom } from '../src/shell.ts';

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
  view: () => PanelView;
  click: () => Promise<void>;
  downloads: Array<{ filename: string; body: string }>;
  setSrcs: (next: string[]) => void;
  mountCount: () => number;
  renders: () => number;
} {
  let current: PanelView = { label: '', busy: false, message: null };
  let onExport: (() => void) | null = null;
  let mounts = 0;
  let renders = 0;
  const downloads: Array<{ filename: string; body: string }> = [];
  let frames = srcs;
  return {
    downloads,
    view: () => current,
    mountCount: () => mounts,
    renders: () => renders,
    setSrcs(next) {
      frames = next;
    },
    async click() {
      onExport?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    dom: {
      iframeSrcs: () => frames,
      mountPanel(initial, click) {
        mounts += 1;
        current = initial;
        onExport = click;
        return {
          render(next) {
            renders += 1;
            current = next;
          },
        };
      },
      download(filename, body) {
        downloads.push({ filename, body });
      },
    },
  };
}

const ok = (ics = 'BEGIN:VCALENDAR', shiftCount = 3): ExportResult => ({ ok: true, ics, filename: 'adp-shifts.ics', shiftCount });
const openCalendar = 'Open Calendar in ADP (top right) once so this script can find your work schedule, then export.';
const openCalendarAgain = 'ADP no longer accepts the saved schedule. Open Calendar in ADP again, then export.';
const signIn = 'Sign in to ADP, then export again.';

function redirectedExport(state: StateStore, counter: { calls: number }, response: { redirected: boolean; url: string; text: string }) {
  return () =>
    exportSchedule({
      adp: createPageAdpSource(async () => {
        counter.calls += 1;
        return response;
      }),
      clock: { now: () => new Date('2026-10-03T17:00:00.000Z') },
      state,
      timeZone: 'America/Vancouver',
    });
}

describe('userscript Export panel', () => {
  it('caches the Position from a schedule iframe and mounts one Export button without a hint', async () => {
    const state = memoryState(null);
    const ui = fakeDom([encoded]);
    const shell = startUserscript({ dom: ui.dom, state, runExport: async () => ok() });

    await shell.rescan();

    expect(state.saved).toBe('POS-0001');
    expect(ui.view()).toEqual({ label: 'Export .ics', busy: false, message: null });
    expect(ui.mountCount()).toBe(1);
  });

  it('asks the user to open Calendar when no Position is cached, without exporting', async () => {
    const state = memoryState(null);
    const ui = fakeDom([]);
    let exports = 0;
    const shell = startUserscript({
      dom: ui.dom,
      state,
      runExport: async () => {
        exports += 1;
        return ok();
      },
    });

    await shell.rescan();
    expect(ui.view().message).toBeNull();
    await ui.click();

    expect(ui.view().message).toEqual({ text: openCalendar, tone: 'info' });
    expect(exports).toBe(0);
    expect(ui.downloads).toEqual([]);
  });

  it('downloads the ICS and reports the shift count on another Workforce Now page', async () => {
    const state = memoryState('POS-0001');
    const ui = fakeDom([]);
    const shell = startUserscript({
      dom: ui.dom,
      state,
      runExport: async () => ok('BEGIN:VCALENDAR\r\nEND:VCALENDAR', 12),
    });

    await shell.rescan();
    await ui.click();

    expect(ui.downloads).toEqual([{ filename: 'adp-shifts.ics', body: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR' }]);
    expect(ui.view()).toEqual({
      label: 'Export .ics',
      busy: false,
      message: { text: 'Downloaded adp-shifts.ics with 12 shifts. Import it into any calendar app.', tone: 'success' },
    });
  });

  it('uses the singular for one shift', async () => {
    const ui = fakeDom([]);
    const shell = startUserscript({ dom: ui.dom, state: memoryState('POS-0001'), runExport: async () => ok('X', 1) });

    await shell.rescan();
    await ui.click();

    expect(ui.view().message?.text).toBe('Downloaded adp-shifts.ics with 1 shift. Import it into any calendar app.');
  });

  it('shows a busy button and ignores repeated clicks while exporting', async () => {
    const ui = fakeDom([]);
    let finish: (result: ExportResult) => void = () => undefined;
    let exports = 0;
    const shell = startUserscript({
      dom: ui.dom,
      state: memoryState('POS-0001'),
      runExport: () => {
        exports += 1;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    });

    await shell.rescan();
    await ui.click();
    expect(ui.view()).toEqual({ label: 'Exporting…', busy: true, message: null });
    await ui.click();
    expect(exports).toBe(1);

    finish(ok());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ui.view().busy).toBe(false);
    expect(ui.downloads).toHaveLength(1);
  });

  it('exports from the Tampermonkey menu through the same flow', async () => {
    const ui = fakeDom([]);
    const shell = startUserscript({ dom: ui.dom, state: memoryState('POS-0001'), runExport: async () => ok() });

    await shell.rescan();
    await shell.exportNow();

    expect(ui.downloads).toHaveLength(1);
  });

  it('clears the hint once a schedule iframe appears, without remounting', async () => {
    const state = memoryState(null);
    const ui = fakeDom([]);
    const shell = startUserscript({ dom: ui.dom, state, runExport: async () => ok() });

    await shell.rescan();
    await ui.click();
    ui.setSrcs([encoded]);
    await shell.rescan();

    expect(state.saved).toBe('POS-0001');
    expect(ui.view().message).toBeNull();
    expect(ui.mountCount()).toBe(1);
  });

  it('clears the hint after the current ADP Calendar reveals a Position', async () => {
    const state = memoryState(null);
    const ui = fakeDom([]);
    const shell = startUserscript({ dom: ui.dom, state, runExport: async () => ok() });

    await shell.rescan();
    await ui.click();
    state.saved = 'POS-CAL';
    await shell.positionObserved();
    await ui.click();

    expect(ui.downloads).toHaveLength(1);
  });

  it('does not re-render on a rescan that changes nothing', async () => {
    const ui = fakeDom([encoded]);
    const shell = startUserscript({ dom: ui.dom, state: memoryState(null), runExport: async () => ok() });

    await shell.rescan();
    await shell.rescan();
    await shell.rescan();

    expect(ui.renders()).toBe(0);
  });

  it('asks the user to sign in when the ADP Session is dead', async () => {
    const ui = fakeDom([]);
    const shell = startUserscript({
      dom: ui.dom,
      state: memoryState('POS-0001'),
      runExport: async () => ({ ok: false, reason: 'session-dead' }),
    });

    await shell.rescan();
    await ui.click();

    expect(ui.view().message).toEqual({ text: signIn, tone: 'error' });
    expect(ui.downloads).toEqual([]);
  });

  it('asks to sign in after one redirected ADP response and does not request again', async () => {
    const counter = { calls: 0 };
    const state = memoryState('POS-0001');
    const ui = fakeDom([]);
    const shell = startUserscript({
      dom: ui.dom,
      state,
      runExport: redirectedExport(state, counter, {
        redirected: true,
        url: 'https://online.adp.com/olp/olplanding.html',
        text: '<html><title>Federation Redirector</title></html>',
      }),
    });

    await shell.rescan();
    await ui.click();

    expect(ui.view().message?.text).toBe(signIn);
    expect(counter.calls).toBe(1);
    expect(ui.downloads).toEqual([]);
  });

  it('asks to sign in when the ADP body is HTML and does not request again', async () => {
    const counter = { calls: 0 };
    const state = memoryState('POS-0001');
    const ui = fakeDom([]);
    const shell = startUserscript({
      dom: ui.dom,
      state,
      runExport: redirectedExport(state, counter, {
        redirected: false,
        url: 'https://workforcenow.adp.com/mascsr/wfntlm/schedule/v1/monthlyview',
        text: '<html>Please sign in</html>',
      }),
    });

    await shell.rescan();
    await ui.click();

    expect(ui.view().message?.text).toBe(signIn);
    expect(counter.calls).toBe(1);
    expect(ui.downloads).toEqual([]);
  });

  it('shows a failure when Export throws, including an unknown time zone, and re-enables the button', async () => {
    const ui = fakeDom([]);
    const shell = startUserscript({
      dom: ui.dom,
      state: memoryState('POS-0001'),
      runExport: async () => {
        throw new Error('No VTIMEZONE for Not/AZone');
      },
    });

    await shell.rescan();
    await ui.click();

    expect(ui.view()).toEqual({
      label: 'Export .ics',
      busy: false,
      message: {
        text: 'Could not export the schedule. Check the time zone in the Tampermonkey menu, or reload ADP and try again.',
        tone: 'error',
      },
    });
    expect(ui.downloads).toEqual([]);
  });

  it('says there is no schedule yet and does not download an ICS', async () => {
    const state = memoryState('POS-0001');
    const ui = fakeDom([]);
    const shell = startUserscript({ dom: ui.dom, state, runExport: async () => ({ ok: false, reason: 'no-schedule' }) });

    await shell.rescan();
    await ui.click();

    expect(ui.view().message).toEqual({ text: 'No schedule for this period yet.', tone: 'info' });
    expect(state.saved).toBe('POS-0001');
    expect(ui.downloads).toEqual([]);
  });

  it('clears an invalid Position and waits for Calendar to be opened again', async () => {
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

    expect(ui.view().message).toEqual({ text: openCalendarAgain, tone: 'info' });
    expect(state.saved).toBeNull();
    expect(exports).toBe(1);

    ui.setSrcs([encoded]);
    await shell.rescan();
    await ui.click();

    expect(state.saved).toBeNull();
    expect(exports).toBe(1);

    ui.setSrcs([]);
    await shell.rescan();
    ui.setSrcs([encoded]);
    await shell.rescan();

    expect(state.saved).toBe('POS-0001');
    expect(ui.view().message).toBeNull();
    await ui.click();

    expect(state.saved).toBeNull();
    expect(exports).toBe(2);
    expect(ui.downloads).toEqual([]);
  });

  it('accepts a Position from the current Calendar after an invalid one', async () => {
    const state = memoryState('POS-0001');
    const ui = fakeDom([]);
    let reason: 'position-invalid' | null = 'position-invalid';
    const shell = startUserscript({
      dom: ui.dom,
      state,
      runExport: async () => (reason ? { ok: false, reason } : ok()),
    });

    await shell.rescan();
    await ui.click();
    reason = null;
    state.saved = 'POS-0001';
    await shell.positionObserved();

    expect(ui.view().message).toBeNull();
    await ui.click();
    expect(ui.downloads).toHaveLength(1);
  });

  it('says ADP changed its data format and links to a new issue', async () => {
    const state = memoryState('POS-0001');
    const ui = fakeDom([]);
    const shell = startUserscript({ dom: ui.dom, state, runExport: async () => ({ ok: false, reason: 'shape-drift' }) });

    await shell.rescan();
    await ui.click();

    expect(ui.view().message).toEqual({
      text: 'ADP changed its data format. Nothing was downloaded.',
      tone: 'error',
      link: { href: 'https://github.com/thedavidweng/adp-calendar/issues/new', label: 'Report an issue' },
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
      runExport: async () => ({ ok: false, reason: 'adp-error', description: 'err_UnexpectedError_Business_Validation' }),
    });

    await shell.rescan();
    await ui.click();

    expect(ui.view().message).toEqual({
      text: 'ADP could not return the schedule: err_UnexpectedError_Business_Validation',
      tone: 'error',
    });
    expect(state.saved).toBe('POS-0001');
    expect(ui.downloads).toEqual([]);
  });
});
