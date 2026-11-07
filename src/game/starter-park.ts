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

/** How a scenario's map differs from the default sandbox. */
export interface TerrainStyle {
  /** Shifts the hill noise so each map looks different. */
  seed?: number;
  /** Height of hills inside the owned plot (0 keeps it flat). */
  plotHills?: number;
  /** A small pond (default), a large lake along the east side, or no water. */
  water?: 'pond' | 'lake' | 'none';
}

export function createStarterTerrain(size = STARTER_MAP_SIZE, style: TerrainStyle = {}): Terrain {
  const { seed = 0, plotHills = 0, water = 'pond' } = style;
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
      const hill = valueNoise(cx + seed * 37, cy + seed * 11, 14) * 10 + valueNoise(cx + 100 + seed * 13, cy, 5) * 3;
      // Inside a hilly plot, keep the ground by the entrance flat.
      const nearGate = Math.min(1, Math.max(0, (Math.hypot(cx - entrance.tx, cy - entrance.ty) - 14) / 8));
      const inside = plotHills * nearGate * valueNoise(cx + 50 + seed * 7, cy + 50, 9);
      const h = Math.round(BASE_HEIGHT + fade * hill + (1 - fade) * inside);
      t.corners[cornerIndex(t, cx, cy)] = Math.min(h, MAX_HEIGHT);
    }
  }
  relaxSlopes(t);

  if (water === 'pond') {
    // A small pond inside the plot: a dip filled with water.
    digLake(t, x1 - 12, y0 + 12, 4, 3);
  } else if (water === 'lake') {
    // A long lake along the east side of the plot, spilling past it.
    digLake(t, x1 - 6, y0 + 20, 9, 16);
  }
  if (plotHills > 0 && water !== 'none') relaxSlopes(t);

  // Entrance path heading into the park.
  for (let ty = entrance.ty; ty > entrance.ty - 14; ty--) {
    t.paths[tileIndex(t, entrance.tx - 1, ty)] = 1;
    t.paths[tileIndex(t, entrance.tx, ty)] = 1;
  }
  return t;
}

/** A flat-bottomed dip filled with water, centred on a corner, rx by ry tiles out. */
function digLake(t: Terrain, pcx: number, pcy: number, rx: number, ry: number): void {
  for (let cy = pcy - ry; cy <= pcy + ry; cy++) {
    for (let cx = pcx - rx; cx <= pcx + rx; cx++) {
      if (cx < 0 || cy < 0 || cx > t.width || cy > t.height) continue;
      // The rim sits at the water line so the shore slopes in, one step deeper per ring.
      const ring = Math.min(rx - Math.abs(cx - pcx), ry - Math.abs(cy - pcy));
      t.corners[cornerIndex(t, cx, cy)] = BASE_HEIGHT - Math.min(ring, 2);
    }
  }
  for (let ty = pcy - ry; ty < pcy + ry; ty++) {
    for (let tx = pcx - rx; tx < pcx + rx; tx++) {
      if (tx < 0 || ty < 0 || tx >= t.width || ty >= t.height) continue;
      t.water[tileIndex(t, tx, ty)] = BASE_HEIGHT;
    }
  }
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
