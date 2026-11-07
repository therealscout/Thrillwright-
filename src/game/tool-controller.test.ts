import { describe, expect, it } from 'vitest';
import { createTerrain, tileIndex } from '../core/terrain';
import { Park } from './park';
import { ToolController, type BrushView } from './tool-controller';

function setup() {
  const t = createTerrain(12, 12);
  t.owned.fill(1);
  const park = new Park(t, 100_000);
  const brushes: number[] = [];
  const view: BrushView = { setBrush: (tiles) => brushes.push(tiles.length) };
  return { park, tools: new ToolController(park, view), brushes };
}

describe('ToolController', () => {
  it('paints paths along a drag as one undo step', () => {
    const { park, tools } = setup();
    tools.setTool('path');
    tools.pointer('down', { tx: 1, ty: 1 });
    tools.pointer('move', { tx: 2, ty: 1 });
    tools.pointer('move', { tx: 3, ty: 1 });
    tools.pointer('up', { tx: 3, ty: 1 });
    expect([1, 2, 3].every((x) => park.terrain.paths[tileIndex(park.terrain, x, 1)] === 1)).toBe(true);
    tools.undo();
    expect(park.terrain.paths.every((p) => p === 0)).toBe(true);
  });

  it('raises land once per click, not while dragging', () => {
    const { park, tools } = setup();
    tools.setTool('raise');
    const versionBefore = park.version;
    tools.pointer('down', { tx: 5, ty: 5 });
    tools.pointer('move', { tx: 6, ty: 5 });
    tools.pointer('up', { tx: 6, ty: 5 });
    expect(park.version).toBe(versionBefore + 1);
  });

  it('reports why an edit failed', () => {
    const { tools } = setup();
    tools.setTool('water-down');
    tools.pointer('down', { tx: 5, ty: 5 });
    tools.pointer('up', { tx: 5, ty: 5 });
    expect(tools.state.message?.text).toBe('Nothing to change here.');
  });

  it('switches tools and brush sizes from the keyboard', () => {
    const { tools, brushes } = setup();
    expect(tools.key('5', false, false)).toBe(true);
    expect(tools.state.tool).toBe('path');
    tools.key(']', false, false);
    expect(tools.state.brushSize).toBe(3);
    tools.pointer('move', { tx: 5, ty: 5 });
    expect(brushes.at(-1)).toBe(9);
    tools.key('Escape', false, false);
    expect(tools.state.tool).toBe('inspect');
  });
});
