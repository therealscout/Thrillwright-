import { describe, expect, it } from 'vitest';
import { GuestState } from './guests';
import { SNAPSHOT_STRIDE, SimCore, TICK_RATE, type SimWorld } from './sim-core';

/** A square loop of path with a spur down to an entrance at the bottom. */
function loopWorld(size = 20): { world: SimWorld; entrance: { tx: number; ty: number } } {
  const paths = new Uint8Array(size * size);
  const set = (x: number, y: number) => (paths[y * size + x] = 1);
  for (let i = 2; i < size - 4; i++) {
    set(i, 2);
    set(i, size - 5);
    set(2, i);
    set(size - 5, i);
  }
  const ex = Math.floor(size / 2);
  for (let y = size - 5; y < size; y++) set(ex, y);
  return {
    world: { width: size, height: size, paths, corners: new Uint8Array((size + 1) * (size + 1)).fill(4) },
    entrance: { tx: ex, ty: size - 1 },
  };
}

function gridWorld(size: number): { world: SimWorld; entrance: { tx: number; ty: number } } {
  const paths = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (x % 4 === 0 || y % 4 === 0) paths[y * size + x] = 1;
  return {
    world: { width: size, height: size, paths, corners: new Uint8Array((size + 1) * (size + 1)).fill(4) },
    entrance: { tx: 0, ty: size - 1 },
  };
}

describe('SimCore', () => {
  it('spawns guests at the entrance at the arrival rate', () => {
    const { world, entrance } = loopWorld();
    const sim = new SimCore(world, [entrance], { arrivalRate: 4, maxGuests: 100 });
    for (let t = 0; t < TICK_RATE * 5; t++) sim.tick();
    expect(sim.guests.count).toBe(20);
  });

  it('respects the guest cap', () => {
    const { world, entrance } = loopWorld();
    const sim = new SimCore(world, [entrance], { arrivalRate: 100, maxGuests: 30 });
    for (let t = 0; t < TICK_RATE * 5; t++) sim.tick();
    expect(sim.guests.count).toBe(30);
  });

  it('keeps every guest on a path tile', () => {
    const { world, entrance } = loopWorld();
    const sim = new SimCore(world, [entrance], { arrivalRate: 10, maxGuests: 200 });
    const g = sim.guests;
    for (let t = 0; t < TICK_RATE * 30; t++) {
      sim.tick();
      for (let i = 0; i < g.count; i++) {
        expect(world.paths[(g.toY[i] as number) * world.width + (g.toX[i] as number)]).toBe(1);
      }
    }
  });

  it('sends guests home through the entrance when their visit is over', () => {
    const { world, entrance } = loopWorld();
    const sim = new SimCore(world, [entrance], { arrivalRate: 5, maxGuests: 5 });
    for (let t = 0; t < TICK_RATE * 2; t++) sim.tick();
    sim.config = { arrivalRate: 0, maxGuests: 5 };
    for (let i = 0; i < sim.guests.count; i++) sim.guests.stay[i] = 0;
    for (let t = 0; t < TICK_RATE * 120 && sim.guests.count > 0; t++) sim.tick();
    expect(sim.guests.count).toBe(0);
    expect(sim.stats().left).toBe(5);
  });

  it('marks long-staying guests as leaving', () => {
    const { world, entrance } = loopWorld();
    const sim = new SimCore(world, [entrance], { arrivalRate: 1, maxGuests: 1 });
    for (let t = 0; t < TICK_RATE * 2; t++) sim.tick();
    sim.guests.stay[0] = 0;
    sim.tick();
    expect(sim.guests.state[0]).toBe(GuestState.Leaving);
  });

  it('removes guests whose path was deleted', () => {
    const { world, entrance } = loopWorld();
    const sim = new SimCore(world, [entrance], { arrivalRate: 0, maxGuests: 100 });
    sim.spawnScattered(50);
    sim.setWorld({ ...world, paths: new Uint8Array(world.paths.length) });
    expect(sim.guests.count).toBe(0);
  });

  it('writes a snapshot with positions on the map', () => {
    const { world, entrance } = loopWorld();
    const sim = new SimCore(world, [entrance], { arrivalRate: 0, maxGuests: 100 });
    sim.spawnScattered(10);
    sim.tick();
    const out = new Float32Array(10 * SNAPSHOT_STRIDE);
    expect(sim.writeSnapshot(out)).toBe(10);
    for (let i = 0; i < 10; i++) {
      const x = out[i * SNAPSHOT_STRIDE] as number;
      const z = out[i * SNAPSHOT_STRIDE + 2] as number;
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(world.width);
      expect(z).toBeGreaterThan(0);
      expect(z).toBeLessThan(world.height);
    }
  });

  it('simulates 10,000 guests well within the tick budget', () => {
    const { world, entrance } = gridWorld(96);
    const sim = new SimCore(world, [entrance], { arrivalRate: 0, maxGuests: 10_000 });
    expect(sim.spawnScattered(10_000)).toBe(10_000);
    const out = new Float32Array(10_000 * SNAPSHOT_STRIDE);
    for (let t = 0; t < 20; t++) sim.tick(); // warm up the JIT
    const start = performance.now();
    const ticks = 100;
    for (let t = 0; t < ticks; t++) {
      sim.tick();
      sim.writeSnapshot(out);
    }
    const perTick = (performance.now() - start) / ticks;
    // One tick every 50 ms; use under a fifth of it even on slow CI machines.
    expect(perTick).toBeLessThan(10);
    console.log(`10k guests: ${perTick.toFixed(2)} ms per tick + snapshot`);
  });
});
