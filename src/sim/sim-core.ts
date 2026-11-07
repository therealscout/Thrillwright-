/**
 * The guest simulation. Runs at a fixed 20 ticks per second, usually inside a
 * Web Worker, and has no DOM or Three.js dependencies so it can be unit tested
 * and benchmarked in Node.
 */
import { HEIGHT_STEP } from '../core/grid';
import { GuestState, GuestStore } from './guests';
import { DIRS, UNREACHABLE, buildDistanceMap, isPath, type PathGrid } from './path-map';

export const TICK_RATE = 20;
export const TICK_SECONDS = 1 / TICK_RATE;

/** Floats per guest in a snapshot: x, y, z, vx, vy, vz, heading, look. */
export const SNAPSHOT_STRIDE = 8;

export interface SimWorld extends PathGrid {
  readonly corners: Uint8Array;
}

export interface SimConfig {
  /** Guests arriving per second while below the cap. */
  arrivalRate: number;
  /** Most guests allowed in the park at once. */
  maxGuests: number;
}

export interface SimStats {
  guests: number;
  arrived: number;
  left: number;
  tick: number;
  /** Average time per tick over the last second, in ms. */
  tickMs: number;
}

export class SimCore {
  readonly guests: GuestStore;
  private world: SimWorld;
  private exitMap: Uint16Array;
  private arrivalDebt = 0;
  private seed = 0x9e3779b9;
  private tickCount = 0;
  private arrived = 0;
  private left = 0;
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
  }

  /** Swap in new terrain/path data after the player edits the park. */
  setWorld(world: SimWorld): void {
    this.world = world;
    this.exitMap = buildDistanceMap(world, this.entrances);
    // Guests whose path vanished from under them are removed for now;
    // milestone 6 will make them walk off the grass instead.
    const g = this.guests;
    for (let i = g.count - 1; i >= 0; i--) {
      if (!isPath(world, g.fromX[i] as number, g.fromY[i] as number) && !isPath(world, g.toX[i] as number, g.toY[i] as number)) {
        g.remove(i);
        this.left++;
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
    for (let i = g.count - 1; i >= 0; i--) {
      if (!this.updateGuest(i)) {
        g.remove(i);
        this.left++;
      }
    }
    this.tickTimes.push(performance.now() - start);
    if (this.tickTimes.length > TICK_RATE) this.tickTimes.shift();
  }

  stats(): SimStats {
    const total = this.tickTimes.reduce((a, b) => a + b, 0);
    return {
      guests: this.guests.count,
      arrived: this.arrived,
      left: this.left,
      tick: this.tickCount,
      tickMs: this.tickTimes.length ? total / this.tickTimes.length : 0,
    };
  }

  /** Write every guest's position and velocity into `out` (SNAPSHOT_STRIDE floats each). */
  writeSnapshot(out: Float32Array): number {
    const g = this.guests;
    const n = Math.min(g.count, Math.floor(out.length / SNAPSHOT_STRIDE));
    for (let i = 0; i < n; i++) {
      const fx = (g.fromX[i] as number) + 0.5;
      const fz = (g.fromY[i] as number) + 0.5;
      const dx = (g.toX[i] as number) + 0.5 - fx;
      const dz = (g.toY[i] as number) + 0.5 - fz;
      const p = g.progress[i] as number;
      const lane = g.lane[i] as number;
      // Lane offset perpendicular to the direction of travel.
      const x = fx + dx * p - dz * lane;
      const z = fz + dz * p + dx * lane;
      const y = this.heightAt(x, z);
      const moving = dx !== 0 || dz !== 0;
      const s = moving ? (g.speed[i] as number) : 0;
      const o = i * SNAPSHOT_STRIDE;
      out[o] = x;
      out[o + 1] = y;
      out[o + 2] = z;
      out[o + 3] = dx * s;
      out[o + 4] = moving ? (this.heightAt(x + dx * 0.1, z + dz * 0.1) - y) * 10 * s : 0;
      out[o + 5] = dz * s;
      out[o + 6] = moving ? Math.atan2(dx, dz) : 0;
      out[o + 7] = g.look[i] as number;
    }
    return n;
  }

  // ---- internals ---------------------------------------------------------

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

  /** Advance one guest. Returns false when the guest leaves the park. */
  private updateGuest(i: number): boolean {
    const g = this.guests;
    g.age[i] = (g.age[i] as number) + TICK_SECONDS;
    if (g.state[i] === GuestState.Wandering && (g.age[i] as number) > (g.stay[i] as number)) {
      g.state[i] = GuestState.Leaving;
    }

    let p = (g.progress[i] as number) + (g.speed[i] as number) * TICK_SECONDS;
    if (p < 1) {
      g.progress[i] = p;
      return true;
    }

    // Arrived at the next tile: choose where to go from here.
    const tx = g.toX[i] as number;
    const ty = g.toY[i] as number;
    if (g.state[i] === GuestState.Leaving) {
      const d = this.exitMap[ty * this.world.width + tx] as number;
      if (d === 0) return false; // Reached the entrance: goodbye.
      // Give up on an unreachable exit after a long time (stuck guests).
      if (d === UNREACHABLE && (g.age[i] as number) > (g.stay[i] as number) + 300) return false;
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

  /** Pick a direction index into DIRS, or -1 if there is no path onward. */
  private chooseNext(i: number, tx: number, ty: number): number {
    const g = this.guests;
    const w = this.world;
    const cameX = tx - (g.fromX[i] as number);
    const cameY = ty - (g.fromY[i] as number);

    if (g.state[i] === GuestState.Leaving) {
      const here = this.exitMap[ty * w.width + tx] as number;
      let best = -1;
      let bestD = here;
      for (let d = 0; d < 4; d++) {
        const dir = DIRS[d] as readonly [number, number];
        const nx = tx + dir[0];
        const ny = ty + dir[1];
        if (!isPath(w, nx, ny)) continue;
        const nd = this.exitMap[ny * w.width + nx] as number;
        if (nd < bestD) {
          bestD = nd;
          best = d;
        }
      }
      if (best >= 0) return best;
      // Exit unreachable from here: fall through and wander.
    }

    // Wander: prefer carrying straight on, avoid turning back unless stuck.
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
