/**
 * Main-thread side of the simulation: starts the worker, keeps it in sync
 * with park edits, and holds the latest guest snapshot for the renderer.
 */
import { tileIndex } from '../core/terrain';
import type { Park } from '../game/park';
import type { FromWorker, ToWorker, WorldData } from './protocol';
import type { SimConfig, SimStats } from './sim-core';

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
  private lastStats: SimStats = { guests: 0, arrived: 0, left: 0, tick: 0, tickMs: 0 };
  private readonly listeners = new Set<(s: SimStats) => void>();
  private lastEmit = 0;

  constructor(private readonly park: Park, entrances: Array<{ tx: number; ty: number }>, config: SimConfig) {
    this.config = config;
    this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module', name: 'simulation' });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.receive(e.data);
    this.syncedVersion = park.version;
    this.send({ type: 'init', world: this.worldData(), entrances, config });
    park.onChange(() => this.syncWorld());
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

  setPaused(paused: boolean): void {
    this.send({ type: 'paused', paused });
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
    return { width: t.width, height: t.height, corners: t.corners.slice(), paths };
  }

  private receive(msg: FromWorker): void {
    if (msg.type !== 'snapshot') return;
    const previous = this.current;
    this.current = { data: new Float32Array(msg.buffer), count: msg.count, receivedAt: performance.now() };
    if (previous) this.send({ type: 'recycle', buffer: previous.data.buffer as ArrayBuffer }, [previous.data.buffer as ArrayBuffer]);
    this.lastStats = msg.stats;
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
