/**
 * Draws roller coasters: tubular steel track with ties, support columns down
 * to the ground, a covered station, the entrance and a running train. Also
 * draws the design being edited in the coaster builder.
 */
import * as THREE from 'three';
import type { Building } from '../core/buildings';
import { COASTER_CARS, coasterEntrance, endState, type CoasterDesign } from '../core/coaster';
import { runTest, trainPosition } from '../core/coaster-physics';
import { HEIGHT_STEP } from '../core/grid';
import { SHIRTS, SKINS } from './guest-layer';
import { tileMaxHeight, type Terrain } from '../core/terrain';
import { FORWARD, sampleTrack, STATION_LENGTH, type TrackPoint } from '../core/track';
import type { BuildingStats } from '../sim/sim-core';

const GAUGE = 0.19; // half the distance between rails
const RAIL_RADIUS = 0.04;
const SPINE_RADIUS = 0.065;
const CAR_SPACING = 0.62;
/** Track is drawn this far above its nominal height so the spine clears the ground. */
const LIFT = 0.25;

export interface TrackColours {
  rail: string;
  spine: string;
  support: string;
}

const BUILT: TrackColours = { rail: '#ef476f', spine: '#ffd166', support: '#e9edf2' };
const DRAFT: TrackColours = { rail: '#ff7aa0', spine: '#ffe39a', support: '#f4f6f8' };

