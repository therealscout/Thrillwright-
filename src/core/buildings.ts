/**
 * Placing rides and stalls on the map. A building occupies a square
 * footprint and faces one way; guests use it from the "access" tile just
 * outside the middle of its front side, which should be a path.
 */
import { buildingType, type BuildingType } from './catalog';
import type { TileCoord } from './grid';
import { cornerHeight, tileIndex, type Terrain } from './terrain';

/** 0 north (-y), 1 east (+x), 2 south (+y), 3 west (-x). */
export type Facing = 0 | 1 | 2 | 3;

export interface Building {
  id: number;
  type: string;
  /** Top-left (north-west) tile of the footprint. */
  x: number;
  y: number;
  facing: Facing;
  price: number;
  open: boolean;
}

export const FACING_NAMES = ['north', 'east', 'south', 'west'] as const;

export function footprint(b: { type: string; x: number; y: number }): TileCoord[] {
  const size = buildingType(b.type).size;
  const tiles: TileCoord[] = [];
  for (let ty = b.y; ty < b.y + size; ty++) for (let tx = b.x; tx < b.x + size; tx++) tiles.push({ tx, ty });
  return tiles;
}

/** The tile guests stand on to enter or buy. */
export function accessTile(b: { type: string; x: number; y: number; facing: Facing }): TileCoord {
  const size = buildingType(b.type).size;
  const mid = Math.floor(size / 2);
  switch (b.facing) {
    case 0: return { tx: b.x + mid, ty: b.y - 1 };
    case 1: return { tx: b.x + size, ty: b.y + mid };
    case 2: return { tx: b.x + mid, ty: b.y + size };
    case 3: return { tx: b.x - 1, ty: b.y + mid };
  }
}

/** Top-left tile for a building of this type centred on `centre`. */
export function originFor(type: BuildingType, centre: TileCoord): TileCoord {
  const half = Math.floor(type.size / 2);
  return { tx: centre.tx - half, ty: centre.ty - half };
}

export interface PlacementCheck {
  ok: boolean;
  reason?: string;
  /** True when the access tile already has a path. */
  connected: boolean;
}

export function checkPlacement(t: Terrain, b: { type: string; x: number; y: number; facing: Facing }): PlacementCheck {
  const tiles = footprint(b);
  const fail = (reason: string): PlacementCheck => ({ ok: false, reason, connected: false });
  const h = cornerHeight(t, Math.max(0, Math.min(b.x, t.width)), Math.max(0, Math.min(b.y, t.height)));
  for (const { tx, ty } of tiles) {
    if (tx < 0 || ty < 0 || tx >= t.width || ty >= t.height) return fail('Too close to the edge of the map.');
    const k = tileIndex(t, tx, ty);
    if (!t.owned[k]) return fail("You don't own this land.");
    if (t.blocked[k]) return fail('Something is already built here.');
    if (t.paths[k]) return fail('Remove the path here first.');
    if (t.water[k]) return fail("You can't build on water.");
    for (const [cx, cy] of [[tx, ty], [tx + 1, ty], [tx, ty + 1], [tx + 1, ty + 1]] as const) {
      if (cornerHeight(t, cx, cy) !== h) return fail('The ground needs to be flat.');
    }
  }
  const a = accessTile(b);
  if (a.tx < 0 || a.ty < 0 || a.tx >= t.width || a.ty >= t.height) return fail('The entrance would face off the map.');
  return { ok: true, connected: t.paths[tileIndex(t, a.tx, a.ty)] === 1 };
}

/** Mark or clear a building's footprint in the terrain's blocked mask. */
export function setBlocked(t: Terrain, b: Building, value: 0 | 1): void {
  for (const { tx, ty } of footprint(b)) t.blocked[tileIndex(t, tx, ty)] = value;
}

/** The building covering a tile, if any. */
export function buildingAt(buildings: readonly Building[], tile: TileCoord): Building | undefined {
  return buildings.find((b) => {
    const size = buildingType(b.type).size;
    return tile.tx >= b.x && tile.ty >= b.y && tile.tx < b.x + size && tile.ty < b.y + size;
  });
}
