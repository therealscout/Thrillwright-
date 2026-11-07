/**
 * The coaster builder: place a station, lay track piece by piece (paying as
 * you go), test-run the finished circuit, choose the entrance side and open
 * the ride. Cancelling refunds everything laid so far.
 */
import {
  checkDesign,
  checkEntrance,
  checkPiece,
  endState,
  isComplete,
  sampleLayout,
  slopePiece,
  stationPieces,
  type CoasterDesign,
  type TrackCheck,
} from '../core/coaster';
import { runTest, type TestRun } from '../core/coaster-physics';
import { coasterType, type CoasterTypeId } from '../core/coaster-types';
import { premadeById, premadePieces, premadesFor, type PremadeSpec } from '../core/premade';
import type { TileCoord } from '../core/grid';
import { tileMaxHeight } from '../core/terrain';
import { canFollow, PIECES, STATION_LENGTH, type Dir, type Piece, type PieceKind, type TrackState } from '../core/track';
import type { Park } from './park';

export type BuilderPhase = 'idle' | 'station' | 'track';

/** A button in the builder: what it lays, and whether it can right now. */
export interface PieceOption {
  id: string;
  label: string;
  kind: PieceKind | null;
  cost: number;
  ok: boolean;
  reason?: string;
  /** Still to be researched. */
  locked?: boolean;
}

/** A ready-made design on offer in the builder. */
export interface PremadeOption {
  id: string;
  name: string;
  blurb: string;
  price: number;
  /** Needs a piece that hasn't been researched yet. */
  locked: boolean;
}

export interface BuilderState {
  phase: BuilderPhase;
  /** The kind of coaster being built. */
  type: CoasterTypeId;
  /** Ready-made designs for this kind of coaster. */
  premades: PremadeOption[];
  /** The ready-made design being placed, if any. */
  template: string | null;
  /** Direction the station will face when placed. */
  stationDir: Dir;
  design: CoasterDesign | null;
  /** Money laid out on track so far. */
  spent: number;
  complete: boolean;
  lift: boolean;
  side: -1 | 1;
  options: PieceOption[];
  test: TestRun | null;
  entrance: TrackCheck & { connected: boolean } | null;
  version: number;
}

/** Track pieces that need research first, and the feature that unlocks them. */
const PIECE_FEATURE: Partial<Record<PieceKind, string>> = {
  'bank-left': 'banked-turns',
  'bank-right': 'banked-turns',
  loop: 'loop',
};

const BUTTONS: Array<{ id: string; label: string; pick: (s: TrackState) => PieceKind | null }> = [
  { id: 'straight', label: 'Straight', pick: () => 'straight' },
  { id: 'left', label: 'Left turn', pick: () => 'left' },
  { id: 'right', label: 'Right turn', pick: () => 'right' },
  { id: 'bank-left', label: 'Banked left', pick: () => 'bank-left' },
  { id: 'bank-right', label: 'Banked right', pick: () => 'bank-right' },
  { id: 'small-left', label: 'Tight left', pick: () => 'small-left' },
  { id: 'small-right', label: 'Tight right', pick: () => 'small-right' },
  { id: 'up', label: 'Up', pick: (s) => slopePiece(s, 'up') },
  { id: 'down', label: 'Down', pick: (s) => slopePiece(s, 'down') },
  { id: 'level', label: 'Level out', pick: (s) => slopePiece(s, 'level') },
  { id: 'loop', label: 'Loop', pick: () => 'loop' },
  { id: 'brakes', label: 'Brakes', pick: () => 'brakes' },
];

export class CoasterEditor {
  private phase: BuilderPhase = 'idle';
  private stationDir: Dir = 1;
  private design: CoasterDesign | null = null;
  private spent = 0;
  private lift = true;
  private side: -1 | 1 = 1;
  private test: TestRun | null = null;
  private version = 0;
  private type: CoasterTypeId = 'steel-coaster';
  private template: PremadeSpec | null = null;
  private readonly listeners = new Set<(s: BuilderState) => void>();

  constructor(private readonly park: Park, private readonly isUnlocked: (feature: string) => boolean = () => true) {
    park.onChange(() => this.emit());
    park.onCash(() => this.emit());
  }

