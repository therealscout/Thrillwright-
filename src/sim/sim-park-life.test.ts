import { describe, expect, it } from 'vitest';
import { GuestState } from './guests';
import { demandFactor, targetRating } from './rating';
import { BIN_CAPACITY, fairPrice, SimCore, TICK_RATE, type SimBuilding, type SimWorld } from './sim-core';
import { Thought, ThoughtLog, thoughtText } from './thoughts';

/** A straight east-west path along y = 5 with the entrance at its west end. */
function street(buildings: SimBuilding[], width = 30, items?: Uint8Array): SimWorld {
  const height = 10;
  const paths = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) paths[5 * width + x] = 1;
  return { width, height, paths, items: items ?? new Uint8Array(width * height), corners: new Uint8Array((width + 1) * (height + 1)).fill(4), buildings };
}

const base = { price: 2, open: true, excitement: 0, intensity: 0, nausea: 0, capacity: 0, cycle: 0, satisfies: 0 };
const ride = (over: Partial<SimBuilding> = {}): SimBuilding => ({ ...base, id: 1, kind: 'ride', ax: 20, ay: 5, excitement: 4, intensity: 2, nausea: 1, capacity: 4, cycle: 10, ...over });

function run(sim: SimCore, seconds: number) {
  for (let t = 0; t < TICK_RATE * seconds; t++) sim.tick();
}

function keep(sim: SimCore) {
  const g = sim.guests;
  for (let i = 0; i < g.count; i++) {
    g.stay[i] = 10_000;
    g.energy[i] = 255;
  }
}

describe('thoughts', () => {
  it('fill in ride names and keep a tally', () => {
    expect(thoughtText(Thought.LovedRide, 'Steel Coaster')).toBe('Steel Coaster was great!');
    const log = new ThoughtLog(3);
    for (let i = 0; i < 5; i++) log.add({ guest: i, thought: Thought.Hungry, about: 0, tick: i });
    log.add({ guest: 9, thought: Thought.Tired, about: 0, tick: 9 });
    // Repeats are tallied but not repeated in the feed.
    expect(log.recent).toHaveLength(2);
    expect(log.recent[0]?.thought).toBe(Thought.Tired);
    expect(log.top(2)[0]).toEqual({ thought: Thought.Hungry, count: 5 });
    log.decay(0.5);
    expect(log.top(1)[0]?.count).toBe(3);
  });

  it('guests say when they are hungry', () => {
    const sim = new SimCore(street([]), [{ tx: 0, ty: 5 }], { arrivalRate: 0, maxGuests: 50 });
    sim.spawnScattered(40);
    keep(sim);
    for (let i = 0; i < sim.guests.count; i++) sim.guests.hunger[i] = 230;
    run(sim, 20);
    expect(sim.stats().thoughts.top.some((t) => t.thought === Thought.Hungry)).toBe(true);
  });

  it('guests refuse overpriced rides and say so', () => {
    const pricey = ride({ price: Math.ceil(fairPrice(4) + 3) });
    const sim = new SimCore(street([pricey]), [{ tx: 0, ty: 5 }], { arrivalRate: 0, maxGuests: 60 });
    sim.spawnScattered(50);
    keep(sim);
    for (let i = 0; i < sim.guests.count; i++) sim.guests.cash[i] = 100;
    run(sim, 40);
    const stats = sim.stats();
    expect(stats.buildings[0]?.customers).toBe(0);
    expect(stats.thoughts.top.some((t) => t.thought === Thought.TooExpensive)).toBe(true);
  });
});

