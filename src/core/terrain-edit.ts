/**
 * Pure terrain editing rules. Every operation either applies completely or
 * changes nothing, and reports what it cost.
 */
import { COSTS } from './costs';
import type { TileCoord } from './grid';
import {
  MAX_HEIGHT,
  MIN_HEIGHT,
  PathItem,
  cornerIndex,
  isPathable,
  isUnderwater,
  tileIndex,
  tileMinHeight,
  type Terrain,
} from './terrain';

export interface EditResult {
  ok: boolean;
  cost: number;
  /** Player-facing explanation when nothing changed. */
  reason?: string;
}

const fail = (reason: string): EditResult => ({ ok: false, cost: 0, reason });

/** Largest allowed height difference between neighbouring corners. */
export const MAX_SLOPE = 1;

/** Square brush of `size` tiles (odd sizes centre on the tile), clipped to the map. */
export function brushTiles(center: TileCoord, size: number, width: number, height: number): TileCoord[] {
  const half = Math.floor(size / 2);
  const tiles: TileCoord[] = [];
  for (let ty = center.ty - half; ty < center.ty - half + size; ty++) {
    for (let tx = center.tx - half; tx < center.tx - half + size; tx++) {
      if (tx >= 0 && ty >= 0 && tx < width && ty < height) tiles.push({ tx, ty });
    }
  }
  return tiles;
}

function isOwned(t: Terrain, tx: number, ty: number): boolean {
  return t.owned[tileIndex(t, tx, ty)] === 1;
}

/** Why a corner can't move, or null if it can. */
function cornerLock(t: Terrain, cx: number, cy: number): 'unowned' | 'building' | null {
  let lock: 'unowned' | 'building' | null = null;
  for (let ty = cy - 1; ty <= cy; ty++) {
    for (let tx = cx - 1; tx <= cx; tx++) {
      if (tx < 0 || ty < 0 || tx >= t.width || ty >= t.height) continue;
      if (t.blocked[tileIndex(t, tx, ty)]) lock = 'building';
      else if (!isOwned(t, tx, ty) && !lock) lock = 'unowned';
    }
  }
  return lock;
}

/** A corner may move only if every tile touching it is owned and free of buildings. */
function cornerEditable(t: Terrain, cx: number, cy: number): boolean {
  return cornerLock(t, cx, cy) === null;
}

/**
 * Raise (direction 1) or lower (-1) the land under a brush. Raising lifts the
 * lowest corners first, so repeated clicks level an area before building it
 * up, which is what you want when preparing ground for a ride. Neighbouring
 * land is reshaped into slopes automatically.
 */
export function moveLand(t: Terrain, tiles: TileCoord[], direction: 1 | -1, budget: number): EditResult {
  const owned = tiles.filter((p) => isOwned(t, p.tx, p.ty));
  if (owned.length === 0) return fail("You don't own this land.");

  // Collect the brush's corners.
  const brush = new Set<number>();
  for (const { tx, ty } of owned) {
    brush.add(cornerIndex(t, tx, ty));
    brush.add(cornerIndex(t, tx + 1, ty));
    brush.add(cornerIndex(t, tx + 1, ty + 1));
    brush.add(cornerIndex(t, tx, ty + 1));
  }
  const stride = t.width + 1;
  const editable = [...brush].filter((i) => cornerEditable(t, i % stride, Math.floor(i / stride)));
  if (editable.length === 0) {
    const underBuilding = [...brush].some((i) => cornerLock(t, i % stride, Math.floor(i / stride)) === 'building');
    return fail(underBuilding ? 'Remove the ride or stall first.' : "You can't reshape the edge of your land.");
  }

  const heights = editable.map((i) => t.corners[i] as number);
  const target = direction > 0 ? Math.min(...heights) + 1 : Math.max(...heights) - 1;
  if (target > MAX_HEIGHT) return fail('The land is as high as it can go.');
  if (target < MIN_HEIGHT) return fail('The land is as low as it can go.');

  const next = t.corners.slice();
  const queue: number[] = [];
  for (const i of editable) {
    const h = next[i] as number;
    if ((direction > 0 && h < target) || (direction < 0 && h > target)) {
      next[i] = target;
      queue.push(i);
    }
  }

  // Cascade: keep neighbouring corners within MAX_SLOPE so slopes form.
  while (queue.length > 0) {
    const i = queue.pop() as number;
    const cx = i % stride;
    const cy = Math.floor(i / stride);
    const h = next[i] as number;
    const neighbours: Array<[number, number]> = [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]];
    for (const [nx, ny] of neighbours) {
      if (nx < 0 || ny < 0 || nx > t.width || ny > t.height) continue;
      const j = cornerIndex(t, nx, ny);
      const nh = next[j] as number;
      const wanted = direction > 0 ? Math.max(nh, h - MAX_SLOPE) : Math.min(nh, h + MAX_SLOPE);
      if (wanted === nh) continue;
      const lock = cornerLock(t, nx, ny);
      if (lock === 'building') return fail('That would reshape the ground under a ride or stall.');
      if (lock) return fail("That would reshape land you don't own.");
      next[j] = wanted;
      queue.push(j);
    }
  }

  let steps = 0;
  for (let i = 0; i < next.length; i++) steps += Math.abs((next[i] as number) - (t.corners[i] as number));
  if (steps === 0) return fail('Nothing to change here.');
  const cost = steps * COSTS.landStep;
  if (cost > budget) return { ok: false, cost, reason: 'Not enough cash.' };

  // Paths must stay walkable; check against the new shape before committing.
  const old = t.corners.slice();
  t.corners.set(next);
  for (let ty = 0; ty < t.height; ty++) {
    for (let tx = 0; tx < t.width; tx++) {
      const k = tileIndex(t, tx, ty);
      if (t.paths[k] && (!isPathable(t, tx, ty) || isUnderwater(t, tx, ty))) {
        t.corners.set(old);
        return fail('That would break a path. Remove the path first.');
      }
    }
  }
  return { ok: true, cost };
}

