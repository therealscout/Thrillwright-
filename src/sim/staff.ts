/**
 * Park staff: handymen sweep paths and empty bins; mechanics fix broken
 * rides and inspect worn ones. Stored like guests, in flat arrays, but there
 * are only ever a few dozen of them.
 */

export const StaffKind = {
  Handyman: 1,
  Mechanic: 2,
} as const;
export type StaffKind = (typeof StaffKind)[keyof typeof StaffKind];

export const StaffState = {
  /** Walking the paths looking for work. */
  Patrolling: 0,
  /** Walking to a job (a dirty tile, or a ride for mechanics). */
  Heading: 1,
  /** Sweeping, emptying a bin, fixing or inspecting. */
  Working: 2,
} as const;
export type StaffState = (typeof StaffState)[keyof typeof StaffState];

export const MAX_STAFF_ROWS = 128;

export class StaffStore {
  count = 0;
  private nextId = 1;
  readonly id = new Uint32Array(MAX_STAFF_ROWS);
  readonly kind = new Uint8Array(MAX_STAFF_ROWS);
  readonly state = new Uint8Array(MAX_STAFF_ROWS);
  readonly fromX = new Int16Array(MAX_STAFF_ROWS);
  readonly fromY = new Int16Array(MAX_STAFF_ROWS);
  readonly toX = new Int16Array(MAX_STAFF_ROWS);
  readonly toY = new Int16Array(MAX_STAFF_ROWS);
  readonly progress = new Float32Array(MAX_STAFF_ROWS);
  /** Ride a mechanic is going to, or 0. */
  readonly target = new Uint32Array(MAX_STAFF_ROWS);
  /** Seconds left on the current job. */
  readonly timer = new Float32Array(MAX_STAFF_ROWS);
  /** True when a mechanic's job is a repair rather than an inspection. */
  readonly repair = new Uint8Array(MAX_STAFF_ROWS);
  readonly rng = new Uint32Array(MAX_STAFF_ROWS);
  /** Jobs done: tiles swept or rides fixed. */
  readonly jobs = new Uint32Array(MAX_STAFF_ROWS);

  add(kind: StaffKind, tx: number, ty: number): number {
    if (this.count >= MAX_STAFF_ROWS) return -1;
    const i = this.count++;
    this.id[i] = this.nextId++;
    this.kind[i] = kind;
    this.state[i] = StaffState.Patrolling;
    this.fromX[i] = this.toX[i] = tx;
    this.fromY[i] = this.toY[i] = ty;
    this.progress[i] = 1;
    this.target[i] = 0;
    this.timer[i] = 0;
    this.repair[i] = 0;
    this.rng[i] = (this.id[i] as number) * 2654435761 || 1;
    this.jobs[i] = 0;
    return i;
  }

  remove(i: number): void {
    const last = --this.count;
    if (i === last) return;
    for (const arr of [this.id, this.kind, this.state, this.fromX, this.fromY, this.toX, this.toY, this.progress, this.target, this.timer, this.repair, this.rng, this.jobs]) {
      arr[i] = arr[last] as number;
    }
  }

  countOf(kind: StaffKind): number {
    let n = 0;
    for (let i = 0; i < this.count; i++) if (this.kind[i] === kind) n++;
    return n;
  }

  random(i: number): number {
    let x = this.rng[i] as number;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rng[i] = x >>> 0;
    return (x >>> 0) / 4294967296;
  }
}
