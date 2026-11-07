import { describe, expect, it } from 'vitest';
import { GuestState } from './guests';
import { SimCore, TICK_RATE, type SimBuilding, type SimWorld } from './sim-core';

/** A straight east-west path along y = 5 with the entrance at its west end. */
function street(buildings: SimBuilding[], width = 30): SimWorld {
  const height = 10;
  const paths = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) paths[5 * width + x] = 1;
  return { width, height, paths, corners: new Uint8Array((width + 1) * (height + 1)).fill(4), buildings };
}

const base = { price: 2, open: true, excitement: 0, intensity: 0, nausea: 0, capacity: 0, cycle: 0, satisfies: 0 };

function ride(over: Partial<SimBuilding> = {}): SimBuilding {
  return { ...base, id: 1, kind: 'ride', ax: 20, ay: 5, excitement: 4, intensity: 2, nausea: 1, capacity: 4, cycle: 10, ...over };
}

function run(sim: SimCore, seconds: number) {
  for (let t = 0; t < TICK_RATE * seconds; t++) sim.tick();
}

describe('guest needs and stalls', () => {
  it('hungry guests walk to food and pay for it', () => {
    const food: SimBuilding = { ...base, id: 7, kind: 'food', ax: 12, ay: 5, price: 3, satisfies: 150 };
    const sim = new SimCore(street([food]), [{ tx: 0, ty: 5 }], { arrivalRate: 0, maxGuests: 10 });
    sim.spawnScattered(5);
    const g = sim.guests;
    for (let i = 0; i < g.count; i++) {
      g.hunger[i] = 220;
      g.stay[i] = 1000;
    }
    run(sim, 40);
    const stats = sim.stats();
    expect(stats.buildings[0]?.customers).toBe(5);
    expect(stats.income).toBe(15);
    for (let i = 0; i < g.count; i++) expect(g.hunger[i]).toBeLessThan(120);
  });

  it('needs grow and happiness falls when they are ignored', () => {
    const sim = new SimCore(street([]), [{ tx: 0, ty: 5 }], { arrivalRate: 0, maxGuests: 10 });
    sim.spawnScattered(1);
    const g = sim.guests;
    g.stay[0] = 10_000;
    g.hunger[0] = 190;
    g.thirst[0] = 190;
    g.happiness[0] = 200;
    run(sim, 60);
    expect(g.hunger[0]).toBeGreaterThan(200);
    expect(g.happiness[0]).toBeLessThan(200);
  });
});

describe('rides', () => {
  it('queues, runs a full cycle and makes riders happier', () => {
    const sim = new SimCore(street([ride()]), [{ tx: 0, ty: 5 }], { arrivalRate: 0, maxGuests: 20 });
    sim.spawnScattered(8);
    const g = sim.guests;
    for (let i = 0; i < g.count; i++) {
      g.stay[i] = 1000;
      g.intensityPref[i] = 30;
      g.happiness[i] = 120;
      g.state[i] = GuestState.Heading;
      g.target[i] = 1;
    }
    run(sim, 60);
    const stats = sim.stats();
    const b = stats.buildings[0]!;
    expect(b.customers).toBe(8);
    expect(b.revenue).toBe(16);
    let rode = 0;
    for (let i = 0; i < g.count; i++) {
      if ((g.rides[i] as number) > 0) {
        rode++;
        expect(g.happiness[i]).toBeGreaterThan(120);
      }
    }
    expect(rode).toBe(8);
  });

  it('timid guests skip rides that are too intense', () => {
    const sim = new SimCore(street([ride({ intensity: 9 })]), [{ tx: 0, ty: 5 }], { arrivalRate: 0, maxGuests: 50 });
    sim.spawnScattered(30);
    const g = sim.guests;
    for (let i = 0; i < g.count; i++) {
      g.stay[i] = 1000;
      g.intensityPref[i] = 20;
    }
    run(sim, 60);
    expect(sim.stats().buildings[0]?.customers).toBe(0);
  });

  it('refunds the queue when a ride closes', () => {
    const world = street([ride({ capacity: 50 })]);
    const sim = new SimCore(world, [{ tx: 0, ty: 5 }], { arrivalRate: 0, maxGuests: 20 });
    sim.spawnScattered(6);
    const g = sim.guests;
    for (let i = 0; i < g.count; i++) {
      g.stay[i] = 1000;
      g.state[i] = GuestState.Heading;
      g.target[i] = 1;
    }
    const queuing = () => Array.from(g.state.subarray(0, g.count)).filter((s) => s === GuestState.Queuing).length;
    const cash = () => Array.from(g.cash.subarray(0, g.count)).reduce((a, b) => a + b, 0);
    for (let t = 0; t < TICK_RATE * 40 && queuing() < 2; t++) sim.tick();
    const waiting = queuing();
    expect(waiting).toBeGreaterThan(0);
    const before = cash();
    sim.setWorld({ ...world, buildings: [ride({ capacity: 50, open: false })] });
    expect(sim.stats().buildings[0]?.queue).toBe(0);
    expect(cash()).toBe(before + waiting * 2);
    for (let i = 0; i < g.count; i++) expect(g.state[i]).not.toBe(GuestState.Queuing);
  });

  it('broke or miserable guests head home', () => {
    const sim = new SimCore(street([]), [{ tx: 0, ty: 5 }], { arrivalRate: 0, maxGuests: 10 });
    sim.spawnScattered(2);
    const g = sim.guests;
    g.stay[0] = g.stay[1] = 1000;
    g.cash[0] = 0;
    g.happiness[1] = 10;
    run(sim, 2);
    expect(g.state[0]).toBe(GuestState.Leaving);
    expect(g.state[1]).toBe(GuestState.Leaving);
  });
});
