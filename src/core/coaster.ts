/**
 * Roller coaster designs on the map: where track may go, when a circuit is
 * complete, and which tiles a finished coaster occupies.
 */
import type { TileCoord } from './grid';
import { isUnderwater, tileIndex, tileMaxHeight, tileMinHeight, type Terrain } from './terrain';
import {
  layout,
  nextState,
  pieceTiles,
  RIGHT,
  sameState,
  STATION_LENGTH,
  trackCost,
  type Dir,
  type Piece,
  type PieceKind,
  type TileUse,
  type TrackState,
} from './track';

/** Height steps of free space needed between track and a path or other track below it. */
export const TRACK_CLEARANCE = 4;
/** Highest the track may go, in height steps. */
export const MAX_TRACK_HEIGHT = 72;
/** Riders per train: 4 cars of 4 seats. */
export const COASTER_SEATS = 16;
export const COASTER_CARS = 4;

export interface CoasterDesign {
  start: TrackState;
  pieces: Piece[];
}

export interface CoasterRatings {
  excitement: number;
  intensity: number;
  nausea: number;
  /** Top speed in metres per second. */
  maxSpeed: number;
  /** Track length in metres. */
  length: number;
  /** Seconds from leaving the station to stopping back in it. */
  duration: number;
  maxPositiveG: number;
  maxNegativeG: number;
  maxLateralG: number;
  drops: number;
  /** Highest single drop in metres. */
  highestDrop: number;
  inversions: number;
  /** Seconds of negative vertical G ("floating"). */
  airtime: number;
}

/** What a finished coaster carries on its Building. */
export interface CoasterInfo extends CoasterDesign {
  /** Which side of the station the entrance is on: -1 left, 1 right. */
  side: -1 | 1;
  ratings: CoasterRatings;
  /** Price of the track, for the demolish refund. */
  cost: number;
}

export interface TrackCheck {
  ok: boolean;
  reason?: string;
}

/** Every tile the track uses, piece by piece. */
export function designTiles(design: CoasterDesign): TileUse[][] {
  const { states } = layout(design.start, design.pieces);
  return design.pieces.map((p, i) => pieceTiles(states[i] as TrackState, p.kind));
}

