/**
 * The guest simulation. Runs at a fixed 20 ticks per second, usually inside a
 * Web Worker, and has no DOM or Three.js dependencies so it can be unit tested
 * and benchmarked in Node.
 *
 * Each guest moves every tick, but "thinks" (updates needs and picks what to
 * do next) only once a second, staggered across ticks so the work is spread
 * evenly.
 */
import { HEIGHT_STEP } from '../core/grid';
import { GuestState, GuestStore } from './guests';
import { DIRS, UNREACHABLE, buildDistanceMap, isPath, type PathGrid } from './path-map';

export const TICK_RATE = 20;
export const TICK_SECONDS = 1 / TICK_RATE;

/** Floats per guest in a snapshot: x, y, z, vx, vy, vz, heading, look. */
export const SNAPSHOT_STRIDE = 8;

/** Seconds a ride waits for a full load before running part-full. */
export const LOAD_WAIT = 8;

/** What the simulation needs to know about a ride or stall. */
export interface SimBuilding {
  id: number;
  kind: 'ride' | 'food' | 'drink' | 'toilet';
  /** Access tile: where guests enter or buy. */
  ax: number;
  ay: number;
  price: number;
  open: boolean;
  excitement: number;
  intensity: number;
  nausea: number;
  capacity: number;
  cycle: number;
  satisfies: number;
}

export interface SimWorld extends PathGrid {
  readonly corners: Uint8Array;
  readonly buildings?: readonly SimBuilding[];
}

export interface SimConfig {
  /** Guests arriving per second while below the cap. */
  arrivalRate: number;
  /** Most guests allowed in the park at once. */
  maxGuests: number;
}

export interface BuildingStats {
  id: number;
  queue: number;
  riders: number;
  /** 0..1 progress through the current ride cycle; 0 while loading. */
  phase: number;
  customers: number;
  revenue: number;
}

export interface GuestAverages {
  happiness: number;
  hunger: number;
  thirst: number;
  toilet: number;
  energy: number;
  nausea: number;
  cash: number;
}

export interface SimStats {
  guests: number;
  arrived: number;
  left: number;
  tick: number;
  /** Average time per tick over the last second, in ms. */
  tickMs: number;
  /** Money taken since the previous stats() call. */
  income: number;
  averages: GuestAverages;
  buildings: BuildingStats[];
}

interface BuildingRuntime {
  def: SimBuilding;
  /** Distance (in path tiles) from every tile to this building's access tile. */
  dist: Uint16Array;
  running: boolean;
  timer: number;
  queue: number;
  riders: number;
  customers: number;
  revenue: number;
}

export const EMPTY_AVERAGES: GuestAverages = { happiness: 0, hunger: 0, thirst: 0, toilet: 0, energy: 0, nausea: 0, cash: 0 };

export class SimCore {
  readonly guests: GuestStore;
  private world: SimWorld;
  private exitMap: Uint16Array;
  private buildings = new Map<number, BuildingRuntime>();
  private arrivalDebt = 0;
  private seed = 0x9e3779b9;
  private tickCount = 0;
  private arrived = 0;
  private left = 0;
  private income = 0;
  private nextTicket = 1;
  private tickTimes: number[] = [];

  constructor(
    world: SimWorld,
    private readonly entrances: ReadonlyArray<{ tx: number; ty: number }>,
    public config: SimConfig,
    capacity = 16384,
  ) {
    this.guests = new GuestStore(capacity);
    this.world = world;
    this.exitMap = buildDistanceMap(world, entrances);
    this.syncBuildings();
  }

  /** Swap in new terrain/path/building data after the player edits the park. */
  setWorld(world: SimWorld): void {
    this.world = world;
    this.exitMap = buildDistanceMap(world, this.entrances);
    this.syncBuildings();
    const g = this.guests;
    for (let i = g.count - 1; i >= 0; i--) {
      // Guests whose ride or stall vanished go back to wandering.
      const target = g.target[i] as number;
      if (target && !this.buildings.has(target)) {
        g.target[i] = 0;
        if (g.state[i] !== GuestState.Leaving) g.state[i] = GuestState.Wandering;
      }
      if (g.state[i] === GuestState.Riding || g.state[i] === GuestState.Queuing) continue;
      // Guests whose path vanished from under them are removed for now;
      // milestone 6 will make them walk off the grass instead.
      if (!isPath(world, g.fromX[i] as number, g.fromY[i] as number) && !isPath(world, g.toX[i] as number, g.toY[i] as number)) {
        this.removeGuest(i);
      }
    }
  }

