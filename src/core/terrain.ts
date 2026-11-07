/**
 * Terrain data, stored in flat typed arrays (the same data-oriented style the
 * guest simulation will use).
 *
 * Heights live on tile CORNERS, so a tile can be flat, sloped or uneven.
 * Corner (cx, cy) is shared by up to four tiles; a tile (tx, ty) has corners
 * (tx, ty), (tx+1, ty), (tx+1, ty+1), (tx, ty+1).
 */

export const Surface = {
  Grass: 0,
  Dirt: 1,
  Sand: 2,
} as const;
export type Surface = (typeof Surface)[keyof typeof Surface];

/** Lowest and highest corner height, in HEIGHT_STEP units. */
export const MIN_HEIGHT = 0;
export const MAX_HEIGHT = 48;
/** Height of fresh, untouched land. Leaves room to dig ponds and valleys. */
export const BASE_HEIGHT = 4;

export interface Terrain {
  readonly width: number;
  readonly height: number;
  /** Corner heights, (width + 1) * (height + 1). */
  readonly corners: Uint8Array;
  /** Water surface height per tile; 0 means no water. */
  readonly water: Uint8Array;
  readonly surfaces: Uint8Array;
  /** 1 where the tile has a footpath. */
  readonly paths: Uint8Array;
  /** 1 where the park owns the land and may build. */
  readonly owned: Uint8Array;
}

export function createTerrain(width: number, height: number): Terrain {
  if (width <= 0 || height <= 0) throw new Error('Terrain size must be positive');
  const tiles = width * height;
  return {
    width,
    height,
    corners: new Uint8Array((width + 1) * (height + 1)).fill(BASE_HEIGHT),
    water: new Uint8Array(tiles),
    surfaces: new Uint8Array(tiles),
    paths: new Uint8Array(tiles),
    owned: new Uint8Array(tiles),
  };
}

export function tileIndex(terrain: Terrain, tx: number, ty: number): number {
  return ty * terrain.width + tx;
}

export function cornerIndex(terrain: Terrain, cx: number, cy: number): number {
  return cy * (terrain.width + 1) + cx;
}

export function cornerHeight(terrain: Terrain, cx: number, cy: number): number {
  return terrain.corners[cornerIndex(terrain, cx, cy)] as number;
}

/** The four corner heights of a tile, in order NW, NE, SE, SW. */
export function tileCorners(terrain: Terrain, tx: number, ty: number): [number, number, number, number] {
  return [
    cornerHeight(terrain, tx, ty),
    cornerHeight(terrain, tx + 1, ty),
    cornerHeight(terrain, tx + 1, ty + 1),
    cornerHeight(terrain, tx, ty + 1),
  ];
}

export function tileMinHeight(terrain: Terrain, tx: number, ty: number): number {
  return Math.min(...tileCorners(terrain, tx, ty));
}

export function tileMaxHeight(terrain: Terrain, tx: number, ty: number): number {
  return Math.max(...tileCorners(terrain, tx, ty));
}

/** True when any part of the tile is below its water surface. */
export function isUnderwater(terrain: Terrain, tx: number, ty: number): boolean {
  const w = terrain.water[tileIndex(terrain, tx, ty)] as number;
  return w > 0 && w > tileMinHeight(terrain, tx, ty);
}

/**
 * A tile can carry a path when it is flat, or a simple ramp: one edge exactly
 * one step higher than the opposite edge.
 */
export function isPathable(terrain: Terrain, tx: number, ty: number): boolean {
  const [nw, ne, se, sw] = tileCorners(terrain, tx, ty);
  if (nw === ne && ne === se && se === sw) return true;
  const rampNS = nw === ne && sw === se && Math.abs(nw - sw) === 1;
  const rampEW = nw === sw && ne === se && Math.abs(nw - ne) === 1;
  return rampNS || rampEW;
}

/** Deterministic 0..1 noise per tile, used to vary tints and scatter scenery. */
export function tileNoise(tx: number, ty: number): number {
  let h = (tx * 374761393 + ty * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/** Copy every array of a terrain, for undo snapshots. */
export function cloneTerrain(t: Terrain): Terrain {
  return {
    width: t.width,
    height: t.height,
    corners: t.corners.slice(),
    water: t.water.slice(),
    surfaces: t.surfaces.slice(),
    paths: t.paths.slice(),
    owned: t.owned.slice(),
  };
}

/** Overwrite the arrays of `target` with those of `source` (same size). */
export function restoreTerrain(target: Terrain, source: Terrain): void {
  target.corners.set(source.corners);
  target.water.set(source.water);
  target.surfaces.set(source.surfaces);
  target.paths.set(source.paths);
  target.owned.set(source.owned);
}
