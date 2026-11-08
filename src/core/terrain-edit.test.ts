import { describe, expect, it } from 'vitest';
import { BASE_HEIGHT, PathItem, cornerHeight, createTerrain, isPathable, tileCorners, tileIndex, type Terrain } from './terrain';
import { MAX_SLOPE, brushTiles, buyLand, moveLand, moveWater, placeItem, placePath, removePath } from './terrain-edit';
import { COSTS } from './costs';

const RICH = 1_000_000;

function ownedTerrain(size = 12): Terrain {
  const t = createTerrain(size, size);
  t.owned.fill(1);
  return t;
}

function maxNeighbourDiff(t: Terrain): number {
  let worst = 0;
  for (let cy = 0; cy <= t.height; cy++) {
    for (let cx = 0; cx <= t.width; cx++) {
      const h = cornerHeight(t, cx, cy);
      if (cx < t.width) worst = Math.max(worst, Math.abs(h - cornerHeight(t, cx + 1, cy)));
      if (cy < t.height) worst = Math.max(worst, Math.abs(h - cornerHeight(t, cx, cy + 1)));
    }
  }
  return worst;
}

describe('brushTiles', () => {
  it('centres odd brushes and clips to the map', () => {
    expect(brushTiles({ tx: 5, ty: 5 }, 3, 10, 10)).toHaveLength(9);
    expect(brushTiles({ tx: 0, ty: 0 }, 3, 10, 10)).toHaveLength(4);
    expect(brushTiles({ tx: 2, ty: 2 }, 1, 10, 10)).toEqual([{ tx: 2, ty: 2 }]);
  });
});

describe('moveLand', () => {
  it('raises a tile and builds slopes around it', () => {
    const t = ownedTerrain();
    for (let i = 0; i < 3; i++) expect(moveLand(t, [{ tx: 6, ty: 6 }], 1, RICH).ok).toBe(true);
    expect(tileCorners(t, 6, 6)).toEqual([BASE_HEIGHT + 3, BASE_HEIGHT + 3, BASE_HEIGHT + 3, BASE_HEIGHT + 3]);
    expect(maxNeighbourDiff(t)).toBeLessThanOrEqual(MAX_SLOPE);
  });

  it('levels uneven ground before raising it', () => {
    const t = ownedTerrain();
    moveLand(t, [{ tx: 4, ty: 4 }], 1, RICH);
    // A 3x3 brush around it: the low corners rise to meet the raised ones.
    moveLand(t, brushTiles({ tx: 4, ty: 4 }, 3, t.width, t.height), 1, RICH);
    const flat = tileCorners(t, 3, 3);
    expect(new Set(flat).size).toBe(1);
  });

  it('charges per height step and refuses when broke', () => {
    const t = ownedTerrain();
    const result = moveLand(t, [{ tx: 6, ty: 6 }], 1, RICH);
    expect(result.cost).toBe(4 * COSTS.landStep);
    const before = t.corners.slice();
    const broke = moveLand(t, [{ tx: 6, ty: 6 }], 1, 1);
    expect(broke.ok).toBe(false);
    expect(t.corners).toEqual(before);
  });

  it("won't edit land the park doesn't own", () => {
    const t = createTerrain(8, 8);
    expect(moveLand(t, [{ tx: 3, ty: 3 }], 1, RICH)).toMatchObject({ ok: false });
  });

  it("won't let slopes spill onto land the park doesn't own", () => {
    const t = createTerrain(10, 10);
    for (let ty = 2; ty < 8; ty++) for (let tx = 2; tx < 8; tx++) t.owned[tileIndex(t, tx, ty)] = 1;
    // Tile (4,4) has editable corners; raising it far enough would reach the border.
    let last = moveLand(t, [{ tx: 4, ty: 4 }], 1, RICH);
    for (let i = 0; i < 5 && last.ok; i++) last = moveLand(t, [{ tx: 4, ty: 4 }], 1, RICH);
    expect(last.ok).toBe(false);
    expect(cornerHeight(t, 0, 0)).toBe(BASE_HEIGHT);
  });

  it('keeps paths walkable', () => {
    const t = ownedTerrain();
    placePath(t, [{ tx: 5, ty: 5 }], RICH);
    // Raising the tile beside the path turns the path tile into a ramp: allowed.
    expect(moveLand(t, [{ tx: 6, ty: 5 }], 1, RICH).ok).toBe(true);
    expect(isPathable(t, 5, 5)).toBe(true);
  });

  it('refuses to break an existing path', () => {
    const t = ownedTerrain();
    placePath(t, [{ tx: 5, ty: 5 }], RICH);
    // Raising the diagonal neighbour lifts a single corner of the path tile.
    const before = t.corners.slice();
    expect(moveLand(t, [{ tx: 6, ty: 6 }], 1, RICH)).toMatchObject({ ok: false });
    expect(t.corners).toEqual(before);
  });

  it('lowers land', () => {
    const t = ownedTerrain();
    expect(moveLand(t, [{ tx: 6, ty: 6 }], -1, RICH).ok).toBe(true);
    expect(tileCorners(t, 6, 6)).toEqual([BASE_HEIGHT - 1, BASE_HEIGHT - 1, BASE_HEIGHT - 1, BASE_HEIGHT - 1]);
  });
});