  /** Spawn guests immediately (stress testing), spread across the path network. */
  spawnScattered(n: number): number {
    const tiles: number[] = [];
    const w = this.world;
    for (let k = 0; k < w.paths.length; k++) if (w.paths[k] && (this.exitMap[k] as number) !== UNREACHABLE) tiles.push(k);
    if (tiles.length === 0) return 0;
    let added = 0;
    for (let n2 = 0; n2 < n && !this.guests.full; n2++) {
      const k = tiles[Math.floor(this.nextSeedFloat() * tiles.length)] as number;
      const i = this.guests.add(k % w.width, Math.floor(k / w.width), this.nextSeed());
      this.guests.age[i] = this.nextSeedFloat() * 60;
      added++;
    }
    this.arrived += added;
    return added;
  }

  tick(): void {
    const start = performance.now();
    this.tickCount++;
    this.arrive();
    const g = this.guests;
    const slot = this.tickCount % TICK_RATE;
    for (let i = g.count - 1; i >= 0; i--) {
      const state = g.state[i];
      if (state === GuestState.Riding || state === GuestState.Queuing) {
        g.age[i] = (g.age[i] as number) + TICK_SECONDS;
        continue;
      }
      if (((g.id[i] as number) % TICK_RATE) === slot) this.think(i);
      if (!this.move(i)) this.removeGuest(i);
    }
    this.runRides();
    this.tickTimes.push(performance.now() - start);
    if (this.tickTimes.length > TICK_RATE) this.tickTimes.shift();
  }

  stats(): SimStats {
    const total = this.tickTimes.reduce((a, b) => a + b, 0);
    const income = this.income;
    this.income = 0;
    const buildings: BuildingStats[] = [];
    for (const b of this.buildings.values()) {
      buildings.push({
        id: b.def.id,
        queue: b.queue,
        riders: b.riders,
        phase: b.running ? Math.min(b.timer / b.def.cycle, 1) : 0,
        customers: b.customers,
        revenue: b.revenue,
      });
    }
    return {
      guests: this.guests.count,
      arrived: this.arrived,
      left: this.left,
      tick: this.tickCount,
      tickMs: this.tickTimes.length ? total / this.tickTimes.length : 0,
      income,
      averages: this.averages(),
      buildings,
    };
  }

  /**
   * Write visible guests' positions and velocities into `out`
   * (SNAPSHOT_STRIDE floats each). Guests on a ride are hidden.
   */
  writeSnapshot(out: Float32Array): number {
    const g = this.guests;
    const max = Math.floor(out.length / SNAPSHOT_STRIDE);
    let n = 0;
    for (let i = 0; i < g.count && n < max; i++) {
      if (g.state[i] === GuestState.Riding) continue;
      const fx = (g.fromX[i] as number) + 0.5;
      const fz = (g.fromY[i] as number) + 0.5;
      const dx = (g.toX[i] as number) + 0.5 - fx;
      const dz = (g.toY[i] as number) + 0.5 - fz;
      const p = g.progress[i] as number;
      let lane = g.lane[i] as number;
      let along = 0;
      if (g.state[i] === GuestState.Queuing) {
        // Cluster waiting guests around the entrance.
        const t = (g.ticket[i] as number) % 9;
        lane = ((t % 3) - 1) * 0.25;
        along = (Math.floor(t / 3) - 1) * 0.25;
      }
      // Lane offset perpendicular to the direction of travel.
      const x = fx + dx * p - dz * lane + (dx === 0 && dz === 0 ? lane : 0);
      const z = fz + dz * p + dx * lane + along;
      const y = this.heightAt(x, z);
      const moving = (dx !== 0 || dz !== 0) && g.state[i] !== GuestState.Queuing;
      const s = moving ? (g.speed[i] as number) : 0;
      const o = n * SNAPSHOT_STRIDE;
      out[o] = x;
      out[o + 1] = y;
      out[o + 2] = z;
      out[o + 3] = dx * s;
      out[o + 4] = moving ? (this.heightAt(x + dx * 0.1, z + dz * 0.1) - y) * 10 * s : 0;
      out[o + 5] = dz * s;
      out[o + 6] = dx !== 0 || dz !== 0 ? Math.atan2(dx, dz) : 0;
      out[o + 7] = g.look[i] as number;
      n++;
    }
    return n;
  }

