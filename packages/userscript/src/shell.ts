import type { ExportResult, StateStore } from '@adp-calendar/core';
import { t } from './i18n.ts';
import { readPositionId } from './position.ts';

export interface ExportButton {
  setLabel(label: string): void;
}

export interface ShellDom {
  iframeSrcs(): readonly string[];
  mountButton(label: string, onClick: () => void): ExportButton;
  download(filename: string, body: string): void;
}

export function startUserscript(deps: {
  dom: ShellDom;
  state: StateStore;
  runExport: () => Promise<ExportResult>;
}): { rescan: () => Promise<void> } {
  let button: ExportButton | null = null;
  let mode: 'prompt' | 'export' = 'prompt';
  let busy = false;

  async function onClick(): Promise<void> {
    if (mode !== 'export' || busy) {
      return;
    }
    busy = true;
    try {
      const result = await deps.runExport();
      if (!button) {
        return;
      }
      if (result.ok) {
        deps.dom.download(result.filename, result.ics);
        button.setLabel(t('exportButton'));
        return;
      }
      if (result.reason === 'session-dead') {
        button.setLabel(t('signIn'));
        return;
      }
      if (result.reason === 'no-position') {
        mode = 'prompt';
        button.setLabel(t('openMySchedule'));
        return;
      }
      button.setLabel(t('exportFailed'));
    } finally {
      busy = false;
    }
  }

  return {
    async rescan() {
      const found = readPositionId(deps.dom.iframeSrcs());
      if (found) {
        await deps.state.setPositionId(found);
      }
      const cached = await deps.state.getPositionId();
      const next = cached ? 'export' : 'prompt';
      const label = next === 'export' ? t('exportButton') : t('openMySchedule');
      if (!button) {
        button = deps.dom.mountButton(label, () => {
          void onClick();
        });
      } else if (mode !== next) {
        button.setLabel(label);
      }
      mode = next;
    },
  };
}
