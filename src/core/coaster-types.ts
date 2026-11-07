/**
 * The kinds of roller coaster a park can build. They share the track system
 * and the test run, but each has its own pieces, trains, look and feel.
 * All names are original to Thrillwright.
 */
import type { CoasterRatings } from './coaster';
import type { PieceKind } from './track';

export type CoasterTypeId = 'steel-coaster' | 'wooden-coaster' | 'inverted-coaster' | 'wild-mouse' | 'junior-coaster';

export type SupportStyle = 'steel' | 'wood' | 'inverted';

export interface CoasterType {
  id: CoasterTypeId;
  name: string;
  /** Pieces this kind of track can use (the station is always allowed). */
  pieces: readonly PieceKind[];
  /** Highest the track may climb, in height steps. */
  maxHeight: number;
  /** Cars per train and seats per car. */
  cars: number;
  seatsPerCar: number;
  /** Track piece prices are multiplied by this. */
  costFactor: number;
  supports: SupportStyle;
  colours: { rail: string; spine: string; support: string; tie: string; cars: [string, string]; trim: string };
  /** Turn the shared test-run ratings into this kind of ride's. */
  rate(r: CoasterRatings, pieces: readonly { kind: PieceKind }[]): Pick<CoasterRatings, 'excitement' | 'intensity' | 'nausea'>;
}

const TURNS: PieceKind[] = ['left', 'right'];
const BANKS: PieceKind[] = ['bank-left', 'bank-right'];
const SMALL: PieceKind[] = ['small-left', 'small-right'];
const SLOPES: PieceKind[] = ['flat-up', 'up', 'up-flat', 'flat-down', 'down', 'down-flat'];
const BASIC: PieceKind[] = ['station', 'straight', 'brakes', ...TURNS, ...SLOPES];

const r2 = (x: number) => Math.round(Math.max(0, x) * 100) / 100;
const count = (pieces: readonly { kind: PieceKind }[], kinds: PieceKind[]) => pieces.filter((p) => kinds.includes(p.kind)).length;

export const COASTER_TYPES: Record<CoasterTypeId, CoasterType> = {
  'steel-coaster': {
    id: 'steel-coaster',
    name: 'Steel Coaster',
    pieces: [...BASIC, ...BANKS, 'loop'],
    maxHeight: 72,
    cars: 4,
    seatsPerCar: 4,
    costFactor: 1,
    supports: 'steel',
    colours: { rail: '#ef476f', spine: '#ffd166', support: '#e9edf2', tie: '#3d4654', cars: ['#ef476f', '#118ab2'], trim: '#ffd166' },
    rate: (r) => ({ excitement: r.excitement, intensity: r.intensity, nausea: r.nausea }),
  },
  'wooden-coaster': {
    id: 'wooden-coaster',
    name: 'Timber Twister',
    pieces: [...BASIC, ...BANKS],
    maxHeight: 56,
    cars: 4,
    seatsPerCar: 4,
    costFactor: 0.85,
    supports: 'wood',
    colours: { rail: '#8a8f99', spine: '#a8743f', support: '#c48a4f', tie: '#7a5230', cars: ['#d64933', '#e8b04b'], trim: '#3a2a1c' },
    // A rattling ride with lots of floating: a bit more thrilling and rougher than steel.
    rate: (r) => ({
      excitement: r2(r.excitement * 1.05 + 0.4 + Math.min(r.airtime, 4) * 0.3),
      intensity: r2(r.intensity + 0.5),
      nausea: r2(r.nausea * 0.9),
    }),
  },
  'inverted-coaster': {
    id: 'inverted-coaster',
    name: 'Skyhanger',
    pieces: [...BASIC, ...BANKS, 'loop'],
    maxHeight: 72,
    cars: 4,
    seatsPerCar: 4,
    costFactor: 1.3,
    supports: 'inverted',
    colours: { rail: '#3a86ff', spine: '#2b2d42', support: '#2b2d42', tie: '#1d1f2e', cars: ['#ffbe0b', '#fb5607'], trim: '#3a86ff' },
    // Feet dangling under the track: everything feels bigger.
    rate: (r) => ({ excitement: r2(r.excitement * 1.18 + 0.3), intensity: r2(r.intensity * 1.1), nausea: r2(r.nausea * 1.1) }),
  },
  'wild-mouse': {
    id: 'wild-mouse',
    name: 'Zippy Mouse',
    pieces: [...BASIC, ...SMALL],
    maxHeight: 24,
    cars: 2,
    seatsPerCar: 4,
    costFactor: 0.8,
    supports: 'steel',
    colours: { rail: '#adb5bd', spine: '#6c757d', support: '#ced4da', tie: '#495057', cars: ['#06d6a0', '#9b5de5'], trim: '#ffd166' },
    // Hairpin turns at speed: fun out of proportion to its size.
    rate: (r, pieces) => ({
      excitement: r2(r.excitement + Math.min(count(pieces, SMALL), 16) * 0.12),
      intensity: r2(r.intensity + Math.min(count(pieces, SMALL), 16) * 0.05),
      nausea: r2(r.nausea + Math.min(count(pieces, SMALL), 16) * 0.06),
    }),
  },
  'junior-coaster': {
    id: 'junior-coaster',
    name: 'Little Dipper',
    pieces: [...BASIC, ...SMALL],
    maxHeight: 12,
    cars: 3,
    seatsPerCar: 4,
    costFactor: 0.6,
    supports: 'steel',
    colours: { rail: '#06d6a0', spine: '#ffd166', support: '#f1f3f5', tie: '#3d4654', cars: ['#f15bb5', '#00bbf9'], trim: '#fee440' },
    // Gentle enough for nearly everyone.
    rate: (r) => ({ excitement: r2(r.excitement * 0.9 + 0.3), intensity: r2(r.intensity * 0.6), nausea: r2(r.nausea * 0.6) }),
  },
};

export const COASTER_TYPE_IDS = Object.keys(COASTER_TYPES) as CoasterTypeId[];

export function isCoasterType(id: string): id is CoasterTypeId {
  return id in COASTER_TYPES;
}

/** The kind of coaster, defaulting to steel for designs saved before there were others. */
export function coasterType(id: string | undefined): CoasterType {
  return COASTER_TYPES[(id && isCoasterType(id) ? id : 'steel-coaster') as CoasterTypeId];
}

export function seatsFor(id: string | undefined): number {
  const t = coasterType(id);
  return t.cars * t.seatsPerCar;
}
