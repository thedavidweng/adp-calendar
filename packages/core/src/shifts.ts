import { addDays } from './schedule-range.ts';

export interface ShiftEvent {
  uid: string;
  title: string;
  start: string;
  end: string;
}

export type ParseShiftsResult =
  | { ok: true; shifts: ShiftEvent[] }
  | { ok: false; reason: 'no-schedule' }
  | { ok: false; reason: 'shape-drift' }
  | { ok: false; reason: 'adp-error'; description: string };

interface ShiftDefinition {
  templateName: string;
  payCodeDesc: string;
  inTime: string;
  outTime: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HMS = /^(\d{2}):(\d{2}):(\d{2})$/;

export function parseShifts(body: unknown): ParseShiftsResult {
  if (!isRecord(body) || !isRecord(body.data)) {
    return { ok: false, reason: 'shape-drift' };
  }
  const data = body.data;
  if (data.statusDescription === 'err_nonTimeEmployee') {
    return { ok: false, reason: 'no-schedule' };
  }
  if (data.status === 'failure' || data.statusCode !== 200) {
    const description = typeof data.statusDescription === 'string' ? data.statusDescription : 'adp-error';
    return { ok: false, reason: 'adp-error', description };
  }
  if (!Array.isArray(data.details)) {
    return { ok: false, reason: 'shape-drift' };
  }

  const shifts: ShiftEvent[] = [];
  const seen = new Set<string>();
  for (const detail of data.details) {
    if (!isRecord(detail) || !Array.isArray(detail.shiftDefinitions) || !Array.isArray(detail.positionShiftAssignments)) {
      return { ok: false, reason: 'shape-drift' };
    }
    const definitions = new Map<string, ShiftDefinition>();
    for (const raw of detail.shiftDefinitions) {
      const read = readDefinition(raw);
      if (!read) {
        return { ok: false, reason: 'shape-drift' };
      }
      definitions.set(read.id, read.definition);
    }
    for (const assignment of detail.positionShiftAssignments) {
      if (!isRecord(assignment) || !Array.isArray(assignment.shifts)) {
        return { ok: false, reason: 'shape-drift' };
      }
      for (const rawShift of assignment.shifts) {
        const shift = readShift(rawShift, definitions);
        if (!shift) {
          return { ok: false, reason: 'shape-drift' };
        }
        if (seen.has(shift.uid)) {
          return { ok: false, reason: 'shape-drift' };
        }
        seen.add(shift.uid);
        shifts.push(shift);
      }
    }
  }
  return { ok: true, shifts };
}

function readDefinition(value: unknown): { id: string; definition: ShiftDefinition } | null {
  if (!isRecord(value) || typeof value.shiftReferenceId !== 'string' || value.shiftReferenceId.length === 0) {
    return null;
  }
  if (typeof value.inTime !== 'string' || typeof value.outTime !== 'string' || !isHms(value.inTime) || !isHms(value.outTime)) {
    return null;
  }
  return {
    id: value.shiftReferenceId,
    definition: {
      inTime: value.inTime,
      outTime: value.outTime,
      templateName: typeof value.templateName === 'string' ? value.templateName : '',
      payCodeDesc: typeof value.payCodeDesc === 'string' ? value.payCodeDesc : '',
    },
  };
}

function readShift(value: unknown, definitions: Map<string, ShiftDefinition>): ShiftEvent | null {
  if (!isRecord(value)) {
    return null;
  }
  const shiftObjectId = value.shiftObjectId;
  const shiftDate = value.shiftDate;
  const shiftEndDate = value.shiftEndDate;
  const shiftReferenceId = value.shiftReferenceId;
  if (typeof shiftObjectId !== 'string' || shiftObjectId.length === 0) {
    return null;
  }
  if (typeof shiftDate !== 'string' || !DATE.test(shiftDate)) {
    return null;
  }
  if (typeof shiftEndDate !== 'string' || !DATE.test(shiftEndDate)) {
    return null;
  }
  if (typeof shiftReferenceId !== 'string') {
    return null;
  }

  const definition = definitions.get(shiftReferenceId);
  let startDate = shiftDate;
  let startTime: string;
  let endDate = shiftEndDate;
  let endTime: string;
  if (definition) {
    // Wall times are the Shift Definition span. Do not subtract mealDeductSeconds.
    startTime = definition.inTime;
    endTime = definition.outTime;
    if (compareWall(endDate, endTime, startDate, startTime) <= 0) {
      endDate = addDays(endDate, 1);
    }
  } else {
    const fallbackStart = timeFromHour(value.inTimeHour);
    if (!fallbackStart || typeof value.shiftWorkedTotalSeconds !== 'number') {
      return null;
    }
    startTime = fallbackStart;
    const end = addSeconds(startDate, startTime, value.shiftWorkedTotalSeconds);
    if (!end) {
      return null;
    }
    endDate = end.date;
    endTime = end.time;
  }

  return {
    uid: `adps${shiftObjectId}@adp-schedule-export`,
    title: shiftTitle(definition),
    start: `${startDate}T${startTime}`,
    end: `${endDate}T${endTime}`,
  };
}

function shiftTitle(definition: ShiftDefinition | undefined): string {
  const template = definition?.templateName.trim() ?? '';
  if (template) {
    return template;
  }
  const payCode = definition?.payCodeDesc.trim() ?? '';
  if (payCode) {
    return payCode;
  }
  return 'Shift';
}

function timeFromHour(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 235959) {
    return null;
  }
  const digits = String(value).padStart(6, '0');
  const time = `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4, 6)}`;
  return isHms(time) ? time : null;
}

function addSeconds(date: string, time: string, seconds: number): { date: string; time: string } | null {
  const match = HMS.exec(time);
  if (!match || !Number.isFinite(seconds)) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const secs = Number(match[3]);
  if (hours > 23 || minutes > 59 || secs > 59) {
    return null;
  }
  let total = hours * 3600 + minutes * 60 + secs + seconds;
  let dayOffset = Math.floor(total / 86400);
  total %= 86400;
  if (total < 0) {
    total += 86400;
    dayOffset -= 1;
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    date: addDays(date, dayOffset),
    time: `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`,
  };
}

function compareWall(dateA: string, timeA: string, dateB: string, timeB: string): number {
  if (dateA !== dateB) {
    return dateA < dateB ? -1 : 1;
  }
  if (timeA !== timeB) {
    return timeA < timeB ? -1 : 1;
  }
  return 0;
}

function isHms(value: string): boolean {
  const match = HMS.exec(value);
  if (!match) {
    return false;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  return hours <= 23 && minutes <= 59 && seconds <= 59;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
