import { describe, expect, it } from 'vitest';
import { daylight, skyState } from './atmosphere';

describe('Sky', () => {
  it('is light by day and dark at night, with short nights', () => {
    expect(daylight(0.5)).toBe(1);
    expect(daylight(0)).toBe(0);
    expect(daylight(0.95)).toBe(0);
    let lit = 0;
    for (let i = 0; i < 1000; i++) if (daylight(i / 1000) > 0.5) lit++;
    expect(lit).toBeGreaterThan(550);
  });

  it('dims the sun and greys the sky in the rain', () => {
    const clear = skyState({ time: 0.5, cloud: 0, rain: 0 });
    const wet = skyState({ time: 0.5, cloud: 1, rain: 1 });
    expect(wet.sunIntensity).toBeLessThan(clear.sunIntensity * 0.6);
    const sat = (c: { r: number; g: number; b: number }) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
    expect(sat(wet.sky)).toBeLessThan(sat(clear.sky));
  });

  it('keeps the light coming from above the ground', () => {
    for (let t = 0; t < 1; t += 0.05) {
      const s = skyState({ time: t, cloud: 0, rain: 0 });
      expect(s.sunDir.y).toBeGreaterThan(0.3);
      expect(s.night).toBeGreaterThanOrEqual(0);
      expect(s.night).toBeLessThanOrEqual(1);
    }
  });
});
