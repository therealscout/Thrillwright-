/**
 * Builds Three.js geometry from terrain data. Everything here is rebuilt from
 * scratch when the terrain changes; a 96 x 96 map rebuilds in a few ms.
 */
import * as THREE from 'three';
import { HEIGHT_STEP, type TileCoord } from '../core/grid';
import {
  Surface,
  cornerHeight,
  tileCorners,
  tileIndex,
  tileNoise,
  type Terrain,
} from '../core/terrain';
import { palette } from './palette';

const SKIRT_DEPTH = -2;

type Corners = [number, number, number, number];

/** World-space corner positions of a tile, NW, NE, SE, SW. */
function cornerPoints(tx: number, ty: number, h: Corners, lift = 0): Array<[number, number, number]> {
  return [
    [tx, h[0] * HEIGHT_STEP + lift, ty],
    [tx + 1, h[1] * HEIGHT_STEP + lift, ty],
    [tx + 1, h[2] * HEIGHT_STEP + lift, ty + 1],
    [tx, h[3] * HEIGHT_STEP + lift, ty + 1],
  ];
}

/**
 * Two triangles per tile. The split runs along the diagonal whose corners
 * match, so ridges and valleys look right.
 */
function tileOrder(h: Corners): number[] {
  return h[1] === h[3] && h[0] !== h[2] ? [0, 3, 1, 1, 3, 2] : [0, 3, 2, 0, 2, 1];
}

function pushTile(out: number[], p: Array<[number, number, number]>, h: Corners): void {
  for (const i of tileOrder(h)) out.push(...(p[i] as [number, number, number]));
}

function pushColor(out: number[], color: THREE.Color, vertices: number): void {
  for (let i = 0; i < vertices; i++) out.push(color.r, color.g, color.b);
}

