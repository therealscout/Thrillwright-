import { describe, expect, it } from 'vitest';
import { createTerrain, tileIndex } from '../core/terrain';
import { COSTS } from '../core/costs';
import { Park, UNDO_LIMIT } from './park';

function makePark(cash = 10_000) {
  const t = createTerrain(10, 10);
  t.owned.fill(1);
  return new Park(t, cash);
}

describe('Park', () => {
  it('charges for edits', () => {
    const park = makePark();
    park.applyOnce('path', [{ tx: 1, ty: 1 }]);
    expect(park.cash).toBe(10_000 - COSTS.path);
  });

  it('undoes and redoes a whole drag as one step, including cash', () => {
    const park = makePark();
    park.beginStroke();
    park.apply('path', [{ tx: 1, ty: 1 }]);
    park.apply('path', [{ tx: 2, ty: 1 }]);
    park.endStroke();
    expect(park.undo()).toBe(true);
    expect(park.terrain.paths[tileIndex(park.terrain, 1, 1)]).toBe(0);
    expect(park.terrain.paths[tileIndex(park.terrain, 2, 1)]).toBe(0);
    expect(park.cash).toBe(10_000);
    expect(park.redo()).toBe(true);
    expect(park.terrain.paths[tileIndex(park.terrain, 2, 1)]).toBe(1);
    expect(park.cash).toBe(10_000 - 2 * COSTS.path);
  });

  it('does not record failed edits', () => {
    const park = makePark(0);
    expect(park.applyOnce('path', [{ tx: 1, ty: 1 }]).ok).toBe(false);
    expect(park.canUndo).toBe(false);
  });

  it('clears redo after a new edit and caps history', () => {
    const park = makePark(1_000_000);
    park.applyOnce('path', [{ tx: 0, ty: 0 }]);
    park.undo();
    park.applyOnce('path', [{ tx: 1, ty: 0 }]);
    expect(park.canRedo).toBe(false);
    for (let i = 0; i < UNDO_LIMIT + 10; i++) {
      park.applyOnce(i % 2 ? 'path' : 'remove-path', [{ tx: 1, ty: 0 }]);
    }
    let undos = 0;
    while (park.undo()) undos++;
    expect(undos).toBe(UNDO_LIMIT);
  });

  it('notifies listeners', () => {
    const park = makePark();
    let calls = 0;
    park.onChange(() => calls++);
    park.applyOnce('path', [{ tx: 1, ty: 1 }]);
    expect(calls).toBe(1);
    expect(park.version).toBe(1);
  });
});

describe('Park buildings', () => {
  it('places a building, charges for it and blocks the ground', () => {
    const park = makePark();
    const r = park.placeBuilding('carousel', { tx: 2, ty: 2 }, 2);
    expect(r.ok).toBe(true);
    expect(park.cash).toBe(10_000 - 900);
    expect(park.terrain.blocked[tileIndex(park.terrain, 3, 3)]).toBe(1);
    expect(park.placeBuilding('carousel', { tx: 3, ty: 3 }, 2).ok).toBe(false);
    expect(park.applyOnce('raise', [{ tx: 3, ty: 3 }]).ok).toBe(false);
  });

  it('undoes a placement with a refund and keeps income earned since', () => {
    const park = makePark();
    park.placeBuilding('carousel', { tx: 2, ty: 2 }, 2);
    park.earn(50);
    park.undo();
    expect(park.buildings).toHaveLength(0);
    expect(park.terrain.blocked.every((v) => v === 0)).toBe(true);
    expect(park.cash).toBe(10_050);
    park.redo();
    expect(park.buildings).toHaveLength(1);
    expect(park.cash).toBe(10_050 - 900);
  });

  it('demolishes for half the price', () => {
    const park = makePark();
    const { building } = park.placeBuilding('drop-tower', { tx: 2, ty: 2 }, 2);
    park.demolish(building!.id);
    expect(park.buildings).toHaveLength(0);
    expect(park.cash).toBe(10_000 - 2400 + 1200);
  });

  it('clamps prices to half-dollar steps', () => {
    const park = makePark();
    const { building } = park.placeBuilding('burger-stand', { tx: 2, ty: 2 }, 2);
    park.setPrice(building!.id, 3.26);
    expect(park.buildings[0]!.price).toBe(3.5);
    park.setPrice(building!.id, -4);
    expect(park.buildings[0]!.price).toBe(0);
  });

  it('prices every stall of a type at once', () => {
    const park = makePark();
    const a = park.placeBuilding('burger-stand', { tx: 2, ty: 2 }, 2).building!;
    const b = park.placeBuilding('burger-stand', { tx: 5, ty: 2 }, 2).building!;
    const c = park.placeBuilding('popcorn-cart', { tx: 2, ty: 5 }, 2).building!;
    park.setPrice(a.id, 4);
    park.setPriceForType('burger-stand', 4.2);
    expect(park.buildings.find((x) => x.id === b.id)!.price).toBe(4);
    expect(park.buildings.find((x) => x.id === c.id)!.price).toBe(2);
  });
});
