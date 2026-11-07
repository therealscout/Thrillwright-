/**
 * Water: a lit, gently rippling surface that is clear and teal in the
 * shallows, deep blue in the middle, with foam along the shore and where it
 * meets water at another level. Pools higher than their neighbours get side
 * walls, and spill over into lower water as little waterfalls.
 */
import * as THREE from 'three';
import { HEIGHT_STEP } from '../core/grid';
import { tileCorners, tileIndex, type Terrain } from '../core/terrain';
import { palette } from './palette';

/** The surface sits a touch below its level, so the shore line meets the bank. */
const SURFACE_DROP = 0.03;

/** Wall kinds, passed to the shader in aWater.z. */
const TOP = 0;
const SIDE = 1;
const FALL = 2;

/**
 * One water tile is split into 2 x 2 quads so the foam can hug each edge.
 * Per vertex, aWater holds (shore 0..1, depth in height steps, kind).
 */
export function buildWaterGeometry(t: Terrain): THREE.BufferGeometry {
  const positions: number[] = [];
  const attrs: number[] = [];
  const level = (x: number, y: number) => (x >= 0 && y >= 0 && x < t.width && y < t.height ? (t.water[tileIndex(t, x, y)] as number) : -1);

  for (let ty = 0; ty < t.height; ty++) {
    for (let tx = 0; tx < t.width; tx++) {
      const w = level(tx, ty);
      if (w <= 0) continue;
      const h = tileCorners(t, tx, ty);
      const top = w * HEIGHT_STEP - SURFACE_DROP;

      // Surface: a 3 x 3 grid of points at half-tile steps.
      const grid: Array<[number, number, number, number, number]> = [];
      for (let j = 0; j <= 2; j++) {
        for (let i = 0; i <= 2; i++) {
          const u = i / 2;
          const v = j / 2;
          const n = h[0] + (h[1] - h[0]) * u;
          const s = h[3] + (h[2] - h[3]) * u;
          const ground = n + (s - n) * v;
          const depth = Math.max(0, w - ground);
          // Shore where the point touches a tile at another level (the map edge doesn't count).
          let edge = false;
          for (const y of j === 0 ? [ty - 1, ty] : j === 2 ? [ty, ty + 1] : [ty]) {
            for (const x of i === 0 ? [tx - 1, tx] : i === 2 ? [tx, tx + 1] : [tx]) {
              const l = level(x, y);
              if (l !== -1 && l !== w) edge = true;
            }
          }
          const shore = edge ? 1 : Math.max(0, Math.min(1, 1 - depth));
          grid.push([tx + u, top, ty + v, shore, depth]);
        }
      }
      for (let j = 0; j < 2; j++) {
        for (let i = 0; i < 2; i++) {
          const a = j * 3 + i;
          const quad = [a, a + 1, a + 4, a + 3]; // NW, NE, SE, SW
          for (const q of [0, 3, 2, 0, 2, 1]) {
            const p = grid[quad[q] as number] as [number, number, number, number, number];
            positions.push(p[0], p[1], p[2]);
            attrs.push(p[3], p[4], TOP);
          }
        }
      }

      // Side walls where the neighbour is lower: its water, or the ground at the edge.
      const edges: Array<[number, number, number, number, number, number, number, number]> = [
        // corner a (x, z, height), corner b (x, z, height), neighbour tile
        [tx, ty, h[0], tx + 1, ty, h[1], tx, ty - 1],
        [tx + 1, ty, h[1], tx + 1, ty + 1, h[2], tx + 1, ty],
        [tx + 1, ty + 1, h[2], tx, ty + 1, h[3], tx, ty + 1],
        [tx, ty + 1, h[3], tx, ty, h[0], tx - 1, ty],
      ];
      for (const [ax, az, ag, bx, bz, bg, nx, ny] of edges) {
        const nw = Math.max(0, level(nx, ny));
        if (nw >= w) continue;
        const bottomA = Math.min(w, Math.max(ag, nw));
        const bottomB = Math.min(w, Math.max(bg, nw));
        if (bottomA >= w && bottomB >= w) continue;
        const fall = nw > ag && nw > bg;
        // The foot of the wall: the lower water's surface, or the ground just under it.
        const foot = (b: number, g: number) => (nw > g ? b * HEIGHT_STEP - SURFACE_DROP : b * HEIGHT_STEP - 0.02);
        const ya = foot(bottomA, ag);
        const yb = foot(bottomB, bg);
        const kind = fall ? FALL : SIDE;
        const splash = fall ? 1 : 0;
        positions.push(ax, top, az, bx, yb, bz, bx, top, bz, ax, top, az, ax, ya, az, bx, yb, bz);
        attrs.push(0, 3, kind, splash, 3, kind, 0, 3, kind, 0, 3, kind, splash, 3, kind, splash, 3, kind);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aWater', new THREE.Float32BufferAttribute(attrs, 3));
  geometry.computeVertexNormals();
  return geometry;
}

const NOISE = /* glsl */ `
  float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float wNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), u.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
`;

export interface WaterMaterial {
  material: THREE.MeshPhongMaterial;
  /** Advance the ripples by dt seconds. */
  tick(dt: number): void;
}

export function createWaterMaterial(): WaterMaterial {
  const uniforms = {
    uTime: { value: 0 },
    uShallow: { value: new THREE.Color(palette.waterShallow) },
    uDeep: { value: new THREE.Color(palette.water) },
    uFoam: { value: new THREE.Color(palette.foam) },
  };
  const material = new THREE.MeshPhongMaterial({
    color: palette.water,
    transparent: true,
    shininess: 90,
    specular: 0x9fc4dd,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aWater;\nvarying vec3 vWater;\nvarying vec3 vWPos;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvWater = aWater;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
varying vec3 vWater;
varying vec3 vWPos;
${NOISE}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float deep = smoothstep(0.2, 3.0, vWater.y);
  vec3 col = mix(uShallow, uDeep, deep);
  float alpha = mix(0.62, 0.9, deep);
  float foam = 0.0;
  vec2 drift = vec2(uTime * 0.21, uTime * 0.13);
  float n = wNoise(vWPos.xz * 2.4 + drift) * 0.6 + wNoise(vWPos.xz * 6.0 - drift * 1.7) * 0.4;
  if (vWater.z < 0.5) {
    float lap = 0.06 * sin(uTime * 1.5 + vWPos.x * 2.3 + vWPos.z * 1.7);
    float edge = vWater.x + (n - 0.5) * 0.45 + lap;
    foam = smoothstep(0.66, 0.82, edge);
    // A thin second line of foam a little way out.
    foam = max(foam, 0.45 * smoothstep(0.44, 0.48, edge) * (1.0 - smoothstep(0.5, 0.55, edge)));
    // Small glints of light catching the ripples.
    col += vec3(0.05) * smoothstep(0.8, 0.95, wNoise(vWPos.xz * 7.0 + drift * 3.0));
  } else {
    // The side of a raised pool: clear water seen edge-on.
    col = mix(uShallow, uDeep, 0.55) * 1.1 + vec3(0.05) * n;
    alpha = 0.78;
    if (vWater.z > 1.5) {
      // Falling water: streaks that run downward.
      float streak = wNoise(vec2((vWPos.x + vWPos.z) * 7.0, vWPos.y * 2.5 + uTime * 3.0));
      col = mix(col, uFoam, 0.2 + 0.45 * streak);
      foam = smoothstep(0.55, 0.95, vWater.x + (n - 0.5) * 0.4);
    }
  }
  diffuseColor.rgb = mix(col, uFoam, foam);
  diffuseColor.a = mix(alpha, 0.96, foam);
}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
if (vWater.z < 0.5) {
  vec2 p = vWPos.xz;
  float t = uTime;
  // Slope of three travelling waves, in world space.
  vec2 g = vec2(0.0);
  g += vec2(3.1, 1.3) * cos(dot(p, vec2(3.1, 1.3)) + t * 1.7) * 0.022;
  g += vec2(-1.7, 2.9) * cos(dot(p, vec2(-1.7, 2.9)) + t * 1.3) * 0.02;
  g += vec2(5.3, -4.1) * cos(dot(p, vec2(5.3, -4.1)) + t * 2.6) * 0.008;
  vec3 wn = normalize(vec3(-g.x, 1.0, -g.y));
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}`,
      );
  };
  material.customProgramCacheKey = () => 'thrillwright-water';
  return {
    material,
    tick(dt) {
      uniforms.uTime.value = (uniforms.uTime.value + dt) % 1000;
    },
  };
}
