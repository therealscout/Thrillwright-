import { describe, expect, it } from 'vitest';
import { accessTile, buildingAt, checkPlacement, footprint, originFor, setBlocked, type Building } from './buildings';
import { CATALOG, buildingType } from './catalog';
import { cornerIndex, createTerrain, tileIndex } from './terrain';

function land() {
  const t = createTerrain(20, 20);
  t.owned.fill(1);
  return t;
}

describe('catalog', () => {
  it('has rides with ratings and stalls with effects', () => {
    for (const type of CATALOG) {
      if (type.kind === 'ride') {
        expect(type.capacity).toBeGreaterThan(0);
        expect(type.cycle).toBeGreaterThan(0);
        expect(type.excitement).toBeGreaterThan(0);
      } else {
        expect(type.satisfies).toBeGreaterThan(0);
      }
    }
    expect(() => buildingType('nope')).toThrow();
  });
});

describe('placement', () => {
  const ride = { type: 'carousel', x: 5, y: 5, facing: 2 as const };

  it('has a footprint and an access tile in front', () => {
    expect(footprint(ride)).toHaveLength(9);
    expect(accessTile(ride)).toEqual({ tx: 6, ty: 8 });
    expect(accessTile({ ...ride, facing: 0 })).toEqual({ tx: 6, ty: 4 });
    expect(accessTile({ ...ride, facing: 1 })).toEqual({ tx: 8, ty: 6 });
    expect(accessTile({ ...ride, facing: 3 })).toEqual({ tx: 4, ty: 6 });
    expect(originFor(buildingType('carousel'), { tx: 6, ty: 6 })).toEqual({ tx: 5, ty: 5 });
  });

  it('accepts flat, owned, empty land and reports path connection', () => {
    const t = land();
    expect(checkPlacement(t, ride)).toEqual({ ok: true, connected: false });
    t.paths[tileIndex(t, 6, 8)] = 1;
    expect(checkPlacement(t, ride).connected).toBe(true);
  });

  it('refuses bad ground', () => {
    const t = land();
    t.corners[cornerIndex(t, 6, 6)] = 5;
    expect(checkPlacement(t, ride)).toMatchObject({ ok: false, reason: 'The ground needs to be flat.' });
    const t2 = land();
    t2.paths[tileIndex(t2, 5, 5)] = 1;
    expect(checkPlacement(t2, ride).ok).toBe(false);
    const t3 = createTerrain(20, 20);
    expect(checkPlacement(t3, ride).reason).toBe("You don't own this land.");
    expect(checkPlacement(land(), { ...ride, x: 18 }).ok).toBe(false);
  });

  it('blocks its footprint and can be found by tile', () => {
    const t = land();
    const b: Building = { id: 1, ...ride, price: 2, open: true };
    setBlocked(t, b, 1);
    expect(checkPlacement(t, { ...ride, x: 6 }).reason).toBe('Something is already built here.');
    expect(buildingAt([b], { tx: 7, ty: 7 })?.id).toBe(1);
    expect(buildingAt([b], { tx: 8, ty: 7 })).toBeUndefined();
  });
});