const matCache = new Map<string, THREE.Material>();
function mat(color: string, ghost = false): THREE.Material {
  const key = `${color}${ghost ? '-g' : ''}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: false, transparent: ghost, opacity: ghost ? 0.6 : 1, depthWrite: !ghost });
    matCache.set(key, m);
  }
  return m;
}

/** Interpolated position and frame at distance `s` along the track (wraps around). */
export function pointAt(points: readonly TrackPoint[], s: number, out = { p: new THREE.Vector3(), t: new THREE.Vector3(), u: new THREE.Vector3() }) {
  const total = (points[points.length - 1] as TrackPoint).s;
  const d = ((s % total) + total) % total;
  let lo = 0, hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((points[mid] as TrackPoint).s <= d) lo = mid;
    else hi = mid;
  }
  const a = points[lo] as TrackPoint;
  const b = points[hi] as TrackPoint;
  const f = b.s > a.s ? (d - a.s) / (b.s - a.s) : 0;
  out.p.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f + LIFT, a.z + (b.z - a.z) * f);
  out.t.set(a.tx + (b.tx - a.tx) * f, a.ty + (b.ty - a.ty) * f, a.tz + (b.tz - a.tz) * f).normalize();
  out.u.set(a.ux + (b.ux - a.ux) * f, a.uy + (b.uy - a.uy) * f, a.uz + (b.uz - a.uz) * f).normalize();
  return out;
}

/** A tube following the track at an offset in each point's (right, up) frame. */
function tube(points: readonly TrackPoint[], offRight: number, offUp: number, radius: number, sides = 6): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const t = new THREE.Vector3(), u = new THREE.Vector3(), r = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  points.forEach((p, i) => {
    t.set(p.tx, p.ty, p.tz);
    u.set(p.ux, p.uy, p.uz);
    r.crossVectors(u, t).normalize();
    c.set(p.x, p.y + LIFT, p.z).addScaledVector(r, offRight).addScaledVector(u, offUp);
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      n.copy(r).multiplyScalar(Math.cos(a)).addScaledVector(u, Math.sin(a));
      pos.push(c.x + n.x * radius, c.y + n.y * radius, c.z + n.z * radius);
      nor.push(n.x, n.y, n.z);
    }
    if (i === 0) return;
    const b0 = (i - 1) * sides;
    const b1 = i * sides;
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides;
      idx.push(b0 + k, b1 + k, b0 + k1, b0 + k1, b1 + k, b1 + k1);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

const tieGeometry = new THREE.BoxGeometry(GAUGE * 2 + 0.06, 0.035, 0.06);
const supportGeometry = new THREE.CylinderGeometry(0.05, 0.06, 1, 6).translate(0, 0.5, 0);
const footGeometry = new THREE.BoxGeometry(0.2, 0.06, 0.2);

/** Track, ties and supports for a design. */
export function buildTrack(design: CoasterDesign, terrain: Terrain, colours: TrackColours, ghost = false): { group: THREE.Group; points: TrackPoint[] } {
  const group = new THREE.Group();
  const points = sampleTrack(design.start, design.pieces);
  if (points.length < 2) return { group, points };
  const add = (geometry: THREE.BufferGeometry, color: string) => {
    const m = new THREE.Mesh(geometry, mat(color, ghost));
    m.castShadow = !ghost;
    group.add(m);
    return m;
  };
  add(tube(points, GAUGE, 0.04, RAIL_RADIUS), colours.rail);
  add(tube(points, -GAUGE, 0.04, RAIL_RADIUS), colours.rail);
  add(tube(points, 0, -0.1, SPINE_RADIUS), colours.spine);

  const total = (points[points.length - 1] as TrackPoint).s;
  const frame = { p: new THREE.Vector3(), t: new THREE.Vector3(), u: new THREE.Vector3() };
  const m4 = new THREE.Matrix4();
  const r = new THREE.Vector3();
  const ties: THREE.Matrix4[] = [];
  const supports: THREE.Matrix4[] = [];
  const feet: THREE.Matrix4[] = [];
  for (let s = 0.15; s < total; s += 0.32) {
    pointAt(points, s, frame);
    r.crossVectors(frame.u, frame.t).normalize();
    m4.makeBasis(r, frame.u, frame.t).setPosition(frame.p.x - frame.u.x * 0.04, frame.p.y - frame.u.y * 0.04, frame.p.z - frame.u.z * 0.04);
    ties.push(m4.clone());
  }
  // Support columns about every tile, from under the spine to the ground.
  for (let s = 0.5; s < total; s += 1) {
    pointAt(points, s, frame);
    const tx = Math.floor(frame.p.x);
    const ty = Math.floor(frame.p.z);
    if (tx < 0 || ty < 0 || tx >= terrain.width || ty >= terrain.height) continue;
    const ground = tileMaxHeight(terrain, tx, ty) * HEIGHT_STEP;
    // Hang from the lowest part of the track here (the bottom of a loop is lower than its top).
    const under = frame.u.y > 0 ? frame.p.y - 0.17 : frame.p.y + 0.17 * frame.u.y;
    const height = under - ground;
    if (height < 0.12 || frame.u.y < -0.2) continue;
    supports.push(new THREE.Matrix4().compose(new THREE.Vector3(frame.p.x, ground, frame.p.z), new THREE.Quaternion(), new THREE.Vector3(1, height, 1)));
    feet.push(new THREE.Matrix4().makeTranslation(frame.p.x, ground + 0.03, frame.p.z));
  }
  const instanced = (geometry: THREE.BufferGeometry, color: string, list: THREE.Matrix4[]) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geometry, mat(color, ghost), list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = !ghost;
    group.add(im);
  };
  instanced(tieGeometry, '#3d4654', ties);
  instanced(supportGeometry, colours.support, supports);
  instanced(footGeometry, '#9aa3ad', feet);
  return { group, points };
}

/** A covered platform alongside the station pieces. */
function buildStation(design: CoasterDesign, side: -1 | 1, terrain: Terrain): THREE.Group {
  const g = new THREE.Group();
  const { start } = design;
  const F = FORWARD[start.dir] as readonly [number, number];
  const y = start.h * HEIGHT_STEP;
  // Centre of the three station tiles.
  const cx = start.tx + 0.5 + F[0] * (STATION_LENGTH - 1) / 2;
  const cz = start.ty + 0.5 + F[1] * (STATION_LENGTH - 1) / 2;
  const along = F[0] !== 0;
  const len = STATION_LENGTH;
  const box = (w: number, h: number, d: number, color: string, x: number, yy: number, z: number) => {
    const m = new THREE.Mesh(along ? new THREE.BoxGeometry(w, h, d) : new THREE.BoxGeometry(d, h, w), mat(color));
    // Local x = along the station, z = across it towards the entrance side.
    const R = [-F[1], F[0]];
    m.position.set(cx + F[0] * x + (R[0] as number) * z, yy, cz + F[1] * x + (R[1] as number) * z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };
  box(len - 0.05, 0.16, 0.9, '#cfc3b4', 0, y + 0.08, 0);
  // Roof on four posts.
  for (const px of [-len / 2 + 0.15, len / 2 - 0.15]) {
    for (const pz of [-0.45, 0.45]) box(0.07, 1.2, 0.07, '#5c6b7a', px, y + 0.6, pz);
  }
  box(len + 0.1, 0.08, 1.15, '#118ab2', 0, y + 1.24, 0);
  box(len + 0.1, 0.1, 0.12, '#ffd166', 0, y + 1.17, 0.55 * side);
  // Entrance sign on the access tile.
  const a = coasterEntrance(design, side);
  if (a.tx >= 0 && a.ty >= 0 && a.tx < terrain.width && a.ty < terrain.height) {
    const ay = tileMaxHeight(terrain, a.tx, a.ty) * HEIGHT_STEP;
    const post = (dx: number, dz: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.06), mat('#5c4b3b'));
      m.position.set(a.tx + 0.5 + dx, ay + 0.4, a.ty + 0.5 + dz);
      g.add(m);
    };
    const along2 = along ? [0.4, 0] : [0, 0.4];
    post(along2[0] as number, along2[1] as number);
    post(-(along2[0] as number), -(along2[1] as number));
    const sign = new THREE.Mesh(along ? new THREE.BoxGeometry(0.9, 0.2, 0.06) : new THREE.BoxGeometry(0.06, 0.2, 0.9), mat('#ef476f'));
    sign.position.set(a.tx + 0.5, ay + 0.82, a.ty + 0.5);
    g.add(sign);
  }
  return g;
}

/** A seated rider: body, head and two arms that go up on the big moments. */
interface Rider {
  group: THREE.Group;
  shirt: THREE.Mesh;
  skin: THREE.Mesh[];
  arms: THREE.Group[];
  look: number;
}

const torsoGeometry = new THREE.BoxGeometry(0.11, 0.13, 0.08);
const headGeometry = new THREE.IcosahedronGeometry(0.058, 0);
const armGeometry = new THREE.BoxGeometry(0.035, 0.12, 0.035).translate(0, 0.06, 0);

function buildRider(): Rider {
  const group = new THREE.Group();
  group.name = 'rider';
  const shirt = new THREE.Mesh(torsoGeometry, mat(SHIRTS[0] as string));
  shirt.position.y = 0.075;
  shirt.castShadow = true;
  const head = new THREE.Mesh(headGeometry, mat(SKINS[0] as string));
  head.position.y = 0.2;
  group.add(shirt, head);
  const skin: THREE.Mesh[] = [head];
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.07, 0.12, 0);
    const arm = new THREE.Mesh(armGeometry, mat(SKINS[0] as string));
    pivot.add(arm);
    pivot.rotation.x = Math.PI * 0.85; // resting: hands down on the lap bar
    group.add(pivot);
    skin.push(arm);
    arms.push(pivot);
  }
  group.visible = false;
  return { group, shirt, skin, arms, look: -1 };
}

/** Colour a rider like the guest sitting there (same palettes as the crowd). */
function dressRider(r: Rider, look: number): void {
  if (r.look === look) return;
  r.look = look;
  r.shirt.material = mat(SHIRTS[look % SHIRTS.length] as string);
  const skin = mat(SKINS[Math.floor(look / SHIRTS.length) % SKINS.length] as string);
  for (const m of r.skin) m.material = skin;
}

/** One coaster car: a low body with two rows of two seats, facing +z. */
function buildCar(color: string, lead: boolean, riders: Rider[]): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.56), mat(color));
  body.position.y = 0.16;
  body.castShadow = true;
  g.add(body);
  for (const z of [-0.13, 0.14]) {
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.05), mat('#2b2d42'));
    back.position.set(0, 0.3, z - 0.1);
    g.add(back);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.03), mat('#ffd166'));
    bar.position.set(0, 0.33, z + 0.09);
    g.add(bar);
    for (const x of [-0.1, 0.1]) {
      const r = buildRider();
      r.group.position.set(x, 0.24, z);
      g.add(r.group);
      riders.push(r);
    }
  }
  if (lead) {
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.12), mat('#ffd166'));
    nose.position.set(0, 0.15, 0.33);
    g.add(nose);
  }
  return g;
}

interface Entry {
  building: Building;
  group: THREE.Group;
  points: TrackPoint[];
  timeline: Float32Array;
  duration: number;
  cycle: number;
  train: THREE.Group[];
  /** Seats in boarding order: front car first. */
  riders: Rider[];
  /** How far each car's riders have their arms up, 0..1. */
  cheer: number[];
  time: number;
  stationS: number;
}

export class CoasterLayer {
  readonly group = new THREE.Group();
  private readonly entries = new Map<number, Entry>();
  private draft: { key: string; group: THREE.Group } | null = null;
  private readonly frame = { p: new THREE.Vector3(), t: new THREE.Vector3(), u: new THREE.Vector3() };

  sync(buildings: readonly Building[], terrain: Terrain): void {
    const seen = new Set<number>();
    for (const b of buildings) {
      if (!b.coaster) continue;
      seen.add(b.id);
      const existing = this.entries.get(b.id);
      if (existing && existing.building.coaster === b.coaster) {
        existing.building = b;
        continue;
      }
      if (existing) this.group.remove(existing.group);
      this.entries.set(b.id, this.create(b, terrain));
    }
    for (const [id, e] of this.entries) {
      if (seen.has(id)) continue;
      this.group.remove(e.group);
      this.entries.delete(id);
    }
  }

  /** Move trains from the simulation's ride cycle. */
  update(dt: number, stats: readonly BuildingStats[]): void {
    const byId = new Map(stats.map((s) => [s.id, s]));
    for (const [id, e] of this.entries) {
      const s = byId.get(id);
      const running = !!s && s.phase > 0;
      if (!running) {
        e.time = 0;
      } else {
        // Smoothly follow the simulation's clock between snapshots.
        const target = (s as BuildingStats).phase * e.cycle;
        e.time += dt;
        if (Math.abs(target - e.time) > 0.6) e.time = target;
        else e.time += (target - e.time) * Math.min(1, dt * 2);
      }
      const head = running ? trainPosition(e.timeline, Math.min(e.time, e.duration)) : e.stationS;
      const looks = running ? (s as BuildingStats).looks ?? [] : [];
      const count = running ? Math.min((s as BuildingStats).riders, e.riders.length) : 0;
      e.riders.forEach((r, i) => {
        r.group.visible = i < count;
        if (i < count) dressRider(r, looks[i] ?? i * 7);
      });
      this.placeTrain(e, head, dt);
    }
  }

  /** Show the design being edited (or a station about to be placed), or null to hide it. */
  setDraft(design: CoasterDesign | null, terrain: Terrain, valid = true, version = 0): void {
    const key = design ? `${version}:${valid}:${design.start.tx},${design.start.ty},${design.start.dir},${design.pieces.length}` : '';
    if (this.draft?.key === key) return;
    if (this.draft) this.group.remove(this.draft.group);
    this.draft = null;
    if (!design) return;
    const { group } = buildTrack(design, terrain, valid ? DRAFT : { rail: '#ef476f', spine: '#ef476f', support: '#ef476f' }, true);
    // An arrow where the next piece goes.
    if (design.pieces.length) {
      const end = endState(design);
      const F = FORWARD[end.dir] as readonly [number, number];
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 8), mat('#06d6a0'));
      arrow.position.set(end.tx + 0.5 - F[0] * 0.2, end.h * HEIGHT_STEP + 0.35, end.ty + 0.5 - F[1] * 0.2);
      arrow.rotation.set(F[1] !== 0 ? (F[1] > 0 ? Math.PI / 2 : -Math.PI / 2) : 0, 0, F[0] !== 0 ? (F[0] > 0 ? -Math.PI / 2 : Math.PI / 2) : 0);
      group.add(arrow);
    }
    this.draft = { key, group };
    this.group.add(group);
  }

  private create(b: Building, terrain: Terrain): Entry {
    const info = b.coaster as NonNullable<Building['coaster']>;
    const { group, points } = buildTrack(info, terrain, BUILT);
    group.add(buildStation(info, info.side, terrain));
    const run = runTest(info);
    const train: THREE.Group[] = [];
    const riders: Rider[] = [];
    for (let i = 0; i < COASTER_CARS; i++) {
      const car = buildCar(i % 2 ? '#118ab2' : '#ef476f', i === 0, riders);
      train.push(car);
      group.add(car);
    }
    this.group.add(group);
    const stationS = run.timeline[0] ?? 0;
    const duration = run.timeline.length ? (run.timeline.length - 1) * 0.1 : 0;
    const entry: Entry = { building: b, group, points, timeline: run.timeline, duration, cycle: info.ratings.duration + 4, train, riders, cheer: train.map(() => 0), time: 0, stationS };
    this.placeTrain(entry, stationS);
    return entry;
  }

  private placeTrain(e: Entry, head: number, dt = 0): void {
    if (e.points.length < 2) return;
    const f = this.frame;
    const r = new THREE.Vector3();
    const m = new THREE.Matrix4();
    e.train.forEach((car, i) => {
      pointAt(e.points, head - 0.3 - i * CAR_SPACING, f);
      r.crossVectors(f.u, f.t).normalize();
      m.makeBasis(r, f.u, f.t);
      car.quaternion.setFromRotationMatrix(m);
      car.position.copy(f.p);
      // Hands up going down a steep drop or upside down in a loop.
      const thrill = f.t.y < -0.45 || f.u.y < 0.2;
      const goal = thrill ? 1 : 0;
      const c = (e.cheer[i] = (e.cheer[i] as number) + (goal - (e.cheer[i] as number)) * Math.min(1, dt * 6));
      for (let k = i * 4; k < i * 4 + 4; k++) {
        const rider = e.riders[k];
        if (!rider?.group.visible) continue;
        // Rest on the lap bar (forward and down) or reach straight up.
        const lean = Math.PI * 0.85 * (1 - c) + 0.15 * c;
        const sway = c * Math.sin(head * 3 + k) * 0.25;
        (rider.arms[0] as THREE.Group).rotation.set(lean, 0, sway + c * 0.2);
        (rider.arms[1] as THREE.Group).rotation.set(lean, 0, -sway - c * 0.2);
      }
    });
  }

  /** Where the front of a coaster's train is now, or null (for the follow camera). */
  trainPosition(id: number, out: THREE.Vector3): THREE.Vector3 | null {
    const e = this.entries.get(id);
    const car = e?.train[0];
    if (!car) return null;
    return out.copy(car.position);
  }
}
