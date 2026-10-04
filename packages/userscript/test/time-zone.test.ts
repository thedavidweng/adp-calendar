import { describe, expect, it } from 'vitest';
import { createGmState, registerTimeZoneMenu, TIME_ZONE_KEY } from '../src/state.ts';

function memoryGm() {
  const values = new Map<string, unknown>();
  return {
    values,
    async getValue(key: string) {
      return values.has(key) ? values.get(key) : null;
    },
    async setValue(key: string, value: unknown) {
      values.set(key, value);
    },
  };
}

describe('time zone override', () => {
  it('uses the browser zone until a non-blank override is stored', async () => {
    const gm = memoryGm();
    const state = createGmState(gm);

    expect(await state.getTimeZone('America/Vancouver')).toBe('America/Vancouver');
    await state.setTimeZone('  America/Toronto  ');
    expect(await state.getTimeZone('America/Vancouver')).toBe('America/Toronto');
    await state.setTimeZone('   ');
    expect(await state.getTimeZone('America/Vancouver')).toBe('America/Vancouver');
  });

  it('stores a menu override and ignores cancel', async () => {
    const gm = memoryGm();
    const command: { run: (() => void) | null } = { run: null };
    let promptValue: string | null = 'America/Toronto';
    registerTimeZoneMenu({
      caption: 'Set time zone',
      prompt: 'IANA time zone for exported events. Leave blank to use the browser zone.',
      registerCommand(_caption, onClick) {
        command.run = onClick;
      },
      getStored: () => gm.getValue(TIME_ZONE_KEY),
      setStored: (value) => gm.setValue(TIME_ZONE_KEY, value),
      ask: () => promptValue,
      browserZone: () => 'America/Vancouver',
    });

    command.run?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(gm.values.get(TIME_ZONE_KEY)).toBe('America/Toronto');

    promptValue = null;
    command.run?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(gm.values.get(TIME_ZONE_KEY)).toBe('America/Toronto');

    promptValue = '   ';
    command.run?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(gm.values.get(TIME_ZONE_KEY)).toBe('');
    expect(await createGmState(gm).getTimeZone('America/Vancouver')).toBe('America/Vancouver');
  });
});
