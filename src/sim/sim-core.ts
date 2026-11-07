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
import { demandFactor, ratingParts, targetRating, type RatingParts } from './rating';
import { StaffKind, StaffState, StaffStore } from './staff';
import { Thought, ThoughtLog, type ThoughtEntry } from './thoughts';

/** Path items, matching PathItem in core/terrain. */
const BIN = 1;
const BENCH = 2;
/** Pieces of litter a bin holds before it overflows. */
export const BIN_CAPACITY = 40;
/** Litter plus three times the sick on a tile above this makes it "dirty". */
const DIRTY = 2;

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
  /** Ride type id, for counting ride variety. */
  type?: string;
}

export interface SimWorld extends PathGrid {
  readonly corners: Uint8Array;
  /** Path items per tile (bins and benches). */
  readonly items?: Uint8Array;
  readonly buildings?: readonly SimBuilding[];
}

export interface SimConfig {
  /** Guests arriving per second while below the cap. */
  arrivalRate: number;
  /** Most guests allowed in the park at once. */
  maxGuests: number;
  /** Scale arrivals and the guest cap by the park rating (off for benchmarks). */
  useRating?: boolean;
}

export interface BuildingStats {
  id: number;
  queue: number;
  riders: number;
  /** 0..1 progress through the current ride cycle; 0 while loading. */
  phase: number;
  customers: number;
  revenue: number;
  broken: boolean;
  /** 0..100: worn rides break down more often. */
  reliability: number;
  /** Seconds spent broken down in total. */
  downtime: number;
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
  /** Park rating 0..100 and what makes it up. */
  rating: number;
  ratingParts: RatingParts;
  thoughts: { top: Array<{ thought: Thought; count: number }>; recent: ThoughtEntry[] };
  staff: { handymen: number; mechanics: number; swept: number; repairs: number };
  /** Things that happened since the last stats() call. */
  events: SimEvent[];
  /** The guest picked for the info window, while they're still in the park. */
  guest: GuestDetails | null;
}

export interface GuestDetails {
  id: number;
  state: 'wandering' | 'leaving' | 'heading' | 'queuing' | 'riding';
  /** Ride or stall they are heading to, queuing for or riding. */
  target: number;
  happiness: number;
  energy: number;
  hunger: number;
  thirst: number;
  toilet: number;
  nausea: number;
  cash: number;
  rides: number;
  /** Most intense ride (0..10) they'll go on. */
  maxIntensity: number;
  minutes: number;
  thought: Thought;
  thoughtAbout: number;
  tx: number;
  ty: number;
}

const STATE_NAMES: ReadonlyArray<GuestDetails['state']> = ['wandering', 'leaving', 'heading', 'queuing', 'riding'];

export type SimEvent = { kind: 'breakdown'; id: number } | { kind: 'fixed'; id: number };

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
  reliability: number;
  broken: boolean;
  downtime: number;
  /** Staff id of the mechanic on the way, or 0. */
  mechanic: number;
}

/** Staff walking speed, tiles per second. */
const STAFF_SPEED = 1.4;
/** Handymen head for dirt within this many path tiles; further away they patrol. */
const SWEEP_RANGE = 24;