  /** The design being edited, cheaply, for drawing every frame. */
  get draft(): { design: CoasterDesign | null; version: number; type: CoasterTypeId } {
    return { design: this.design, version: this.version, type: this.type };
  }

  get active(): boolean {
    return this.phase !== 'idle';
  }

  get state(): BuilderState {
    const d = this.design;
    return {
      phase: this.phase,
      type: this.type,
      premades: premadesFor(this.type).map((p) => ({
        id: p.id,
        name: p.name,
        blurb: p.blurb,
        price: this.priceOf(this.templatePieces(p)),
        locked: this.templatePieces(p).some((x) => !this.pieceUnlocked(x.kind)),
      })),
      template: this.template?.id ?? null,
      stationDir: this.stationDir,
      design: d,
      spent: this.spent,
      complete: !!d && isComplete(d),
      lift: this.lift,
      side: this.side,
      options: this.options(),
      test: this.test,
      entrance: d && isComplete(d) ? checkEntrance(this.park.terrain, d, this.side) : null,
      version: this.version,
    };
  }

  subscribe(listener: (s: BuilderState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /** Open the builder, ready to place a station (switching kind of coaster only between designs). */
  begin(type?: CoasterTypeId): void {
    if (type && (this.phase === 'idle' || (this.phase === 'station' && !this.design))) {
      if (type !== this.type) this.template = null;
      this.type = type;
    }
    if (this.phase === 'idle') this.phase = 'station';
    this.emit();
  }

  /** Pick a ready-made design to drop on the map (null goes back to building by hand). */
  choosePremade(id: string | null): TrackCheck {
    if (this.phase !== 'station') return { ok: false, reason: 'Finish or cancel the coaster you are building first.' };
    if (id === null) {
      this.template = null;
      this.emit();
      return { ok: true };
    }
    const spec = premadeById(id);
    if (!spec || spec.type !== this.type) return { ok: false, reason: 'No such design.' };
    if (this.templatePieces(spec).some((p) => !this.pieceUnlocked(p.kind))) return { ok: false, reason: 'Research the loop first.' };
    this.template = spec;
    this.emit();
    return { ok: true };
  }

  /** A premade's pieces, with plain turns where banked ones aren't researched yet. */
  private templatePieces(spec: PremadeSpec): Piece[] {
    const banked = this.isUnlocked('banked-turns');
    return premadePieces(spec).map((p) =>
      !banked && p.kind === 'bank-left' ? { ...p, kind: 'left' as const } : !banked && p.kind === 'bank-right' ? { ...p, kind: 'right' as const } : p,
    );
  }

  /** Price of a piece of this kind of coaster's track. */
  private pieceCost(p: Piece): number {
    return Math.round(PIECES[p.kind].cost * coasterType(this.type).costFactor) + (p.lift ? 40 : 0);
  }

  private priceOf(pieces: readonly Piece[]): number {
    return pieces.reduce((sum, p) => sum + this.pieceCost(p), 0);
  }

  rotateStation(): void {
    this.stationDir = ((this.stationDir + 1) % 4) as Dir;
    this.emit();
  }

  /** The station that would be placed with its first tile here, and whether it fits. */
  stationAt(tile: TileCoord): { design: CoasterDesign; check: TrackCheck } {
    const t = this.park.terrain;
    const inside = tile.tx >= 0 && tile.ty >= 0 && tile.tx < t.width && tile.ty < t.height;
    const h = inside ? tileMaxHeight(t, tile.tx, tile.ty) : 0;
    const pieces = this.template ? this.templatePieces(this.template) : stationPieces();
    const design: CoasterDesign = { start: { tx: tile.tx, ty: tile.ty, h, dir: this.stationDir, slope: 0 }, pieces };
    const check = inside ? checkDesign(t, design) : { ok: false, reason: 'Pick a tile on the map.' };
    if (check.ok && this.template && !this.entranceSide(design)) return { design, check: { ok: false, reason: 'There is no room for the entrance.' } };
    if (check.ok && this.priceOf(design.pieces) > this.park.cash) return { design, check: { ok: false, reason: 'Not enough cash.' } };
    return { design, check };
  }

  placeStation(tile: TileCoord): TrackCheck & { connected?: boolean } {
    if (this.phase !== 'station') return { ok: false };
    const { design, check } = this.stationAt(tile);
    if (!check.ok) return check;
    const cost = this.priceOf(design.pieces);
    if (!this.park.payForDraft(cost)) return { ok: false, reason: 'Not enough cash.' };
    this.design = design;
    this.spent = cost;
    this.phase = 'track';
    this.changed();
    if (!this.template) return { ok: true };
    // A ready-made design opens straight away, entrance on the side with a path if there is one.
    this.side = this.entranceSide(design) ?? -1;
    const opened = this.open();
    if (!opened.ok) this.cancel();
    return opened;
  }

  /** The best side for a premade's entrance: one with a path, else any that fits. */
  private entranceSide(design: CoasterDesign): -1 | 1 | null {
    const t = this.park.terrain;
    // Ready-made circuits turn right, so the left side faces out of the loop.
    const sides = ([-1, 1] as const).map((side) => ({ side, check: checkEntrance(t, design, side) })).filter((s) => s.check.ok);
    return (sides.find((s) => s.check.connected) ?? sides[0])?.side ?? null;
  }

  setLift(on: boolean): void {
    this.lift = on;
    this.emit();
  }

  setSide(side: -1 | 1): void {
    this.side = side;
    this.emit();
  }

  /** Lay the piece behind a builder button. */
  press(id: string): TrackCheck {
    const option = this.options().find((o) => o.id === id);
    if (!option || !option.kind) return { ok: false, reason: option?.reason ?? 'That piece cannot go here.' };
    if (!option.ok) return { ok: false, reason: option.reason };
    return this.add(option.kind);
  }

  /** Lay one piece at the end of the track. */
  add(kind: PieceKind): TrackCheck {
    const d = this.design;
    if (!d || this.phase !== 'track') return { ok: false };
    if (!this.pieceUnlocked(kind)) return { ok: false, reason: 'Research this piece first.' };
    const check = this.canAdd(kind);
    if (!check.ok) return check;
    const piece = this.makePiece(kind);
    const cost = this.pieceCost(piece);
    if (!this.park.payForDraft(cost)) return { ok: false, reason: 'Not enough cash.' };
    d.pieces.push(piece);
    this.spent += cost;
    this.changed();
    return { ok: true };
  }

  /** Take the last piece up again for a full refund. Removing the station puts it back in your hand. */
  removeLast(): void {
    const d = this.design;
    if (!d) return;
    if (d.pieces.length <= STATION_LENGTH) {
      this.park.payForDraft(-this.spent);
      this.spent = 0;
      this.design = null;
      this.phase = 'station';
    } else {
      const p = d.pieces.pop() as Piece;
      const refund = this.pieceCost(p);
      this.park.payForDraft(-refund);
      this.spent -= refund;
    }
    this.changed();
  }

  /** Lay the ready-made sample circuit from a bare station. */
  buildSample(): TrackCheck {
    const d = this.design;
    if (!d || d.pieces.length !== STATION_LENGTH) return { ok: false, reason: 'Start from a bare station.' };
    // Steel keeps its classic sample; other kinds use their first ready-made design.
    const first = premadesFor(this.type)[0];
    const sample = this.type === 'steel-coaster' || !first
      ? sampleLayout({ bankedTurns: this.isUnlocked('banked-turns'), loop: this.isUnlocked('loop') })
      : this.templatePieces(first);
    const rest = sample.slice(STATION_LENGTH);
    if (rest.some((p) => !this.pieceUnlocked(p.kind))) return { ok: false, reason: 'Research the loop first.' };
    const trial: CoasterDesign = { start: d.start, pieces: [...d.pieces, ...rest] };
    const check = checkDesign(this.park.terrain, trial);
    if (!check.ok) return { ok: false, reason: `The sample track doesn't fit here: ${check.reason?.toLowerCase()}` };
    const cost = this.priceOf(rest);
    if (!this.park.payForDraft(cost)) return { ok: false, reason: 'Not enough cash for the sample track.' };
    d.pieces.push(...rest);
    this.spent += cost;
    this.changed();
    return { ok: true };
  }

  /** Run a train round the finished circuit and rate it. */
  runTest(): TestRun | null {
    const d = this.design;
    if (!d || !isComplete(d)) return null;
    const run = runTest(d);
    // Each kind of coaster feels different for the same shape of track.
    if (run.ratings) run.ratings = { ...run.ratings, ...coasterType(this.type).rate(run.ratings, d.pieces) };
    this.test = run;
    this.emit();
    return this.test;
  }

  /** Finish: build the ride so guests can use it. */
  open(): TrackCheck & { connected?: boolean } {
    const d = this.design;
    if (!d || !isComplete(d)) return { ok: false, reason: 'Finish the circuit back to the station first.' };
    const test = this.test ?? this.runTest();
    if (!test?.ok || !test.ratings) return { ok: false, reason: test?.reason ?? 'The test run failed.' };
    const result = this.park.openCoaster({ type: this.type, start: d.start, pieces: d.pieces.map((p) => ({ ...p })), side: this.side, ratings: test.ratings, cost: this.spent });
    if (!result.ok) return { ok: false, reason: result.reason };
    this.reset();
    return { ok: true, connected: result.connected };
  }

  /** Close the builder and refund every piece. */
  cancel(): void {
    if (this.spent) this.park.payForDraft(-this.spent);
    this.reset();
  }

  private reset(): void {
    this.template = null;
    this.design = null;
    this.spent = 0;
    this.test = null;
    this.phase = 'idle';
    this.changed();
  }

  private makePiece(kind: PieceKind): Piece {
    return this.lift && PIECES[kind].dh > 0 ? { kind, lift: true } : { kind };
  }

  private canAdd(kind: PieceKind): TrackCheck {
    const d = this.design;
    if (!d) return { ok: false };
    if (isComplete(d)) return { ok: false, reason: 'The circuit is complete.' };
    const end = endState(d);
    const type = coasterType(this.type);
    if (!type.pieces.includes(kind)) return { ok: false, reason: `A ${type.name} can't use that piece.` };
    if (!canFollow(end, kind)) return { ok: false, reason: end.slope === 0 ? 'Not on level track.' : 'Level out first.' };
    if (end.h + PIECES[kind].dh + PIECES[kind].top > type.maxHeight) return { ok: false, reason: `That is as high as a ${type.name} can go.` };
    return checkPiece(this.park.terrain, d, end, kind);
  }

  private options(): PieceOption[] {
    const d = this.design;
    if (!d || this.phase !== 'track' || isComplete(d)) return [];
    const end = endState(d);
    const allowed = coasterType(this.type).pieces;
    // Only the buttons this kind of coaster can ever use.
    const buttons = BUTTONS.filter((b) => {
      const kind = b.pick({ ...end, slope: 0 }) ?? b.pick({ ...end, slope: 1 }) ?? b.pick({ ...end, slope: -1 });
      return !kind || allowed.includes(kind);
    });
    return buttons.map((b) => {
      const kind = b.pick(end);
      if (!kind) {
        const reason = b.id === 'level' ? 'Already level.' : 'Level out first.';
        return { id: b.id, label: b.label, kind: null, cost: 0, ok: false, reason };
      }
      if (!this.pieceUnlocked(kind)) {
        return { id: b.id, label: b.label, kind, cost: PIECES[kind].cost, ok: false, locked: true, reason: 'Not researched yet.' };
      }
      const piece = this.makePiece(kind);
      const cost = this.pieceCost(piece);
      const check = this.canAdd(kind);
      const ok = check.ok && cost <= this.park.cash;
      return { id: b.id, label: b.label, kind, cost, ok, reason: check.ok && !ok ? 'Not enough cash.' : check.reason };
    });
  }

  private pieceUnlocked(kind: PieceKind): boolean {
    const feature = PIECE_FEATURE[kind];
    return !feature || this.isUnlocked(feature);
  }

  /** Track changed: old test results no longer apply. */
  private changed(): void {
    this.test = null;
    this.version++;
    this.emit();
  }

  private emit(): void {
    if (this.listeners.size === 0) return;
    const s = this.state;
    for (const l of this.listeners) l(s);
  }
}
