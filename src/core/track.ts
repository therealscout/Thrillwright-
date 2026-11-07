/**
 * Roller coaster track: pieces joined end to end on the tile grid.
 *
 * Every piece starts at the back edge of a tile, travelling in one of the
 * four grid directions, at a height measured in HEIGHT_STEP units, on a given
 * slope. Its shape is described in a local frame (forward, right, up) and
 * turned into world positions when the track is laid out.
 */
import { HEIGHT_STEP } from './grid';

export type Dir = 0 | 1 | 2 | 3; // north, east, south, west
/** -1 going down, 0 level, 1 going up. */
export type Slope = -1 | 0 | 1;

export type PieceKind =
  | 'station'
  | 'straight'
  | 'brakes'
  | 'left'
  | 'right'
  | 'bank-left'
  | 'bank-right'
  | 'flat-up'
  | 'up'
  | 'up-flat'
  | 'flat-down'
  | 'down'
  | 'down-flat'
  | 'loop';

export interface Piece {
  kind: PieceKind;
  /** Chain lift (only on upward pieces). */
  lift?: boolean;
}

export interface TrackState {
  tx: number;
  ty: number;
  /** Height of the track at the piece's start, in HEIGHT_STEP units. */
  h: number;
  dir: Dir;
  slope: Slope;
}

/** A point along a piece in its local frame: forward and right in tiles, up in height steps. */
interface LocalSample {
  f: number;
  r: number;
  u: number;
  /** Local direction of travel (unnormalised), same units. */
  df: number;
  dr: number;
  du: number;
  /** Roll angle around the direction of travel, radians (banking). */
  roll: number;
  /** True when the rider's "up" is the inside of a vertical loop. */
  loopAngle?: number;
}

interface PieceDef {
  name: string;
  from: Slope;
  to: Slope;
  /** Height change in steps. */
  dh: number;
  /** Turn: -1 left, 0 none, 1 right. */
  turn: -1 | 0 | 1;
  /** Next piece's entry tile, in local (forward, right) tile offsets. */
  next: [number, number];
  /** Tiles used, in local (forward, right) offsets. */
  tiles: Array<[number, number]>;
  /** Extra height above the start used by the shape (for clearance), in steps. */
  top: number;
  samples: number;
  sample(t: number): LocalSample;
  /** Price in dollars. */
  cost: number;
}

const TURN_RADIUS = 1.5;
const LOOP_RADIUS = 1.6; // tiles
const LOOP_LENGTH = 3; // tiles forward
const tileUnits = 1 / HEIGHT_STEP; // height steps per tile of distance

function straightDef(name: string, cost: number): PieceDef {
  return {
    name, from: 0, to: 0, dh: 0, turn: 0, next: [1, 0], tiles: [[0, 0]], top: 0, samples: 4, cost,
    sample: (t) => ({ f: t, r: 0, u: 0, df: 1, dr: 0, du: 0, roll: 0 }),
  };
}

function turnDef(name: string, side: -1 | 1, bank: number, cost: number): PieceDef {
  const R = TURN_RADIUS;
  return {
    name, from: 0, to: 0, dh: 0, turn: side, next: [1, 2 * side], top: 0, samples: 16, cost,
    tiles: [[0, 0], [1, 0], [0, side], [1, side]],
    sample: (t) => {
      const a = (t * Math.PI) / 2;
      // Bank into the turn, easing in and out.
      const roll = side * bank * Math.sin(t * Math.PI);
      return { f: R * Math.sin(a), r: side * (R - R * Math.cos(a)), u: 0, df: Math.cos(a), dr: side * Math.sin(a), du: 0, roll };
    },
  };
}

/** Height profile pieces: u(t) and its derivative, in steps. */
function slopeDef(name: string, from: Slope, to: Slope, u: (t: number) => number, du: (t: number) => number, cost: number): PieceDef {
  const dh = u(1);
  return {
    name, from, to, dh, turn: 0, next: [1, 0], tiles: [[0, 0]], top: Math.max(0, dh), samples: 8, cost,
    sample: (t) => ({ f: t, r: 0, u: u(t), df: 1, dr: 0, du: du(t), roll: 0 }),
  };
}

