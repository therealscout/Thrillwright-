/**
 * Connects pointer input to park edits: which tool is active, the brush
 * size, drag strokes, undo/redo and feedback messages.
 */
import { accessTile, buildingAt, checkPlacement, footprint, originFor, type Facing } from '../core/buildings';
import { buildingType } from '../core/catalog';
import type { TileCoord } from '../core/grid';
import { tileIndex } from '../core/terrain';
import { brushTiles } from '../core/terrain-edit';
import type { CoasterDesign } from '../core/coaster';
import { uniqueTiles } from '../core/coaster';
import type { CoasterEditor } from './coaster-editor';
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
  { id: 'build', label: 'Build', hint: 'Click to place. R rotates the entrance; face it onto a path', key: 'b', paints: false, usesBrush: false },
  { id: 'coaster', label: 'Coaster builder', hint: 'Click flat land for the station. R turns it', key: 'c', paints: false, usesBrush: false },
];

export const BRUSH_SIZES = [1, 3, 5, 7] as const;

export interface ToolState {
  tool: ToolId;
  brushSize: number;
  cash: number;
  canUndo: boolean;
  canRedo: boolean;
  /** Last feedback, with an id so the UI can tell repeats apart. */
  message: { text: string; id: number; tone: 'error' | 'info' } | null;
  /** Ride or stall chosen for the Build tool. */
  buildType: string | null;
  facing: Facing;
  /** Building picked with the Look tool, for the info window. */
  selected: number | null;
}

export interface BrushView {
  setBrush(tiles: TileCoord[], valid: boolean): void;
  setGhost?(ghost: { type: string; x: number; y: number; facing: Facing; valid: boolean } | null): void;
  /** Preview of a coaster station about to be placed. */
  setTrackGhost?(design: CoasterDesign | null, valid: boolean): void;
}

export class ToolController {
  private tool: ToolId = 'inspect';
  private brushSize = 1;
  private hovered: TileCoord | null = null;
  private dragging = false;
  private lastPainted = '';
  private message: ToolState['message'] = null;
  private messageId = 0;
  private buildType: string | null = null;
  private facing: Facing = 2;
  private selected: number | null = null;
  private readonly listeners = new Set<(s: ToolState) => void>();

  constructor(
    private readonly park: Park,
    private readonly view: BrushView,
    private readonly coaster?: CoasterEditor,
  ) {
    coaster?.subscribe((s) => {
      // Leave the coaster tool once the builder closes (opened or cancelled).
      if (s.phase === 'idle' && this.tool === 'coaster') {
        this.tool = 'inspect';
        this.refreshBrush();
        this.emit();
      } else if (s.phase === 'track' && this.tool === 'coaster') {
        this.refreshBrush();
      }
    });
    park.onChange(() => {
      if (this.selected !== null && !park.buildings.some((b) => b.id === this.selected)) this.selected = null;
      this.refreshBrush();
      this.emit();
    });
    park.onCash(() => this.emit());
  }

  get state(): ToolState {
    return {
      tool: this.tool,
      brushSize: this.brushSize,
      cash: this.park.cash,
      canUndo: this.park.canUndo,
      canRedo: this.park.canRedo,
      message: this.message,
      buildType: this.buildType,
      facing: this.facing,
      selected: this.selected,
    };
  }