  // ---- arrivals and departures -------------------------------------------

  private arrive(): void {
    const g = this.guests;
    if (g.count >= this.config.maxGuests || this.entrances.length === 0) {
      this.arrivalDebt = 0;
      return;
    }
    this.arrivalDebt += this.config.arrivalRate * TICK_SECONDS;
    while (this.arrivalDebt >= 1 && g.count < this.config.maxGuests) {
      this.arrivalDebt -= 1;
      const e = this.entrances[Math.floor(this.nextSeedFloat() * this.entrances.length)];
      if (!e || !isPath(this.world, e.tx, e.ty)) return;
      if (g.add(e.tx, e.ty, this.nextSeed()) >= 0) this.arrived++;
    }
  }

  private removeGuest(i: number): void {
    this.guests.remove(i);
    this.left++;
  }

  // ---- thinking ------------------------------------------------------------

  /** Once a second: update needs and mood, and decide what to do next. */
  private think(i: number): void {
    const g = this.guests;
    g.hunger[i] = Math.min(255, (g.hunger[i] as number) + 0.6);
    g.thirst[i] = Math.min(255, (g.thirst[i] as number) + 0.8);
    g.toilet[i] = Math.min(255, (g.toilet[i] as number) + 0.4);
    g.energy[i] = Math.max(0, (g.energy[i] as number) - 0.25);
    g.nausea[i] = Math.max(0, (g.nausea[i] as number) - 2);

    let mood = 0;
    if ((g.hunger[i] as number) > 200) mood -= 1.5;
    if ((g.thirst[i] as number) > 200) mood -= 1.5;
    if ((g.toilet[i] as number) > 210) mood -= 2;
    if ((g.nausea[i] as number) > 150) mood -= 2;
    if ((g.energy[i] as number) < 50) mood -= 1;
    // With nothing to do, boredom sets in slowly.
    if (this.buildings.size === 0) mood -= 0.15;
    g.happiness[i] = Math.max(0, Math.min(255, (g.happiness[i] as number) + mood));

    const state = g.state[i];
    if (state === GuestState.Leaving) return;

    if (
      (g.age[i] as number) > (g.stay[i] as number) ||
      (g.happiness[i] as number) < 40 ||
      (g.energy[i] as number) < 15 ||
      (g.cash[i] as number) < 1
    ) {
      g.state[i] = GuestState.Leaving;
      g.target[i] = 0;
      return;
    }

    if (state === GuestState.Heading) {
      const b = this.buildings.get(g.target[i] as number);
      if (!b || !b.def.open || this.distTo(b, i) === UNREACHABLE) {
        g.target[i] = 0;
        g.state[i] = GuestState.Wandering;
        g.happiness[i] = Math.max(0, (g.happiness[i] as number) - 4);
      }
      return;
    }

    const goal = this.chooseGoal(i);
    if (goal) {
      g.target[i] = goal;
      g.state[i] = GuestState.Heading;
    }
  }

