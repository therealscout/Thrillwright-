import * as THREE from 'three';
import {
  CAMERA_ELEVATION,
  clamp,
  inBounds,
  isoCameraOffset,
  lerpAngle,
  nextRotation,
  rotationYaw,
  worldToTile,
  type Rotation,
  type TileCoord,
} from '../core/grid';
import { Surface, tileIndex, tileNoise, type Terrain } from '../core/terrain';
import { palette } from './palette';

export interface RendererStats {
  fps: number;
  rotation: Rotation;
  zoom: number;
  hoveredTile: TileCoord | null;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const PAN_SPEED = 18; // world units per second at zoom 1
const CAMERA_DISTANCE = 200;

/**
 * Owns the Three.js scene, the isometric camera and input for the camera.
 * Game objects will be added by later systems; for milestone 1 it draws the
 * terrain, placeholder scenery and a tile cursor.
 */
export class GameRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.OrthographicCamera;
  private readonly target: THREE.Vector3;
  private readonly cursor: THREE.Mesh;
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly keys = new Set<string>();
  private readonly cleanup: Array<() => void> = [];

  private rotation: Rotation = 0;
  private yaw = rotationYaw(0);
  private zoom = 1;
  private hovered: TileCoord | null = null;
  private pointerInside = false;
  private dragging: { x: number; y: number } | null = null;
  private frames = 0;
  private fpsTime = 0;
  private fps = 0;
  private lastTime = performance.now();
  private readonly listeners = new Set<(s: RendererStats) => void>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly terrain: Terrain,
  ) {
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
    this.target = new THREE.Vector3(terrain.width / 2, 0, terrain.height - 16);

    this.addLights();
    this.scene.add(this.buildGround());
    this.scene.add(this.buildGridLines());
    this.addPlaceholderScenery();
    this.cursor = this.buildCursor();
    this.scene.add(this.cursor);

    this.bindInput();
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  onStats(listener: (s: RendererStats) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  rotate(direction: 1 | -1): void {
    this.rotation = nextRotation(this.rotation, direction);
  }

  zoomBy(factor: number): void {
    this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    this.updateProjection();
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    for (const off of this.cleanup) off();
    this.renderer.dispose();
  }

  // ---- setup -------------------------------------------------------------

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight(palette.skyLight, palette.groundLight, 1.1));
    const sun = new THREE.DirectionalLight(palette.sun, 2.2);
    const { width, height } = this.terrain;
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

  /** One flat-coloured quad per tile, merged into a single mesh. */
  private buildGround(): THREE.Mesh {
    const { width, height } = this.terrain;
    const count = width * height;
    const positions = new Float32Array(count * 6 * 3);
    const colors = new Float32Array(count * 6 * 3);
    const color = new THREE.Color();
    let p = 0;
    for (let ty = 0; ty < height; ty++) {
      for (let tx = 0; tx < width; tx++) {
        const surface = this.terrain.surfaces[tileIndex(this.terrain, tx, ty)];
        const base =
          surface === Surface.Path ? palette.path : surface === Surface.Sand ? palette.sand : palette.grass;
        color.set(base).offsetHSL(0, 0, (tileNoise(tx, ty) - 0.5) * 0.04);
        const quad = [tx, ty, tx, ty + 1, tx + 1, ty + 1, tx, ty, tx + 1, ty + 1, tx + 1, ty];
        for (let v = 0; v < 6; v++) {
          positions[p] = quad[v * 2] as number;
          positions[p + 1] = 0;
          positions[p + 2] = quad[v * 2 + 1] as number;
          colors[p] = color.r;
          colors[p + 1] = color.g;
          colors[p + 2] = color.b;
          p += 3;
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.receiveShadow = true;
    mesh.name = 'ground';
    return mesh;
  }

  private buildGridLines(): THREE.LineSegments {
    const { width, height } = this.terrain;
    const points: number[] = [];
    for (let x = 0; x <= width; x++) points.push(x, 0.01, 0, x, 0.01, height);
    for (let z = 0; z <= height; z++) points.push(0, 0.01, z, width, 0.01, z);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const material = new THREE.LineBasicMaterial({ color: palette.gridLine, transparent: true, opacity: 0.18 });
    const lines = new THREE.LineSegments(geometry, material);
    lines.name = 'grid';
    return lines;
  }

  private buildCursor(): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: palette.cursor,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 0.02;
    mesh.visible = false;
    return mesh;
  }

  /** Low-poly trees and a pond, so the style can be judged before real assets exist. */
  private addPlaceholderScenery(): void {
    const { width, height } = this.terrain;
    const trunkGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.5, 6).translate(0, 0.25, 0);
    const crownGeo = new THREE.ConeGeometry(0.42, 1.1, 7).translate(0, 1.0, 0);
    const spots: Array<[number, number, number]> = [];
    for (let ty = 0; ty < height; ty++) {
      for (let tx = 0; tx < width; tx++) {
        const edge = Math.min(tx, ty, width - 1 - tx, height - 1 - ty);
        const n = tileNoise(tx, ty);
        const chance = edge < 6 ? 0.45 : 0.015;
        const surface = this.terrain.surfaces[tileIndex(this.terrain, tx, ty)];
        if (surface === Surface.Grass && n < chance) spots.push([tx, ty, tileNoise(ty, tx)]);
      }
    }
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: palette.trunk }), spots.length);
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: palette.leaves }), spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const tint = new THREE.Color();
    spots.forEach(([tx, ty, r], i) => {
      const scale = 0.75 + r * 0.6;
      pos.set(tx + 0.3 + r * 0.4, 0, ty + 0.3 + (1 - r) * 0.4);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r * Math.PI * 2);
      s.set(scale, scale, scale);
      m.compose(pos, q, s);
      trunks.setMatrixAt(i, m);
      crowns.setMatrixAt(i, m);
      crowns.setColorAt(i, tint.set(palette.leaves).offsetHSL((r - 0.5) * 0.04, 0, (r - 0.5) * 0.1));
    });
    for (const mesh of [trunks, crowns]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }

    const pond = new THREE.Mesh(
      new THREE.CircleGeometry(5, 28).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: palette.water, transparent: true, opacity: 0.9 }),
    );
    pond.position.set(width * 0.7, 0.03, height * 0.32);
    pond.receiveShadow = true;
    this.scene.add(pond);

    // Entrance gate placeholder at the end of the path.
    const gateMat = new THREE.MeshLambertMaterial({ color: palette.accent });
    const gate = new THREE.Group();
    const pillarGeo = new THREE.BoxGeometry(0.5, 2.4, 0.5).translate(0, 1.2, 0);
    const left = new THREE.Mesh(pillarGeo, gateMat);
    const right = new THREE.Mesh(pillarGeo, gateMat);
    left.position.x = -1.5;
    right.position.x = 1.5;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.5, 0.6).translate(0, 2.6, 0), new THREE.MeshLambertMaterial({ color: palette.accentDark }));
    gate.add(left, right, beam);
    gate.traverse((o) => {
      o.castShadow = true;
    });
    gate.position.set(width / 2, 0, height - 3);
    this.scene.add(gate);
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
      if (e.target instanceof HTMLInputElement) return;
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
      if (e.button === 1 || e.button === 2) {
        this.dragging = { x: e.clientX, y: e.clientY };
        this.canvas.setPointerCapture(e.pointerId);
      }
    });
    this.listen(this.canvas, 'pointerup', (e) => {
      this.dragging = null;
      if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    });
    this.listen(this.canvas, 'pointerleave', () => {
      this.pointerInside = false;
    });
    this.listen(this.canvas, 'pointermove', (e) => {
      this.pointerInside = true;
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      if (this.dragging) {
        const dx = e.clientX - this.dragging.x;
        const dy = e.clientY - this.dragging.y;
        this.dragging = { x: e.clientX, y: e.clientY };
        const unitsPerPixel = (this.camera.top - this.camera.bottom) / rect.height;
        this.panScreen(-dx * unitsPerPixel, -dy * unitsPerPixel / Math.sin(CAMERA_ELEVATION));
      }
    });
  }

  /** Move the view target in screen-aligned directions (right, down). */
  private panScreen(right: number, down: number): void {
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    this.target.x = clamp(this.target.x + rx * right - fx * down, 0, this.terrain.width);
    this.target.z = clamp(this.target.z + rz * right - fz * down, 0, this.terrain.height);
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

    // Keyboard panning.
    const speed = (PAN_SPEED / this.zoom) * dt;
    let right = 0;
    let down = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) right -= speed;
    if (this.keys.has('d') || this.keys.has('arrowright')) right += speed;
    if (this.keys.has('w') || this.keys.has('arrowup')) down -= speed;
    if (this.keys.has('s') || this.keys.has('arrowdown')) down += speed;
    if (right || down) this.panScreen(right, down);

    // Smooth rotation toward the target view.
    this.yaw = lerpAngle(this.yaw, rotationYaw(this.rotation), 1 - Math.exp(-dt * 12));
    const off = isoCameraOffset(this.yaw, CAMERA_DISTANCE);
    this.camera.position.set(this.target.x + off.x, this.target.y + off.y, this.target.z + off.z);
    this.camera.lookAt(this.target);

    this.updateCursor();
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

  private updateCursor(): void {
    let tile: TileCoord | null = null;
    if (this.pointerInside) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.groundPlane, hit)) {
        const t = worldToTile(hit.x, hit.z);
        if (inBounds(this.terrain.width, this.terrain.height, t.tx, t.ty)) tile = t;
      }
    }
    this.cursor.visible = tile !== null;
    if (tile) this.cursor.position.set(tile.tx + 0.5, 0.02, tile.ty + 0.5);
    const changed = tile?.tx !== this.hovered?.tx || tile?.ty !== this.hovered?.ty;
    this.hovered = tile;
    if (changed) this.emit();
  }

  private emit(): void {
    const stats: RendererStats = { fps: this.fps, rotation: this.rotation, zoom: this.zoom, hoveredTile: this.hovered };
    for (const l of this.listeners) l(stats);
  }
}
