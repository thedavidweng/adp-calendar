import type { StateStore } from '@adp-calendar/core';
import { readPositionId } from '@adp-calendar/core/position';

export async function capturePosition(iframeSrcs: readonly string[], state: StateStore): Promise<string | null> {
  const positionId = readPositionId(iframeSrcs);
  if (!positionId) {
    return null;
  }
  if ((await state.getPositionId()) !== positionId) {
    await state.setPositionId(positionId);
  }
  return positionId;
}