const loopK = LOOP_LENGTH / (2 * Math.PI);

export const PIECES: Record<PieceKind, PieceDef> = {
  station: straightDef('Station', 120),
  straight: straightDef('Straight', 60),
  brakes: straightDef('Brakes', 90),
  left: turnDef('Left turn', -1, 0, 180),
  right: turnDef('Right turn', 1, 0, 180),
  'bank-left': turnDef('Banked left turn', -1, 0.6, 220),
  'bank-right': turnDef('Banked right turn', 1, 0.6, 220),
  // 2 steps per tile is a 45 degree slope; transitions ease in and out.
  'flat-up': slopeDef('Start climb', 0, 1, (t) => t * t, (t) => 2 * t, 80),
  up: slopeDef('Climb', 1, 1, (t) => 2 * t, () => 2, 80),
  'up-flat': slopeDef('Level off', 1, 0, (t) => 2 * t - t * t, (t) => 2 - 2 * t, 80),
  'flat-down': slopeDef('Start drop', 0, -1, (t) => -t * t, (t) => -2 * t, 80),
  down: slopeDef('Drop', -1, -1, (t) => -2 * t, () => -2, 80),
  'down-flat': slopeDef('Pull out', -1, 0, (t) => -2 * t + t * t, (t) => -2 + 2 * t, 80),
  loop: {
    name: 'Vertical loop', from: 0, to: 0, dh: 0, turn: 0, next: [LOOP_LENGTH, 0],
    tiles: [[0, 0], [1, 0], [2, 0]], top: Math.ceil(2 * LOOP_RADIUS * tileUnits) + 1, samples: 48, cost: 900,
    sample: (t) => {
      const a = t * Math.PI * 2;
      return {
        f: LOOP_RADIUS * Math.sin(a) + loopK * a,
        r: 0,
        u: LOOP_RADIUS * (1 - Math.cos(a)) * tileUnits,
        df: LOOP_RADIUS * Math.cos(a) + loopK,
        dr: 0,
        du: LOOP_RADIUS * Math.sin(a) * tileUnits,
        roll: 0,
        loopAngle: a,
      };
    },
  },
};

export const PIECE_KINDS = Object.keys(PIECES) as PieceKind[];

export function pieceInfo(kind: PieceKind) {
  const d = PIECES[kind];
  return { name: d.name, cost: d.cost, from: d.from, to: d.to, isLift: d.dh > 0 };
}

export const FORWARD: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const RIGHT: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1]];

function localToTile(s: TrackState, f: number, r: number): [number, number] {
  const F = FORWARD[s.dir] as readonly [number, number];
  const R = RIGHT[s.dir] as readonly [number, number];
  return [s.tx + F[0] * f + R[0] * r, s.ty + F[1] * f + R[1] * r];
}

/** Can this piece follow a track ending in `state`? */
export function canFollow(state: TrackState, kind: PieceKind): boolean {
  return PIECES[kind].from === state.slope;
}

/** The state after laying `kind` from `state`. */
export function nextState(state: TrackState, kind: PieceKind): TrackState {
  const d = PIECES[kind];
  const [tx, ty] = localToTile(state, d.next[0], d.next[1]);
  return { tx, ty, h: state.h + d.dh, dir: (((state.dir + d.turn) % 4) + 4) % 4 as Dir, slope: d.to };
}

export interface TileUse {
  tx: number;
  ty: number;
  /** Lowest and highest track height over this tile, in steps. */
  hMin: number;
  hMax: number;
}

/** Tiles a piece covers when laid from `state`. */
export function pieceTiles(state: TrackState, kind: PieceKind): TileUse[] {
  const d = PIECES[kind];
  const lo = Math.min(0, d.dh);
  const hi = Math.max(0, d.dh, d.top);
  return d.tiles.map(([f, r]) => {
    const [tx, ty] = localToTile(state, f, r);
    return { tx, ty, hMin: state.h + lo, hMax: state.h + hi };
  });
}

