import type { ExportResult, StateStore } from '@adp-calendar/core';
import { adpErrorMessage, t } from './i18n.ts';
import { readPositionId } from './position.ts';

export interface ExportButton {
  setLabel(label: string): void;
  setReportLink(href: string | null, label?: string): void;
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
  let rejectedPositionId: string | null = null;
  let sawScheduleLeave = false;

  async function onClick(): Promise<void> {
    if (mode !== 'export' || busy) {
      return;
    }
    busy = true;
    try {
      const attemptedPositionId = await deps.state.getPositionId();
      const result = await deps.runExport();
      if (!button) {
        return;
      }
      button.setReportLink(null);
      if (result.ok) {
        deps.dom.download(result.filename, result.ics);
        button.setLabel(t('exportButton'));
        return;
      }
      if (result.reason === 'session-dead') {
        button.setLabel(t('signIn'));
        return;
      }
      if (result.reason === 'no-schedule') {
        button.setLabel(t('noSchedule'));
        return;
      }
      if (result.reason === 'position-invalid') {
        rejectedPositionId = attemptedPositionId;
        sawScheduleLeave = false;
        await deps.state.clearPositionId();
        mode = 'prompt';
        button.setLabel(t('openMyScheduleAgain'));
        return;
      }
      if (result.reason === 'shape-drift') {
        button.setLabel(t('shapeDrift'));
        button.setReportLink(t('reportIssueUrl'), t('reportIssue'));
        return;
      }
      if (result.reason === 'adp-error') {
        button.setLabel(adpErrorMessage(result.description));
        return;
      }
      mode = 'prompt';
      button.setLabel(t('openMySchedule'));
      const remaining: 'no-position' = result.reason;
      void remaining;
    } catch {
      button?.setReportLink(null);
      button?.setLabel(t('exportFailed'));
    } finally {
      busy = false;
    }
  }

  return {
    async rescan() {
      const found = readPositionId(deps.dom.iframeSrcs());
      if (rejectedPositionId) {
        if (!found) {
          sawScheduleLeave = true;
        } else if (sawScheduleLeave || found !== rejectedPositionId) {
          rejectedPositionId = null;
          sawScheduleLeave = false;
          await deps.state.setPositionId(found);
        }
      } else if (found) {
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
        button.setReportLink(null);
        button.setLabel(label);
      }
      mode = next;
    },
  };
}
