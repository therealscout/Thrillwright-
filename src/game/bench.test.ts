import { describe, expect, it } from 'vitest';
import { tileIndex } from '../core/terrain';
import { buildDistanceMap, UNREACHABLE } from '../sim/path-map';
import { layTestGrid } from './bench';
import { createStarterTerrain, starterLayout } from './starter-park';

describe('layTestGrid', () => {
  it('adds a grid of paths connected to the entrance', () => {
    const t = createStarterTerrain();
    expect(layTestGrid(t)).toBeGreaterThan(500);
    const dist = buildDistanceMap(t, [starterLayout().entrance]);
    let reachable = 0;
    let total = 0;
    for (let k = 0; k < t.paths.length; k++) {
      if (!t.paths[k]) continue;
      total++;
      if (dist[k] !== UNREACHABLE) reachable++;
    }
    expect(reachable / total).toBeGreaterThan(0.95);
    expect(t.owned[tileIndex(t, 0, 0)]).toBe(0);
    expect(t.paths[tileIndex(t, 0, 0)]).toBe(0);
  });
});
