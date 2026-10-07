import type { AdpSource, ExportResult, StateStore } from '@adp-calendar/core';
import { exportSchedule } from '@adp-calendar/core/export';

export type PopupExportResult = ExportResult | { ok: false; reason: 'export-failed' };

export type ExportMessageKey =
  | 'exportIcs'
  | 'exporting'
  | 'exportDone'
  | 'exportSessionDead'
  | 'exportFailed'
  | 'noPosition'
  | 'noSchedule'
  | 'positionInvalid'
  | 'shapeDrift'
  | 'adpError';

type Translator = (key: ExportMessageKey, substitution?: string | string[]) => string;

/** Export reads ADP only. It works without Google and never touches the Shift Calendar. */
export async function runExtensionExport(deps: {
  adp: AdpSource;
  state: StateStore;
  now: () => Date;
  timeZone: () => Promise<string>;
}): Promise<PopupExportResult> {
  try {
    return await exportSchedule({
      adp: deps.adp,
      clock: { now: deps.now },
      state: deps.state,
      timeZone: await deps.timeZone(),
    });
  } catch {
    return { ok: false, reason: 'export-failed' };
  }
}

export function exportStatusText(result: PopupExportResult, translate: Translator): string {
  if (result.ok) {
    return translate('exportDone', [result.filename, String(result.shiftCount)]);
  }
  switch (result.reason) {
    case 'no-position':
      return translate('noPosition');
    case 'session-dead':
      return translate('exportSessionDead');
    case 'no-schedule':
      return translate('noSchedule');
    case 'position-invalid':
      return translate('positionInvalid');
    case 'shape-drift':
      return translate('shapeDrift');
    case 'adp-error':
      return translate('adpError', result.description);
    case 'export-failed':
      return translate('exportFailed');
  }
}

export function exportShowsReportIssue(result: PopupExportResult): boolean {
  return !result.ok && result.reason === 'shape-drift';
}
