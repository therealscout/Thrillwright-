import { describe, expect, it } from 'vitest';
import { rideHints } from './BuildingInfo';
import { riderShare, suggestedTicket } from '../core/pricing';
import { SimCore, TICK_RATE, type SimBuilding, type SimWorld } from '../sim/sim-core';

function street(buildings: SimBuilding[], width = 30): SimWorld {
  const height = 10;
  const paths = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) paths[5 * width + x] = 1;
  return { width, height, paths, corners: new Uint8Array((width + 1) * (height + 1)).fill(4), buildings };
}

const ride = (over: Partial<SimBuilding> = {}): SimBuilding => ({
  id: 1, kind: 'ride', ax: 20, ay: 5, price: 5, open: true, excitement: 2, intensity: 2, nausea: 1, capacity: 16, cycle: 20, satisfies: 0, ...over,
});

function run(sim: SimCore, seconds: number) {
  for (let t = 0; t < TICK_RATE * seconds; t++) sim.tick();
}

function crowd(b: SimBuilding): SimCore {
  const sim = new SimCore(street([b]), [{ tx: 0, ty: 5 }], { arrivalRate: 0, maxGuests: 60 });
  sim.spawnScattered(50);
  for (let i = 0; i < sim.guests.count; i++) {
    sim.guests.stay[i] = 10_000;
    sim.guests.cash[i] = 100;
  }
  return sim;
}

describe('why a ride is empty', () => {
  it('suggests a ticket guests will pay', () => {
    expect(suggestedTicket(5.3)).toBe(5.5);
    expect(suggestedTicket(2)).toBe(2.5);
    expect(suggestedTicket(0)).toBe(1);
  });

  it('counts guests who find the ticket too dear, and the fix brings them in', () => {
    const sim = crowd(ride({ price: 8 }));
    run(sim, 30);
    const before = sim.stats().buildings[0];
    expect(before?.refused?.price).toBeGreaterThan(5);
    expect(before?.customers).toBe(0);
    const hints = rideHints(before!, 8, 2);
    expect(hints[0]?.price).toBe(suggestedTicket(2));
  });

  it('counts guests put off by intensity', () => {
    const sim = crowd(ride({ price: 1, excitement: 6, intensity: 11 }));
    run(sim, 30);
    const s = sim.stats().buildings[0]!;
    expect(s.refused?.intense).toBeGreaterThan(5);
    expect(rideHints(s, 1, 6).some((h) => h.text.includes('intense'))).toBe(true);
  });

  it('only counts guests who could have walked there', () => {
    const sim = crowd(ride({ ay: 8, intensity: 11 }));
    run(sim, 30);
    expect(sim.stats().buildings[0]?.refused?.intense).toBe(0);
  });

  it('estimates how many guests are brave enough', () => {
    expect(riderShare(2)).toBe(1);
    expect(riderShare(7)).toBeGreaterThan(0.4);
    expect(riderShare(12)).toBe(0);
    expect(riderShare(9)).toBeLessThan(riderShare(8));
  });

  it('gets riders on a modest ride at the far end of the park', () => {
    const sim = new SimCore(street([ride({ ax: 58, price: 3, excitement: 3, intensity: 5 })], 60), [{ tx: 0, ty: 5 }], { arrivalRate: 0, maxGuests: 60 });
    sim.spawnScattered(50);
    for (let i = 0; i < sim.guests.count; i++) {
      sim.guests.stay[i] = 10_000;
      sim.guests.cash[i] = 100;
    }
    run(sim, 90);
    expect(sim.stats().buildings[0]?.customers).toBeGreaterThan(5);
  });

  it('reports an entrance no path reaches', () => {
    const sim = crowd(ride({ ay: 8 }));
    const s = sim.stats().buildings[0]!;
    expect(s.reachable).toBe(false);
    expect(rideHints(s, 5, 2)[0]?.text).toContain("can't reach");
    expect(crowd(ride()).stats().buildings[0]?.reachable).toBe(true);
  });
});
