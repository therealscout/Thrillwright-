/**
 * Placing rides and stalls on the map. A building occupies a square
 * footprint and faces one way; guests use it from the "access" tile just
 * outside the middle of its front side, which should be a path.
 */
import { buildingType, type BuildingType } from './catalog';
import { coasterEntrance, designTiles, TRACK_CLEARANCE, uniqueTiles, type CoasterInfo } from './coaster';
import type { TileCoord } from './grid';
import { cornerHeight, tileIndex, tileMaxHeight, type Terrain } from './terrain';

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
  /** Track rides only: the design, entrance side and test-run ratings. */
  coaster?: CoasterInfo;
}

type Placed = { type: string; x: number; y: number; coaster?: CoasterInfo };

export const FACING_NAMES = ['north', 'east', 'south', 'west'] as const;

export function footprint(b: Placed): TileCoord[] {
  if (b.coaster) return uniqueTiles(b.coaster);
  const size = buildingType(b.type).size;
  const tiles: TileCoord[] = [];
  for (let ty = b.y; ty < b.y + size; ty++) for (let tx = b.x; tx < b.x + size; tx++) tiles.push({ tx, ty });
  return tiles;
}

/** The tile guests stand on to enter or buy. */
export function accessTile(b: Placed & { facing: Facing }): TileCoord {
  if (b.coaster) return coasterEntrance(b.coaster, b.coaster.side);
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
    if (t.trackHigh[k]) return fail('A coaster passes over here.');
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

/**
 * Tiles a building stops anything else using. A coaster only takes its
 * station and the tiles where its track runs close to the ground; paths
 * and other track can go under the rest.
 */
export function blockedTiles(t: Terrain, b: Placed): TileCoord[] {
  if (!b.coaster) return footprint(b);
  const out: TileCoord[] = [];
  const seen = new Set<number>();
  designTiles(b.coaster).forEach((uses, i) => {
    const station = b.coaster?.pieces[i]?.kind === 'station';
    for (const u of uses) {
      if (u.tx < 0 || u.ty < 0 || u.tx >= t.width || u.ty >= t.height) continue;
      const k = tileIndex(t, u.tx, u.ty);
      if (seen.has(k)) continue;
      if (station || u.hMin < tileMaxHeight(t, u.tx, u.ty) + TRACK_CLEARANCE) {
        seen.add(k);
        out.push({ tx: u.tx, ty: u.ty });
      }
    }
  });
  return out;
}

/** Height steps a station's roof stands above its track. */
export const STATION_ROOF = 5;

/**
 * Work out the blocked mask and the track layers from scratch: after
 * building, demolishing, undo, or loading a save.
 */
export function refreshOccupancy(t: Terrain, buildings: readonly Building[]): void {
  t.blocked.fill(0);
  t.trackLow.fill(0);
  t.trackHigh.fill(0);
  for (const b of buildings) {
    for (const { tx, ty } of blockedTiles(t, b)) t.blocked[tileIndex(t, tx, ty)] = 1;
    if (!b.coaster) continue;
    designTiles(b.coaster).forEach((uses, i) => {
      const roof = b.coaster?.pieces[i]?.kind === 'station' ? STATION_ROOF : 0;
      for (const u of uses) {
        if (u.tx < 0 || u.ty < 0 || u.tx >= t.width || u.ty >= t.height) continue;
        const k = tileIndex(t, u.tx, u.ty);
        const lo = u.hMin + 1;
        const hi = Math.min(255, u.hMax + roof + 1);
        if (!t.trackLow[k] || lo < (t.trackLow[k] as number)) t.trackLow[k] = lo;
        if (hi > (t.trackHigh[k] as number)) t.trackHigh[k] = hi;
      }
    });
  }
}

/** Mark or clear a building's footprint in the terrain's blocked mask. */
export function setBlocked(t: Terrain, b: Building, value: 0 | 1): void {
  for (const { tx, ty } of blockedTiles(t, b)) t.blocked[tileIndex(t, tx, ty)] = value;
}

/** The building covering a tile, if any. */
export function buildingAt(buildings: readonly Building[], tile: TileCoord): Building | undefined {
  return buildings.find((b) => {
    if (b.coaster) return footprint(b).some((u) => u.tx === tile.tx && u.ty === tile.ty);
    const size = buildingType(b.type).size;
    return tile.tx >= b.x && tile.ty >= b.y && tile.tx < b.x + size && tile.ty < b.y + size;
  });
}
