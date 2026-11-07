/** Messages between the main thread and the simulation worker. */
import type { SimConfig, SimStats } from './sim-core';

export interface WorldData {
  width: number;
  height: number;
  corners: Uint8Array;
  paths: Uint8Array;
}

export type ToWorker =
  | { type: 'init'; world: WorldData; entrances: Array<{ tx: number; ty: number }>; config: SimConfig }
  | { type: 'world'; world: WorldData }
  | { type: 'config'; config: SimConfig }
  | { type: 'spawn'; count: number }
  | { type: 'paused'; paused: boolean }
  /** Hand a used snapshot buffer back so the worker can refill it. */
  | { type: 'recycle'; buffer: ArrayBuffer };

export type FromWorker = {
  type: 'snapshot';
  buffer: ArrayBuffer;
  count: number;
  /** performance.now() in the worker when the snapshot was taken. */
  stats: SimStats;
};
