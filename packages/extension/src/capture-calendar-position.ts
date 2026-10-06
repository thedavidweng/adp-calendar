import type { StateStore } from '@adp-calendar/core';

const POSITION_PATH = '/mascsr/timeoffrequest/ess/metaservices/emppositions/getemployeepositions/';

export function calendarPositionRequest(resourceUrl: string): boolean {
  const url = new URL(resourceUrl);
  return url.origin === 'https://workforcenow.adp.com' && url.pathname === POSITION_PATH && !!url.searchParams.get('pfid');
}

/** Calendar's own request identifies the selected Position, including when the employee switches jobs. */
export async function captureCalendarPosition(
  resourceUrl: string,
  state: StateStore,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const pfid = new URL(resourceUrl).searchParams.get('pfid');
  const response = await fetchImpl(resourceUrl, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`ADP Calendar Position lookup failed: ${response.status}`);
  const body = await response.json() as {
    employeePositinDto: { positionList: Array<{ pFid: string; positionId: string }> };
  };
  const position = body.employeePositinDto.positionList.find((item) => item.pFid === pfid);
  if (!position) return null;
  if (await state.getPositionId() !== position.positionId) await state.setPositionId(position.positionId);
  return position.positionId;
}
