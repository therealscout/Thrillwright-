import { describe, expect, it } from 'vitest';
import {
  checkDesign,
  checkEntrance,
  checkPiece,
  coasterEntrance,
  endState,
  isComplete,
  sampleLayout,
  slopePiece,
  stationPieces,
  TRACK_CLEARANCE,
  uniqueTiles,
  type CoasterDesign,
} from './coaster';
import { runTest, trainPosition } from './coaster-physics';
import { BASE_HEIGHT, cornerIndex, createTerrain, tileIndex, type Terrain } from './terrain';
import type { TrackState } from './track';

function owned(w = 40, h = 20): Terrain {
  const t = createTerrain(w, h);
  t.owned.fill(1);
  return t;
}

const start: TrackState = { tx: 10, ty: 5, h: BASE_HEIGHT, dir: 1, slope: 0 };
const sample = (): CoasterDesign => ({ start, pieces: sampleLayout() });

describe('coaster placement', () => {
  it('the sample layout is a valid closed circuit', () => {
    const t = owned();
    const d = sample();
    expect(isComplete(d)).toBe(true);
    expect(checkDesign(t, d)).toEqual({ ok: true });
    // 13 x 4 area, with a little overlap where the track loops back.
    const tiles = uniqueTiles(d);
    const xs = tiles.map((u) => u.tx);
    const ys = tiles.map((u) => u.ty);
    expect(Math.max(...xs) - Math.min(...xs) + 1).toBe(13);
    expect(Math.max(...ys) - Math.min(...ys) + 1).toBe(4);
  });

  it('a station alone is not a complete circuit', () => {
    expect(isComplete({ start, pieces: stationPieces() })).toBe(false);
  });

  it('refuses land the park does not own', () => {
    const t = owned();
    t.owned[tileIndex(t, 11, 5)] = 0;
    expect(checkPiece(t, { start, pieces: [] }, start, 'station').ok).toBe(true);
    const r = checkDesign(t, { start, pieces: stationPieces() });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/own/);
  });

  it('keeps track out of the ground and the station on flat land', () => {
    const t = owned();
    // A bump under the third station tile.
    t.corners[cornerIndex(t, 13, 5)] = BASE_HEIGHT + 1;
    const r = checkDesign(t, { start, pieces: stationPieces() });
    expect(r.ok).toBe(false);
    // Track that tries to dive below ground level.
    const low = { start, pieces: [...stationPieces()] };
    const s = endState(low);
    expect(checkPiece(owned(), low, s, 'flat-down').reason).toMatch(/ground/);
  });

  it('needs headroom over paths', () => {
    const t = owned();
    const d = { start, pieces: [...stationPieces(), { kind: 'straight' as const }] };
    const s = endState(d);
    t.paths[tileIndex(t, s.tx, s.ty)] = 1;
    expect(checkPiece(t, d, s, 'straight').reason).toMatch(/headroom/);
    const high = { ...s, h: BASE_HEIGHT + TRACK_CLEARANCE };
    expect(checkPiece(t, d, high, 'straight').ok).toBe(true);
  });

  it('stops the track running into itself', () => {
    const t = owned();
    const d: CoasterDesign = { start, pieces: [...stationPieces(), { kind: 'right' }, { kind: 'right' }, { kind: 'right' }, { kind: 'straight' }] };
    expect(checkDesign(t, d)).toEqual({ ok: true });
    // The next straight would run onto the first station tile.
    const s = endState(d);
    expect(s).toMatchObject({ tx: 11, ty: 5, dir: 0 });
    expect(checkPiece(t, d, s, 'straight').reason).toMatch(/itself/);
    // High enough above it, crossing is fine.
    expect(checkPiece(t, d, { ...s, h: s.h + TRACK_CLEARANCE }, 'straight').ok).toBe(true);
  });

  it('puts the entrance beside the middle of the station', () => {
    const d = sample();
    // Station runs east from (10,5); right of east is south.
    expect(coasterEntrance(d, 1)).toEqual({ tx: 11, ty: 6 });
    expect(coasterEntrance(d, -1)).toEqual({ tx: 11, ty: 4 });
    const t = owned();
    t.paths[tileIndex(t, 11, 4)] = 1;
    expect(checkEntrance(t, d, -1)).toEqual({ ok: true, connected: true });
    // The sample track runs back past the right-hand side.
    expect(checkEntrance(t, d, 1).ok).toBe(true);
  });

  it('picks slope transitions automatically', () => {
    const flat = start;
    expect(slopePiece(flat, 'up')).toBe('flat-up');
    expect(slopePiece({ ...flat, slope: 1 }, 'up')).toBe('up');
    expect(slopePiece({ ...flat, slope: 1 }, 'level')).toBe('up-flat');
    expect(slopePiece({ ...flat, slope: 1 }, 'down')).toBeNull();
    expect(slopePiece({ ...flat, slope: -1 }, 'level')).toBe('down-flat');
    expect(slopePiece(flat, 'level')).toBeNull();
  });
});

describe('coaster test run', () => {
  it('runs the sample layout and rates it', () => {
    const run = runTest(sample());
    expect(run.ok).toBe(true);
    const r = run.ratings!;
    expect(r.inversions).toBe(1);
    expect(r.drops).toBeGreaterThanOrEqual(1);
    expect(r.maxSpeed).toBeGreaterThan(10);
    expect(r.maxPositiveG).toBeGreaterThan(2);
    expect(r.excitement).toBeGreaterThan(3);
    expect(r.excitement).toBeLessThan(9);
    expect(r.intensity).toBeGreaterThan(r.nausea);
    expect(r.duration).toBeGreaterThan(10);
  });

  it('the train ends where it started, stopped in the station', () => {
    const run = runTest(sample());
    const tl = run.timeline;
    const total = run.points.at(-1)!.s;
    expect(tl.at(-1)! - tl[0]!).toBeCloseTo(total, 1);
    for (let i = 1; i < tl.length; i++) expect(tl[i]!).toBeGreaterThanOrEqual(tl[i - 1]!);
    expect(trainPosition(tl, 0)).toBe(tl[0]);
    expect(trainPosition(tl, 1e6)).toBe(tl.at(-1));
  });

  it('a hill without a chain lift stalls', () => {
    const pieces = sampleLayout().map((p) => ({ kind: p.kind }));
    const run = runTest({ start, pieces });
    expect(run.ok).toBe(false);
    expect(run.reason).toMatch(/stalled/);
  });

  it('a flat circuit with no hill runs out of speed', () => {
    const r = (): { kind: 'right' } => ({ kind: 'right' });
    const st = (): { kind: 'straight' } => ({ kind: 'straight' });
    const loop: CoasterDesign = { start, pieces: [...stationPieces(), r(), r(), st(), st(), st(), r(), r()] };
    expect(isComplete(loop)).toBe(true);
    const run = runTest(loop);
    expect(run.ok).toBe(false);
    expect(run.reason).toMatch(/stalled/);
  });
});
