import { describe, expect, it } from 'vitest';
import { GuestState } from './guests';
import { findQueueLine, QUEUE_SPACING, QUEUE_TILE, SimCore, SNAPSHOT_STRIDE, TICK_RATE, type SimBuilding, type SimWorld } from './sim-core';

/** A path along y = 5 (x 0..9), then a queue line x 10..14 to a ride entrance at (14, 5). */
function world(buildings: SimBuilding[]): SimWorld {
  const width = 20, height = 10;
  const paths = new Uint8Array(width * height);
  for (let x = 0; x < 10; x++) paths[5 * width + x] = 1;
  for (let x = 10; x <= 14; x++) paths[5 * width + x] = QUEUE_TILE;
  return { width, height, paths, corners: new Uint8Array((width + 1) * (height + 1)).fill(4), buildings };
}

const ride: SimBuilding = { id: 1, kind: 'ride', ax: 14, ay: 5, price: 1, open: true, excitement: 6, intensity: 3, nausea: 1, capacity: 2, cycle: 60, satisfies: 0 };

describe('queue lines', () => {
  it('finds the line from the entrance to where it meets the path', () => {
    const line = findQueueLine(world([]), 14, 5)!;
    expect(line.tiles.map((t) => t.tx)).toEqual([14, 13, 12, 11, 10]);
    expect(line.join).toEqual({ tx: 9, ty: 5 });
    expect(findQueueLine(world([]), 5, 5)).toBeNull();
  });

  it('keeps wandering guests off the queue and lines riders up along it', () => {
    const sim = new SimCore(world([ride]), [{ tx: 0, ty: 5 }], { arrivalRate: 0, maxGuests: 20 });
    sim.spawnScattered(8);
    const g = sim.guests;
    for (let i = 0; i < g.count; i++) {
      g.stay[i] = 10_000;
      g.cash[i] = 50;
      g.intensityPref[i] = 50;
    }
    for (let t = 0; t < TICK_RATE * 60; t++) {
      sim.tick();
      // Nobody walks on the queue tiles unless they are queuing.
      for (let i = 0; i < g.count; i++) {
        if (g.state[i] === GuestState.Queuing || g.state[i] === GuestState.Riding) continue;
        expect(g.toX[i]).toBeLessThan(10);
      }
    }
    const s = sim.stats().buildings[0]!;
    expect(s.customers).toBeGreaterThan(2);
    // Queuing guests stand on the queue tiles, spaced out, the first by the entrance.
    const out = new Float32Array(64 * SNAPSHOT_STRIDE);
    const n = sim.writeSnapshot(out);
    const xs: number[] = [];
    let q = 0;
    for (let i = 0; i < g.count; i++) if (g.state[i] === GuestState.Queuing) q++;
    for (let k = 0; k < n; k++) {
      const x = out[k * SNAPSHOT_STRIDE] as number;
      const z = out[k * SNAPSHOT_STRIDE + 2] as number;
      if (x > 10 && Math.abs(z - 5.5) < 0.2) xs.push(x);
    }
    expect(q).toBeGreaterThan(1);
    expect(xs.length).toBeGreaterThanOrEqual(q);
    xs.sort((a, b) => b - a);
    expect(xs[0]).toBeCloseTo(14.5, 0);
    expect((xs[0] as number) - (xs[1] as number)).toBeGreaterThan(QUEUE_SPACING * 0.6);
  });
});
