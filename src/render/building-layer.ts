/**
 * Keeps one 3D model per building in the scene, in step with the park, and
 * animates rides from the simulation's running state.
 */
import * as THREE from 'three';
import type { Building } from '../core/buildings';
import { buildingType } from '../core/catalog';
import { HEIGHT_STEP } from '../core/grid';
import { cornerHeight, type Terrain } from '../core/terrain';
import type { BuildingStats } from '../sim/sim-core';
import { createModel, facingRotation, setModelGlow, type BuildingModel } from './building-models';

interface Entry {
  building: Building;
  model: BuildingModel;
  speed: number;
}

export class BuildingLayer {
  readonly group = new THREE.Group();
  private readonly entries = new Map<number, Entry>();
  private ghost: { type: string; model: BuildingModel } | null = null;
  private readonly ghostMaterial = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false });

  /** Rides and stalls glow after dark (0 by day .. 1 at night). */
  setNight(night: number): void {
    setModelGlow(Math.max(0, night - 0.3) / 0.7);
  }

  /** Add, move or remove models to match the park's buildings. */
  sync(buildings: readonly Building[], terrain: Terrain): void {
    const seen = new Set<number>();
    for (const b of buildings) {
      if (b.coaster) continue; // drawn by the coaster layer
      seen.add(b.id);
      let entry = this.entries.get(b.id);
      if (!entry || entry.building.type !== b.type) {
        if (entry) this.group.remove(entry.model.group);
        entry = { building: b, model: createModel(b.type), speed: 0 };
        this.entries.set(b.id, entry);
        this.group.add(entry.model.group);
      }
      entry.building = b;
      place(entry.model.group, b, terrain);
    }
    for (const [id, entry] of this.entries) {
      if (seen.has(id)) continue;
      this.group.remove(entry.model.group);
      this.entries.delete(id);
    }
  }

  /** Animate rides. `stats` comes from the latest simulation snapshot. */
  update(dt: number, stats: readonly BuildingStats[]): void {
    const byId = new Map(stats.map((s) => [s.id, s]));
    for (const [id, entry] of this.entries) {
      const s = byId.get(id);
      const running = !!s && s.riders > 0 && s.phase > 0 && s.phase < 0.95;
      entry.speed += ((running ? 1 : 0) - entry.speed) * Math.min(1, dt * 1.5);
      entry.model.animate(dt, entry.speed, s?.phase ?? 0);
    }
  }

  /** A see-through preview of a building being placed, or null to hide it. */
  setGhost(ghost: { type: string; x: number; y: number; facing: Building['facing']; valid: boolean } | null, terrain: Terrain): void {
    if (!ghost) {
      if (this.ghost) this.group.remove(this.ghost.model.group);
      this.ghost = null;
      return;
    }
    if (!this.ghost || this.ghost.type !== ghost.type) {
      if (this.ghost) this.group.remove(this.ghost.model.group);
      const model = createModel(ghost.type);
      model.group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.material = this.ghostMaterial;
          o.castShadow = false;
        }
      });
      this.ghost = { type: ghost.type, model };
      this.group.add(model.group);
    }
    this.ghostMaterial.color.set(ghost.valid ? '#ffffff' : '#ef476f');
    place(this.ghost.model.group, ghost, terrain);
  }
}

function place(group: THREE.Object3D, b: { type: string; x: number; y: number; facing: number }, terrain: Terrain): void {
  const size = buildingType(b.type).size;
  const cx = Math.max(0, Math.min(b.x, terrain.width));
  const cy = Math.max(0, Math.min(b.y, terrain.height));
  group.position.set(b.x + size / 2, cornerHeight(terrain, cx, cy) * HEIGHT_STEP, b.y + size / 2);
  group.rotation.y = facingRotation(b.facing);
}
