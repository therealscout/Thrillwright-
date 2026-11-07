import { describe, expect, it } from 'vitest';
import {
  BASE_HEIGHT,
  cloneTerrain,
  cornerIndex,
  createTerrain,
  isPathable,
  isUnderwater,
  restoreTerrain,
  tileCorners,
  tileIndex,
  tileNoise,
} from './terrain';

describe('terrain', () => {
  it('allocates tiles and corners', () => {
    const t = createTerrain(64, 32);
    expect(t.water.length).toBe(64 * 32);
    expect(t.corners.length).toBe(65 * 33);
    expect(tileIndex(t, 3, 2)).toBe(2 * 64 + 3);
    expect(tileCorners(t, 0, 0)).toEqual([BASE_HEIGHT, BASE_HEIGHT, BASE_HEIGHT, BASE_HEIGHT]);
  });

  it('rejects empty maps', () => {
    expect(() => createTerrain(0, 10)).toThrow();
  });

  it('allows paths on flat tiles and simple ramps only', () => {
    const t = createTerrain(4, 4);
    expect(isPathable(t, 1, 1)).toBe(true);
    // Raise the north edge of tile (1,1): a ramp.
    t.corners[cornerIndex(t, 1, 1)] = BASE_HEIGHT + 1;
    t.corners[cornerIndex(t, 2, 1)] = BASE_HEIGHT + 1;
    expect(isPathable(t, 1, 1)).toBe(true);
    // Raise one more corner: uneven.
    t.corners[cornerIndex(t, 2, 2)] = BASE_HEIGHT + 1;
    expect(isPathable(t, 1, 1)).toBe(false);
  });

  it('detects underwater tiles', () => {
    const t = createTerrain(4, 4);
    expect(isUnderwater(t, 0, 0)).toBe(false);
    t.water[tileIndex(t, 0, 0)] = BASE_HEIGHT + 1;
    expect(isUnderwater(t, 0, 0)).toBe(true);
  });

  it('clones and restores', () => {
    const t = createTerrain(4, 4);
    const snap = cloneTerrain(t);
    t.paths[0] = 1;
    t.corners[0] = 9;
    restoreTerrain(t, snap);
    expect(t.paths[0]).toBe(0);
    expect(t.corners[0]).toBe(BASE_HEIGHT);
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