  /** Pick a building to visit, or 0 to keep wandering. */
  private chooseGoal(i: number): number {
    const g = this.guests;
    if ((g.toilet[i] as number) > 170) {
      const b = this.nearest(i, 'toilet');
      if (b) return b;
    }
    if ((g.hunger[i] as number) > 150) {
      const b = this.nearest(i, 'food');
      if (b) return b;
    }
    if ((g.thirst[i] as number) > 150) {
      const b = this.nearest(i, 'drink');
      if (b) return b;
    }
    // Look for a ride now and then, not every second.
    if (g.random(i) > 0.3) return 0;
    const pref = (g.intensityPref[i] as number) / 10;
    const queasy = (g.nausea[i] as number) > 100 + (g.nauseaTolerance[i] as number) * 0.3;
    let best = 0;
    let bestScore = 0.5;
    for (const b of this.buildings.values()) {
      const d = b.def;
      if (d.kind !== 'ride' || !d.open || d.id === g.lastRide[i] || d.price > (g.cash[i] as number)) continue;
      if (d.intensity > pref + 2.5) continue; // "Too intense for me"
      if (queasy && d.nausea > 2.5) continue;
      const dist = this.distTo(b, i);
      if (dist === UNREACHABLE) continue;
      const fit = d.excitement - Math.abs(d.intensity - pref) * 0.6;
      const wait = b.queue / Math.max(d.capacity, 1);
      const score = fit - dist / 40 - wait * 0.4 - d.price * 0.15 + g.random(i) * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = d.id;
      }
    }
    return best;
  }

  private nearest(i: number, kind: SimBuilding['kind']): number {
    const g = this.guests;
    let best = 0;
    let bestDist = UNREACHABLE;
    for (const b of this.buildings.values()) {
      if (b.def.kind !== kind || !b.def.open || b.def.price > (g.cash[i] as number)) continue;
      const d = this.distTo(b, i);
      if (d < bestDist) {
        bestDist = d;
        best = b.def.id;
      }
    }
    return best;
  }

  private distTo(b: BuildingRuntime, i: number): number {
    const g = this.guests;
    return b.dist[(g.toY[i] as number) * this.world.width + (g.toX[i] as number)] as number;
  }

  // ---- moving --------------------------------------------------------------

  /** Advance one guest along the paths. Returns false when the guest leaves the park. */
  private move(i: number): boolean {
    const g = this.guests;
    g.age[i] = (g.age[i] as number) + TICK_SECONDS;

    let p = (g.progress[i] as number) + (g.speed[i] as number) * TICK_SECONDS;
    if (p < 1) {
      g.progress[i] = p;
      return true;
    }

    // Arrived at the next tile: act, or choose where to go from here.
    const tx = g.toX[i] as number;
    const ty = g.toY[i] as number;
    const k = ty * this.world.width + tx;
    if (g.state[i] === GuestState.Leaving) {
      const d = this.exitMap[k] as number;
      if (d === 0) return false; // Reached the entrance: goodbye.
      // Give up on an unreachable exit after a long time (stuck guests).
      if (d === UNREACHABLE && (g.age[i] as number) > (g.stay[i] as number) + 300) return false;
    } else if (g.state[i] === GuestState.Heading) {
      const b = this.buildings.get(g.target[i] as number);
      if (b && b.dist[k] === 0) {
        g.fromX[i] = tx;
        g.fromY[i] = ty;
        g.progress[i] = 1;
        this.visit(i, b);
        if ((g.state[i] as number) === GuestState.Queuing) return true;
      }
    }

    const next = this.chooseNext(i, tx, ty);
    p -= 1;
    if (next < 0) {
      // Nowhere to go (isolated tile): stand still.
      g.fromX[i] = tx;
      g.fromY[i] = ty;
      g.progress[i] = 1;
      return isPath(this.world, tx, ty);
    }
    const dir = DIRS[next] as readonly [number, number];
    g.fromX[i] = tx;
    g.fromY[i] = ty;
    g.toX[i] = tx + dir[0];
    g.toY[i] = ty + dir[1];
    g.progress[i] = Math.min(p, 0.99);
    return true;
  }

  /** Follow a distance map downhill. Returns a DIRS index or -1. */
  private downhill(map: Uint16Array, tx: number, ty: number): number {
    const w = this.world;
    let best = -1;
    let bestD = map[ty * w.width + tx] as number;
    for (let d = 0; d < 4; d++) {
      const dir = DIRS[d] as readonly [number, number];
      const nx = tx + dir[0];
      const ny = ty + dir[1];
      if (!isPath(w, nx, ny)) continue;
      const nd = map[ny * w.width + nx] as number;
      if (nd < bestD) {
        bestD = nd;
        best = d;
      }
    }
    return best;
  }

  /** Pick a direction index into DIRS, or -1 if there is no path onward. */
  private chooseNext(i: number, tx: number, ty: number): number {
    const g = this.guests;
    const w = this.world;

    if (g.state[i] === GuestState.Leaving) {
      const d = this.downhill(this.exitMap, tx, ty);
      if (d >= 0) return d;
    } else if (g.state[i] === GuestState.Heading) {
      const b = this.buildings.get(g.target[i] as number);
      if (b) {
        const d = this.downhill(b.dist, tx, ty);
        if (d >= 0) return d;
      }
    }

    // Wander: prefer carrying straight on, avoid turning back unless stuck.
    const cameX = tx - (g.fromX[i] as number);
    const cameY = ty - (g.fromY[i] as number);
    let options = 0;
    let straight = -1;
    let back = -1;
    const choices: number[] = [];
    for (let d = 0; d < 4; d++) {
      const dir = DIRS[d] as readonly [number, number];
      if (!isPath(w, tx + dir[0], ty + dir[1])) continue;
      if (dir[0] === -cameX && dir[1] === -cameY && (cameX !== 0 || cameY !== 0)) {
        back = d;
        continue;
      }
      if (dir[0] === cameX && dir[1] === cameY) straight = d;
      choices.push(d);
      options++;
    }
    if (options === 0) return back;
    if (straight >= 0 && g.random(i) < 0.6) return straight;
    return choices[Math.floor(g.random(i) * options)] as number;
  }

  // ---- rides and stalls ----------------------------------------------------

  /** A guest has reached a building's access tile. */
  private visit(i: number, b: BuildingRuntime): void {
    const g = this.guests;
    const d = b.def;
    g.target[i] = 0;
    g.state[i] = GuestState.Wandering;
    if (!d.open || d.price > (g.cash[i] as number)) {
      g.happiness[i] = Math.max(0, (g.happiness[i] as number) - 5);
      return;
    }
    this.charge(i, b);
    switch (d.kind) {
      case 'ride':
        g.state[i] = GuestState.Queuing;
        g.target[i] = d.id;
        g.ticket[i] = this.nextTicket++;
        b.queue++;
        return;
      case 'food':
        g.hunger[i] = Math.max(0, (g.hunger[i] as number) - d.satisfies);
        g.happiness[i] = Math.min(255, (g.happiness[i] as number) + 8);
        return;
      case 'drink':
        g.thirst[i] = Math.max(0, (g.thirst[i] as number) - d.satisfies);
        g.toilet[i] = Math.min(255, (g.toilet[i] as number) + 30);
        g.happiness[i] = Math.min(255, (g.happiness[i] as number) + 6);
        return;
      case 'toilet':
        g.toilet[i] = 0;
        g.happiness[i] = Math.min(255, (g.happiness[i] as number) + 6);
        return;
    }
  }

  private charge(i: number, b: BuildingRuntime): void {
    const price = b.def.price;
    this.guests.cash[i] = (this.guests.cash[i] as number) - price;
    this.income += price;
    b.revenue += price;
    b.customers++;
  }

  /** Load, run and unload every ride. */
  private runRides(): void {
    for (const b of this.buildings.values()) {
      if (b.def.kind !== 'ride') continue;
      // While idle, the load timer only starts once someone is waiting.
      b.timer = !b.running && b.queue === 0 ? 0 : b.timer + TICK_SECONDS;
      if (b.running) {
        if (b.timer >= b.def.cycle) this.unload(b);
      } else if (b.queue >= b.def.capacity || (b.queue > 0 && b.timer >= LOAD_WAIT)) {
        this.load(b);
      }
    }
  }

  private load(b: BuildingRuntime): void {
    const g = this.guests;
    const id = b.def.id;
    // First come, first served: take the lowest tickets.
    const waiting: number[] = [];
    for (let i = 0; i < g.count; i++) if (g.state[i] === GuestState.Queuing && g.target[i] === id) waiting.push(i);
    waiting.sort((a, c) => (g.ticket[a] as number) - (g.ticket[c] as number));
    const boarding = waiting.slice(0, b.def.capacity);
    for (const i of boarding) g.state[i] = GuestState.Riding;
    b.queue -= boarding.length;
    b.riders = boarding.length;
    b.running = true;
    b.timer = 0;
  }

  private unload(b: BuildingRuntime): void {
    const g = this.guests;
    const d = b.def;
    for (let i = 0; i < g.count; i++) {
      if (g.state[i] !== GuestState.Riding || g.target[i] !== d.id) continue;
      const pref = (g.intensityPref[i] as number) / 10;
      const joy = d.excitement * 7 - Math.max(0, d.intensity - pref) * 6;
      g.happiness[i] = Math.max(0, Math.min(255, (g.happiness[i] as number) + joy));
      const queasy = d.nausea * 18 * (1 - (g.nauseaTolerance[i] as number) / 400);
      g.nausea[i] = Math.min(255, (g.nausea[i] as number) + queasy);
      g.energy[i] = Math.max(0, (g.energy[i] as number) - 3);
      g.state[i] = GuestState.Wandering;
      g.target[i] = 0;
      g.lastRide[i] = d.id;
      g.rides[i] = (g.rides[i] as number) + 1;
    }
    b.riders = 0;
    b.running = false;
    b.timer = 0;
  }

  /** Rebuild per-building runtime state, keeping counters for buildings that stay. */
  private syncBuildings(): void {
    const next = new Map<number, BuildingRuntime>();
    for (const def of this.world.buildings ?? []) {
      const old = this.buildings.get(def.id);
      const dist = buildDistanceMap(this.world, [{ tx: def.ax, ty: def.ay }]);
      next.set(def.id, old ? { ...old, def, dist } : { def, dist, running: false, timer: 0, queue: 0, riders: 0, customers: 0, revenue: 0 });
    }
    this.buildings = next;
    // Guests already queuing for a ride that is now closed get a refund and leave the queue.
    const g = this.guests;
    for (let i = 0; i < g.count; i++) {
      if (g.state[i] !== GuestState.Queuing) continue;
      const b = this.buildings.get(g.target[i] as number);
      if (b && b.def.open) continue;
      if (b) {
        b.queue--;
        g.cash[i] = (g.cash[i] as number) + b.def.price;
        this.income -= b.def.price;
        b.revenue -= b.def.price;
      }
      g.state[i] = GuestState.Wandering;
      g.target[i] = 0;
    }
  }

  private averages(): GuestAverages {
    const g = this.guests;
    const n = g.count;
    if (n === 0) return EMPTY_AVERAGES;
    let happiness = 0, hunger = 0, thirst = 0, toilet = 0, energy = 0, nausea = 0, cash = 0;
    for (let i = 0; i < n; i++) {
      happiness += g.happiness[i] as number;
      hunger += g.hunger[i] as number;
      thirst += g.thirst[i] as number;
      toilet += g.toilet[i] as number;
      energy += g.energy[i] as number;
      nausea += g.nausea[i] as number;
      cash += g.cash[i] as number;
    }
    return {
      happiness: happiness / n,
      hunger: hunger / n,
      thirst: thirst / n,
      toilet: toilet / n,
      energy: energy / n,
      nausea: nausea / n,
      cash: cash / n,
    };
  }

  /** Ground height at a world position, interpolated between tile corners. */
  private heightAt(x: number, z: number): number {
    const w = this.world;
    const tx = Math.min(Math.max(Math.floor(x), 0), w.width - 1);
    const ty = Math.min(Math.max(Math.floor(z), 0), w.height - 1);
    const u = x - tx;
    const v = z - ty;
    const stride = w.width + 1;
    const c = w.corners;
    const nw = c[ty * stride + tx] as number;
    const ne = c[ty * stride + tx + 1] as number;
    const sw = c[(ty + 1) * stride + tx] as number;
    const se = c[(ty + 1) * stride + tx + 1] as number;
    const n = nw + (ne - nw) * u;
    const s = sw + (se - sw) * u;
    // Paths sit slightly above the ground.
    return (n + (s - n) * v) * HEIGHT_STEP + 0.045;
  }

  private nextSeed(): number {
    let x = this.seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed;
  }

  private nextSeedFloat(): number {
    return this.nextSeed() / 4294967296;
  }
}
