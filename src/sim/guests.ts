/**
 * Guest storage: one row per guest across flat typed arrays ("structure of
 * arrays"). Updating thousands of guests is then a tight loop over numbers,
 * with no per-guest objects for the garbage collector to chase.
 *
 * Rows are kept dense: removing a guest moves the last row into its slot.
 * Each guest also has a stable `id` for future inspection windows.
 */

export const GuestState = {
  Wandering: 0,
  Leaving: 1,
} as const;
export type GuestState = (typeof GuestState)[keyof typeof GuestState];

export class GuestStore {
  count = 0;
  private nextId = 1;

  readonly id: Uint32Array;
  readonly state: Uint8Array;
  /** Tile the guest is walking from, and the tile it is walking to. */
  readonly fromX: Int16Array;
  readonly fromY: Int16Array;
  readonly toX: Int16Array;
  readonly toY: Int16Array;
  /** 0..1 progress from `from` to `to`. */
  readonly progress: Float32Array;
  /** Tiles per second. */
  readonly speed: Float32Array;
  /** Sideways offset from the path centre line, so crowds spread out. */
  readonly lane: Float32Array;
  /** Seconds spent in the park, and how long this guest plans to stay. */
  readonly age: Float32Array;
  readonly stay: Float32Array;
  /** Per-guest random number state. */
  readonly rng: Uint32Array;
  /** Appearance: index into the shirt colour palette. */
  readonly look: Uint8Array;

  // Needs (0..255). Simulated in milestone 4; stored now so the layout is final.
  readonly happiness: Uint8Array;
  readonly energy: Uint8Array;
  readonly hunger: Uint8Array;
  readonly thirst: Uint8Array;
  readonly toilet: Uint8Array;
  readonly cash: Uint16Array;

  constructor(readonly capacity: number) {
    this.id = new Uint32Array(capacity);
    this.state = new Uint8Array(capacity);
    this.fromX = new Int16Array(capacity);
    this.fromY = new Int16Array(capacity);
    this.toX = new Int16Array(capacity);
    this.toY = new Int16Array(capacity);
    this.progress = new Float32Array(capacity);
    this.speed = new Float32Array(capacity);
    this.lane = new Float32Array(capacity);
    this.age = new Float32Array(capacity);
    this.stay = new Float32Array(capacity);
    this.rng = new Uint32Array(capacity);
    this.look = new Uint8Array(capacity);
    this.happiness = new Uint8Array(capacity);
    this.energy = new Uint8Array(capacity);
    this.hunger = new Uint8Array(capacity);
    this.thirst = new Uint8Array(capacity);
    this.toilet = new Uint8Array(capacity);
    this.cash = new Uint16Array(capacity);
  }

  get full(): boolean {
    return this.count >= this.capacity;
  }

  /** Add a guest standing on a tile. Returns its row, or -1 when full. */
  add(tx: number, ty: number, seed: number): number {
    if (this.full) return -1;
    const i = this.count++;
    this.id[i] = this.nextId++;
    this.state[i] = GuestState.Wandering;
    this.fromX[i] = tx;
    this.fromY[i] = ty;
    this.toX[i] = tx;
    this.toY[i] = ty;
    this.progress[i] = 1;
    this.rng[i] = seed || 1;
    this.speed[i] = 1.0 + this.random(i) * 0.5;
    this.lane[i] = (this.random(i) - 0.5) * 0.6;
    this.age[i] = 0;
    this.stay[i] = 120 + this.random(i) * 360;
    this.look[i] = Math.floor(this.random(i) * 256);
    this.happiness[i] = 180;
    this.energy[i] = 200 + Math.floor(this.random(i) * 55);
    this.hunger[i] = Math.floor(this.random(i) * 80);
    this.thirst[i] = Math.floor(this.random(i) * 80);
    this.toilet[i] = Math.floor(this.random(i) * 40);
    this.cash[i] = 20 + Math.floor(this.random(i) * 80);
    return i;
  }

  /** Remove row i by moving the last row into it. */
  remove(i: number): void {
    const last = --this.count;
    if (i === last) return;
    for (const arr of this.columns()) arr[i] = arr[last] as number;
  }

  /** Per-guest xorshift random number in [0, 1). */
  random(i: number): number {
    let x = this.rng[i] as number;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rng[i] = x >>> 0;
    return (x >>> 0) / 4294967296;
  }

  private columns() {
    return [
      this.id, this.state, this.fromX, this.fromY, this.toX, this.toY, this.progress, this.speed,
      this.lane, this.age, this.stay, this.rng, this.look, this.happiness, this.energy, this.hunger,
      this.thirst, this.toilet, this.cash,
    ];
  }
}
