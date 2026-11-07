import { describe, expect, it } from 'vitest';
import { BASE_HEIGHT, tileIndex } from '../core/terrain';
import { CATALOG } from '../core/catalog';
import { RESEARCH } from '../core/research';
import { GoalTracker, deadlineMonth, goalLines, hasGoal, type GoalState } from './goals';
import { Management, MONTH_SECONDS } from './management';
import { Park } from './park';
import { SCENARIOS, isScenarioOpen, scenarioById } from './scenarios';
import { createStarterTerrain, starterLayout } from './starter-park';
import { TUTORIAL, TutorialProgress, pathCount, type TutorialContext } from './tutorial';

const blank: GoalState = { guests: 0, rating: 0, bestCoaster: 0, bestMonthProfit: 0, loan: 0, monthIndex: 0 };

describe('Scenarios', () => {
  it('have unique ids, real prerequisites and research that exists', () => {
    const ids = new Set(SCENARIOS.map((s) => s.id));
    expect(ids.size).toBe(SCENARIOS.length);
    for (const s of SCENARIOS) {
      if (s.after) expect(ids.has(s.after)).toBe(true);
      const r = s.management.researched;
      if (Array.isArray(r)) for (const id of r) expect(RESEARCH.some((x) => x.id === id)).toBe(true);
      if (s.difficulty !== 'Sandbox') expect(hasGoal(s.goal)).toBe(true);
    }
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(5);
  });

  it('opens each scenario once the one before is finished', () => {
    const lakeshore = scenarioById('lakeshore')!;
    expect(isScenarioOpen(scenarioById('first-steps')!, new Set())).toBe(true);
    expect(isScenarioOpen(scenarioById('meadowbrook')!, new Set())).toBe(true);
    expect(isScenarioOpen(lakeshore, new Set())).toBe(false);
    expect(isScenarioOpen(lakeshore, new Set(['meadowbrook']))).toBe(true);
  });

  it('gives every map a flat, path-connected entrance', () => {
    const layout = starterLayout();
    for (const s of SCENARIOS) {
      const t = createStarterTerrain(undefined, s.terrain);
      const { tx, ty } = layout.entrance;
      expect(t.paths[tileIndex(t, tx, ty)]).toBe(1);
      expect(t.water[tileIndex(t, tx, ty - 5)]).toBe(0);
    }
  });

  it('builds a lake on lake maps and hills on hilly ones', () => {
    const count = (style: Parameters<typeof createStarterTerrain>[1]) => {
      const t = createStarterTerrain(undefined, style);
      let water = 0;
      for (const w of t.water) if (w) water++;
      const [x0, y0, x1, y1] = starterLayout().owned;
      let high = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if ((t.corners[y * (t.width + 1) + x] as number) > BASE_HEIGHT + 1) high++;
      return { water, high };
    };
    const plain = count({});
    expect(count({ water: 'lake' }).water).toBeGreaterThan(plain.water * 4);
    expect(count({ water: 'none' }).water).toBe(0);
    expect(plain.high).toBe(0);
    expect(count({ plotHills: 7, water: 'none' }).high).toBeGreaterThan(50);
  });

  it('only lists rides that exist in the catalogue in research', () => {
    for (const r of RESEARCH) {
      if (r.category === 'coaster') continue;
      expect(CATALOG.some((t) => t.id === r.unlocks)).toBe(true);
    }
  });
});

describe('Goals', () => {
  it('describes each part of the goal and whether it is met', () => {
    const lines = goalLines({ guests: 100, rating: 60, noLoan: true }, { ...blank, guests: 120, rating: 50, loan: 3000 });
    expect(lines.map((l) => [l.id, l.met])).toEqual([['guests', true], ['rating', false], ['loan', false]]);
    expect(lines[0]!.label).toBe('100 guests in the park');
  });

  it('puts the deadline at the end of October', () => {
    // Opening in March (month 2): Year 1 runs out after 8 months.
    expect(deadlineMonth({ year: 1 }, 2)).toBe(8);
    expect(deadlineMonth({ year: 2 }, 2)).toBe(20);
    expect(deadlineMonth({}, 2)).toBeNull();
  });

  it('wins once every part is met, and stays won', () => {
    const g = new GoalTracker({ guests: 100, coasterExcitement: 5, year: 1 }, 2);
    const seen: string[] = [];
    g.onOutcome((o) => seen.push(o));
    expect(g.check({ ...blank, guests: 150 })).toBe('playing');
    expect(g.check({ ...blank, guests: 150, bestCoaster: 5.2 })).toBe('won');
    expect(g.check({ ...blank, monthIndex: 50 })).toBe('won');
    expect(seen).toEqual(['won']);
  });

  it('loses when the deadline passes', () => {
    const g = new GoalTracker({ monthlyProfit: 1000, year: 1 }, 2);
    expect(g.check({ ...blank, monthIndex: 7, bestMonthProfit: 500 })).toBe('playing');
    expect(g.monthsLeft(7)).toBe(1);
    expect(g.check({ ...blank, monthIndex: 8, bestMonthProfit: 500 })).toBe('lost');
  });

  it('never ends a sandbox', () => {
    const g = new GoalTracker({}, 2);
    expect(g.check({ ...blank, monthIndex: 500 })).toBe('playing');
  });

  it('follows the calendar of a real park', () => {
    const park = new Park(createStarterTerrain());
    const m = new Management(park, { startMonth: 2 });
    const g = new GoalTracker({ guests: 10, year: 1 }, m.startMonth);
    m.setFunding(0);
    m.advance(MONTH_SECONDS * 7.9);
    expect(m.date.month).toBe('October');
    expect(g.check({ ...blank, monthIndex: m.monthIndex })).toBe('playing');
    m.advance(MONTH_SECONDS * 0.2);
    expect(m.date.month).toBe('November');
    expect(g.check({ ...blank, monthIndex: m.monthIndex })).toBe('lost');
  });
});

describe('Tutorial', () => {
  function ctx(park: Park, extra: Partial<TutorialContext> = {}): TutorialContext {
    return { park, startPaths: pathCount(park), guests: 0, rideIncome: 0, opened: new Set(), cameraMoved: false, ...extra };
  }

  it('moves on as the player does each step, in order', () => {
    const park = new Park(createStarterTerrain(), 50_000);
    const p = new TutorialProgress();
    const base = ctx(park);
    expect(TUTORIAL[p.update(base)]!.id).toBe('camera');
    expect(TUTORIAL[p.update({ ...base, cameraMoved: true })]!.id).toBe('path');
    const { tx, ty } = starterLayout().entrance;
    const tiles = [1, 2, 3, 4, 5].map((n) => ({ tx, ty: ty - 13 - n }));
    expect(park.applyOnce('path', tiles).ok).toBe(true);
    expect(TUTORIAL[p.update(base)]!.id).toBe('ride');
    park.placeBuilding('carousel', { tx: tx + 1, ty: ty - 20 }, 3);
    expect(TUTORIAL[p.update(base)]!.id).toBe('riders');
    expect(TUTORIAL[p.update({ ...base, rideIncome: 2 })]!.id).toBe('food');
  });

  it('can skip a step but not the last one', () => {
    const p = new TutorialProgress();
    p.skip();
    expect(TUTORIAL[p.index]!.id).toBe('path');
    for (let i = 0; i < 20; i++) p.skip();
    expect(TUTORIAL[p.index]!.id).toBe('goal');
  });
});
