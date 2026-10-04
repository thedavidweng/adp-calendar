import { describe, expect, it } from 'vitest';
import type { ExportResult, StateStore } from '@adp-calendar/core';
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
  };
}

function fakeDom(srcs: string[]): {
  dom: ShellDom;
  label: () => string;
  click: () => Promise<void>;
  downloads: Array<{ filename: string; body: string }>;
  setSrcs: (next: string[]) => void;
  mountCount: () => number;
} {
  let label = '';
  let onClick: (() => void) | null = null;
  let mounts = 0;
  const downloads: Array<{ filename: string; body: string }> = [];
  let current = srcs;
  return {
    downloads,
    label: () => label,
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
});
