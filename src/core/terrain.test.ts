import { describe, expect, it } from 'vitest';
import { createTerrain, tileIndex, tileNoise } from './terrain';

describe('terrain', () => {
  it('allocates one cell per tile', () => {
    const t = createTerrain(64, 32);
    expect(t.heights.length).toBe(64 * 32);
    expect(tileIndex(t, 3, 2)).toBe(2 * 64 + 3);
  });

  it('rejects empty maps', () => {
    expect(() => createTerrain(0, 10)).toThrow();
  });

  it('has deterministic noise in 0..1', () => {
    for (let i = 0; i < 100; i++) {
      const n = tileNoise(i, i * 3);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
      expect(tileNoise(i, i * 3)).toBe(n);
    }
  });
});