/** Distinct tiles under the track. */
export function uniqueTiles(design: CoasterDesign): TileCoord[] {
  const seen = new Set<string>();
  const out: TileCoord[] = [];
  for (const uses of designTiles(design)) {
    for (const u of uses) {
      const key = `${u.tx},${u.ty}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ tx: u.tx, ty: u.ty });
    }
  }
  return out;
}

/** The state where the next piece would start. */
export function endState(design: CoasterDesign): TrackState {
  return layout(design.start, design.pieces).end;
}

/** True when the track returns to the start of the station. */
export function isComplete(design: CoasterDesign): boolean {
  return design.pieces.length > STATION_LENGTH && sameState(endState(design), design.start);
}

/** Can `kind` be laid at `state`, given the track already laid? */
export function checkPiece(t: Terrain, design: CoasterDesign, state: TrackState, kind: PieceKind): TrackCheck {
  const fail = (reason: string): TrackCheck => ({ ok: false, reason });
  if (isComplete(design)) return fail('The circuit is already complete.');
  const uses = pieceTiles(state, kind);
  const laid = designTiles(design).flat();
  for (const u of uses) {
    if (u.tx < 0 || u.ty < 0 || u.tx >= t.width || u.ty >= t.height) return fail('The track would leave the map.');
    if (u.hMax > MAX_TRACK_HEIGHT) return fail('That is as high as track can go.');
    const k = tileIndex(t, u.tx, u.ty);
    if (!t.owned[k]) return fail("You don't own this land.");
    // Another coaster here: pass under or over it with headroom, like track crossing itself.
    const otherLow = (t.trackLow[k] as number) - 1;
    const otherHigh = (t.trackHigh[k] as number) - 1;
    if (t.blocked[k] && otherHigh < 0) return fail('Something is already built here.');
    if (otherHigh >= 0) {
      if (kind === 'station') return fail('A station needs open sky above it.');
      const clear = u.hMin >= otherHigh + TRACK_CLEARANCE || otherLow >= u.hMax + TRACK_CLEARANCE;
      if (!clear) return fail('The track would hit another coaster.');
    }
    const ground = tileMaxHeight(t, u.tx, u.ty);
    if (u.hMin < ground) return fail('The track would go into the ground.');
    if (kind === 'station') {
      if (u.hMin !== ground || ground !== tileMinHeight(t, u.tx, u.ty)) return fail('The station needs flat ground.');
      if (t.paths[k]) return fail('Remove the path here first.');
      if (isUnderwater(t, u.tx, u.ty)) return fail("You can't build a station in water.");
    }
    if (t.water[k] && u.hMin < (t.water[k] as number)) return fail('The track would go under water.');
    if (t.paths[k] && u.hMin < ground + TRACK_CLEARANCE) return fail('Not enough headroom over the path.');
    for (const other of laid) {
      if (other.tx !== u.tx || other.ty !== u.ty) continue;
      const clear = u.hMin >= other.hMax + TRACK_CLEARANCE || other.hMin >= u.hMax + TRACK_CLEARANCE;
      if (!clear) return fail('The track would hit itself.');
    }
  }
  return { ok: true };
}

/** Check a whole design again (for example after the ground changed). */
export function checkDesign(t: Terrain, design: CoasterDesign): TrackCheck {
  const partial: CoasterDesign = { start: design.start, pieces: [] };
  let state = design.start;
  for (const p of design.pieces) {
    const check = checkPiece(t, partial, state, p.kind);
    if (!check.ok) return check;
    partial.pieces.push(p);
    state = nextState(state, p.kind);
  }
  return { ok: true };
}

/** The station's middle tile and direction. */
function stationMiddle(design: CoasterDesign): TrackState {
  const { states } = layout(design.start, design.pieces.slice(0, STATION_LENGTH));
  return states[Math.floor(STATION_LENGTH / 2)] ?? design.start;
}

/** The tile beside the station where guests queue and board. */
export function coasterEntrance(design: CoasterDesign, side: -1 | 1): TileCoord {
  const mid = stationMiddle(design);
  const R = RIGHT[mid.dir] as readonly [number, number];
  return { tx: mid.tx + R[0] * side, ty: mid.ty + R[1] * side };
}

/** Is the entrance tile usable? */
export function checkEntrance(t: Terrain, design: CoasterDesign, side: -1 | 1): TrackCheck & { connected: boolean } {
  const a = coasterEntrance(design, side);
  if (a.tx < 0 || a.ty < 0 || a.tx >= t.width || a.ty >= t.height) return { ok: false, reason: 'The entrance would be off the map.', connected: false };
  const k = tileIndex(t, a.tx, a.ty);
  if (t.blocked[k]) return { ok: false, reason: 'Something is in the way of the entrance.', connected: false };
  const onTrack = uniqueTiles(design).some((u) => u.tx === a.tx && u.ty === a.ty);
  if (onTrack && !t.paths[k]) return { ok: false, reason: 'The track is in the way of the entrance.', connected: false };
  return { ok: true, connected: t.paths[k] === 1 };
}

/** The pieces a station is made of. */
export function stationPieces(): Piece[] {
  return Array.from({ length: STATION_LENGTH }, () => ({ kind: 'station' as const }));
}

/**
 * Which piece to lay for a simple "go up / go down / level out" choice, so
 * the player never has to pick slope transitions by hand.
 */
export function slopePiece(state: TrackState, want: 'up' | 'down' | 'level'): PieceKind | null {
  if (want === 'up') return state.slope === 0 ? 'flat-up' : state.slope === 1 ? 'up' : null;
  if (want === 'down') return state.slope === 0 ? 'flat-down' : state.slope === -1 ? 'down' : null;
  return state.slope === 1 ? 'up-flat' : state.slope === -1 ? 'down-flat' : null;
}

/**
 * A ready-made circuit that fits a 13 by 4 tile area starting at the
 * station: a chain lift, a drop, a loop and two pairs of turns. Without
 * banked turns or the loop researched, it uses plain turns and straights.
 */
export function sampleLayout(features: { bankedTurns?: boolean; loop?: boolean } = {}): Piece[] {
  const { bankedTurns = true, loop = true } = features;
  const lift = (kind: PieceKind): Piece => ({ kind, lift: true });
  const turn: PieceKind = bankedTurns ? 'bank-right' : 'right';
  return [
    ...stationPieces(),
    { kind: 'straight' },
    lift('flat-up'),
    ...Array.from({ length: 3 }, () => lift('up')),
    lift('up-flat'),
    { kind: turn },
    { kind: turn },
    { kind: 'flat-down' },
    ...Array.from({ length: 3 }, (): Piece => ({ kind: 'down' })),
    { kind: 'down-flat' },
    ...(loop ? [{ kind: 'loop' } as Piece] : Array.from({ length: 3 }, (): Piece => ({ kind: 'straight' }))),
    { kind: 'brakes' },
    { kind: 'right' },
    { kind: 'right' },
  ];
}

/** A level start state on a tile. */
export function startFor(tile: TileCoord, h: number, dir: Dir): TrackState {
  return { tx: tile.tx, ty: tile.ty, h, dir, slope: 0 };
}

export function designCost(design: CoasterDesign): number {
  return trackCost(design.pieces);
}
