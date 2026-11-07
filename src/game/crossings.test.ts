import { describe, expect, it } from 'vitest';
import { checkPiece, designTiles, sampleLayout, startFor, TRACK_CLEARANCE, type CoasterInfo } from '../core/coaster';
import { runTest } from '../core/coaster-physics';
import { BASE_HEIGHT, createTerrain, tileIndex, tileMaxHeight } from '../core/terrain';
import { Park } from './park';

function parkWithCoaster() {
  const t = createTerrain(40, 40);
  t.owned.fill(1);
  const park = new Park(t, 1_000_000);
  const design = { start: startFor({ tx: 5, ty: 10 }, BASE_HEIGHT, 1), pieces: sampleLayout() };
  const run = runTest(design);
  expect(run.ok).toBe(true);
  const info: CoasterInfo = { ...design, side: -1, ratings: run.ratings!, cost: 1000 };
  expect(park.openCoaster(info).ok).toBe(true);
  const uses = designTiles(design).flat();
  const high = uses.find((u) => u.hMin >= tileMaxHeight(t, u.tx, u.ty) + TRACK_CLEARANCE && uses.every((o) => o.tx !== u.tx || o.ty !== u.ty || o.hMin >= BASE_HEIGHT + TRACK_CLEARANCE))!;
  const low = uses.find((u) => u.hMax <= BASE_HEIGHT + 1 && u.tx > 8)!;
  return { park, t, high, low, design };
}

describe('building under coaster track', () => {
  it('only blocks the ground where the track runs low', () => {
    const { t, high, low } = parkWithCoaster();
    expect(high).toBeDefined();
    expect(t.blocked[tileIndex(t, high.tx, high.ty)]).toBe(0);
    expect(t.trackHigh[tileIndex(t, high.tx, high.ty)]).toBeGreaterThan(0);
    expect(t.blocked[tileIndex(t, low.tx, low.ty)]).toBe(1);
  });

  it('lets paths go under raised track but not under low track', () => {
    const { park, high, low } = parkWithCoaster();
    expect(park.applyOnce('path', [{ tx: high.tx, ty: high.ty }]).ok).toBe(true);
    expect(park.applyOnce('path', [{ tx: low.tx, ty: low.ty }]).ok).toBe(false);
  });

  it('keeps stalls and land edits out from under the track', () => {
    const { park, high } = parkWithCoaster();
    const stall = park.placeBuilding('popcorn-cart', { tx: high.tx, ty: high.ty }, 0);
    expect(stall.ok).toBe(false);
    expect(stall.reason).toBe('A coaster passes over here.');
    expect(park.applyOnce('raise', [{ tx: high.tx, ty: high.ty }]).ok).toBe(false);
  });

  it('lets another coaster pass over or under with headroom', () => {
    const { t, low } = parkWithCoaster();
    const over = startFor({ tx: low.tx, ty: low.ty }, BASE_HEIGHT + 1 + TRACK_CLEARANCE + 1, 0);
    expect(checkPiece(t, { start: over, pieces: [] }, over, 'straight').ok).toBe(true);
    const into = startFor({ tx: low.tx, ty: low.ty }, BASE_HEIGHT + 1, 0);
    expect(checkPiece(t, { start: into, pieces: [] }, into, 'straight').reason).toBe('The track would hit another coaster.');
  });

  it('frees the ground again when the coaster is demolished or undone', () => {
    const { park, t, low } = parkWithCoaster();
    const id = park.buildings[0]!.id;
    park.demolish(id);
    expect(t.blocked[tileIndex(t, low.tx, low.ty)]).toBe(0);
    expect(t.trackHigh[tileIndex(t, low.tx, low.ty)]).toBe(0);
    park.undo();
    expect(t.blocked[tileIndex(t, low.tx, low.ty)]).toBe(1);
  });

  it('unblocks the ground under raised track in older saves', () => {
    const { park, t, high } = parkWithCoaster();
    t.blocked[tileIndex(t, high.tx, high.ty)] = 1; // how saves used to store it
    park.loadState(park.saveState());
    expect(t.blocked[tileIndex(t, high.tx, high.ty)]).toBe(0);
  });
});
