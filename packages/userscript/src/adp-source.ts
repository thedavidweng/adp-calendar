import type { AdpSource } from '@adp-calendar/core';

const MONTHLY_VIEW = 'https://workforcenow.adp.com/mascsr/wfntlm/schedule/v1/monthlyview';

export interface PageResponse {
  redirected: boolean;
  url: string;
  text: string;
}

export function buildMonthlyViewUrl(
  positionId: string,
  startDate: string,
  endDate: string,
  nowMs: number,
): string {
  const url = new URL(MONTHLY_VIEW);
  url.searchParams.set('positionid', positionId);
  url.searchParams.set('startdate', startDate);
  url.searchParams.set('enddate', endDate);
  url.searchParams.set('pfId', '');
  url.searchParams.set('preventCache', String(nowMs));
  return url.toString();
}

export function createPageAdpSource(
  pageFetch: (url: string) => Promise<PageResponse>,
  now: () => number = Date.now,
): AdpSource {
  return {
    async fetchMonthlyView(positionId, startDate, endDate) {
      const response = await pageFetch(buildMonthlyViewUrl(positionId, startDate, endDate, now()));
      if (response.redirected || !isWorkforceNow(response.url)) {
        return { kind: 'redirected' };
      }
      try {
        return { kind: 'json', body: JSON.parse(response.text) as unknown };
      } catch {
        return { kind: 'non-json' };
      }
    },
  };
}

function isWorkforceNow(url: string): boolean {
  try {
    return new URL(url).host === 'workforcenow.adp.com';
  } catch {
    return false;
  }
}
