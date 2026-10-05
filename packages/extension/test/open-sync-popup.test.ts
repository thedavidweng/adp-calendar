import { describe, expect, it } from 'vitest';
import { openSyncPopup } from '../src/open-sync-popup.ts';

describe('first Sync popup', () => {
  it('opens the popup with an automatic Sync request, then restores normal toolbar behavior', async () => {
    const actions: string[] = [];
    await openSyncPopup({
      async setPopup({ popup }) { actions.push(popup); },
      async openPopup() { actions.push('open'); },
    });
    expect(actions).toEqual(['/popup.html?sync=1', 'open', '/popup.html']);
  });

  it('restores the normal toolbar popup and reports an opening failure', async () => {
    const popups: string[] = [];
    await expect(openSyncPopup({
      async setPopup({ popup }) { popups.push(popup); },
      async openPopup() { throw new Error('cannot open'); },
    })).rejects.toThrow('cannot open');
    expect(popups).toEqual(['/popup.html?sync=1', '/popup.html']);
  });
});