/** The most a guest happily pays for a ride of this excitement, in dollars. */
export function fairPrice(excitement: number): number {
  return excitement * 0.9 + 1.5;
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
  readonly thoughts = new ThoughtLog();
  readonly staff = new StaffStore();
  /** Litter and sick per tile (0..255). */
  litter: Uint8Array;
  vomit: Uint8Array;
  /** How full each bin is. */
  binFill: Uint8Array;
  /** Distance along paths to the nearest dirty tile or full bin. */
  private dirtMap: Uint16Array;
  rating = 50;
  private unhappyLeavers = 0;
  private events: SimEvent[] = [];
  private swept = 0;
  private repairs = 0;
  /** Guest shown in the info window. */
  private inspectedId = 0;

  constructor(
    world: SimWorld,
    private readonly entrances: ReadonlyArray<{ tx: number; ty: number }>,
    public config: SimConfig,
    capacity = 16384,
  ) {
    this.guests = new GuestStore(capacity);
    this.world = world;
    this.exitMap = buildDistanceMap(world, entrances);
    const tiles = world.width * world.height;
    this.litter = new Uint8Array(tiles);
    this.vomit = new Uint8Array(tiles);
    this.binFill = new Uint8Array(tiles);
    this.dirtMap = new Uint16Array(tiles).fill(UNREACHABLE);
    this.syncBuildings();
  }

  /** Swap in new terrain/path/building data after the player edits the park. */
  setWorld(world: SimWorld): void {
    this.world = world;
    this.exitMap = buildDistanceMap(world, this.entrances);
    this.syncBuildings();
    // Litter only lies on paths; bins that were removed are gone.
    for (let k = 0; k < this.litter.length; k++) {
      if (!world.paths[k]) this.litter[k] = this.vomit[k] = 0;
      if (world.items?.[k] !== BIN) this.binFill[k] = 0;
    }
    this.rebuildDirtMap();
    const st = this.staff;
    for (let i = st.count - 1; i >= 0; i--) {
      if (!isPath(world, st.toX[i] as number, st.toY[i] as number)) this.placeStaff(i);
      const target = st.target[i] as number;
      if (target && !this.buildings.has(target)) {
        st.target[i] = 0;
        st.state[i] = StaffState.Patrolling;
      }
    }
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
    for (let i = 0; i < this.staff.count; i++) this.moveStaff(i);
    if (this.tickCount % TICK_RATE === 0) this.everySecond();
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
        broken: b.broken,
        reliability: Math.round(b.reliability),
        downtime: Math.round(b.downtime),
      });
    }
    const events = this.events;
    this.events = [];
    return {
      guests: this.guests.count,
      arrived: this.arrived,
      left: this.left,
      tick: this.tickCount,
      tickMs: this.tickTimes.length ? total / this.tickTimes.length : 0,
      income,
      averages: this.averages(),
      buildings,
      rating: Math.round(this.rating),
      ratingParts: ratingParts(this.ratingInputs()),
      thoughts: { top: this.thoughts.top(6), recent: this.thoughts.recent.slice() },
      staff: {
        handymen: this.staff.countOf(StaffKind.Handyman),
        mechanics: this.staff.countOf(StaffKind.Mechanic),
        swept: this.swept,
        repairs: this.repairs,
      },
      events,
      guest: this.guestDetails(),
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
    const st = this.staff;
    for (let i = 0; i < st.count && n < max; i++) {
      const fx = (st.fromX[i] as number) + 0.5;
      const fz = (st.fromY[i] as number) + 0.5;
      const dx = (st.toX[i] as number) + 0.5 - fx;
      const dz = (st.toY[i] as number) + 0.5 - fz;
      const p = st.progress[i] as number;
      const x = fx + dx * p + 0.2;
      const z = fz + dz * p - 0.2;
      const working = st.state[i] === StaffState.Working;
      const s = working ? 0 : STAFF_SPEED;
      const o = n * SNAPSHOT_STRIDE;
      out[o] = x;
      out[o + 1] = this.heightAt(x, z);
      out[o + 2] = z;
      out[o + 3] = dx * s;
      out[o + 4] = 0;
      out[o + 5] = dz * s;
      out[o + 6] = dx !== 0 || dz !== 0 ? Math.atan2(dx, dz) : 0;
      // Looks of 256 and up are staff uniforms in the renderer.
      out[o + 7] = 255 + (st.kind[i] as number);
      n++;
    }
    return n;
  }

  // ---- arrivals and departures -------------------------------------------

  private arrive(): void {
    const g = this.guests;
    const factor = this.config.useRating ? demandFactor(this.rating) : 1;
    const cap = Math.round(this.config.maxGuests * factor);
    if (g.count >= cap || this.entrances.length === 0) {
      this.arrivalDebt = 0;
      return;
    }
    this.arrivalDebt += this.config.arrivalRate * factor * TICK_SECONDS;
    while (this.arrivalDebt >= 1 && g.count < cap) {
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
    if (this.buildings.size === 0) {
      mood -= 0.15;
      if (g.random(i) < 0.02) this.think_(i, Thought.Bored);
    }
    mood += this.surroundings(i);
    g.happiness[i] = Math.max(0, Math.min(255, (g.happiness[i] as number) + mood));
    this.needThoughts(i);

    const state = g.state[i];
    if (state === GuestState.Leaving) return;

    const broke = (g.cash[i] as number) < 1;
    const unhappy = (g.happiness[i] as number) < 40;
    if ((g.age[i] as number) > (g.stay[i] as number) || unhappy || (g.energy[i] as number) < 15 || broke) {
      g.state[i] = GuestState.Leaving;
      g.target[i] = 0;
      if (unhappy) this.unhappyLeavers++;
      if (broke) this.think_(i, Thought.OutOfCash);
      return;
    }

    if (state === GuestState.Heading) {
      const b = this.buildings.get(g.target[i] as number);
      if (!b || !b.def.open || b.broken || this.distTo(b, i) === UNREACHABLE) {
        if (b?.broken) this.think_(i, Thought.RideBroken, b.def.id);
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
      if (d.kind !== 'ride' || !d.open || b.broken || d.id === g.lastRide[i] || d.price > (g.cash[i] as number)) continue;
      if (d.intensity > pref + 2.5) {
        if (g.random(i) < 0.03) this.think_(i, Thought.TooIntense, d.id);
        continue;
      }
      if (queasy && d.nausea > 2.5) continue;
      const dist = this.distTo(b, i);
      if (dist === UNREACHABLE) continue;
      // Guests have a feel for what a ride is worth.
      if (d.price > fairPrice(d.excitement) + g.random(i)) {
        if (g.random(i) < 0.15) this.think_(i, Thought.TooExpensive, d.id);
        continue;
      }
      const fit = d.excitement - Math.abs(d.intensity - pref) * 0.6;
      const wait = b.queue / Math.max(d.capacity, 1);
      if (wait > 4) {
        if (g.random(i) < 0.08) this.think_(i, Thought.QueueTooLong, d.id);
        continue;
      }
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
      if (b.def.kind !== kind || !b.def.open || b.broken || b.def.price > (g.cash[i] as number)) continue;
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
    if (!d.open || b.broken || d.price > (g.cash[i] as number)) {
      g.happiness[i] = Math.max(0, (g.happiness[i] as number) - 5);
      if (b.broken) this.think_(i, Thought.RideBroken, d.id);
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
        g.carrying[i] = 8 + g.random(i) * 25; // a wrapper to throw away
        return;
      case 'drink':
        g.carrying[i] = 8 + g.random(i) * 25; // an empty cup
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
      if (b.broken) {
        b.downtime += TICK_SECONDS;
        continue;
      }
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
      if (joy > 25 && g.random(i) < 0.25) this.think_(i, Thought.LovedRide, d.id);
      else if (d.price < fairPrice(d.excitement) * 0.6 && g.random(i) < 0.1) this.think_(i, Thought.GoodValue, d.id);
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
    // Every run wears the ride a little; worn rides break down more often.
    b.reliability = Math.max(0, b.reliability - (0.4 + d.intensity * 0.05));
    if (this.nextSeedFloat() < (100 - b.reliability) / 500) this.breakDown(b);
  }

  /** Rebuild per-building runtime state, keeping counters for buildings that stay. */
  private syncBuildings(): void {
    const next = new Map<number, BuildingRuntime>();
    for (const def of this.world.buildings ?? []) {
      const old = this.buildings.get(def.id);
      const dist = buildDistanceMap(this.world, [{ tx: def.ax, ty: def.ay }]);
      next.set(
        def.id,
        old
          ? { ...old, def, dist }
          : { def, dist, running: false, timer: 0, queue: 0, riders: 0, customers: 0, revenue: 0, reliability: 100, broken: false, downtime: 0, mechanic: 0 },
      );
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

  // ---- guest info window ---------------------------------------------------

  /** Pick the guest nearest the middle of a tile for the info window (or clear it with null). */
  inspectAt(tile: { tx: number; ty: number } | null): boolean {
    this.inspectedId = 0;
    if (!tile) return false;
    const g = this.guests;
    let best = -1;
    let bestD = 0.9;
    for (let i = 0; i < g.count; i++) {
      if (g.state[i] === GuestState.Riding) continue;
      const fx = g.fromX[i] as number, fy = g.fromY[i] as number;
      const p = g.progress[i] as number;
      const x = fx + ((g.toX[i] as number) - fx) * p;
      const y = fy + ((g.toY[i] as number) - fy) * p;
      const d = Math.hypot(x - tile.tx, y - tile.ty);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) return false;
    this.inspectedId = g.id[best] as number;
    return true;
  }

  /** Follow a guest by id in the info window. */
  inspectGuest(id: number): void {
    this.inspectedId = id;
  }

  private guestDetails(): GuestDetails | null {
    if (!this.inspectedId) return null;
    const g = this.guests;
    let i = -1;
    for (let k = 0; k < g.count; k++) if (g.id[k] === this.inspectedId) { i = k; break; }
    if (i < 0) {
      this.inspectedId = 0;
      return null;
    }
    return {
      id: g.id[i] as number,
      state: STATE_NAMES[g.state[i] as number] ?? 'wandering',
      target: g.target[i] as number,
      happiness: g.happiness[i] as number,
      energy: g.energy[i] as number,
      hunger: g.hunger[i] as number,
      thirst: g.thirst[i] as number,
      toilet: g.toilet[i] as number,
      nausea: g.nausea[i] as number,
      cash: g.cash[i] as number,
      rides: g.rides[i] as number,
      maxIntensity: Math.round(((g.intensityPref[i] as number) / 10 + 2.5) * 10) / 10,
      minutes: Math.floor((g.age[i] as number) / 60),
      thought: g.thought[i] as Thought,
      thoughtAbout: g.thoughtAbout[i] as number,
      tx: g.toX[i] as number,
      ty: g.toY[i] as number,
    };
  }

  // ---- thoughts, litter and surroundings -----------------------------------

  /** Record a guest's thought. */
  private think_(i: number, thought: Thought, about = 0): void {
    const g = this.guests;
    // A guest repeating themselves isn't news.
    if (g.thought[i] === thought && g.thoughtAbout[i] === about) return;
    g.thought[i] = thought;
    g.thoughtAbout[i] = about;
    this.thoughts.add({ guest: g.id[i] as number, thought, about, tick: this.tickCount });
  }

  /** Grumbles about unmet needs, now and then. */
  private needThoughts(i: number): void {
    const g = this.guests;
    if (g.random(i) > 0.06) return;
    if ((g.toilet[i] as number) > 200) this.think_(i, Thought.NeedToilet);
    else if ((g.hunger[i] as number) > 190) this.think_(i, Thought.Hungry);
    else if ((g.thirst[i] as number) > 190) this.think_(i, Thought.Thirsty);
    else if ((g.energy[i] as number) < 60) this.think_(i, Thought.Tired);
    else if ((g.happiness[i] as number) > 225 && g.random(i) < 0.3) this.think_(i, Thought.ParkLovely);
  }

  /** Litter, sick, bins and benches where the guest is. Returns a mood change. */
  private surroundings(i: number): number {
    const g = this.guests;
    const w = this.world;
    const tx = g.toX[i] as number;
    const ty = g.toY[i] as number;
    if (!isPath(w, tx, ty)) return 0;
    const k = ty * w.width + tx;
    let mood = 0;

    // Rubbish in hand goes in a nearby bin, or on the floor.
    const carrying = g.carrying[i] as number;
    if (carrying > 0) {
      const bin = this.binNear(tx, ty);
      if (bin >= 0) {
        this.binFill[bin] = (this.binFill[bin] as number) + 1;
        g.carrying[i] = 0;
      } else if (carrying <= 1) {
        this.litter[k] = Math.min(255, (this.litter[k] as number) + 1);
        g.carrying[i] = 0;
      } else {
        g.carrying[i] = carrying - 1;
      }
    }

    // Very queasy guests may be sick.
    if ((g.nausea[i] as number) > 190 && g.random(i) < 0.12) {
      this.vomit[k] = Math.min(255, (this.vomit[k] as number) + 1);
      g.nausea[i] = Math.max(0, (g.nausea[i] as number) - 110);
      mood -= 8;
      this.think_(i, Thought.Sick);
    }

    // Nobody likes a dirty path.
    if (this.dirt(k) > DIRTY) {
      mood -= 1.5;
      if (g.random(i) < 0.1) this.think_(i, Thought.PathDirty);
    }

    // Tired guests rest on benches.
    if (w.items?.[k] === BENCH && (g.energy[i] as number) < 150) {
      g.energy[i] = Math.min(255, (g.energy[i] as number) + 25);
      mood += 1;
      if (g.random(i) < 0.1) this.think_(i, Thought.NiceBench);
    }
    return mood;
  }

  private dirt(k: number): number {
    return (this.litter[k] as number) + (this.vomit[k] as number) * 3;
  }

  /** A bin with room on this tile or next to it, as a tile index, or -1. */
  private binNear(tx: number, ty: number): number {
    const w = this.world;
    const items = w.items;
    if (!items) return -1;
    for (let d = -1; d < 4; d++) {
      const nx = d < 0 ? tx : tx + (DIRS[d] as readonly [number, number])[0];
      const ny = d < 0 ? ty : ty + (DIRS[d] as readonly [number, number])[1];
      if (!isPath(w, nx, ny)) continue;
      const k = ny * w.width + nx;
      if (items[k] === BIN && (this.binFill[k] as number) < BIN_CAPACITY) return k;
    }
    return -1;
  }

  /** Path tiles with litter or sick on them. */
  dirtyTiles(): number {
    let n = 0;
    for (let k = 0; k < this.litter.length; k++) if (this.dirt(k) > DIRTY) n++;
    return n;
  }

  private rebuildDirtMap(): void {
    const w = this.world;
    const targets: Array<{ tx: number; ty: number }> = [];
    for (let k = 0; k < this.litter.length; k++) {
      const full = w.items?.[k] === BIN && (this.binFill[k] as number) >= BIN_CAPACITY * 0.75;
      if (this.dirt(k) > 0 || full) targets.push({ tx: k % w.width, ty: Math.floor(k / w.width) });
    }
    this.dirtMap = buildDistanceMap(w, targets);
  }

  // ---- once a second -------------------------------------------------------

  private everySecond(): void {
    this.thoughts.decay();
    this.unhappyLeavers *= 0.99;
    this.rebuildDirtMap();
    for (let i = 0; i < this.staff.count; i++) this.staffThink(i);
    const target = targetRating(this.ratingInputs());
    this.rating += (target - this.rating) * 0.05;
  }

  private ratingInputs() {
    let rides = 0, broken = 0;
    const kinds = new Set<string>();
    for (const b of this.buildings.values()) {
      if (b.def.kind !== 'ride') continue;
      if (b.broken) broken++;
      if (!b.def.open || b.broken) continue;
      rides++;
      kinds.add(b.def.type ?? String(b.def.id));
    }
    return {
      guests: this.guests.count,
      happiness: this.guests.count ? this.averages().happiness : 0,
      rides,
      rideKinds: kinds.size,
      dirtyTiles: this.dirtyTiles(),
      brokenRides: broken,
      unhappyLeavers: this.unhappyLeavers,
    };
  }

  // ---- breakdowns ----------------------------------------------------------

  private breakDown(b: BuildingRuntime): void {
    b.broken = true;
    this.clearQueue(b, Thought.RideBroken);
    this.events.push({ kind: 'breakdown', id: b.def.id });
  }

  /** Make a ride break down now (tests and debugging). */
  forceBreakdown(id: number): void {
    const b = this.buildings.get(id);
    if (b && !b.broken) this.breakDown(b);
  }

  /** Send everyone queuing for a ride away with their money back. */
  private clearQueue(b: BuildingRuntime, thought?: Thought): void {
    const g = this.guests;
    for (let i = 0; i < g.count; i++) {
      if (g.state[i] !== GuestState.Queuing || g.target[i] !== b.def.id) continue;
      g.cash[i] = (g.cash[i] as number) + b.def.price;
      this.income -= b.def.price;
      b.revenue -= b.def.price;
      g.state[i] = GuestState.Wandering;
      g.target[i] = 0;
      if (thought) {
        this.think_(i, thought, b.def.id);
        g.happiness[i] = Math.max(0, (g.happiness[i] as number) - 6);
      }
    }
    b.queue = 0;
  }

  // ---- staff ---------------------------------------------------------------

  /** Hire or let go staff so there are this many of each. */
  setStaff(handymen: number, mechanics: number): void {
    const st = this.staff;
    for (const [kind, want] of [[StaffKind.Handyman, handymen], [StaffKind.Mechanic, mechanics]] as const) {
      let have = st.countOf(kind);
      for (let i = st.count - 1; i >= 0 && have > want; i--) {
        if (st.kind[i] !== kind) continue;
        this.releaseJob(i);
        st.remove(i);
        have--;
      }
      while (have < want) {
        const e = this.entrances[0];
        if (!e || st.add(kind, e.tx, e.ty) < 0) break;
        have++;
      }
    }
  }

  /** Put a stranded staff member back at the entrance. */
  private placeStaff(i: number): void {
    const st = this.staff;
    const e = this.entrances[0];
    if (!e) return;
    this.releaseJob(i);
    st.fromX[i] = st.toX[i] = e.tx;
    st.fromY[i] = st.toY[i] = e.ty;
    st.progress[i] = 1;
    st.state[i] = StaffState.Patrolling;
  }

  private releaseJob(i: number): void {
    const b = this.buildings.get(this.staff.target[i] as number);
    if (b && b.mechanic === this.staff.id[i]) b.mechanic = 0;
    this.staff.target[i] = 0;
  }

  /** Once a second: mechanics pick a ride to fix or inspect. */
  private staffThink(i: number): void {
    const st = this.staff;
    if (st.kind[i] !== StaffKind.Mechanic || st.state[i] !== StaffState.Patrolling) return;
    const k = (st.toY[i] as number) * this.world.width + (st.toX[i] as number);
    let best: BuildingRuntime | null = null;
    let bestScore = Infinity;
    for (const b of this.buildings.values()) {
      if (b.def.kind !== 'ride' || b.mechanic) continue;
      // Broken rides first, then worn ones that are due an inspection.
      if (!b.broken && b.reliability >= 70) continue;
      const d = b.dist[k] as number;
      if (d === UNREACHABLE) continue;
      const score = d + (b.broken ? 0 : 1000);
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
    if (!best) return;
    best.mechanic = st.id[i] as number;
    st.target[i] = best.def.id;
    st.repair[i] = best.broken ? 1 : 0;
    st.state[i] = StaffState.Heading;
  }

  private moveStaff(i: number): void {
    const st = this.staff;
    if (st.state[i] === StaffState.Working) {
      st.timer[i] = (st.timer[i] as number) - TICK_SECONDS;
      if ((st.timer[i] as number) <= 0) this.finishJob(i);
      return;
    }
    const p = (st.progress[i] as number) + STAFF_SPEED * TICK_SECONDS;
    if (p < 1) {
      st.progress[i] = p;
      return;
    }
    const w = this.world;
    const tx = st.toX[i] as number;
    const ty = st.toY[i] as number;
    const k = ty * w.width + tx;
    st.fromX[i] = tx;
    st.fromY[i] = ty;
    st.progress[i] = 1;

    // Arrived at a tile: start a job here?
    if (st.kind[i] === StaffKind.Handyman) {
      const full = w.items?.[k] === BIN && (this.binFill[k] as number) > 0;
      if (this.dirt(k) > 0 || full) {
        st.state[i] = StaffState.Working;
        st.timer[i] = 1.5;
        return;
      }
    } else if (st.state[i] === StaffState.Heading) {
      const b = this.buildings.get(st.target[i] as number);
      if (!b) {
        st.state[i] = StaffState.Patrolling;
      } else if (b.dist[k] === 0) {
        st.state[i] = StaffState.Working;
        st.timer[i] = st.repair[i] ? 5 : 3;
        return;
      }
    }

    // Choose the next tile.
    let dir = -1;
    if (st.kind[i] === StaffKind.Handyman && (this.dirtMap[k] as number) <= SWEEP_RANGE) {
      dir = this.downhill(this.dirtMap, tx, ty);
    } else if (st.state[i] === StaffState.Heading) {
      const b = this.buildings.get(st.target[i] as number);
      if (b) dir = this.downhill(b.dist, tx, ty);
    }
    if (dir < 0) dir = this.staffWander(i, tx, ty);
    if (dir < 0) return;
    const d = DIRS[dir] as readonly [number, number];
    st.toX[i] = tx + d[0];
    st.toY[i] = ty + d[1];
    st.progress[i] = Math.min(p - 1, 0.99);
  }

  /** A random neighbouring path tile, as a DIRS index, or -1. */
  private staffWander(i: number, tx: number, ty: number): number {
    const st = this.staff;
    const choices: number[] = [];
    for (let d = 0; d < 4; d++) {
      const dir = DIRS[d] as readonly [number, number];
      if (isPath(this.world, tx + dir[0], ty + dir[1])) choices.push(d);
    }
    if (choices.length === 0) return -1;
    return choices[Math.floor(st.random(i) * choices.length)] as number;
  }

  private finishJob(i: number): void {
    const st = this.staff;
    const w = this.world;
    st.state[i] = StaffState.Patrolling;
    if (st.kind[i] === StaffKind.Handyman) {
      const k = (st.toY[i] as number) * w.width + (st.toX[i] as number);
      if (this.dirt(k) > 0) this.swept++;
      this.litter[k] = 0;
      this.vomit[k] = 0;
      this.binFill[k] = 0;
      st.jobs[i] = (st.jobs[i] as number) + 1;
      return;
    }
    const b = this.buildings.get(st.target[i] as number);
    st.target[i] = 0;
    if (!b) return;
    b.mechanic = 0;
    if (b.broken) {
      b.broken = false;
      b.timer = 0;
      b.reliability = Math.min(100, b.reliability + 30);
      this.repairs++;
      this.events.push({ kind: 'fixed', id: b.def.id });
    } else {
      b.reliability = Math.min(100, b.reliability + 20);
    }
    st.jobs[i] = (st.jobs[i] as number) + 1;
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
