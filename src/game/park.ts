/**
 * The player's park: terrain, buildings, cash and the undo history. Tools go
 * through here so every change is costed and can be undone.
 */
import { checkPlacement, setBlocked, type Building, type Facing } from '../core/buildings';
import { buildingType } from '../core/catalog';
import { STARTING_CASH } from '../core/costs';
import type { TileCoord } from '../core/grid';
import { cloneTerrain, restoreTerrain, type Terrain } from '../core/terrain';
import { buyLand, moveLand, moveWater, placePath, removePath, type EditResult } from '../core/terrain-edit';

export type ToolId =
  | 'inspect'
  | 'raise'
  | 'lower'
  | 'water-up'
  | 'water-down'
  | 'path'
  | 'remove-path'
  | 'buy-land'
  | 'build';

interface Snapshot {
  terrain: Terrain;
  buildings: Building[];
}

interface HistoryEntry {
  state: Snapshot;
  /** Cash spent by this step (negative for refunds). Undo gives it back. */
  spent: number;
}

export const UNDO_LIMIT = 50;
/** Share of a building's price returned when it is demolished. */
export const DEMOLISH_REFUND = 0.5;

export class Park {
  cash: number;
  buildings: Building[] = [];
  /** Bumped on every change to the world, so views know when to redraw. */
  version = 0;
  /** Total income since the park opened. */
  income = 0;
  private nextBuildingId = 1;
  private readonly undoStack: HistoryEntry[] = [];
  private readonly redoStack: HistoryEntry[] = [];
  private strokeStart: Snapshot | null = null;
  private strokeSpent = 0;
  private strokeChanged = false;
  private readonly listeners = new Set<() => void>();
  private readonly cashListeners = new Set<() => void>();

  constructor(readonly terrain: Terrain, cash = STARTING_CASH) {
    this.cash = cash;
  }

  /** World changes: terrain, paths, buildings, prices. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Cash changes, including income that doesn't change the world. */
  onCash(listener: () => void): () => void {
    this.cashListeners.add(listener);
    return () => this.cashListeners.delete(listener);
  }

  /** Start a drag. All edits until endStroke() undo as one step. */
  beginStroke(): void {
    this.strokeStart = this.snapshot();
    this.strokeSpent = 0;
    this.strokeChanged = false;
  }

  endStroke(): void {
    if (this.strokeStart && this.strokeChanged) this.pushUndo({ state: this.strokeStart, spent: this.strokeSpent });
    this.strokeStart = null;
    this.strokeChanged = false;
    this.strokeSpent = 0;
  }

  /** Apply a terrain edit inside the current stroke (see applyOnce for a single click). */
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
      case 'inspect':
      case 'build':
        return { ok: false, cost: 0 };
    }
    if (result.ok) this.spend(result.cost);
    return result;
  }

  /** Apply one edit as its own undo step. */
  applyOnce(tool: ToolId, tiles: TileCoord[]): EditResult {
    this.beginStroke();
    const result = this.apply(tool, tiles);
    this.endStroke();
    return result;
  }

  /**
   * Change the terrain directly, free of charge, as one undo step. Used by
   * developer tools such as the performance test grid.
   */
  applyFree(mutate: (terrain: Terrain) => void): void {
    this.beginStroke();
    mutate(this.terrain);
    this.strokeChanged = true;
    this.endStroke();
    this.changed();
  }

  /** Build a ride or stall as its own undo step. */
  placeBuilding(type: string, origin: TileCoord, facing: Facing): EditResult & { building?: Building; connected?: boolean } {
    const info = buildingType(type);
    const candidate = { type, x: origin.tx, y: origin.ty, facing };
    const check = checkPlacement(this.terrain, candidate);
    if (!check.ok) return { ok: false, cost: 0, reason: check.reason };
    if (info.cost > this.cash) return { ok: false, cost: info.cost, reason: 'Not enough cash.' };
    this.beginStroke();
    const building: Building = { id: this.nextBuildingId++, ...candidate, price: info.price, open: true };
    this.buildings.push(building);
    setBlocked(this.terrain, building, 1);
    this.spend(info.cost);
    this.endStroke();
    return { ok: true, cost: info.cost, building, connected: check.connected };
  }

  /** Knock a building down for a partial refund, as its own undo step. */
  demolish(id: number): EditResult {
    const building = this.buildings.find((b) => b.id === id);
    if (!building) return { ok: false, cost: 0, reason: 'Nothing to demolish.' };
    const refund = Math.round(buildingType(building.type).cost * DEMOLISH_REFUND);
    this.beginStroke();
    setBlocked(this.terrain, building, 0);
    this.buildings = this.buildings.filter((b) => b.id !== id);
    this.spend(-refund);
    this.endStroke();
    return { ok: true, cost: -refund };
  }

  setPrice(id: number, price: number): void {
    const b = this.buildings.find((x) => x.id === id);
    if (!b) return;
    b.price = Math.max(0, Math.min(20, Math.round(price * 2) / 2));
    this.changed();
  }

  setOpen(id: number, open: boolean): void {
    const b = this.buildings.find((x) => x.id === id);
    if (!b || b.open === open) return;
    b.open = open;
    this.changed();
  }

  /** Money from tickets and stalls, reported by the simulation. */
  earn(amount: number): void {
    if (amount === 0) return;
    this.cash += amount;
    this.income += amount;
    for (const l of this.cashListeners) l();
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): boolean {
    const entry = this.undoStack.pop();
    if (!entry) return false;
    this.redoStack.push({ state: this.snapshot(), spent: entry.spent });
    this.restore(entry.state);
    this.adjustCash(entry.spent);
    return true;
  }

  redo(): boolean {
    const entry = this.redoStack.at(-1);
    if (!entry || entry.spent > this.cash) return false;
    this.redoStack.pop();
    this.undoStack.push({ state: this.snapshot(), spent: entry.spent });
    this.restore(entry.state);
    this.adjustCash(-entry.spent);
    return true;
  }

  private spend(cost: number): void {
    this.strokeSpent += cost;
    this.strokeChanged = true;
    this.adjustCash(-cost);
    this.changed();
  }

  private adjustCash(delta: number): void {
    this.cash += delta;
    for (const l of this.cashListeners) l();
  }

  private snapshot(): Snapshot {
    return { terrain: cloneTerrain(this.terrain), buildings: this.buildings.map((b) => ({ ...b })) };
  }

  private restore(snap: Snapshot): void {
    restoreTerrain(this.terrain, snap.terrain);
    this.buildings = snap.buildings.map((b) => ({ ...b }));
    this.changed();
  }

  private pushUndo(entry: HistoryEntry): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  private changed(): void {
    this.version++;
    for (const l of this.listeners) l();
  }
}
