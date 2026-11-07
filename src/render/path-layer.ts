/**
 * Things on the footpaths: bins and benches (from the park) and litter and
 * sick (from the simulation), all drawn with instancing.
 */
import * as THREE from 'three';
import { PathItem, tileIndex, tileNoise, type Terrain } from '../core/terrain';
import { palette } from './palette';
import { tileCentreY } from './terrain-mesh';

const SIDES: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

function lambert(color: string): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

/** An instanced mesh that grows when it needs more room. */
class Pool {
  mesh: THREE.InstancedMesh;
  constructor(private readonly group: THREE.Group, private readonly geometry: THREE.BufferGeometry, private readonly material: THREE.Material, private capacity = 64, private readonly shadow = true) {
    this.mesh = this.make();
  }

  set(matrices: THREE.Matrix4[], colors?: THREE.Color[]): void {
    if (matrices.length > this.capacity) {
      this.group.remove(this.mesh);
      this.mesh.dispose();
      while (this.capacity < matrices.length) this.capacity *= 2;
      this.mesh = this.make();
    }
    matrices.forEach((m, i) => {
      this.mesh.setMatrixAt(i, m);
      if (colors) this.mesh.setColorAt(i, colors[i] as THREE.Color);
    });
    this.mesh.count = matrices.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private make(): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
    m.count = 0;
    m.castShadow = this.shadow;
    m.receiveShadow = true;
    m.frustumCulled = false;
    this.group.add(m);
    return m;
  }
}

function binGeometry(): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(0.07, 0.06, 0.2, 8).translate(0, 0.1, 0);
}

function benchGeometry(): THREE.BufferGeometry {
  const seat = new THREE.BoxGeometry(0.42, 0.03, 0.12).translate(0, 0.11, 0);
  const back = new THREE.BoxGeometry(0.42, 0.1, 0.025).translate(0, 0.19, -0.06);
  const legL = new THREE.BoxGeometry(0.03, 0.11, 0.1).translate(-0.18, 0.055, 0);
  const legR = new THREE.BoxGeometry(0.03, 0.11, 0.1).translate(0.18, 0.055, 0);
  const parts = [seat, back, legL, legR].map((g) => g.toNonIndexed());
  const merged = new THREE.BufferGeometry();
  const pos: number[] = [];
  for (const p of parts) pos.push(...(p.getAttribute('position').array as Float32Array));
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  merged.computeVertexNormals();
  return merged;
}

const LITTER_COLOURS = ['#ffffff', '#ffd166', '#ef476f', '#8ecae6'].map((c) => new THREE.Color(c));

export class PathLayer {
  readonly group = new THREE.Group();
  private readonly bins: Pool;
  private readonly benches: Pool;
  private readonly litter: Pool;
  private readonly vomit: Pool;
  private readonly rails: Pool;
  private readonly posts: Pool;
  private dirtVersion = -1;

