/**
 * Main-thread side of the simulation: starts the worker, keeps it in sync
 * with park edits, and holds the latest guest snapshot for the renderer.
 */
import { accessTile } from '../core/buildings';
import { buildingType } from '../core/catalog';
import { seatsFor } from '../core/coaster-types';
import { tileIndex } from '../core/terrain';
import type { Park } from '../game/park';
import type { FromWorker, ToWorker, WorldData } from './protocol';
import { EMPTY_AVERAGES, TICK_RATE, type SimConfig, type SimEvent, type SimStats } from './sim-core';
import { ratingParts } from './rating';

export interface GuestSnapshot {
  data: Float32Array;
  count: number;
  /** performance.now() on the main thread when it arrived. */
  receivedAt: number;
}

export class SimClient {
  private readonly worker: Worker;
  private current: GuestSnapshot | null = null;
  private syncedVersion: number;
  private config: SimConfig;
  private lastStats: SimStats = {
    guests: 0, arrived: 0, left: 0, tick: 0, tickMs: 0, income: 0, incomeBy: { rides: 0, stalls: 0, entry: 0 },
    averages: EMPTY_AVERAGES, buildings: [],
    rating: 50,
    ratingParts: ratingParts({ guests: 0, happiness: 0, rides: 0, rideKinds: 0, dirtyTiles: 0, brokenRides: 0, unhappyLeavers: 0 }),
    thoughts: { top: [], recent: [] },
    staff: { handymen: 0, mechanics: 0, swept: 0, repairs: 0 },
    events: [],
    guest: null,
  };
  private readonly eventListeners = new Set<(e: SimEvent) => void>();
  private readonly timeListeners = new Set<(seconds: number) => void>();
  /** Latest litter and sick per tile. */
  dirt: { litter: Uint8Array; vomit: Uint8Array; version: number } | null = null;
  private readonly listeners = new Set<(s: SimStats) => void>();
  private lastEmit = 0;

  constructor(private readonly park: Park, entrances: Array<{ tx: number; ty: number }>, config: SimConfig) {
    this.config = config;
    this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module', name: 'simulation' });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.receive(e.data);
    this.syncedVersion = park.version;
    this.send({ type: 'init', world: this.worldData(), entrances, config });
    park.onChange(() => this.syncWorld());
    park.onStaff(() => this.syncStaff());
    this.syncStaff();
  }

  /** Simulated seconds passing (not called while paused). */
  onTime(listener: (seconds: number) => void): () => void {
    this.timeListeners.add(listener);
    return () => this.timeListeners.delete(listener);
  }

  /** Breakdowns, repairs and other news from the simulation. */
  onEvent(listener: (e: SimEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /** Show the guest nearest this tile in the info window, or close it with null. */
  inspectAt(tile: { tx: number; ty: number } | null): void {
    this.send({ type: 'inspect', tile });
  }

  private syncStaff(): void {
    this.send({ type: 'staff', handymen: this.park.staff.handymen, mechanics: this.park.staff.mechanics });
  }

  get snapshot(): GuestSnapshot | null {
    return this.current;
  }

  get stats(): SimStats {
    return this.lastStats;
  }

  get settings(): SimConfig {
    return this.config;
  }

  onStats(listener: (s: SimStats) => void): () => void {
    this.listeners.add(listener);
    listener(this.lastStats);
    return () => this.listeners.delete(listener);
  }

  setConfig(config: Partial<SimConfig>): void {
    this.config = { ...this.config, ...config };
    this.send({ type: 'config', config: this.config });
  }

  /** Drop guests straight onto the path network (stress test). */
  spawn(count: number): void {
    this.send({ type: 'spawn', count });
  }

  /** Whether the park is paused, and how fast it runs otherwise. */
  paused = false;
  speed = 1;

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.send({ type: 'paused', paused });
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.send({ type: 'speed', speed });
  }

  dispose(): void {
    this.worker.terminate();
  }

  private syncWorld(): void {
    // Path and terrain edits are rare; send the arrays (copied) each time.
    if (this.park.version === this.syncedVersion) return;
    this.syncedVersion = this.park.version;
    this.send({ type: 'world', world: this.worldData() });
  }

  private worldData(): WorldData {
    const t = this.park.terrain;
    // Only tiles with a path that the park owns count as walkable.
    const paths = t.paths.slice();
    for (let ty = 0; ty < t.height; ty++) {
      for (let tx = 0; tx < t.width; tx++) {
        const k = tileIndex(t, tx, ty);
        if (!t.owned[k]) paths[k] = 0;
      }
    }
    const buildings = this.park.buildings.map((b) => {
      const type = buildingType(b.type);
      const a = accessTile(b);
      const r = b.coaster?.ratings;
      if (r) {
        return {
          id: b.id, kind: type.kind, type: b.type, ax: a.tx, ay: a.ty, price: b.price, open: b.open,
          excitement: r.excitement, intensity: r.intensity, nausea: r.nausea,
          // The train's run plus a few seconds to unload in the station.
          capacity: seatsFor(b.coaster?.type), cycle: r.duration + 4, satisfies: 0,
        };
      }
      return {
        id: b.id,
        kind: type.kind,
        type: b.type,
        ax: a.tx,
        ay: a.ty,
        price: b.price,
        open: b.open,
        excitement: type.excitement ?? 0,
        intensity: type.intensity ?? 0,
        nausea: type.nausea ?? 0,
        capacity: type.capacity ?? 0,
        cycle: type.cycle ?? 0,
        satisfies: type.satisfies ?? 0,
      };
    });
    return { width: t.width, height: t.height, corners: t.corners.slice(), paths, items: t.items.slice(), buildings };
  }

  private receive(msg: FromWorker): void {
    if (msg.type !== 'snapshot') return;
    const previous = this.current;
    this.current = { data: new Float32Array(msg.buffer), count: msg.count, receivedAt: performance.now() };
    if (previous) this.send({ type: 'recycle', buffer: previous.data.buffer as ArrayBuffer }, [previous.data.buffer as ArrayBuffer]);
    const ticks = msg.stats.tick - this.lastStats.tick;
    this.lastStats = msg.stats;
    const by = msg.stats.incomeBy;
    this.park.earn(by.rides, 'rides');
    this.park.earn(by.stalls, 'stalls');
    this.park.earn(by.entry, 'entry');
    // Staff are paid for simulated time, so a paused park costs nothing.
    if (ticks > 0 && ticks < TICK_RATE * 20) {
      this.park.payWages(ticks / TICK_RATE);
      for (const l of this.timeListeners) l(ticks / TICK_RATE);
    }
    for (const e of msg.stats.events) for (const l of this.eventListeners) l(e);
    if (msg.dirt) this.dirt = { ...msg.dirt, version: (this.dirt?.version ?? 0) + 1 };
    const now = performance.now();
    if (now - this.lastEmit > 250) {
      this.lastEmit = now;
      for (const l of this.listeners) l(msg.stats);
    }
  }

  private send(msg: ToWorker, transfer: Transferable[] = []): void {
    this.worker.postMessage(msg, transfer);
  }
}
