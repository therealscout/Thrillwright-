/**
 * Ready-made coaster designs to drop onto the map for a set price. Each is an
 * out-and-back circuit built from a few blocks: a chain lift, optional
 * hairpin zig-zags at the top, a turn-around, a drop with hills or a loop on
 * the way back, brakes, and a second turn-around into the station.
 */
import { stationPieces } from './coaster';
import type { CoasterTypeId } from './coaster-types';
import type { Piece, PieceKind } from './track';

export interface PremadeSpec {
  id: string;
  name: string;
  type: CoasterTypeId;
  blurb: string;
  /** Straights before the lift. */
  lead: number;
  /** Climb pieces in the lift (each rises two height steps). */
  climb: number;
  /** Hairpin zig-zags at the top (needs tight turns). */
  zigzags: number;
  /** How the train turns round: two normal, banked or tight turns. */
  turn: 'right' | 'bank-right' | 'small-right';
  /** Straights between the two halves of each turn-around (makes the circuit wider). */
  width: number;
  /** What happens on the way back after the drop. */
  element: 'none' | 'hill' | 'big-hill' | 'two-hills' | 'loop';
}

const P = (kind: PieceKind, lift = false): Piece => (lift ? { kind, lift: true } : { kind });
const times = (n: number, make: () => Piece[]): Piece[] => Array.from({ length: n }, make).flat();
const straights = (n: number) => times(n, () => [P('straight')]);
const hill = () => [P('flat-up'), P('up-flat'), P('flat-down'), P('down-flat')];
const bigHill = () => [P('flat-up'), P('up'), P('up-flat'), P('flat-down'), P('down'), P('down-flat')];
const ELEMENTS: Record<PremadeSpec['element'], () => Piece[]> = {
  none: () => [],
  hill,
  'big-hill': bigHill,
  'two-hills': () => [...hill(), ...hill()],
  loop: () => [P('loop')],
};

/** Tiles forward each piece moves the track (turn-arounds cancel out). */
function forward(pieces: Piece[]): number {
  return pieces.reduce((n, p) => {
    if (p.kind === 'loop') return n + 3;
    if (p.kind === 'small-left' || p.kind === 'small-right') return n + 0.5;
    if (p.kind === 'left' || p.kind === 'right' || p.kind === 'bank-left' || p.kind === 'bank-right') return n;
    return n + 1;
  }, 0);
}

/** The full piece list of a premade design, station first. */
export function premadePieces(spec: PremadeSpec): Piece[] {
  const zig = [P('small-right'), P('small-left'), P('small-left'), P('small-right')];
  const out = [
    ...straights(spec.lead),
    P('flat-up', true),
    ...times(spec.climb, () => [P('up', true)]),
    P('up-flat', true),
    ...times(spec.zigzags, () => zig),
  ];
  const turn = [P(spec.turn), ...straights(spec.width), P(spec.turn)];
  const body = [P('flat-down'), ...times(spec.climb, () => [P('down')]), P('down-flat'), ...ELEMENTS[spec.element]()];
  // The way back is as long as the way out (station included), finishing on the brakes.
  const filler = 3 + forward(out) - forward(body) - 1;
  if (filler < 0) throw new Error(`Premade ${spec.id} doesn't close`);
  return [...stationPieces(), ...out, ...turn, ...body, ...straights(filler), P('brakes'), ...turn];
}

export const PREMADES: PremadeSpec[] = [
  { id: 'loop-runner', name: 'Loop Runner', type: 'steel-coaster', blurb: 'A lift, a big drop and a vertical loop. A crowd favourite.', lead: 1, climb: 3, zigzags: 0, turn: 'bank-right', width: 0, element: 'loop' },
  { id: 'camelback', name: 'Camelback', type: 'steel-coaster', blurb: 'A family steel coaster with a floaty hill on the way home.', lead: 4, climb: 2, zigzags: 0, turn: 'right', width: 0, element: 'big-hill' },
  { id: 'grand-looper', name: 'Grand Looper', type: 'steel-coaster', blurb: 'Taller and wider, with a long run into the loop.', lead: 5, climb: 4, zigzags: 0, turn: 'bank-right', width: 3, element: 'loop' },
  { id: 'timber-hop', name: 'Timber Hop', type: 'wooden-coaster', blurb: 'A small wooden starter with one bouncy hill.', lead: 2, climb: 1, zigzags: 0, turn: 'right', width: 0, element: 'hill' },
  { id: 'old-faithful', name: 'Old Faithful', type: 'wooden-coaster', blurb: 'Rattling banked turns and a big airtime hill.', lead: 4, climb: 2, zigzags: 0, turn: 'bank-right', width: 1, element: 'big-hill' },
  { id: 'thunder-barn', name: 'Thunder Barn', type: 'wooden-coaster', blurb: 'A tall timber giant with a long, fast drop.', lead: 5, climb: 5, zigzags: 0, turn: 'bank-right', width: 3, element: 'none' },
  { id: 'dangle', name: 'Dangle', type: 'inverted-coaster', blurb: 'Feet in the air over one big swooping drop.', lead: 0, climb: 3, zigzags: 0, turn: 'bank-right', width: 0, element: 'none' },
  { id: 'bat-wing', name: 'Bat Wing', type: 'inverted-coaster', blurb: 'A hanging coaster with a loop. Compact and wild.', lead: 1, climb: 3, zigzags: 0, turn: 'bank-right', width: 0, element: 'loop' },
  { id: 'sky-serpent', name: 'Sky Serpent', type: 'inverted-coaster', blurb: 'A long, wide swoop through a loop.', lead: 5, climb: 3, zigzags: 0, turn: 'bank-right', width: 3, element: 'loop' },
  { id: 'cheese-dash', name: 'Cheese Dash', type: 'wild-mouse', blurb: 'One zig-zag of hairpins and a hop on the way down.', lead: 0, climb: 1, zigzags: 1, turn: 'small-right', width: 1, element: 'hill' },
  { id: 'mouse-trap', name: 'Mouse Trap', type: 'wild-mouse', blurb: 'Two zig-zags up top, then a big hill.', lead: 0, climb: 2, zigzags: 2, turn: 'small-right', width: 1, element: 'big-hill' },
  { id: 'whisker-whirl', name: 'Whisker Whirl', type: 'wild-mouse', blurb: 'Hairpins first, then two quick hills.', lead: 2, climb: 1, zigzags: 2, turn: 'small-right', width: 1, element: 'two-hills' },
  { id: 'ladybird', name: 'Ladybird', type: 'junior-coaster', blurb: 'The smallest coaster in the park. Perfect for a first ride.', lead: 2, climb: 1, zigzags: 0, turn: 'small-right', width: 0, element: 'hill' },
  { id: 'puddle-jumper', name: 'Puddle Jumper', type: 'junior-coaster', blurb: 'Little hairpins and a hop.', lead: 0, climb: 1, zigzags: 2, turn: 'small-right', width: 1, element: 'hill' },
  { id: 'caterpillar', name: 'Caterpillar', type: 'junior-coaster', blurb: 'A longer gentle ride with two bumps.', lead: 2, climb: 1, zigzags: 2, turn: 'small-right', width: 1, element: 'two-hills' },
];

export function premadeById(id: string): PremadeSpec | undefined {
  return PREMADES.find((p) => p.id === id);
}

export function premadesFor(type: CoasterTypeId): PremadeSpec[] {
  return PREMADES.filter((p) => p.type === type);
}
