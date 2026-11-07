import * as THREE from 'three';
import {
  CAMERA_ELEVATION,
  clamp,
  isoCameraOffset,
  lerpAngle,
  nextRotation,
  rotationYaw,
  type Rotation,
  type TileCoord,
} from '../core/grid';
import { tileIndex, tileNoise, type Terrain } from '../core/terrain';
import type { Park } from '../game/park';
import type { Building } from '../core/buildings';
import type { GuestSnapshot } from '../sim/sim-client';
import type { BuildingStats } from '../sim/sim-core';
import { BuildingLayer } from './building-layer';
import { CoasterLayer } from './coaster-layer';
import { PathLayer } from './path-layer';
import type { CoasterDesign } from '../core/coaster';
import { GuestLayer } from './guest-layer';
import { palette } from './palette';
import {
  buildBrushGeometry,
  buildGridGeometry,
  buildPathGeometry,
  buildTerrainGeometry,
  buildWaterGeometry,
  tileCentreY,
  tileFromFace,
} from './terrain-mesh';

export interface RendererStats {
  fps: number;
  rotation: Rotation;
  zoom: number;
  hoveredTile: TileCoord | null;
}

export type TilePointerEvent = { kind: 'down' | 'move' | 'up'; tile: TileCoord | null; shift: boolean };

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const PAN_SPEED = 18; // world units per second at zoom 1
const CAMERA_DISTANCE = 200;

/**
 * Owns the Three.js scene, the isometric camera and pointer input. It draws
 * the park's terrain and redraws it whenever the park changes.
 */