/** Ground surface. Faces 2*tile and 2*tile+1 belong to tile index `tile`, for picking. */
export function buildTerrainGeometry(t: Terrain): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const color = new THREE.Color();
  const unowned = new THREE.Color(palette.unowned);
  for (let ty = 0; ty < t.height; ty++) {
    for (let tx = 0; tx < t.width; tx++) {
      const k = tileIndex(t, tx, ty);
      const h = tileCorners(t, tx, ty);
      pushTile(positions, cornerPoints(tx, ty, h), h);
      const surface = t.surfaces[k];
      const water = t.water[k] as number;
      const base = surface === Surface.Sand ? palette.sand : surface === Surface.Dirt ? palette.dirt : palette.grass;
      // Each corner below the water line takes the lake-bed colour, so the bank shades into the water.
      const corner = h.map((c) => {
        color.set(water > c ? palette.lakeBed : base).offsetHSL(0, 0, (tileNoise(tx, ty) - 0.5) * 0.04);
        if (!t.owned[k]) color.lerp(unowned, 0.35);
        return color.clone();
      });
      for (const i of tileOrder(h)) {
        const c = corner[i] as THREE.Color;
        colors.push(c.r, c.g, c.b);
      }
    }
  }

  // Skirt walls around the map edge, so the world reads as a solid block.
  color.set(palette.dirt);
  const wall = (ax: number, az: number, ah: number, bx: number, bz: number, bh: number) => {
    const a = ah * HEIGHT_STEP;
    const b = bh * HEIGHT_STEP;
    positions.push(ax, a, az, bx, SKIRT_DEPTH, bz, bx, b, bz, ax, a, az, ax, SKIRT_DEPTH, az, bx, SKIRT_DEPTH, bz);
    pushColor(colors, color, 6);
  };
  for (let x = 0; x < t.width; x++) {
    wall(x + 1, 0, cornerHeight(t, x + 1, 0), x, 0, cornerHeight(t, x, 0));
    wall(x, t.height, cornerHeight(t, x, t.height), x + 1, t.height, cornerHeight(t, x + 1, t.height));
  }
  for (let y = 0; y < t.height; y++) {
    wall(0, y, cornerHeight(t, 0, y), 0, y + 1, cornerHeight(t, 0, y + 1));
    wall(t.width, y + 1, cornerHeight(t, t.width, y + 1), t.width, y, cornerHeight(t, t.width, y));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Tile index under a picked terrain face, or null for the edge walls. */
export function tileFromFace(t: Terrain, faceIndex: number): TileCoord | null {
  const tile = Math.floor(faceIndex / 2);
  if (tile >= t.width * t.height) return null;
  return { tx: tile % t.width, ty: Math.floor(tile / t.width) };
}

export function buildGridGeometry(t: Terrain): THREE.BufferGeometry {
  const points: number[] = [];
  const lift = 0.01;
  const y = (cx: number, cy: number) => cornerHeight(t, cx, cy) * HEIGHT_STEP + lift;
  for (let cy = 0; cy <= t.height; cy++) {
    for (let cx = 0; cx < t.width; cx++) points.push(cx, y(cx, cy), cy, cx + 1, y(cx + 1, cy), cy);
  }
  for (let cx = 0; cx <= t.width; cx++) {
    for (let cy = 0; cy < t.height; cy++) points.push(cx, y(cx, cy), cy, cx, y(cx, cy + 1), cy + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

/** Path tiles: a slab that follows the ground, with a darker kerb where it meets grass. */
export function buildPathGeometry(t: Terrain): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const top = new THREE.Color();
  const kerb = new THREE.Color(palette.pathEdge);
  const kindAt = (x: number, y: number) => (x >= 0 && y >= 0 && x < t.width && y < t.height ? (t.paths[tileIndex(t, x, y)] as number) : 0);
  const queueTop = new THREE.Color(palette.queue);
  const inset = 0.08;
  for (let ty = 0; ty < t.height; ty++) {
    for (let tx = 0; tx < t.width; tx++) {
      const kind = kindAt(tx, ty);
      if (!kind) continue;
      // Paving joins neighbours of the same kind: queue lines read as their own lanes.
      const isPath = (x: number, y: number) => kindAt(x, y) === kind;
      const h = tileCorners(t, tx, ty);
      // Kerb: the full tile, slightly lifted.
      pushTile(positions, cornerPoints(tx, ty, h, 0.03), h);
      pushColor(colors, kerb, 6);
      // Paving: inset on sides that don't join another path.
      const x0 = tx + (isPath(tx - 1, ty) ? 0 : inset);
      const x1 = tx + 1 - (isPath(tx + 1, ty) ? 0 : inset);
      const z0 = ty + (isPath(tx, ty - 1) ? 0 : inset);
      const z1 = ty + 1 - (isPath(tx, ty + 1) ? 0 : inset);
      const at = (x: number, z: number): [number, number, number] => {
        // Bilinear height inside the tile.
        const u = x - tx;
        const v = z - ty;
        const n = h[0] + (h[1] - h[0]) * u;
        const s = h[3] + (h[2] - h[3]) * u;
        return [x, (n + (s - n) * v) * HEIGHT_STEP + 0.045, z];
      };
      const p = [at(x0, z0), at(x1, z0), at(x1, z1), at(x0, z1)];
      pushTile(positions, p, h);
      if (kind === 2) top.copy(queueTop).offsetHSL(0, 0, (tileNoise(tx, ty) - 0.5) * 0.03);
      else top.set(palette.path).offsetHSL(0, 0, (tileNoise(tx, ty) - 0.5) * 0.03);
      pushColor(colors, top, 6);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Highlight for the tiles under the current brush. */
export function buildBrushGeometry(t: Terrain, tiles: TileCoord[]): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const { tx, ty } of tiles) {
    const h = tileCorners(t, tx, ty);
    pushTile(positions, cornerPoints(tx, ty, h, 0.06), h);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

/** Average height of a tile's corners, in world units. */
export function tileCentreY(t: Terrain, tx: number, ty: number): number {
  const h = tileCorners(t, tx, ty);
  return ((h[0] + h[1] + h[2] + h[3]) / 4) * HEIGHT_STEP;
}
