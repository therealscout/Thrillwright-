import { describe, expect, it } from 'vitest';
import { cornerHeight, isPathable, isUnderwater, tileIndex } from '../core/terrain';
import { MAX_SLOPE } from '../core/terrain-edit';
import { createStarterTerrain, starterLayout } from './starter-park';

describe('starter park', () => {
  const t = createStarterTerrain();
  const layout = starterLayout();

  it('has no slopes steeper than the editor allows', () => {
    for (let cy = 0; cy <= t.height; cy++) {
      for (let cx = 0; cx < t.width; cx++) {
        expect(Math.abs(cornerHeight(t, cx, cy) - cornerHeight(t, cx + 1, cy))).toBeLessThanOrEqual(MAX_SLOPE);
      }
    }
  });

  it('starts with a walkable, dry entrance path on owned land', () => {
    const { tx, ty } = layout.entrance;
    const k = tileIndex(t, tx, ty);
    expect(t.paths[k]).toBe(1);
    expect(t.owned[k]).toBe(1);
    expect(isPathable(t, tx, ty)).toBe(true);
    expect(isUnderwater(t, tx, ty)).toBe(false);
  });

  it('has some hills outside the park', () => {
    expect(Math.max(...t.corners)).toBeGreaterThan(cornerHeight(t, layout.entrance.tx, layout.entrance.ty) + 2);
  });
});