describe('moveWater', () => {
  it('fills a dug pond and drains it again', () => {
    const t = ownedTerrain();
    const pond = brushTiles({ tx: 6, ty: 6 }, 3, t.width, t.height);
    moveLand(t, pond, -1, RICH);
    expect(moveWater(t, pond, 1, RICH).ok).toBe(true);
    expect(t.water[tileIndex(t, 6, 6)]).toBe(BASE_HEIGHT);
    expect(moveWater(t, pond, -1, RICH).ok).toBe(true);
    expect(t.water[tileIndex(t, 6, 6)]).toBe(0);
  });

  it("won't flood a path", () => {
    const t = ownedTerrain();
    placePath(t, [{ tx: 2, ty: 2 }], RICH);
    expect(moveWater(t, [{ tx: 2, ty: 2 }], 1, RICH).ok).toBe(false);
  });
});

describe('paths and land', () => {
  it('places and removes paths', () => {
    const t = ownedTerrain();
    const r = placePath(t, [{ tx: 1, ty: 1 }, { tx: 2, ty: 1 }], RICH);
    expect(r).toEqual({ ok: true, cost: 2 * COSTS.path });
    expect(placePath(t, [{ tx: 1, ty: 1 }], RICH).ok).toBe(false);
    expect(removePath(t, [{ tx: 1, ty: 1 }]).ok).toBe(true);
    expect(t.paths[tileIndex(t, 1, 1)]).toBe(0);
  });

  it('buys land', () => {
    const t = createTerrain(4, 4);
    expect(buyLand(t, [{ tx: 0, ty: 0 }], RICH)).toEqual({ ok: true, cost: COSTS.landPurchase });
    expect(buyLand(t, [{ tx: 0, ty: 0 }], RICH).ok).toBe(false);
  });
});

describe('bins and benches', () => {
  it('lets one path tile hold a bin and a bench', () => {
    const t = createTerrain(4, 4);
    t.owned.fill(1);
    placePath(t, [{ tx: 1, ty: 1 }], 1e6);
    const k = tileIndex(t, 1, 1);
    expect(placeItem(t, [{ tx: 1, ty: 1 }], PathItem.Bench, 1e6).ok).toBe(true);
    expect(placeItem(t, [{ tx: 1, ty: 1 }], PathItem.Bin, 1e6).ok).toBe(true);
    expect(t.items[k]).toBe(PathItem.Bin | PathItem.Bench);
    expect(placeItem(t, [{ tx: 1, ty: 1 }], PathItem.Bin, 1e6).reason).toContain('already a bin');
  });
});
