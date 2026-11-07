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
  /** Walking to a ride or stall (see `target`). */
  Heading: 2,
  /** Paid and waiting at a ride's entrance. */
  Queuing: 3,
  /** On a ride; hidden from view until the cycle ends. */
  Riding: 4,
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

  // Needs and mood, 0..255. Hunger, thirst and toilet grow; energy drains.
  readonly happiness: Float32Array;
  readonly energy: Float32Array;
  readonly hunger: Float32Array;
  readonly thirst: Float32Array;
  readonly toilet: Float32Array;
  readonly nausea: Float32Array;
  /** Dollars in pocket. */
  readonly cash: Float32Array;

  // Tastes, fixed on arrival.
  /** Favourite ride intensity, in tenths (0..100 = 0.0..10.0). */
  readonly intensityPref: Uint8Array;
  /** How well the guest copes with nausea, 0..255. */
  readonly nauseaTolerance: Uint8Array;

  // Plans.
  /** Building id the guest is heading to, queuing for or riding; 0 for none. */
  readonly target: Uint32Array;
  /** Order of arrival in a queue. */
  readonly ticket: Uint32Array;
  /** Last ride taken, to avoid riding the same thing twice in a row. */
  readonly lastRide: Uint32Array;
  /** Rides taken this visit. */
  readonly rides: Uint16Array;

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
    this.happiness = new Float32Array(capacity);
    this.energy = new Float32Array(capacity);
    this.hunger = new Float32Array(capacity);
    this.thirst = new Float32Array(capacity);
    this.toilet = new Float32Array(capacity);
    this.nausea = new Float32Array(capacity);
    this.cash = new Float32Array(capacity);
    this.intensityPref = new Uint8Array(capacity);
    this.nauseaTolerance = new Uint8Array(capacity);
    this.target = new Uint32Array(capacity);
    this.ticket = new Uint32Array(capacity);
    this.lastRide = new Uint32Array(capacity);
    this.rides = new Uint16Array(capacity);
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
    this.happiness[i] = 170 + this.random(i) * 40;
    this.energy[i] = 200 + this.random(i) * 55;
    this.hunger[i] = this.random(i) * 80;
    this.thirst[i] = this.random(i) * 80;
    this.toilet[i] = this.random(i) * 40;
    this.nausea[i] = 0;
    this.cash[i] = Math.round(25 + this.random(i) * 75);
    // Most guests like gentle-to-moderate rides; a few are thrill-seekers.
    this.intensityPref[i] = Math.round(15 + Math.pow(this.random(i), 1.4) * 70);
    this.nauseaTolerance[i] = Math.floor(this.random(i) * 256);
    this.target[i] = 0;
    this.ticket[i] = 0;
    this.lastRide[i] = 0;
    this.rides[i] = 0;
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
      this.thirst, this.toilet, this.nausea, this.cash, this.intensityPref, this.nauseaTolerance,
      this.target, this.ticket, this.lastRide, this.rides,
    ];
  }
}
