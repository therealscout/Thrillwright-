/**
 * The player's park: terrain, cash and the undo history. Tools go through
 * here so every change is costed and can be undone.
 */
import { STARTING_CASH } from '../core/costs';
import type { TileCoord } from '../core/grid';
import { cloneTerrain, restoreTerrain, type Terrain } from '../core/terrain';
import { buyLand, moveLand, moveWater, placePath, removePath, type EditResult } from '../core/terrain-edit';

export type ToolId = 'inspect' | 'raise' | 'lower' | 'water-up' | 'water-down' | 'path' | 'remove-path' | 'buy-land';

interface Snapshot {
  terrain: Terrain;
  cash: number;
}

export const UNDO_LIMIT = 50;

export class Park {
  cash: number;
  /** Bumped on every change, so views know when to redraw. */
  version = 0;
  private readonly undoStack: Snapshot[] = [];
  private readonly redoStack: Snapshot[] = [];
  private strokeStart: Snapshot | null = null;
  private strokeChanged = false;
  private readonly listeners = new Set<() => void>();

  constructor(readonly terrain: Terrain, cash = STARTING_CASH) {
    this.cash = cash;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Start a drag. All edits until endStroke() undo as one step. */
  beginStroke(): void {
    this.strokeStart = this.snapshot();
    this.strokeChanged = false;
  }

  endStroke(): void {
    if (this.strokeStart && this.strokeChanged) this.pushUndo(this.strokeStart);
    this.strokeStart = null;
    this.strokeChanged = false;
  }

  /** Apply an edit inside the current stroke (see applyOnce for a single click). */
  apply(tool: ToolId, tiles: TileCoord[]): EditResult {
    const t = this.terrain;
    let result: EditResult;
    switch (tool) {
      case 'raise': result = moveLand(t, tiles, 1, this.cash); break;
      case 'lower': result = moveLand(t, tiles, -1, this.cash); break;
      case 'water-up': result = moveWater(t, tiles, 1, this.cash); break;
      case 'water-down': result = moveWater(t, tiles, -1, this.cash); break;
      case 'path': result = placePath(t, tiles, this.cash); break;
      case 'remove-path': result = removePath(t, tiles); break;
      case 'buy-land': result = buyLand(t, tiles, this.cash); break;
      case 'inspect': return { ok: false, cost: 0 };
    }
    if (result.ok) {
      this.cash -= result.cost;
      this.strokeChanged = true;
      this.changed();
    }
    return result;
  }

  /** Apply one edit as its own undo step. */
  applyOnce(tool: ToolId, tiles: TileCoord[]): EditResult {
    this.beginStroke();
    const result = this.apply(tool, tiles);
    this.endStroke();
    return result;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): boolean {
    const snap = this.undoStack.pop();
    if (!snap) return false;
    this.redoStack.push(this.snapshot());
    this.restore(snap);
    return true;
  }

  redo(): boolean {
    const snap = this.redoStack.pop();
    if (!snap) return false;
    this.undoStack.push(this.snapshot());
    this.restore(snap);
    return true;
  }

  private snapshot(): Snapshot {
    return { terrain: cloneTerrain(this.terrain), cash: this.cash };
  }

  private restore(snap: Snapshot): void {
    restoreTerrain(this.terrain, snap.terrain);
    this.cash = snap.cash;
    this.changed();
  }

  private pushUndo(snap: Snapshot): void {
    this.undoStack.push(snap);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  private changed(): void {
    this.version++;
    for (const l of this.listeners) l();
  }
}
