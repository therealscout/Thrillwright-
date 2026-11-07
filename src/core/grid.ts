/**
 * Grid and camera math shared by the renderer and (later) the simulation.
 * Pure functions only, so they are easy to unit test.
 */

/** World units per tile edge. */
export const TILE_SIZE = 1;

/** World units per terrain height step. */
export const HEIGHT_STEP = 0.25;

/** The four classic view directions, in 90 degree steps. */
export type Rotation = 0 | 1 | 2 | 3;

export interface TileCoord {
  tx: number;
  ty: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Centre of a tile in world space. Tile x maps to world x, tile y maps to world z. */
export function tileToWorld(tx: number, ty: number, height = 0): Vec3 {
  return {
    x: (tx + 0.5) * TILE_SIZE,
    y: height * HEIGHT_STEP,
    z: (ty + 0.5) * TILE_SIZE,
  };
}

/** The tile containing a world-space point on the ground plane. */
export function worldToTile(x: number, z: number): TileCoord {
  return { tx: Math.floor(x / TILE_SIZE), ty: Math.floor(z / TILE_SIZE) };
}

export function inBounds(width: number, height: number, tx: number, ty: number): boolean {
  return tx >= 0 && ty >= 0 && tx < width && ty < height;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Step the view rotation clockwise (+1) or counter-clockwise (-1). */
export function nextRotation(rotation: Rotation, direction: 1 | -1): Rotation {
  return (((rotation + direction) % 4) + 4) % 4 as Rotation;
}

/** Camera yaw for a rotation: the diagonal views of a classic isometric game. */
export function rotationYaw(rotation: Rotation): number {
  return Math.PI / 4 + (rotation * Math.PI) / 2;
}

/** Camera elevation above the ground plane, in radians (30 degrees). */
export const CAMERA_ELEVATION = Math.PI / 6;

/** Offset from the look-at target to the camera for a given yaw. */
export function isoCameraOffset(yaw: number, distance: number): Vec3 {
  const horizontal = Math.cos(CAMERA_ELEVATION) * distance;
  return {
    x: Math.sin(yaw) * horizontal,
    y: Math.sin(CAMERA_ELEVATION) * distance,
    z: Math.cos(yaw) * horizontal,
  };
}

/** Interpolate between two angles along the shortest arc. */
export function lerpAngle(from: number, to: number, t: number): number {
  const full = Math.PI * 2;
  let delta = (to - from) % full;
  if (delta > Math.PI) delta -= full;
  if (delta < -Math.PI) delta += full;
  return from + delta * t;
}
