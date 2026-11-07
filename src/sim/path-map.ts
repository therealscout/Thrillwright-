/**
 * Distance maps over the footpath grid. A guest heading somewhere just steps
 * to the neighbouring path tile with a smaller distance, so routing costs
 * nothing per guest. Maps are rebuilt only when paths change.
 */

export const UNREACHABLE = 0xffff;

export interface PathGrid {
  readonly width: number;
  readonly height: number;
  /** 1 where a tile has a footpath. */
  readonly paths: Uint8Array;
}

/** Neighbour offsets in order N, E, S, W. */
export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export function isPath(g: PathGrid, tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < g.width && ty < g.height && g.paths[ty * g.width + tx] === 1;
}

/** Breadth-first distances (in tiles) from a set of target tiles, along paths. */
export function buildDistanceMap(g: PathGrid, targets: ReadonlyArray<{ tx: number; ty: number }>): Uint16Array {
  const dist = new Uint16Array(g.width * g.height).fill(UNREACHABLE);
  const queue = new Int32Array(g.width * g.height);
  let head = 0;
  let tail = 0;
  for (const { tx, ty } of targets) {
    if (!isPath(g, tx, ty)) continue;
    const k = ty * g.width + tx;
    if (dist[k] === 0) continue;
    dist[k] = 0;
    queue[tail++] = k;
  }
  while (head < tail) {
    const k = queue[head++] as number;
    const tx = k % g.width;
    const ty = (k - tx) / g.width;
    const d = (dist[k] as number) + 1;
    for (const [dx, dy] of DIRS) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (!isPath(g, nx, ny)) continue;
      const n = ny * g.width + nx;
      if ((dist[n] as number) <= d) continue;
      dist[n] = d;
      queue[tail++] = n;
    }
  }
  return dist;
}
