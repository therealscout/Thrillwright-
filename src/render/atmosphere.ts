/**
 * Sky, sunlight, day and night, and rain. The look is worked out by a pure
 * function (`skyState`) so it can be tested; `Atmosphere` applies it to the
 * scene and draws the falling rain.
 */
import * as THREE from 'three';
import { palette } from './palette';

export interface SkyInput {
  /** Time of day, 0..1: 0 is midnight, 0.5 is noon. */
  time: number;
  /** 0 clear .. 1 overcast. */
  cloud: number;
  /** 0 dry .. 1 heavy rain. */
  rain: number;
}

export interface SkyState {
  sky: THREE.Color;
  sun: THREE.Color;
  sunIntensity: number;
  /** Hemisphere (ambient) light strength. */
  ambient: number;
  ambientSky: THREE.Color;
  /** Sun direction (normalised, pointing from the ground to the sun). */
  sunDir: THREE.Vector3;
  /** 0 by day .. 1 at full night, for lamps and ride lights. */
  night: number;
}

const DAY_SKY = new THREE.Color(palette.sky);
const DUSK_SKY = new THREE.Color('#f2b38a');
const NIGHT_SKY = new THREE.Color('#1c2a4a');
const STORM_SKY = new THREE.Color('#8e9aa6');
const DAY_SUN = new THREE.Color(palette.sun);
const DUSK_SUN = new THREE.Color('#ffb070');
const MOON = new THREE.Color('#9fb6ff');

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Daylight from 0 (night) to 1 (day). Days are long and nights short, so the
 * park stays easy to see most of the time: dawn around 0.22, dusk around 0.82.
 */
export function daylight(time: number): number {
  const t = ((time % 1) + 1) % 1;
  return smooth(0.18, 0.28, t) * (1 - smooth(0.78, 0.88, t));
}

export function skyState({ time, cloud, rain }: SkyInput): SkyState {
  const t = ((time % 1) + 1) % 1;
  const day = daylight(t);
  // Warm light near sunrise and sunset.
  const dusk = Math.max(0, 1 - Math.abs(day - 0.5) * 2) * (t > 0.1 && t < 0.95 ? 1 : 0);
  const gloom = Math.max(cloud * 0.6, rain * 0.85);

  const sky = NIGHT_SKY.clone().lerp(DAY_SKY, day).lerp(DUSK_SKY, dusk * 0.45);
  sky.lerp(STORM_SKY.clone().multiplyScalar(0.35 + day * 0.65), gloom * 0.8);

  const sun = MOON.clone().lerp(DAY_SUN, day).lerp(DUSK_SUN, dusk * 0.6);
  const sunIntensity = (0.35 + day * 1.85) * (1 - gloom * 0.6);
  const ambient = (0.45 + day * 0.65) * (1 - gloom * 0.3);
  const ambientSky = new THREE.Color(palette.skyLight).lerp(MOON, 1 - day);

  // The sun crosses the sky from east to west; at night the moon light sits high.
  const arc = (t - 0.25) * Math.PI * 2; // 0 at sunrise, PI at sunset
  const height = day > 0.05 ? Math.max(0.35, Math.sin(Math.max(0, Math.min(Math.PI, arc)))) : 0.9;
  const across = day > 0.05 ? Math.cos(Math.max(0, Math.min(Math.PI, arc))) : 0.2;
  const sunDir = new THREE.Vector3(across * 0.8 + 0.2, height, -0.25).normalize();

  return { sky, sun, sunIntensity, ambient, ambientSky, sunDir, night: 1 - day };
}

const RAIN_DROPS = 1400;
const RAIN_BOX = 70;
const RAIN_HEIGHT = 40;

/** Applies a SkyState to the scene's lights and draws rain around the view. */
export class Atmosphere {
  readonly rainLines: THREE.LineSegments;
  private readonly positions: Float32Array;
  private readonly speeds: Float32Array;
  private rain = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly hemi: THREE.HemisphereLight,
    private readonly sun: THREE.DirectionalLight,
    private readonly centre: THREE.Vector3,
    private readonly sunDistance: number,
  ) {
    this.positions = new Float32Array(RAIN_DROPS * 6);
    this.speeds = new Float32Array(RAIN_DROPS);
    for (let i = 0; i < RAIN_DROPS; i++) this.resetDrop(i, Math.random() * RAIN_HEIGHT);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const mat = new THREE.LineBasicMaterial({ color: '#cfe3f5', transparent: true, opacity: 0.45, depthWrite: false });
    this.rainLines = new THREE.LineSegments(geo, mat);
    this.rainLines.frustumCulled = false;
    this.rainLines.visible = false;
    scene.add(this.rainLines);
  }

  apply(state: SkyState, rain: number): void {
    (this.scene.background as THREE.Color).copy(state.sky);
    this.scene.fog?.color.copy(state.sky);
    this.sun.color.copy(state.sun);
    this.sun.intensity = state.sunIntensity;
    this.sun.position.copy(this.centre).addScaledVector(state.sunDir, this.sunDistance);
    this.hemi.intensity = state.ambient;
    this.hemi.color.copy(state.ambientSky);
    this.rain = rain;
    this.rainLines.visible = rain > 0.02;
  }

  /** Move the rain along; it falls in a box that follows the camera target. */
  update(dt: number, target: THREE.Vector3): void {
    if (!this.rainLines.visible) return;
    const active = Math.floor(RAIN_DROPS * Math.min(1, this.rain));
    const p = this.positions;
    for (let i = 0; i < RAIN_DROPS; i++) {
      const o = i * 6;
      if (i >= active) {
        // Park unused drops out of sight.
        p[o + 1] = p[o + 4] = -1000;
        continue;
      }
      const fall = (this.speeds[i] as number) * dt;
      p[o + 1] = (p[o + 1] as number) - fall;
      p[o + 4] = (p[o + 4] as number) - fall;
      // Keep drops in a box around the view as it moves.
      const dx = (p[o] as number) - target.x;
      const dz = (p[o + 2] as number) - target.z;
      if ((p[o + 4] as number) < target.y - 4 || Math.abs(dx) > RAIN_BOX || Math.abs(dz) > RAIN_BOX) {
        this.resetDrop(i, RAIN_HEIGHT, target);
      }
    }
    (this.rainLines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private resetDrop(i: number, height: number, target = this.centre): void {
    const o = i * 6;
    const x = target.x + (Math.random() * 2 - 1) * RAIN_BOX;
    const z = target.z + (Math.random() * 2 - 1) * RAIN_BOX;
    const y = target.y + Math.random() * height;
    const len = 0.6 + Math.random() * 0.5;
    this.positions[o] = x;
    this.positions[o + 1] = y;
    this.positions[o + 2] = z;
    this.positions[o + 3] = x + 0.08;
    this.positions[o + 4] = y + len;
    this.positions[o + 5] = z + 0.04;
    this.speeds[i] = 28 + Math.random() * 10;
  }
}
