import { describe, expect, it } from 'vitest';
import { UNREACHABLE, buildDistanceMap, type PathGrid } from './path-map';

function grid(rows: string[]): PathGrid {
  const height = rows.length;
  const width = (rows[0] as string).length;
  const paths = new Uint8Array(width * height);
  rows.forEach((r, y) => [...r].forEach((c, x) => (paths[y * width + x] = c === '#' ? 1 : 0)));
  return { width, height, paths };
}

describe('buildDistanceMap', () => {
  it('counts steps along paths only', () => {
    const g = grid([
      '#####',
      '....#',
      '#####',
    ]);
    const d = buildDistanceMap(g, [{ tx: 0, ty: 0 }]);
    expect(d[0]).toBe(0);
    expect(d[4]).toBe(4);
    expect(d[2 * 5 + 0]).toBe(10); // around the bend
    expect(d[1 * 5 + 0]).toBe(UNREACHABLE); // grass
  });

  it('marks disconnected paths unreachable', () => {
    const g = grid(['##.##']);
    const d = buildDistanceMap(g, [{ tx: 0, ty: 0 }]);
    expect(d[4]).toBe(UNREACHABLE);
  });
});
