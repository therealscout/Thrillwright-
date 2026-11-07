import { describe, expect, it } from 'vitest';
import { checkDesign, isComplete, startFor, uniqueTiles } from './coaster';
import { runTest } from './coaster-physics';
import { COASTER_TYPE_IDS, COASTER_TYPES } from './coaster-types';
import { PREMADES, premadePieces, premadesFor } from './premade';
import { createTerrain } from './terrain';
import { layout } from './track';

describe('premade coasters', () => {
  const t = createTerrain(60, 60);
  t.owned.fill(1);

  it('has three designs for every kind of coaster', () => {
    for (const type of COASTER_TYPE_IDS) expect(premadesFor(type)).toHaveLength(3);
  });

  for (const spec of PREMADES) {
    it(`${spec.name} is a working ${COASTER_TYPES[spec.type].name}`, () => {
      const type = COASTER_TYPES[spec.type];
      const design = { start: startFor({ tx: 20, ty: 30 }, 4, 1), pieces: premadePieces(spec) };
      expect(isComplete(design)).toBe(true);
      expect(checkDesign(t, design)).toEqual({ ok: true });
      for (const p of design.pieces) expect(type.pieces).toContain(p.kind);
      const top = Math.max(...layout(design.start, design.pieces).states.map((s) => s.h));
      expect(top).toBeLessThanOrEqual(type.maxHeight);
      const run = runTest(design);
      expect(run.ok).toBe(true);
      const r = type.rate(run.ratings!, design.pieces);
      // Worth riding, and not so intense that most guests stay away.
      expect(r.excitement).toBeGreaterThan(3);
      expect(r.intensity).toBeLessThan(spec.type === 'junior-coaster' ? 5 : 7.6);
      expect(uniqueTiles(design).length).toBeLessThan(80);
    });
  }
});
