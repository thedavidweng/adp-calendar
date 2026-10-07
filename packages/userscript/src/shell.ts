import type { ExportResult, StateStore } from '@adp-calendar/core';
import { adpErrorMessage, exportedMessage, t } from './i18n.ts';
import { readPositionId } from './position.ts';

export type MessageTone = 'info' | 'success' | 'error';

export interface PanelMessage {
  text: string;
  tone: MessageTone;
  link?: { href: string; label: string };
}

export interface PanelView {
  label: string;
  busy: boolean;
  message: PanelMessage | null;
}

export interface ExportPanel {
  render(view: PanelView): void;
}

export interface ShellDom {
  iframeSrcs(): readonly string[];
  mountPanel(view: PanelView, onExport: () => void): ExportPanel;
  download(filename: string, body: string): void;
}

export interface UserscriptShell {
  rescan(): Promise<void>;
  /** Called after the current ADP Calendar revealed a Position, which counts as reopening Calendar. */
  positionObserved(): Promise<void>;
  exportNow(): Promise<void>;
}

export function startUserscript(deps: {
  dom: ShellDom;
  state: StateStore;
  runExport: () => Promise<ExportResult>;
}): UserscriptShell {
  let panel: ExportPanel | null = null;
  let busy = false;
  let message: PanelMessage | null = null;
  let rejectedPositionId: string | null = null;
  let sawScheduleLeave = false;

  function view(): PanelView {
    return { label: busy ? t('exporting') : t('exportButton'), busy, message };
  }

  function render(): void {
    if (!panel) {
      panel = deps.dom.mountPanel(view(), () => {
        void exportNow();
      });
      return;
    }
    panel.render(view());
  }

  function show(next: PanelMessage | null): void {
    message = next;
    render();
  }

  async function exportNow(): Promise<void> {
    if (busy) {
      return;
    }
    if (rejectedPositionId || !(await deps.state.getPositionId())) {
      show({ text: t(rejectedPositionId ? 'openCalendarAgain' : 'openCalendar'), tone: 'info' });
      return;
    }
    busy = true;
    show(null);
    try {
      const attemptedPositionId = await deps.state.getPositionId();
      const result = await deps.runExport();
      busy = false;
      if (result.ok) {
        deps.dom.download(result.filename, result.ics);
        show({ text: exportedMessage(result.filename, result.shiftCount), tone: 'success' });
        return;
      }
      switch (result.reason) {
        case 'session-dead':
          show({ text: t('signIn'), tone: 'error' });
          return;
        case 'no-schedule':
          show({ text: t('noSchedule'), tone: 'info' });
          return;
        case 'position-invalid':
          rejectedPositionId = attemptedPositionId;
          sawScheduleLeave = false;
          await deps.state.clearPositionId();
          show({ text: t('openCalendarAgain'), tone: 'error' });
          return;
        case 'shape-drift':
          show({
            text: t('shapeDrift'),
            tone: 'error',
            link: { href: t('reportIssueUrl'), label: t('reportIssue') },
          });
          return;
        case 'adp-error':
          show({ text: adpErrorMessage(result.description), tone: 'error' });
          return;
        case 'no-position':
          show({ text: t('openCalendar'), tone: 'info' });
          return;
      }
    } catch {
      busy = false;
      show({ text: t('exportFailed'), tone: 'error' });
    }
  }

  async function rescan(): Promise<void> {
    const found = readPositionId(deps.dom.iframeSrcs());
    let changed = false;
    if (rejectedPositionId) {
      if (!found) {
        sawScheduleLeave = true;
      } else if (sawScheduleLeave || found !== rejectedPositionId) {
        changed = accept();
        await deps.state.setPositionId(found);
      }
    } else if (found) {
      changed = accept();
      await deps.state.setPositionId(found);
    }
    if (!panel || changed) {
      render();
    }
  }

  /** Returns whether a stale "open Calendar" hint was cleared. */
  function accept(): boolean {
    rejectedPositionId = null;
    sawScheduleLeave = false;
    if (message?.text === t('openCalendar') || message?.text === t('openCalendarAgain')) {
      message = null;
      return true;
    }
    return false;
  }

  return {
    rescan,
    exportNow,
    async positionObserved() {
      if (accept() || !panel) {
        render();
      }
    },
  };
}
