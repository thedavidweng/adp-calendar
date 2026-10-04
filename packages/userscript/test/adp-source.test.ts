import { describe, expect, it } from 'vitest';
import { buildMonthlyViewUrl, createPageAdpSource } from '../src/adp-source.ts';
import { readPageResponse } from '../src/page-fetch.ts';
import { createGmState } from '../src/state.ts';

describe('page ADP source', () => {
  it('requests monthlyview for the cached Position with an empty pfId', () => {
    const url = new URL(buildMonthlyViewUrl('POS-0001', '2026-09-27', '2027-01-01', 123));
    expect(url.origin).toBe('https://workforcenow.adp.com');
    expect(url.pathname).toBe('/mascsr/wfntlm/schedule/v1/monthlyview');
    expect(url.searchParams.get('positionid')).toBe('POS-0001');
    expect(url.searchParams.get('startdate')).toBe('2026-09-27');
    expect(url.searchParams.get('enddate')).toBe('2027-01-01');
    expect(url.searchParams.get('pfId')).toBe('');
    expect(url.searchParams.get('preventCache')).toBe('123');
  });

  it('returns JSON from a page-context response and does not follow a sign-in redirect', async () => {
    const source = createPageAdpSource(async () => ({
      redirected: false,
      url: 'https://workforcenow.adp.com/mascsr/wfntlm/schedule/v1/monthlyview',
      text: '{"status":"success"}',
    }), () => 1);
    await expect(source.fetchMonthlyView('POS-0001', '2026-09-27', '2027-01-01')).resolves.toEqual({
      kind: 'json',
      body: { status: 'success' },
    });

    const redirected = createPageAdpSource(async () => ({
      redirected: true,
      url: 'https://online.adp.com/olp/olplanding.html',
      text: '<html>Federation Redirector</html>',
    }), () => 1);
    await expect(redirected.fetchMonthlyView('POS-0001', '2026-09-27', '2027-01-01')).resolves.toEqual({
      kind: 'redirected',
    });
  });

  it('fetches in the page with credentials and does not read cookies', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const response = await readPageResponse(async (url, init) => {
      seenUrl = String(url);
      seenInit = init;
      return new Response('{"ok":true}', { status: 200 });
    }, 'https://workforcenow.adp.com/mascsr/wfntlm/schedule/v1/monthlyview?positionid=POS-0001');

    expect(seenUrl).toContain('positionid=POS-0001');
    expect(seenInit).toEqual({ credentials: 'include' });
    expect(JSON.stringify(seenInit)).not.toMatch(/cookie/i);
    expect(response).toEqual({
      redirected: false,
      url: '',
      text: '{"ok":true}',
    });
  });
});

describe('GM state', () => {
  it('stores only the Position id', async () => {
    const saved: Record<string, unknown> = {};
    const state = createGmState({
      getValue: (key) => saved[key],
      setValue: (key, value) => {
        saved[key] = value;
      },
    });

    await state.setPositionId('POS-0001');
    await expect(state.getPositionId()).resolves.toBe('POS-0001');
    expect(saved).toEqual({ positionId: 'POS-0001' });
  });
});