describe('litter and bins', () => {
  it('guests drop litter after eating when there is no bin', () => {
    const food: SimBuilding = { ...base, id: 7, kind: 'food', ax: 12, ay: 5, price: 3, satisfies: 150 };
    const sim = new SimCore(street([food]), [{ tx: 0, ty: 5 }], { arrivalRate: 0, maxGuests: 30 });
    sim.spawnScattered(20);
    keep(sim);
    for (let i = 0; i < sim.guests.count; i++) sim.guests.hunger[i] = 220;
    run(sim, 90);
    expect(sim.litter.reduce((a, b) => a + b, 0)).toBeGreaterThan(5);
  });

  it('bins catch the litter instead', () => {
    const width = 30;
    const items = new Uint8Array(width * 10);
    for (let x = 0; x < width; x += 2) items[5 * width + x] = 1; // a bin every other tile
    const food: SimBuilding = { ...base, id: 7, kind: 'food', ax: 12, ay: 5, price: 3, satisfies: 150 };
    const sim = new SimCore(street([food], width, items), [{ tx: 0, ty: 5 }], { arrivalRate: 0, maxGuests: 30 });
    sim.spawnScattered(20);
    keep(sim);
    for (let i = 0; i < sim.guests.count; i++) sim.guests.hunger[i] = 220;
    run(sim, 90);
    expect(sim.litter.reduce((a, b) => a + b, 0)).toBe(0);
    expect(sim.binFill.reduce((a, b) => a + b, 0)).toBeGreaterThan(5);
    expect(Math.max(...sim.binFill)).toBeLessThanOrEqual(BIN_CAPACITY);
  });

  it('very queasy guests are sick on the path, and dirty paths upset guests', () => {
    const sim = new SimCore(street([]), [{ tx: 0, ty: 5 }], { arrivalRate: 0, maxGuests: 30 });
    sim.spawnScattered(20);
    keep(sim);
    for (let i = 0; i < sim.guests.count; i++) sim.guests.nausea[i] = 250;
    run(sim, 30);
    expect(sim.vomit.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(sim.dirtyTiles()).toBeGreaterThan(0);
    const top = sim.stats().thoughts.top.map((t) => t.thought);
    expect(top).toContain(Thought.Sick);
  });

  it('handymen sweep the paths clean', () => {
    const sim = new SimCore(street([]), [{ tx: 0, ty: 5 }], { arrivalRate: 0, maxGuests: 0 });
    for (const x of [5, 9, 14, 22, 27]) sim.litter[5 * 30 + x] = 3;
    sim.setStaff(2, 0);
    expect(sim.stats().staff.handymen).toBe(2);
    run(sim, 60);
    expect(sim.litter.reduce((a, b) => a + b, 0)).toBe(0);
    expect(sim.stats().staff.swept).toBe(5);
    sim.setStaff(0, 0);
    expect(sim.staff.count).toBe(0);
  });

  it('staff show up in the snapshot in uniform', () => {
    const sim = new SimCore(street([]), [{ tx: 0, ty: 5 }], { arrivalRate: 0, maxGuests: 0 });
    sim.setStaff(1, 1);
    const out = new Float32Array(8 * 4);
    expect(sim.writeSnapshot(out)).toBe(2);
    expect([out[7], out[15]].sort()).toEqual([256, 257]);
  });
});

describe('breakdowns and mechanics', () => {
  it('a broken ride sends its queue away and stays broken without a mechanic', () => {
    const sim = new SimCore(street([ride()]), [{ tx: 0, ty: 5 }], { arrivalRate: 0, maxGuests: 20 });
    sim.spawnScattered(10);
    keep(sim);
    run(sim, 30);
    sim.forceBreakdown(1);
    const s = sim.stats();
    expect(s.events).toEqual([{ kind: 'breakdown', id: 1 }]);
    expect(s.buildings[0]?.broken).toBe(true);
    expect(s.buildings[0]?.queue).toBe(0);
    for (let i = 0; i < sim.guests.count; i++) expect(sim.guests.state[i]).not.toBe(GuestState.Queuing);
    run(sim, 20);
    const later = sim.stats().buildings[0]!;
    expect(later.broken).toBe(true);
    expect(later.downtime).toBeGreaterThanOrEqual(19);
    expect(later.riders).toBe(0);
  });

  it('a mechanic walks over and fixes it', () => {
    const sim = new SimCore(street([ride()]), [{ tx: 0, ty: 5 }], { arrivalRate: 0, maxGuests: 0 });
    sim.setStaff(0, 1);
    sim.forceBreakdown(1);
    sim.stats();
    run(sim, 40);
    const s = sim.stats();
    expect(s.buildings[0]?.broken).toBe(false);
    expect(s.events).toContainEqual({ kind: 'fixed', id: 1 });
    expect(s.staff.repairs).toBe(1);
  });

  it('rides wear out with use', () => {
    const sim = new SimCore(street([ride({ intensity: 6 })]), [{ tx: 0, ty: 5 }], { arrivalRate: 0, maxGuests: 30 });
    sim.spawnScattered(25);
    keep(sim);
    run(sim, 120);
    expect(sim.stats().buildings[0]!.reliability).toBeLessThan(100);
  });
});

describe('park rating', () => {
  const calm = { guests: 100, happiness: 200, rides: 4, rideKinds: 4, dirtyTiles: 0, brokenRides: 0, unhappyLeavers: 0 };

  it('rewards happy guests and plenty of rides', () => {
    expect(targetRating(calm)).toBeGreaterThan(60);
    expect(targetRating({ ...calm, rides: 0, rideKinds: 0 })).toBeLessThan(targetRating(calm) - 20);
  });

  it('punishes litter, breakdowns and unhappy departures', () => {
    expect(targetRating({ ...calm, dirtyTiles: 30 })).toBeLessThan(targetRating(calm) - 15);
    expect(targetRating({ ...calm, brokenRides: 2 })).toBe(targetRating(calm) - 10);
    expect(targetRating({ ...calm, unhappyLeavers: 20 })).toBeLessThan(targetRating(calm));
  });

  it('stays between 0 and 100 and scales demand', () => {
    expect(targetRating({ ...calm, happiness: 0, rides: 0, dirtyTiles: 100, brokenRides: 9, unhappyLeavers: 99 })).toBe(0);
    expect(targetRating({ ...calm, happiness: 255, rides: 20, rideKinds: 9 })).toBeLessThanOrEqual(100);
    expect(demandFactor(60)).toBeCloseTo(1);
    expect(demandFactor(20)).toBeLessThan(demandFactor(80));
  });

  it('a well-run park attracts more guests than a dirty one', () => {
    const make = () => new SimCore(street([ride()]), [{ tx: 0, ty: 5 }], { arrivalRate: 5, maxGuests: 400, useRating: true });
    const clean = make();
    const dirty = make();
    for (let x = 0; x < 30; x++) dirty.vomit[5 * 30 + x] = 5;
    run(clean, 60);
    run(dirty, 60);
    expect(clean.stats().rating).toBeGreaterThan(dirty.stats().rating);
    expect(clean.guests.count).toBeGreaterThan(dirty.guests.count);
  });
});

describe('guest info window', () => {
  it('picks the guest on a clicked tile and follows them until they leave', () => {
    const sim = new SimCore(street([]), [{ tx: 0, ty: 5 }], { arrivalRate: 0, maxGuests: 10 });
    sim.spawnScattered(1);
    const g = sim.guests;
    const tile = { tx: g.toX[0] as number, ty: g.toY[0] as number };
    expect(sim.inspectAt({ tx: 3, ty: 0 })).toBe(false);
    expect(sim.inspectAt(tile)).toBe(true);
    const d = sim.stats().guest!;
    expect(d.id).toBe(g.id[0]);
    expect(d.state).toBe('wandering');
    expect(d.cash).toBeGreaterThan(0);
    g.remove(0);
    expect(sim.stats().guest).toBeNull();
  });
});
