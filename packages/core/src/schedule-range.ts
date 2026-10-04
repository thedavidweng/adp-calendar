const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function localToday(now: Date, timeZone: string): string {
  return zonedParts(now, timeZone).today;
}

export function scheduleWindow(now: Date, timeZone: string): { startDate: string; endDate: string } {
  const { today, weekday } = zonedParts(now, timeZone);
  const weekdayIndex = WEEKDAYS.indexOf(weekday as (typeof WEEKDAYS)[number]);
  if (weekdayIndex < 0) {
    throw new Error(`Unexpected weekday ${weekday}`);
  }

  return {
    startDate: addDays(today, -weekdayIndex),
    endDate: addDays(today, 90),
  };
}

function zonedParts(now: Date, timeZone: string): { today: string; weekday: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = value('year');
  const month = value('month');
  const day = value('day');
  const weekday = value('weekday');
  if (!year || !month || !day || !weekday) {
    throw new Error('Could not read the clock in the configured time zone');
  }
  return { today: `${year}-${month}-${day}`, weekday };
}

export function addDays(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    throw new Error(`Bad date ${isoDate}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
