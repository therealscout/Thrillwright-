import { describe, expect, it } from 'vitest';
import { canFollow, layout, nextState, pieceTiles, sameState, sampleTrack, type Piece, type TrackState } from './track';

const start: TrackState = { tx: 10, ty: 10, h: 4, dir: 1, slope: 0 };

describe('track pieces', () => {
  it('moves straight pieces one tile forward', () => {
    expect(nextState(start, 'straight')).toMatchObject({ tx: 11, ty: 10, dir: 1 });
  });

  it('turns right and left through a 2x2 block', () => {
    const r = nextState(start, 'right');
    expect(r).toMatchObject({ tx: 11, ty: 12, dir: 2 });
    const l = nextState(start, 'left');
    expect(l).toMatchObject({ tx: 11, ty: 8, dir: 0 });
    expect(pieceTiles(start, 'right')).toHaveLength(4);
  });

  it('climbs and levels off with matching slopes', () => {
    expect(canFollow(start, 'up')).toBe(false);
    const a = nextState(start, 'flat-up');
    expect(a).toMatchObject({ h: 5, slope: 1 });
    expect(canFollow(a, 'up')).toBe(true);
    const b = nextState(nextState(a, 'up'), 'up-flat');
    expect(b).toMatchObject({ h: 8, slope: 0 });
  });

  it('four right turns make a closed square', () => {
    const pieces: Piece[] = [{ kind: 'right' }, { kind: 'right' }, { kind: 'right' }, { kind: 'right' }];
    expect(sameState(layout(start, pieces).end, start)).toBe(true);
  });

  it('samples a continuous track with unit tangents and upright riders on the flat', () => {
    const pts = sampleTrack(start, [{ kind: 'straight' }, { kind: 'right' }, { kind: 'flat-up' }]);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)).toBeLessThan(0.5);
      expect(Math.hypot(b.tx, b.ty, b.tz)).toBeCloseTo(1);
    }
    expect(pts[0]!.uy).toBeCloseTo(1);
  });

  it('turns riders upside down at the top of a loop', () => {
    const pts = sampleTrack(start, [{ kind: 'loop' }]);
    const top = pts.reduce((a, b) => (b.y > a.y ? b : a));
    expect(top.uy).toBeLessThan(-0.9);
    expect(pts.at(-1)!.uy).toBeCloseTo(1);
    expect(nextState(start, 'loop')).toMatchObject({ tx: 13, ty: 10 });
  });
});
