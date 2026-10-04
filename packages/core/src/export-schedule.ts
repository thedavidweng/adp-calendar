import { shiftsToIcs } from './ics.ts';
import type { ExportInput, ExportResult } from './ports.ts';
import { scheduleWindow } from './schedule-range.ts';
import { parseShifts } from './shifts.ts';

export async function exportSchedule(input: ExportInput): Promise<ExportResult> {
  const positionId = await input.state.getPositionId();
  if (!positionId) {
    return { ok: false, reason: 'no-position' };
  }

  const range = scheduleWindow(input.clock.now(), input.timeZone);
  const fetched = await input.adp.fetchMonthlyView(positionId, range.startDate, range.endDate);
  if (fetched.kind !== 'json') {
    return { ok: false, reason: 'session-dead' };
  }

  const parsed = parseShifts(fetched.body);
  if (!parsed.ok) {
    return parsed;
  }

  return {
    ok: true,
    ics: shiftsToIcs(parsed.shifts, input.timeZone),
    filename: 'adp-shifts.ics',
  };
}
