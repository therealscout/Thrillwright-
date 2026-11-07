import { describe, expect, it } from 'vitest';
import {
  HEIGHT_STEP,
  clamp,
  inBounds,
  isoCameraOffset,
  lerpAngle,
  nextRotation,
  rotationYaw,
  tileToWorld,
  worldToTile,
} from './grid';

describe('tile and world conversion', () => {
  it('places a tile at its centre', () => {
    expect(tileToWorld(3, 5, 2)).toEqual({ x: 3.5, y: 2 * HEIGHT_STEP, z: 5.5 });
  });

  it('round-trips through worldToTile', () => {
    const w = tileToWorld(7, 11);
    expect(worldToTile(w.x, w.z)).toEqual({ tx: 7, ty: 11 });
  });

  it('floors negative coordinates', () => {
    expect(worldToTile(-0.1, -2.5)).toEqual({ tx: -1, ty: -3 });
  });

  it('checks bounds', () => {
    expect(inBounds(10, 10, 0, 9)).toBe(true);
    expect(inBounds(10, 10, 10, 0)).toBe(false);
    expect(inBounds(10, 10, -1, 0)).toBe(false);
  });
});

describe('camera rotation', () => {
  it('wraps in both directions', () => {
    expect(nextRotation(3, 1)).toBe(0);
    expect(nextRotation(0, -1)).toBe(3);
  });

  it('uses diagonal yaws 90 degrees apart', () => {
    expect(rotationYaw(0)).toBeCloseTo(Math.PI / 4);
    expect(rotationYaw(1) - rotationYaw(0)).toBeCloseTo(Math.PI / 2);
  });

  it('keeps the camera at the requested distance', () => {
    const o = isoCameraOffset(rotationYaw(2), 50);
    expect(Math.hypot(o.x, o.y, o.z)).toBeCloseTo(50);
    expect(o.y).toBeGreaterThan(0);
  });

  it('interpolates angles along the short way round', () => {
    const from = Math.PI * 1.9;
    const to = Math.PI * 0.1;
    const mid = lerpAngle(from, to, 0.5);
    expect(Math.cos(mid)).toBeCloseTo(1);
  });

  it('clamps values', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });
});