  constructor() {
    this.bins = new Pool(this.group, binGeometry(), lambert('#5c6b7a'));
    this.benches = new Pool(this.group, benchGeometry(), lambert('#9c6b3f'));
    this.litter = new Pool(this.group, new THREE.BoxGeometry(0.05, 0.012, 0.035), new THREE.MeshLambertMaterial({ color: '#ffffff' }), 256, false);
    this.rails = new Pool(this.group, new THREE.BoxGeometry(1, 0.035, 0.035), lambert(palette.queueRail), 128);
    this.posts = new Pool(this.group, new THREE.BoxGeometry(0.045, 0.26, 0.045).translate(0, 0.13, 0), lambert('#2b2d42'), 128);
    this.vomit = new Pool(this.group, new THREE.CircleGeometry(0.11, 7).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#9bb53a' }), 64, false);
  }

  /** Redraw bins and benches from the terrain. */
  syncItems(t: Terrain): void {
    const bins: THREE.Matrix4[] = [];
    const benches: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    for (let ty = 0; ty < t.height; ty++) {
      for (let tx = 0; tx < t.width; tx++) {
        const k = tileIndex(t, tx, ty);
        const item = t.items[k];
        if (!item || !t.paths[k]) continue;
        const y = tileCentreY(t, tx, ty) + 0.04;
        // Stand at the edge of the tile, on a side without a path if there is one.
        let side = 0;
        for (let s = 0; s < 4; s++) {
          const [dx, dy] = SIDES[s] as readonly [number, number];
          const nx = tx + dx, ny = ty + dy;
          const open = nx < 0 || ny < 0 || nx >= t.width || ny >= t.height || !t.paths[tileIndex(t, nx, ny)];
          if (open) { side = s; break; }
        }
        const [sx, sy] = SIDES[side] as readonly [number, number];
        if (item === PathItem.Bin) {
          const pos = new THREE.Vector3(tx + 0.5 + sx * 0.4 + sy * 0.3, y, ty + 0.5 + sy * 0.4 - sx * 0.3);
          bins.push(new THREE.Matrix4().compose(pos, q.identity(), one));
        } else if (item === PathItem.Bench) {
          const pos = new THREE.Vector3(tx + 0.5 + sx * 0.38, y, ty + 0.5 + sy * 0.38);
          // Face the middle of the path: the bench's back goes on the outside.
          const rot = new THREE.Quaternion().setFromAxisAngle(up, Math.atan2(-sx, -sy));
          benches.push(new THREE.Matrix4().compose(pos, rot, one));
        }
      }
    }
    this.bins.set(bins);
    this.benches.set(benches);
    this.syncQueueRails(t);
  }

  /** Railings along queue lines, open where they meet a path or the ride. */
  private syncQueueRails(t: Terrain): void {
    const rails: THREE.Matrix4[] = [];
    const posts: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (let ty = 0; ty < t.height; ty++) {
      for (let tx = 0; tx < t.width; tx++) {
        if (t.paths[tileIndex(t, tx, ty)] !== 2) continue;
        const y = tileCentreY(t, tx, ty) + 0.04;
        for (let s = 0; s < 4; s++) {
          const [dx, dy] = SIDES[s] as readonly [number, number];
          const nx = tx + dx, ny = ty + dy;
          const inside = nx >= 0 && ny >= 0 && nx < t.width && ny < t.height;
          const n = inside ? tileIndex(t, nx, ny) : -1;
          if (n >= 0 && (t.paths[n] || t.blocked[n])) continue;
          // A rail along this edge, just inside the tile.
          const cx = tx + 0.5 + dx * 0.44;
          const cz = ty + 0.5 + dy * 0.44;
          q.setFromAxisAngle(up, dx !== 0 ? Math.PI / 2 : 0);
          rails.push(new THREE.Matrix4().compose(new THREE.Vector3(cx, y + 0.22, cz), q, new THREE.Vector3(0.9, 1, 1)));
          for (const e of [-0.44, 0.44]) {
            posts.push(new THREE.Matrix4().makeTranslation(cx + (dy !== 0 ? e : 0), y, cz + (dx !== 0 ? e : 0)));
          }
        }
      }
    }
    this.rails.set(rails);
    this.posts.set(posts);
  }

  /** Redraw litter and sick when the simulation sends a new picture. */
  syncDirt(t: Terrain, dirt: { litter: Uint8Array; vomit: Uint8Array; version: number } | null): void {
    if (!dirt || dirt.version === this.dirtVersion || dirt.litter.length !== t.width * t.height) return;
    this.dirtVersion = dirt.version;
    const bits: THREE.Matrix4[] = [];
    const colours: THREE.Color[] = [];
    const blobs: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (let k = 0; k < dirt.litter.length; k++) {
      const l = dirt.litter[k] as number;
      const v = dirt.vomit[k] as number;
      if (!l && !v) continue;
      const tx = k % t.width;
      const ty = Math.floor(k / t.width);
      const y = tileCentreY(t, tx, ty) + 0.05;
      for (let n = 0; n < Math.min(l, 6); n++) {
        const r1 = tileNoise(tx * 7 + n, ty * 13 + n);
        const r2 = tileNoise(ty * 11 + n * 3, tx * 5 + n);
        q.setFromAxisAngle(up, r1 * Math.PI);
        bits.push(new THREE.Matrix4().compose(new THREE.Vector3(tx + 0.15 + r1 * 0.7, y, ty + 0.15 + r2 * 0.7), q, new THREE.Vector3(1, 1, 1)));
        colours.push(LITTER_COLOURS[n % LITTER_COLOURS.length] as THREE.Color);
      }
      if (v) {
        const r = tileNoise(tx + 3, ty + 9);
        const s = Math.min(1.6, 0.8 + v * 0.2);
        blobs.push(new THREE.Matrix4().compose(new THREE.Vector3(tx + 0.3 + r * 0.4, y - 0.005, ty + 0.6 - r * 0.3), q.identity(), new THREE.Vector3(s, 1, s * 0.8)));
      }
    }
    this.litter.set(bits, colours);
    this.vomit.set(blobs);
  }
}