export class GameRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.OrthographicCamera;
  private readonly target: THREE.Vector3;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly keys = new Set<string>();
  private readonly cleanup: Array<() => void> = [];

  private readonly ground: THREE.Mesh;
  private readonly grid: THREE.LineSegments;
  private readonly water: THREE.Mesh;
  private readonly paths: THREE.Mesh;
  private readonly brush: THREE.Mesh;
  private readonly brushMaterial: THREE.MeshBasicMaterial;
  private readonly trunks: THREE.InstancedMesh;
  private readonly crowns: THREE.InstancedMesh;
  private readonly treeSpots: Array<[number, number, number]>;
  private readonly gate: THREE.Group;
  private readonly guests = new GuestLayer();
  private readonly buildingLayer = new BuildingLayer();
  private readonly coasterLayer = new CoasterLayer();
  private readonly pathLayer = new PathLayer();
  private dirtSource: (() => { litter: Uint8Array; vomit: Uint8Array; version: number } | null) | null = null;
  private draftSource: (() => { design: CoasterDesign | null; version: number }) | null = null;
  private trackGhost: { design: CoasterDesign; valid: boolean } | null = null;
  private guestSource: (() => GuestSnapshot | null) | null = null;
  private buildingStatsSource: (() => readonly BuildingStats[]) | null = null;

  private rotation: Rotation = 0;
  private yaw = rotationYaw(0);
  private zoom = 1;
  private hovered: TileCoord | null = null;
  private pointerInside = false;
  private pointerMoved = false;
  private panning: { x: number; y: number } | null = null;
  private leftDown = false;
  private builtVersion = -1;
  private frames = 0;
  private fpsTime = 0;
  private fps = 0;
  private lastTime = performance.now();
  private readonly listeners = new Set<(s: RendererStats) => void>();
  private readonly tileListeners = new Set<(e: TilePointerEvent) => void>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly park: Park,
    entrance: TileCoord,
  ) {
    const terrain = park.terrain;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.scene.background = new THREE.Color(palette.sky);
    this.scene.fog = new THREE.Fog(palette.sky, CAMERA_DISTANCE * 0.9, CAMERA_DISTANCE * 1.6);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, CAMERA_DISTANCE * 3);
    // Start the view near the entrance, where a new park begins.
    this.target = new THREE.Vector3(entrance.tx, 2, entrance.ty - 14);

    this.addLights();

    this.ground = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.ground.receiveShadow = true;
    this.grid = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: palette.gridLine, transparent: true, opacity: 0.14 }),
    );
    this.water = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshPhongMaterial({ color: palette.water, transparent: true, opacity: 0.88, shininess: 60, specular: 0x5a7f99 }),
    );
    this.water.receiveShadow = true;
    this.paths = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.paths.receiveShadow = true;
    this.brushMaterial = new THREE.MeshBasicMaterial({
      color: palette.cursor,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.brush = new THREE.Mesh(new THREE.BufferGeometry(), this.brushMaterial);
    this.brush.renderOrder = 2;
    this.scene.add(this.ground, this.grid, this.water, this.paths, this.brush);

    // Placeholder low-poly trees, scattered on land the park doesn't own yet.
    const trunkGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.5, 6).translate(0, 0.25, 0);
    const crownGeo = new THREE.ConeGeometry(0.42, 1.1, 7).translate(0, 1.0, 0);
    this.treeSpots = [];
    for (let ty = 0; ty < terrain.height; ty++) {
      for (let tx = 0; tx < terrain.width; tx++) {
        if (!terrain.owned[tileIndex(terrain, tx, ty)] && tileNoise(tx, ty) < 0.32) {
          this.treeSpots.push([tx, ty, tileNoise(ty, tx)]);
        }
      }
    }
    this.trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: palette.trunk }), this.treeSpots.length);
    this.crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: palette.leaves }), this.treeSpots.length);
    for (const mesh of [this.trunks, this.crowns]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }

    this.gate = this.buildGate();
    this.gate.position.set(entrance.tx, 0, entrance.ty + 0.5);
    this.scene.add(this.gate);
    this.scene.add(this.guests.mesh);
    this.scene.add(this.buildingLayer.group, this.coasterLayer.group, this.pathLayer.group);

    this.bindInput();
    this.resize();
    this.rebuildWorld();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  onStats(listener: (s: RendererStats) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Left-button presses, drags and releases over the map. */
  onTilePointer(listener: (e: TilePointerEvent) => void): () => void {
    this.tileListeners.add(listener);
    return () => this.tileListeners.delete(listener);
  }

  /** Where to read guest positions from each frame (the simulation client). */
  setGuestSource(source: () => GuestSnapshot | null): void {
    this.guestSource = source;
  }

  /** Where to read ride running state from each frame. */
  setBuildingStatsSource(source: () => readonly BuildingStats[]): void {
    this.buildingStatsSource = source;
  }

  /** Preview of a building being placed, or null. */
  setGhost(ghost: { type: string; x: number; y: number; facing: Building['facing']; valid: boolean } | null): void {
    this.buildingLayer.setGhost(ghost, this.park.terrain);
  }

  /** Where to read litter and sick from (the simulation client). */
  setDirtSource(source: () => { litter: Uint8Array; vomit: Uint8Array; version: number } | null): void {
    this.dirtSource = source;
  }

  /** Preview of a coaster station about to be placed, or null. */
  setTrackGhost(design: CoasterDesign | null, valid: boolean): void {
    this.trackGhost = design ? { design, valid } : null;
  }

  /** Where to read the coaster design being edited from each frame. */
  setDraftSource(source: () => { design: CoasterDesign | null; version: number }): void {
    this.draftSource = source;
  }

  rotate(direction: 1 | -1): void {
    this.rotation = nextRotation(this.rotation, direction);
    this.emit();
  }

  zoomBy(factor: number): void {
    this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    this.updateProjection();
    this.emit();
  }

  /** Show which tiles the current tool would affect. */
  setBrush(tiles: TileCoord[], valid = true): void {
    this.brush.geometry.dispose();
    this.brush.geometry = buildBrushGeometry(this.park.terrain, tiles);
    this.brushMaterial.color.set(valid ? palette.cursor : palette.cursorBad);
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    for (const off of this.cleanup) off();
    this.renderer.dispose();
  }

  // ---- world -------------------------------------------------------------

  private rebuildWorld(): void {
    const t = this.park.terrain;
    const swap = (mesh: THREE.Mesh | THREE.LineSegments, geometry: THREE.BufferGeometry) => {
      mesh.geometry.dispose();
      mesh.geometry = geometry;
    };
    swap(this.ground, buildTerrainGeometry(t));
    swap(this.grid, buildGridGeometry(t));
    swap(this.water, buildWaterGeometry(t));
    swap(this.paths, buildPathGeometry(t));
    this.placeTrees(t);
    this.buildingLayer.sync(this.park.buildings, t);
    this.coasterLayer.sync(this.park.buildings, t);
    this.pathLayer.syncItems(t);
    this.gate.position.y = tileCentreY(t, Math.floor(this.gate.position.x), Math.floor(this.gate.position.z));
    this.builtVersion = this.park.version;
  }

  private placeTrees(t: Terrain): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const tint = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    for (const [tx, ty, r] of this.treeSpots) {
      const k = tileIndex(t, tx, ty);
      if (t.paths[k] || t.water[k] || t.blocked[k]) continue;
      const scale = 0.75 + r * 0.6;
      pos.set(tx + 0.3 + r * 0.4, tileCentreY(t, tx, ty), ty + 0.3 + (1 - r) * 0.4);
      q.setFromAxisAngle(up, r * Math.PI * 2);
      s.set(scale, scale, scale);
      m.compose(pos, q, s);
      this.trunks.setMatrixAt(n, m);
      this.crowns.setMatrixAt(n, m);
      this.crowns.setColorAt(n, tint.set(palette.leaves).offsetHSL((r - 0.5) * 0.04, 0, (r - 0.5) * 0.1));
      n++;
    }
    for (const mesh of [this.trunks, this.crowns]) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private buildGate(): THREE.Group {
    const gateMat = new THREE.MeshLambertMaterial({ color: palette.accent });
    const gate = new THREE.Group();
    const pillarGeo = new THREE.BoxGeometry(0.5, 2.4, 0.5).translate(0, 1.2, 0);
    const left = new THREE.Mesh(pillarGeo, gateMat);
    const right = new THREE.Mesh(pillarGeo, gateMat);
    left.position.x = -1.6;
    right.position.x = 1.6;
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 0.5, 0.6).translate(0, 2.6, 0),
      new THREE.MeshLambertMaterial({ color: palette.accentDark }),
    );
    gate.add(left, right, beam);
    gate.traverse((o) => {
      o.castShadow = true;
    });
    return gate;
  }

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight(palette.skyLight, palette.groundLight, 1.1));
    const sun = new THREE.DirectionalLight(palette.sun, 2.2);
    const { width, height } = this.park.terrain;
    const span = Math.max(width, height);
    sun.position.set(width * 0.2, span * 0.9, height * -0.1);
    sun.target.position.set(width / 2, 0, height / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const cam = sun.shadow.camera;
    cam.left = -span * 0.8;
    cam.right = span * 0.8;
    cam.top = span * 0.8;
    cam.bottom = -span * 0.8;
    cam.near = 1;
    cam.far = span * 3;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun, sun.target);
  }

  // ---- input -------------------------------------------------------------

  private listen<K extends keyof WindowEventMap>(target: Window, type: K, fn: (e: WindowEventMap[K]) => void): void;
  private listen<K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  private listen(target: Window | HTMLElement, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn, opts);
    this.cleanup.push(() => target.removeEventListener(type, fn, opts));
  }

  private bindInput(): void {
    this.listen(window, 'resize', () => this.resize());
    this.listen(window, 'keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key === 'q') this.rotate(-1);
      else if (key === 'e') this.rotate(1);
      else if (key === '=' || key === '+') this.zoomBy(1.25);
      else if (key === '-') this.zoomBy(0.8);
      else this.keys.add(key);
    });
    this.listen(window, 'keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    this.listen(window, 'blur', () => this.keys.clear());
    this.listen(this.canvas, 'wheel', (e) => {
      e.preventDefault();
      this.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });
    this.listen(this.canvas, 'contextmenu', (e) => e.preventDefault());
    this.listen(this.canvas, 'pointerdown', (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      this.updatePointer(e);
      if (e.button === 1 || e.button === 2) {
        this.panning = { x: e.clientX, y: e.clientY };
      } else if (e.button === 0) {
        this.leftDown = true;
        this.pick();
        this.emitTile('down', e.shiftKey);
      }
    });
    this.listen(this.canvas, 'pointerup', (e) => {
      if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
      if (e.button === 0 && this.leftDown) {
        this.leftDown = false;
        this.emitTile('up', e.shiftKey);
      }
      if (e.button === 1 || e.button === 2) this.panning = null;
    });
    this.listen(this.canvas, 'pointerleave', () => {
      this.pointerInside = false;
      this.pointerMoved = true;
    });
    this.listen(this.canvas, 'pointermove', (e) => {
      this.updatePointer(e);
      if (this.panning) {
        const rect = this.canvas.getBoundingClientRect();
        const dx = e.clientX - this.panning.x;
        const dy = e.clientY - this.panning.y;
        this.panning = { x: e.clientX, y: e.clientY };
        const unitsPerPixel = (this.camera.top - this.camera.bottom) / rect.height;
        this.panScreen(-dx * unitsPerPixel, (-dy * unitsPerPixel) / Math.sin(CAMERA_ELEVATION));
      }
    });
  }

  private updatePointer(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.pointerInside = true;
    this.pointerMoved = true;
  }

  /** Move the view target in screen-aligned directions (right, down). */
  private panScreen(right: number, down: number): void {
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const { width, height } = this.park.terrain;
    this.target.x = clamp(this.target.x + rx * right - fx * down, 0, width);
    this.target.z = clamp(this.target.z + rz * right - fz * down, 0, height);
  }

  // ---- per frame ---------------------------------------------------------

  private resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.updateProjection();
  }

  private updateProjection(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const viewHeight = 40 / this.zoom;
    const aspect = w / Math.max(h, 1);
    this.camera.left = (-viewHeight * aspect) / 2;
    this.camera.right = (viewHeight * aspect) / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
  }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    if (this.park.version !== this.builtVersion) this.rebuildWorld();

    // Keyboard panning.
    const speed = (PAN_SPEED / this.zoom) * dt;
    let right = 0;
    let down = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) right -= speed;
    if (this.keys.has('d') || this.keys.has('arrowright')) right += speed;
    if (this.keys.has('w') || this.keys.has('arrowup')) down -= speed;
    if (this.keys.has('s') || this.keys.has('arrowdown')) down += speed;
    if (right || down) {
      this.panScreen(right, down);
      this.pointerMoved = true;
    }

    // Smooth rotation toward the target view.
    const goal = rotationYaw(this.rotation);
    if (Math.abs(this.yaw - goal) > 1e-4) this.pointerMoved = true;
    this.yaw = lerpAngle(this.yaw, goal, 1 - Math.exp(-dt * 12));
    const off = isoCameraOffset(this.yaw, CAMERA_DISTANCE);
    this.camera.position.set(this.target.x + off.x, this.target.y + off.y, this.target.z + off.z);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();

    if (this.pointerMoved) {
      this.pointerMoved = false;
      const before = this.hovered;
      this.pick();
      if (before?.tx !== this.hovered?.tx || before?.ty !== this.hovered?.ty) {
        this.emitTile('move', this.keys.has('shift'));
        this.emit();
      }
    }

    this.guests.update(this.guestSource?.() ?? null, now);
    const buildingStats = this.buildingStatsSource?.() ?? [];
    this.buildingLayer.update(dt, buildingStats);
    this.coasterLayer.update(dt, buildingStats);
    this.pathLayer.syncDirt(this.park.terrain, this.dirtSource?.() ?? null);
    const draft = this.draftSource?.();
    if (this.trackGhost) {
      const g = this.trackGhost.design.start;
      this.coasterLayer.setDraft(this.trackGhost.design, this.park.terrain, this.trackGhost.valid, g.tx * 1000 + g.ty);
    } else {
      this.coasterLayer.setDraft(draft?.design ?? null, this.park.terrain, true, draft?.version ?? 0);
    }
    this.renderer.render(this.scene, this.camera);

    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.frames / this.fpsTime);
      this.frames = 0;
      this.fpsTime = 0;
      this.emit();
    }
  }

  /** Find the tile under the pointer by ray-casting the ground mesh. */
  private pick(): void {
    if (!this.pointerInside) {
      this.hovered = null;
      return;
    }
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.ground, false)[0];
    this.hovered = hit?.faceIndex != null ? tileFromFace(this.park.terrain, hit.faceIndex) : null;
  }

  private emitTile(kind: TilePointerEvent['kind'], shift: boolean): void {
    const event: TilePointerEvent = { kind, tile: this.hovered, shift };
    for (const l of this.tileListeners) l(event);
  }

  private emit(): void {
    const stats: RendererStats = { fps: this.fps, rotation: this.rotation, zoom: this.zoom, hoveredTile: this.hovered };
    for (const l of this.listeners) l(stats);
  }
}
