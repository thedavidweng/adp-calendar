import { describe, expect, it } from 'vitest';
import { readPositionId } from '../src/position.ts';

const encoded = `https://workforcenow.adp.com/theme/legacyAppShell.html?href=${encodeURIComponent(
  '/TLMWeb/MDFHost?pg=430&now=1&TLM_PFID=PF-0001&TLM_POSID=POS-0001',
)}`;

describe('Position from the My Schedule iframe', () => {
  it('reads TLM_POSID from the URL-encoded href', () => {
    expect(readPositionId([encoded])).toBe('POS-0001');
  });

  it('reads a relative legacy iframe src', () => {
    const relative = `legacyAppShell.html?href=${encodeURIComponent('/TLMWeb/MDFHost?TLM_POSID=POS-0001')}`;
    expect(readPositionId([relative])).toBe('POS-0001');
  });

  it('ignores frames that are not the schedule host', () => {
    expect(readPositionId(['https://workforcenow.adp.com/theme/index.html', ''])).toBeNull();
  });
});
