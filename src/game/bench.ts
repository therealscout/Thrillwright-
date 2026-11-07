/**
 * Developer helpers for the performance test: a dense grid of paths across
 * the owned plot so thousands of guests have somewhere to walk.
 */
import { isPathable, isUnderwater, tileIndex, type Terrain } from '../core/terrain';

export const TEST_GRID_SPACING = 4;

/** Lay paths every few tiles across owned, buildable land. Returns tiles added. */
export function layTestGrid(t: Terrain, spacing = TEST_GRID_SPACING): number {
  let added = 0;
  for (let ty = 0; ty < t.height; ty++) {
    for (let tx = 0; tx < t.width; tx++) {
      if (tx % spacing !== 0 && ty % spacing !== 0) continue;
      const k = tileIndex(t, tx, ty);
      if (!t.owned[k] || t.paths[k] || !isPathable(t, tx, ty) || isUnderwater(t, tx, ty)) continue;
      t.paths[k] = 1;
      added++;
    }
  }
  return added;
}
