/**
 * Connects pointer input to park edits: which tool is active, the brush
 * size, drag strokes, undo/redo and feedback messages.
 */
import type { TileCoord } from '../core/grid';
import { tileIndex } from '../core/terrain';
import { brushTiles } from '../core/terrain-edit';
import type { Park, ToolId } from './park';

export interface ToolInfo {
  id: ToolId;
  label: string;
  hint: string;
  key: string;
  /** Tools that paint while dragging; the others act once per click. */
  paints: boolean;
  usesBrush: boolean;
}

export const TOOLS: ToolInfo[] = [
  { id: 'inspect', label: 'Look', hint: 'Look around without building', key: 'Escape', paints: false, usesBrush: false },
  { id: 'raise', label: 'Raise land', hint: 'Click to raise land; slopes form around it', key: '1', paints: false, usesBrush: true },
  { id: 'lower', label: 'Lower land', hint: 'Click to dig down', key: '2', paints: false, usesBrush: true },
  { id: 'water-up', label: 'Add water', hint: 'Click to raise the water level; dig first for a lake', key: '3', paints: false, usesBrush: true },
  { id: 'water-down', label: 'Drain water', hint: 'Click to lower the water level', key: '4', paints: false, usesBrush: true },
  { id: 'path', label: 'Path', hint: 'Click and drag to lay footpath', key: '5', paints: true, usesBrush: true },
  { id: 'remove-path', label: 'Remove path', hint: 'Click and drag to remove footpath', key: '6', paints: true, usesBrush: true },
  { id: 'buy-land', label: 'Buy land', hint: 'Click and drag to buy land next to your park', key: '7', paints: true, usesBrush: true },
];

export const BRUSH_SIZES = [1, 3, 5, 7] as const;

export interface ToolState {
  tool: ToolId;
  brushSize: number;
  cash: number;
  canUndo: boolean;
  canRedo: boolean;
  /** Last feedback, with an id so the UI can tell repeats apart. */
  message: { text: string; id: number } | null;
}

export interface BrushView {
  setBrush(tiles: TileCoord[], valid: boolean): void;
}

export class ToolController {
  private tool: ToolId = 'inspect';
  private brushSize = 1;
  private hovered: TileCoord | null = null;
  private dragging = false;
  private lastPainted = '';
  private message: ToolState['message'] = null;
  private messageId = 0;
  private readonly listeners = new Set<(s: ToolState) => void>();

  constructor(private readonly park: Park, private readonly view: BrushView) {
    park.onChange(() => {
      this.refreshBrush();
      this.emit();
    });
  }

  get state(): ToolState {
    return {
      tool: this.tool,
      brushSize: this.brushSize,
      cash: this.park.cash,
      canUndo: this.park.canUndo,
      canRedo: this.park.canRedo,
      message: this.message,
    };
  }

  subscribe(listener: (s: ToolState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  setTool(tool: ToolId): void {
    this.tool = tool;
    this.refreshBrush();
    this.emit();
  }

  setBrushSize(size: number): void {
    this.brushSize = size;
    this.refreshBrush();
    this.emit();
  }

  undo(): void {
    if (this.park.undo()) this.say('Undone');
  }

  redo(): void {
    if (this.park.redo()) this.say('Redone');
  }

  /** Handle a pointer event from the map. */
  pointer(kind: 'down' | 'move' | 'up', tile: TileCoord | null): void {
    this.hovered = tile;
    if (kind === 'down' && tile && this.tool !== 'inspect') {
      this.dragging = true;
      this.park.beginStroke();
      this.lastPainted = '';
      this.applyAt(tile);
    } else if (kind === 'move' && this.dragging && tile && this.info().paints) {
      this.applyAt(tile);
    } else if (kind === 'up' && this.dragging) {
      this.dragging = false;
      this.park.endStroke();
      this.emit();
    }
    this.refreshBrush();
  }

  /** Keyboard shortcuts. Returns true when the key was used. */
  key(key: string, ctrl: boolean, shift: boolean): boolean {
    const k = key.toLowerCase();
    if (ctrl && k === 'z') {
      if (shift) this.redo();
      else this.undo();
      return true;
    }
    if (ctrl && k === 'y') {
      this.redo();
      return true;
    }
    if (ctrl) return false;
    const tool = TOOLS.find((t) => t.key.toLowerCase() === k);
    if (tool) {
      this.setTool(tool.id);
      return true;
    }
    if (k === '[' || k === ']') {
      const i = BRUSH_SIZES.indexOf(this.brushSize as (typeof BRUSH_SIZES)[number]);
      const next = BRUSH_SIZES[Math.max(0, Math.min(BRUSH_SIZES.length - 1, i + (k === ']' ? 1 : -1)))];
      if (next) this.setBrushSize(next);
      return true;
    }
    return false;
  }

  private info(): ToolInfo {
    return TOOLS.find((t) => t.id === this.tool) as ToolInfo;
  }

  private tilesAt(tile: TileCoord): TileCoord[] {
    const { width, height } = this.park.terrain;
    return brushTiles(tile, this.info().usesBrush ? this.brushSize : 1, width, height);
  }

  private applyAt(tile: TileCoord): void {
    const key = `${tile.tx},${tile.ty}`;
    if (key === this.lastPainted) return;
    this.lastPainted = key;
    const result = this.park.apply(this.tool, this.tilesAt(tile));
    if (!result.ok && result.reason) this.say(result.reason);
  }

  private refreshBrush(): void {
    if (!this.hovered || this.tool === 'inspect') {
      this.view.setBrush([], true);
      return;
    }
    const tiles = this.tilesAt(this.hovered);
    const t = this.park.terrain;
    const valid =
      this.tool === 'buy-land'
        ? tiles.some(({ tx, ty }) => !t.owned[tileIndex(t, tx, ty)])
        : tiles.some(({ tx, ty }) => t.owned[tileIndex(t, tx, ty)] === 1);
    this.view.setBrush(tiles, valid);
  }

  private say(text: string): void {
    this.message = { text, id: ++this.messageId };
    this.emit();
  }

  private emit(): void {
    const s = this.state;
    for (const l of this.listeners) l(s);
  }
}
