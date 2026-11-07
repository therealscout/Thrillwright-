/**
 * Terrain data: one height and one surface type per tile, stored in flat typed
 * arrays (the same data-oriented style the guest simulation will use).
 */

export const Surface = {
  Grass: 0,
  Dirt: 1,
  Sand: 2,
  Path: 3,
} as const;
export type Surface = (typeof Surface)[keyof typeof Surface];

export interface Terrain {
  readonly width: number;
  readonly height: number;
  /** Height in HEIGHT_STEP units, per tile. */
  readonly heights: Uint8Array;
  readonly surfaces: Uint8Array;
}

export function createTerrain(width: number, height: number): Terrain {
  if (width <= 0 || height <= 0) throw new Error('Terrain size must be positive');
  return {
    width,
    height,
    heights: new Uint8Array(width * height),
    surfaces: new Uint8Array(width * height),
  };
}

export function tileIndex(terrain: Terrain, tx: number, ty: number): number {
  return ty * terrain.width + tx;
}

/** Deterministic 0..1 noise per tile, used to vary grass tint. */
export function tileNoise(tx: number, ty: number): number {
  let h = (tx * 374761393 + ty * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
