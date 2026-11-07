/// <reference lib="webworker" />
/**
 * Simulation worker: owns the SimCore, ticks it at a fixed rate and posts a
 * snapshot of guest positions after every tick. Snapshot buffers are
 * transferred (not copied) and handed back by the main thread for reuse.
 */
import type { FromWorker, ToWorker } from './protocol';
import { SNAPSHOT_STRIDE, SimCore, TICK_SECONDS } from './sim-core';

declare const self: DedicatedWorkerGlobalScope;

let sim: SimCore | null = null;
let paused = false;
let speed = 1;
const spare: ArrayBuffer[] = [];
let last = performance.now();
let debt = 0;
let lastDirt = 0;

function bufferFor(count: number): ArrayBuffer {
  const bytes = Math.max(count, 64) * SNAPSHOT_STRIDE * 4;
  while (spare.length > 0) {
    const b = spare.pop() as ArrayBuffer;
    if (b.byteLength >= bytes) return b;
  }
  // Grow in steps so buffers get reused as the park fills up.
  return new ArrayBuffer(Math.ceil(bytes / 65536) * 65536);
}

function loop(): void {
  const now = performance.now();
  debt += ((now - last) / 1000) * speed;
  last = now;
  if (!sim || paused) {
    debt = 0;
    return;
  }
  // Catch up at most a few ticks if the worker was delayed.
  let ticks = 0;
  while (debt >= TICK_SECONDS && ticks < 3 * speed) {
    sim.tick();
    debt -= TICK_SECONDS;
    ticks++;
  }
  if (debt > TICK_SECONDS * 3 * speed) debt = 0;
  if (ticks === 0) return;

  const buffer = bufferFor(sim.guests.count);
  const count = sim.writeSnapshot(new Float32Array(buffer));
  const msg: FromWorker = { type: 'snapshot', buffer, count, stats: sim.stats() };
  // Litter changes slowly: send it about once a second.
  if (performance.now() - lastDirt > 1000) {
    lastDirt = performance.now();
    msg.dirt = { litter: sim.litter.slice(), vomit: sim.vomit.slice() };
  }
  self.postMessage(msg, [buffer]);
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      sim = new SimCore(msg.world, msg.entrances, msg.config);
      last = performance.now();
      break;
    case 'world':
      sim?.setWorld(msg.world);
      break;
    case 'config':
      if (sim) sim.config = msg.config;
      break;
    case 'spawn':
      sim?.spawnScattered(msg.count);
      break;
    case 'inspect':
      sim?.inspectAt(msg.tile);
      break;
    case 'staff':
      sim?.setStaff(msg.handymen, msg.mechanics);
      break;
    case 'speed':
      speed = Math.max(1, Math.min(4, msg.speed));
      break;
    case 'paused':
      paused = msg.paused;
      break;
    case 'recycle':
      if (spare.length < 4) spare.push(msg.buffer);
      break;
  }
};

setInterval(loop, 1000 * TICK_SECONDS * 0.5);
