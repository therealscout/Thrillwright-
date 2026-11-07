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