/** Raise (1) or lower (-1) the water surface over a brush. */
export function moveWater(t: Terrain, tiles: TileCoord[], direction: 1 | -1, budget: number): EditResult {
  const owned = tiles.filter((p) => isOwned(t, p.tx, p.ty));
  if (owned.length === 0) return fail("You don't own this land.");

  const levels = owned.map(({ tx, ty }) => {
    const w = t.water[tileIndex(t, tx, ty)] as number;
    return w > 0 ? w : tileMinHeight(t, tx, ty);
  });
  const level = direction > 0 ? Math.max(...levels) + 1 : Math.max(...levels) - 1;
  if (level > MAX_HEIGHT) return fail('The water is as high as it can go.');

  const changes: Array<[number, number]> = [];
  for (const { tx, ty } of owned) {
    const k = tileIndex(t, tx, ty);
    const value = level > tileMinHeight(t, tx, ty) ? level : 0;
    if (value === t.water[k]) continue;
    if (value > 0 && t.paths[k]) return fail('That would flood a path.');
    if (value > 0 && t.blocked[k]) return fail('That would flood a ride or stall.');
    changes.push([k, value]);
  }
  if (changes.length === 0) return fail('Nothing to change here.');
  const cost = changes.length * COSTS.waterStep;
  if (cost > budget) return { ok: false, cost, reason: 'Not enough cash.' };
  for (const [k, value] of changes) t.water[k] = value;
  return { ok: true, cost };
}

/** Lay footpath on every suitable tile of the brush. */
export function placePath(t: Terrain, tiles: TileCoord[], budget: number): EditResult {
  const targets: number[] = [];
  let reason = 'Nothing to change here.';
  for (const { tx, ty } of tiles) {
    const k = tileIndex(t, tx, ty);
    if (t.paths[k]) continue;
    if (!isOwned(t, tx, ty)) reason = "You don't own this land.";
    else if (t.blocked[k]) reason = 'A ride or stall is in the way.';
    else if (isUnderwater(t, tx, ty)) reason = "Paths can't go underwater.";
    else if (!isPathable(t, tx, ty)) reason = 'Paths need flat ground or a gentle slope.';
    else targets.push(k);
  }
  if (targets.length === 0) return fail(reason);
  const cost = targets.length * COSTS.path;
  if (cost > budget) return { ok: false, cost, reason: 'Not enough cash.' };
  for (const k of targets) t.paths[k] = 1;
  return { ok: true, cost };
}

export function removePath(t: Terrain, tiles: TileCoord[]): EditResult {
  let removed = 0;
  for (const { tx, ty } of tiles) {
    const k = tileIndex(t, tx, ty);
    if (t.paths[k] && isOwned(t, tx, ty)) {
      t.paths[k] = 0;
      t.items[k] = PathItem.None;
      removed++;
    }
  }
  return removed > 0 ? { ok: true, cost: 0 } : fail('No path here.');
}

export function buyLand(t: Terrain, tiles: TileCoord[], budget: number): EditResult {
  const targets = tiles.map(({ tx, ty }) => tileIndex(t, tx, ty)).filter((k) => !t.owned[k]);
  if (targets.length === 0) return fail('You already own this land.');
  const cost = targets.length * COSTS.landPurchase;
  if (cost > budget) return { ok: false, cost, reason: 'Not enough cash.' };
  for (const k of targets) t.owned[k] = 1;
  return { ok: true, cost };
}

/** Put a bin or bench on every path tile of the brush that has nothing on it yet. */
export function placeItem(t: Terrain, tiles: TileCoord[], item: PathItem, budget: number): EditResult {
  const targets: number[] = [];
  let reason = 'Bins and benches go on paths.';
  for (const { tx, ty } of tiles) {
    const k = tileIndex(t, tx, ty);
    if (!t.paths[k] || !isOwned(t, tx, ty)) continue;
    if (t.items[k] === item) {
      reason = 'There is already one here.';
      continue;
    }
    targets.push(k);
  }
  if (targets.length === 0) return fail(reason);
  const cost = targets.length * (item === PathItem.Bin ? COSTS.bin : COSTS.bench);
  if (cost > budget) return { ok: false, cost, reason: 'Not enough cash.' };
  for (const k of targets) t.items[k] = item;
  return { ok: true, cost };
}