  subscribe(listener: (s: ToolState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  setTool(tool: ToolId): void {
    if (tool === 'build' && !this.buildType) {
      this.say('Pick something to build from the Build menu.', 'info');
      return;
    }
    if (tool === 'coaster') {
      this.startCoaster();
      return;
    }
    this.tool = tool;
    this.refreshBrush();
    this.emit();
  }

  /** Open the coaster builder (or go back to it). */
  startCoaster(): void {
    if (!this.coaster) return;
    this.coaster.begin();
    this.tool = 'coaster';
    this.refreshBrush();
    this.emit();
  }

  /** Choose a ride or stall and switch to the Build tool. */
  setBuildType(type: string): void {
    if (buildingType(type).custom) {
      this.startCoaster();
      return;
    }
    this.buildType = type;
    this.tool = 'build';
    this.refreshBrush();
    this.emit();
  }

  /** Turn the entrance of the building being placed a quarter turn. */
  rotateFacing(): void {
    this.facing = ((this.facing + 1) % 4) as Facing;
    this.refreshBrush();
    this.emit();
  }

  select(id: number | null): void {
    this.selected = id;
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
    if (kind === 'down' && tile && this.tool === 'inspect') {
      this.select(buildingAt(this.park.buildings, tile)?.id ?? null);
    } else if (kind === 'down' && tile && this.tool === 'build') {
      this.place(tile);
    } else if (kind === 'down' && tile && this.tool === 'coaster') {
      if (this.coaster?.state.phase === 'station') {
        const r = this.coaster.placeStation(tile);
        if (!r.ok && r.reason) this.say(r.reason);
        else if (r.ok) this.say('Station placed. Now lay track from its far end.', 'info');
      } else {
        this.select(buildingAt(this.park.buildings, tile)?.id ?? null);
      }
    } else if (kind === 'down' && tile && this.tool !== 'inspect') {
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
    if (k === 'r' && this.tool === 'build') {
      this.rotateFacing();
      return true;
    }
    if (k === 'r' && this.tool === 'coaster' && this.coaster?.state.phase === 'station') {
      this.coaster.rotateStation();
      this.refreshBrush();
      return true;
    }
    if (k === 'escape' && this.selected !== null && this.tool === 'inspect') {
      this.select(null);
      return true;
    }
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

  private place(tile: TileCoord): void {
    if (!this.buildType) return;
    const type = buildingType(this.buildType);
    const origin = originFor(type, tile);
    const result = this.park.placeBuilding(this.buildType, origin, this.facing);
    if (!result.ok) {
      if (result.reason) this.say(result.reason);
    } else if (!result.connected) {
      this.say(`${type.name} built. Connect a path to its entrance.`, 'info');
    } else {
      this.say(`${type.name} built.`, 'info');
    }
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
    if (this.tool !== 'build' || !this.hovered) this.view.setGhost?.(null);
    const placingStation = this.tool === 'coaster' && this.coaster?.state.phase === 'station';
    if (!placingStation || !this.hovered) this.view.setTrackGhost?.(null, true);
    if (this.tool === 'coaster') {
      if (placingStation && this.hovered && this.coaster) {
        const { design, check } = this.coaster.stationAt(this.hovered);
        const { width, height } = this.park.terrain;
        this.view.setBrush(uniqueTiles(design).filter(({ tx, ty }) => tx >= 0 && ty >= 0 && tx < width && ty < height), check.ok);
        this.view.setTrackGhost?.(design, check.ok);
      } else {
        this.view.setBrush([], true);
      }
      return;
    }
    if (!this.hovered || this.tool === 'inspect') {
      this.view.setBrush([], true);
      return;
    }
    if (this.tool === 'build' && this.buildType) {
      const type = buildingType(this.buildType);
      const o = originFor(type, this.hovered);
      const candidate = { type: this.buildType, x: o.tx, y: o.ty, facing: this.facing };
      const valid = checkPlacement(this.park.terrain, candidate).ok && type.cost <= this.park.cash;
      const { width, height } = this.park.terrain;
      const tiles = [...footprint(candidate), accessTile(candidate)].filter(
        ({ tx, ty }) => tx >= 0 && ty >= 0 && tx < width && ty < height,
      );
      this.view.setBrush(tiles, valid);
      this.view.setGhost?.({ ...candidate, valid });
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

  /** Show a feedback message (used by panels such as the coaster builder). */
  notify(text: string, tone: 'error' | 'info' = 'error'): void {
    this.say(text, tone);
  }

  private say(text: string, tone: 'error' | 'info' = 'error'): void {
    this.message = { text, id: ++this.messageId, tone };
    this.emit();
  }

  private emit(): void {
    const s = this.state;
    for (const l of this.listeners) l(s);
  }
}