/** Lay pieces out from a start state; returns the state before each piece and the end state. */
export function layout(start: TrackState, pieces: readonly Piece[]): { states: TrackState[]; end: TrackState } {
  const states: TrackState[] = [];
  let s = start;
  for (const p of pieces) {
    states.push(s);
    s = nextState(s, p.kind);
  }
  return { states, end: s };
}

export function sameState(a: TrackState, b: TrackState): boolean {
  return a.tx === b.tx && a.ty === b.ty && a.h === b.h && a.dir === b.dir && a.slope === b.slope;
}

/** A point on the laid-out track in world units. */
export interface TrackPoint {
  x: number;
  y: number;
  z: number;
  /** Unit direction of travel. */
  tx: number;
  ty: number;
  tz: number;
  /** Unit "up" for riders (rolls with banking, flips in loops). */
  ux: number;
  uy: number;
  uz: number;
  /** Distance along the track from the start, world units. */
  s: number;
  piece: number;
  lift: boolean;
  brake: boolean;
  station: boolean;
}

/** Sample the whole track as a dense polyline with frames. */
export function sampleTrack(start: TrackState, pieces: readonly Piece[]): TrackPoint[] {
  const { states } = layout(start, pieces);
  const pts: TrackPoint[] = [];
  let s = 0;
  pieces.forEach((piece, index) => {
    const st = states[index] as TrackState;
    const d = PIECES[piece.kind];
    const F = FORWARD[st.dir] as readonly [number, number];
    const R = RIGHT[st.dir] as readonly [number, number];
    // Entry point: middle of the entry tile's back edge.
    const ex = st.tx + 0.5 - F[0] * 0.5;
    const ez = st.ty + 0.5 - F[1] * 0.5;
    for (let i = index === 0 ? 0 : 1; i <= d.samples; i++) {
      const l = d.sample(i / d.samples);
      const x = ex + F[0] * l.f + R[0] * l.r;
      const z = ez + F[1] * l.f + R[1] * l.r;
      const y = (st.h + l.u) * HEIGHT_STEP;
      // Direction of travel in world units.
      let tx = F[0] * l.df + R[0] * l.dr;
      let tz = F[1] * l.df + R[1] * l.dr;
      let ty = l.du * HEIGHT_STEP;
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      // Rider's right: horizontal and perpendicular to travel, except in loops.
      let rx: number, ry: number, rz: number;
      if (l.loopAngle !== undefined) {
        rx = R[0]; ry = 0; rz = R[1];
      } else {
        const hl = Math.hypot(tx, tz) || 1;
        rx = -tz / hl; ry = 0; rz = tx / hl;
      }
      // up = right x tangent
      let ux = ry * tz - rz * ty;
      let uy = rz * tx - rx * tz;
      let uz = rx * ty - ry * tx;
      if (l.roll) {
        // Rotate up around the tangent by roll (towards the inside of the turn).
        const c = Math.cos(l.roll);
        const sn = Math.sin(l.roll);
        ux = ux * c + rx * sn;
        uy = uy * c + ry * sn;
        uz = uz * c + rz * sn;
      }
      const prev = pts[pts.length - 1];
      if (prev) s += Math.hypot(x - prev.x, y - prev.y, z - prev.z);
      pts.push({
        x, y, z, tx, ty, tz, ux, uy, uz, s, piece: index,
        lift: !!piece.lift, brake: piece.kind === 'brakes', station: piece.kind === 'station',
      });
    }
  });
  return pts;
}

export function trackCost(pieces: readonly Piece[]): number {
  return pieces.reduce((sum, p) => sum + PIECES[p.kind].cost + (p.lift ? 40 : 0), 0);
}

/** Pieces in a station: the train waits on these. */
export const STATION_LENGTH = 3;
