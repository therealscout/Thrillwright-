/**
 * Draws every guest in a single instanced draw call. The simulation sends
 * positions and velocities 20 times a second; between snapshots each guest is
 * moved along its velocity so motion stays smooth at any frame rate.
 *
 * Per-guest data is two small vertex attributes (position + heading, and
 * look + movement); shirt and skin colours are picked in the shader from
 * palettes, so changing 10,000 guests costs one buffer upload per frame.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SNAPSHOT_STRIDE } from '../sim/sim-core';
import type { GuestSnapshot } from '../sim/sim-client';

export const SHIRTS = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f78c6b', '#9b5de5', '#f15bb5', '#00bbf9', '#fee440', '#8ac926', '#ff595e', '#ffffff'];
export const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524'];
const PANTS = '#33415c';
const SHOES = '#2b2d42';

/** Vertex-colour markers the shader swaps for per-guest colours. */
const SHIRT_MARKER = new THREE.Color(1, 1, 1);
const SKIN_MARKER = new THREE.Color(1, 0, 0);

function coloured(geometry: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) color.toArray(colors, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}

/** A small low-poly person, about 0.42 world units tall, facing +z. */
function guestGeometry(): THREE.BufferGeometry {
  const pants = new THREE.Color(PANTS);
  const shoes = new THREE.Color(SHOES);
  const parts = [
    coloured(new THREE.BoxGeometry(0.05, 0.15, 0.06).translate(-0.032, 0.09, 0), pants),
    coloured(new THREE.BoxGeometry(0.05, 0.15, 0.06).translate(0.032, 0.09, 0), pants),
    coloured(new THREE.BoxGeometry(0.055, 0.025, 0.08).translate(-0.032, 0.0125, 0.01), shoes),
    coloured(new THREE.BoxGeometry(0.055, 0.025, 0.08).translate(0.032, 0.0125, 0.01), shoes),
    coloured(new THREE.CylinderGeometry(0.06, 0.07, 0.17, 7).translate(0, 0.25, 0), SHIRT_MARKER),
    coloured(new THREE.IcosahedronGeometry(0.055, 0).translate(0, 0.385, 0), SKIN_MARKER),
  ];
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('Could not build guest geometry');
  merged.computeVertexNormals();
  return merged;
}

export class GuestLayer {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private state: THREE.InstancedBufferAttribute;
  private extra: THREE.InstancedBufferAttribute;
  private capacity = 0;
  private readonly uniforms = { uTime: { value: 0 } };

  constructor() {
    const base = guestGeometry();
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = base.index;
    for (const [name, attr] of Object.entries(base.attributes)) this.geometry.setAttribute(name, attr);
    this.state = this.allocate(4096, 4, 'aState');
    this.extra = this.allocate(4096, 2, 'aExtra');
    this.capacity = 4096;
    this.geometry.instanceCount = 0;

    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const shirts = SHIRTS.map((c) => new THREE.Color(c));
    const skins = SKINS.map((c) => new THREE.Color(c));
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.uTime;
      shader.uniforms.uShirts = { value: shirts };
      shader.uniforms.uSkins = { value: skins };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec4 aState;
          attribute vec2 aExtra;
          uniform float uTime;
          uniform vec3 uShirts[${SHIRTS.length}];
          uniform vec3 uSkins[${SKINS.length}];
          vec3 turn(vec3 v) {
            float c = cos(aState.w), s = sin(aState.w);
            return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
          }`,
        )
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = turn(vec3(normal));')
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = turn(vec3(position));
          float bob = abs(sin(uTime * 10.0 + aExtra.x)) * 0.025 * aExtra.y;
          transformed += aState.xyz + vec3(0.0, bob, 0.0);`,
        )
        .replace(
          '#include <color_vertex>',
          `#include <color_vertex>
          #ifdef USE_COLOR
          if (aExtra.x > 255.5 && color.r > 0.99 && color.g > 0.99 && color.b > 0.99) {
            // Staff uniforms: 256 handyman, 257 mechanic.
            vColor.rgb = aExtra.x > 256.5 ? vec3(0.95, 0.45, 0.1) : vec3(0.15, 0.6, 0.3);
          } else if (color.r > 0.99 && color.g > 0.99 && color.b > 0.99) {
            vColor.rgb = uShirts[int(mod(aExtra.x, ${SHIRTS.length}.0))];
          } else if (color.r > 0.99 && color.g < 0.01) {
            vColor.rgb = uSkins[int(mod(floor(aExtra.x / ${SHIRTS.length}.0), ${SKINS.length}.0))];
          }
          #endif`,
        );
    };

    this.mesh = new THREE.Mesh(this.geometry, material);
    // Guests are spread across the whole map; culling one bounding box is pointless.
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.name = 'guests';
  }

  /** Move every guest to where it should be at time `now` (ms). */
  update(snapshot: GuestSnapshot | null, now: number): void {
    this.uniforms.uTime.value = now / 1000;
    if (!snapshot) {
      this.geometry.instanceCount = 0;
      return;
    }
    const { data, count } = snapshot;
    if (count > this.capacity) this.grow(count);
    const dt = Math.min(Math.max(now - snapshot.receivedAt, 0), 100) / 1000;
    const state = this.state.array as Float32Array;
    const extra = this.extra.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const o = i * SNAPSHOT_STRIDE;
      const vx = data[o + 3] as number;
      const vz = data[o + 5] as number;
      state[i * 4] = (data[o] as number) + vx * dt;
      state[i * 4 + 1] = (data[o + 1] as number) + (data[o + 4] as number) * dt;
      state[i * 4 + 2] = (data[o + 2] as number) + vz * dt;
      state[i * 4 + 3] = data[o + 6] as number;
      extra[i * 2] = data[o + 7] as number;
      extra[i * 2 + 1] = vx !== 0 || vz !== 0 ? 1 : 0;
    }
    this.state.clearUpdateRanges();
    this.state.addUpdateRange(0, count * 4);
    this.state.needsUpdate = true;
    this.extra.clearUpdateRanges();
    this.extra.addUpdateRange(0, count * 2);
    this.extra.needsUpdate = true;
    this.geometry.instanceCount = count;
  }

  private allocate(capacity: number, size: number, name: string): THREE.InstancedBufferAttribute {
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
    attr.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute(name, attr);
    return attr;
  }

  private grow(count: number): void {
    let capacity = this.capacity;
    while (capacity < count) capacity *= 2;
    // A resized attribute needs a new GPU buffer; dispose so three re-creates it.
    this.geometry.dispose();
    this.state = this.allocate(capacity, 4, 'aState');
    this.extra = this.allocate(capacity, 2, 'aExtra');
    this.capacity = capacity;
  }
}
