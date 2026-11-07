/**
 * The default sandbox map: a flat plot of owned land with an entrance path,
 * a small pond, and rolling hills on the land around it.
 */
import { BASE_HEIGHT, MAX_HEIGHT, cornerIndex, createTerrain, tileIndex, tileNoise, type Terrain } from '../core/terrain';
import { MAX_SLOPE } from '../core/terrain-edit';

export const STARTER_MAP_SIZE = 96;

/** Smooth 0..1 noise from a coarse grid of random values. */
function valueNoise(x: number, y: number, cell: number): number {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = x / cell - gx;
  const fy = y / cell - gy;
  const s = (v: number) => v * v * (3 - 2 * v);
  const a = tileNoise(gx, gy);
  const b = tileNoise(gx + 1, gy);
  const c = tileNoise(gx, gy + 1);
  const d = tileNoise(gx + 1, gy + 1);
  const top = a + (b - a) * s(fx);
  const bottom = c + (d - c) * s(fx);
  return top + (bottom - top) * s(fy);
}

export interface StarterLayout {
  /** Owned plot, in tiles: [x0, y0, x1, y1), half-open. */
  owned: [number, number, number, number];
  entrance: { tx: number; ty: number };
}

export function starterLayout(size = STARTER_MAP_SIZE): StarterLayout {
  const half = Math.floor(size / 2);
  return {
    owned: [half - 22, size - 52, half + 22, size - 2],
    entrance: { tx: half, ty: size - 3 },
  };
}

export function createStarterTerrain(size = STARTER_MAP_SIZE): Terrain {
  const t = createTerrain(size, size);
  const { owned, entrance } = starterLayout(size);
  const [x0, y0, x1, y1] = owned;
  for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) t.owned[tileIndex(t, tx, ty)] = 1;

  // Hills grow with distance from the owned plot, which stays flat.
  for (let cy = 0; cy <= size; cy++) {
    for (let cx = 0; cx <= size; cx++) {
      const dx = Math.max(x0 - cx, 0, cx - x1);
      const dy = Math.max(y0 - cy, 0, cy - y1);
      const fade = Math.min(Math.hypot(dx, dy) / 8, 1);
      const hill = valueNoise(cx, cy, 14) * 10 + valueNoise(cx + 100, cy, 5) * 3;
      const h = Math.round(BASE_HEIGHT + fade * hill);
      t.corners[cornerIndex(t, cx, cy)] = Math.min(h, MAX_HEIGHT);
    }
  }
  relaxSlopes(t);

  // A small pond inside the plot: a dip filled with water.
  const pcx = x1 - 12;
  const pcy = y0 + 12;
  for (let cy = pcy - 3; cy <= pcy + 3; cy++) {
    for (let cx = pcx - 4; cx <= pcx + 4; cx++) {
      const inner = Math.abs(cx - pcx) <= 3 && Math.abs(cy - pcy) <= 2;
      t.corners[cornerIndex(t, cx, cy)] = BASE_HEIGHT - (inner ? 2 : 1);
    }
  }
  for (let ty = pcy - 3; ty < pcy + 3; ty++) {
    for (let tx = pcx - 4; tx < pcx + 4; tx++) t.water[tileIndex(t, tx, ty)] = BASE_HEIGHT;
  }

  // Entrance path heading into the park.
  for (let ty = entrance.ty; ty > entrance.ty - 14; ty--) {
    t.paths[tileIndex(t, entrance.tx - 1, ty)] = 1;
    t.paths[tileIndex(t, entrance.tx, ty)] = 1;
  }
  return t;
}

/** Lower any corner that is too steep against a neighbour, until none are. */
export function relaxSlopes(t: Terrain): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (let cy = 0; cy <= t.height; cy++) {
      for (let cx = 0; cx <= t.width; cx++) {
        const i = cornerIndex(t, cx, cy);
        let limit = 255;
        if (cx > 0) limit = Math.min(limit, (t.corners[i - 1] as number) + MAX_SLOPE);
        if (cx < t.width) limit = Math.min(limit, (t.corners[i + 1] as number) + MAX_SLOPE);
        if (cy > 0) limit = Math.min(limit, (t.corners[i - t.width - 1] as number) + MAX_SLOPE);
        if (cy < t.height) limit = Math.min(limit, (t.corners[i + t.width + 1] as number) + MAX_SLOPE);
        if ((t.corners[i] as number) > limit) {
          t.corners[i] = limit;
          changed = true;
        }
      }
    }
  }
}
