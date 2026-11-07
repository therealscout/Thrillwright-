import { describe, expect, it } from 'vitest';
import { Weather } from './weather';

describe('Weather', () => {
  it('changes every couple of minutes, the same way for the same seed', () => {
    const run = (seed: number) => {
      const w = new Weather(seed);
      const kinds: string[] = [];
      w.onChange((k) => kinds.push(k));
      for (let i = 0; i < 60 * 60; i++) w.advance(1, 6);
      return kinds;
    };
    const a = run(42);
    expect(a.length).toBeGreaterThan(5);
    expect(a.length).toBeLessThan(40);
    expect(run(42)).toEqual(a);
    expect(run(43)).not.toEqual(a);
  });

  it('rains more in autumn than in summer', () => {
    const rainy = (month: number) => {
      let n = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const w = new Weather(seed);
        for (let i = 0; i < 3600; i++) {
          w.advance(1, month);
          if (w.kind === 'rain') n++;
        }
      }
      return n;
    };
    expect(rainy(10)).toBeGreaterThan(rainy(6) * 1.5);
  });

  it('eases the sky in and keeps visitors away in the rain', () => {
    const w = new Weather(1);
    w.set('rain');
    expect(w.demandFactor).toBeLessThan(1);
    w.advance(1, 3);
    expect(w.rain).toBeGreaterThan(0);
    expect(w.rain).toBeLessThan(0.5);
    for (let i = 0; i < 30; i++) w.advance(1, 3);
    if (w.kind === 'rain') expect(w.rain).toBeGreaterThan(0.95);
    w.set('sunny');
    expect(w.demandFactor).toBe(1);
  });
});
