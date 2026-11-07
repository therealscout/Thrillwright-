/**
 * Original low-poly placeholder models for every ride and stall, built from
 * simple shapes in code. Each model faces +z (its entrance side) and fits its
 * footprint, with (0, 0, 0) at the centre of the footprint on the ground.
 */
import * as THREE from 'three';
import { buildingType } from '../core/catalog';

export interface BuildingModel {
  group: THREE.Group;
  /** Advance animation. `speed` eases 0..1 as the ride starts and stops; `phase` is 0..1 through the cycle. */
  animate(dt: number, speed: number, phase: number): void;
}

const mats = new Map<string, THREE.MeshLambertMaterial>();
function mat(color: string): THREE.MeshLambertMaterial {
  let m = mats.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    m.emissive.copy(m.color).multiplyScalar(0.45 * glow);
    mats.set(color, m);
  }
  return m;
}

let glow = 0;

/**
 * Light the rides and stalls up after dark: every model colour gets a little
 * of itself back as emitted light, so they stand out against the night.
 */
export function setModelGlow(amount: number): void {
  if (Math.abs(amount - glow) < 0.01) return;
  glow = amount;
  for (const m of mats.values()) m.emissive.copy(m.color).multiplyScalar(0.45 * amount);
}

function mesh(geometry: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geometry, mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A striped cone roof: alternating coloured wedges. */
function stripedRoof(radius: number, height: number, a: string, b: string, segments = 12): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < segments; i++) {
    const wedge = new THREE.ConeGeometry(radius, height, 1, 1, false, (i / segments) * Math.PI * 2, (Math.PI * 2) / segments);
    g.add(mesh(wedge, i % 2 ? a : b, 0, height / 2, 0));
  }
  return g;
}

function base(size: number, color = '#c8b9a6'): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(size - 0.1, 0.12, size - 0.1), color, 0, 0.06, 0);
}

/** A little entrance sign at the front edge of a footprint. */
function entranceSign(size: number, color: string): THREE.Group {
  const g = new THREE.Group();
  const z = size / 2 - 0.05;
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), '#5c4b3b', -0.35, 0.35, z));
  g.add(mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), '#5c4b3b', 0.35, 0.35, z));
  g.add(mesh(new THREE.BoxGeometry(0.86, 0.18, 0.06), color, 0, 0.72, z));
  return g;
}

function carousel(): BuildingModel {
  const group = new THREE.Group();
  group.add(base(3), entranceSign(3, '#ef476f'));
  group.add(mesh(new THREE.CylinderGeometry(1.3, 1.35, 0.18, 16), '#f7e1b5', 0, 0.21, 0));
  const spinner = new THREE.Group();
  spinner.position.y = 0.3;
  spinner.add(mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.3, 8), '#ffd166', 0, 0.65, 0));
  const horses: THREE.Object3D[] = [];
  const colors = ['#ffffff', '#ef476f', '#118ab2', '#ffd166'];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.cos(a) * 0.95;
    const z = Math.sin(a) * 0.95;
    spinner.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 5), '#d4af37', x, 0.65, z));
    const horse = mesh(new THREE.BoxGeometry(0.14, 0.18, 0.36), colors[i % 4] as string, x, 0.45, z);
    horse.rotation.y = -a;
    horses.push(horse);
    spinner.add(horse);
  }
  const roof = stripedRoof(1.45, 0.7, '#ef476f', '#fff4e0', 16);
  roof.position.y = 1.3;
  spinner.add(roof);
  group.add(spinner);
  let t = 0;
  return {
    group,
    animate(dt, speed) {
      t += dt * speed;
      spinner.rotation.y += dt * speed * 1.2;
      horses.forEach((h, i) => (h.position.y = 0.45 + Math.sin(t * 4 + i * 1.6) * 0.08 * speed));
    },
  };
}

function spinCups(): BuildingModel {
  const group = new THREE.Group();
  group.add(base(3), entranceSign(3, '#9b5de5'));
  const plate = new THREE.Group();
  plate.position.y = 0.14;
  plate.add(mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.1, 20), '#f15bb5', 0, 0.05, 0));
  plate.add(mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.5, 8), '#fee440', 0, 0.3, 0));
  const cups: THREE.Group[] = [];
  const colors = ['#00bbf9', '#fee440', '#06d6a0', '#ff595e'];
  for (let i = 0; i < 4; i++) {
    const cup = new THREE.Group();
    const a = (i / 4) * Math.PI * 2;
    cup.position.set(Math.cos(a) * 0.8, 0.1, Math.sin(a) * 0.8);
    cup.add(mesh(new THREE.CylinderGeometry(0.32, 0.22, 0.32, 10, 1, true), colors[i] as string, 0, 0.16, 0));
    cup.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 10), '#ffffff', 0, 0.02, 0));
    cups.push(cup);
    plate.add(cup);
  }
  for (const c of cups) for (const child of c.children) ((child as THREE.Mesh).material as THREE.Material).side = THREE.DoubleSide;
  group.add(plate);
  return {
    group,
    animate(dt, speed) {
      plate.rotation.y += dt * speed * 0.8;
      cups.forEach((c, i) => (c.rotation.y -= dt * speed * (2 + i * 0.4)));
    },
  };
}

function swingTower(): BuildingModel {
  const group = new THREE.Group();
  group.add(base(3), entranceSign(3, '#06d6a0'));
  group.add(mesh(new THREE.CylinderGeometry(0.15, 0.22, 3, 8), '#e9ecef', 0, 1.5, 0));
  const top = new THREE.Group();
  top.position.y = 3;
  const crown = stripedRoof(0.7, 0.4, '#06d6a0', '#ffffff', 12);
  top.add(crown);
  top.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 16), '#ffd166', 0, 0, 0));
  const arms: THREE.Group[] = [];
  for (let i = 0; i < 10; i++) {
    const arm = new THREE.Group();
    const a = (i / 10) * Math.PI * 2;
    arm.position.set(Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7);
    arm.rotation.y = -a;
    const swing = new THREE.Group();
    swing.add(mesh(new THREE.BoxGeometry(0.015, 1.4, 0.015), '#adb5bd', 0, -0.7, 0));
    swing.add(mesh(new THREE.BoxGeometry(0.16, 0.05, 0.14), i % 2 ? '#118ab2' : '#ef476f', 0, -1.42, 0));
    arm.add(swing);
    arms.push(swing);
    top.add(arm);
  }
  group.add(top);
  return {
    group,
    animate(dt, speed) {
      top.rotation.y += dt * speed * 1.6;
      // Chairs fly outward as the top spins faster.
      for (const s of arms) s.rotation.z = speed * 0.75;
    },
  };
}

function skyWheel(): BuildingModel {
  const group = new THREE.Group();
  group.add(base(3), entranceSign(3, '#118ab2'));
  const hub = 2.0;
  for (const side of [-0.35, 0.35]) {
    for (const lean of [-1, 1]) {
      const leg = mesh(new THREE.BoxGeometry(0.08, 2.15, 0.08), '#e9ecef', lean * 0.5, hub / 2, side);
      leg.rotation.z = lean * 0.28;
      group.add(leg);
    }
  }
  const wheel = new THREE.Group();
  wheel.position.y = hub;
  wheel.add(mesh(new THREE.TorusGeometry(1.35, 0.04, 6, 32), '#118ab2'));
  wheel.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8).rotateX(Math.PI / 2), '#ffd166'));
  const gondolas: THREE.Object3D[] = [];
  const colors = ['#ef476f', '#ffd166', '#06d6a0', '#9b5de5'];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const spoke = mesh(new THREE.BoxGeometry(0.03, 1.35, 0.03), '#dee2e6', Math.cos(a) * 0.675, Math.sin(a) * 0.675, 0);
    spoke.rotation.z = a - Math.PI / 2;
    wheel.add(spoke);
    const g = mesh(new THREE.BoxGeometry(0.26, 0.24, 0.26), colors[i % 4] as string, Math.cos(a) * 1.35, Math.sin(a) * 1.35 - 0.16, 0);
    gondolas.push(g);
    wheel.add(g);
  }
  // The wheel turns across the front, so it faces the entrance side-on.
  const holder = new THREE.Group();
  holder.rotation.y = Math.PI / 2;
  holder.add(wheel);
  group.add(holder);
  return {
    group,
    animate(dt, speed) {
      wheel.rotation.z += dt * speed * 0.25;
      // Gondolas hang level.
      for (const g of gondolas) g.rotation.z = -wheel.rotation.z;
    },
  };
}

function dropTower(): BuildingModel {
  const group = new THREE.Group();
  group.add(base(3), entranceSign(3, '#ff595e'));
  const height = 5;
  group.add(mesh(new THREE.BoxGeometry(0.36, height, 0.36), '#e9ecef', 0, height / 2, 0));
  group.add(mesh(new THREE.ConeGeometry(0.3, 0.5, 4).rotateY(Math.PI / 4), '#ff595e', 0, height + 0.25, 0));
  const ring = new THREE.Group();
  ring.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.22, 12), '#ff595e'));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ring.add(mesh(new THREE.BoxGeometry(0.16, 0.3, 0.12), '#2b2d42', Math.cos(a) * 0.82, -0.12, Math.sin(a) * 0.82));
  }
  ring.position.y = 0.5;
  group.add(ring);
  return {
    group,
    animate(_dt, speed, phase) {
      // Slow climb, a pause at the top, then a fast drop.
      let y = 0.5;
      if (speed > 0.05 && phase > 0) {
        if (phase < 0.6) y = 0.5 + (phase / 0.6) * (height - 1);
        else if (phase < 0.75) y = height - 0.5;
        else if (phase < 0.8) y = height - 0.5 - ((phase - 0.75) / 0.05) * (height - 1);
        else y = 0.5;
      }
      ring.position.y = y;
    },
  };
}

function bumperCars(): BuildingModel {
  const group = new THREE.Group();
  group.add(base(3), entranceSign(3, '#00bbf9'));
  // A low arena with a rubber rail and a roof on four posts.
  group.add(mesh(new THREE.BoxGeometry(2.6, 0.06, 2.3), '#5c677d', 0, 0.15, -0.15));
  for (const [w, d, x, z] of [[2.7, 0.1, 0, -1.3], [2.7, 0.1, 0, 1.0], [0.1, 2.4, -1.3, -0.15], [0.1, 2.4, 1.3, -0.15]] as const) {
    group.add(mesh(new THREE.BoxGeometry(w, 0.16, d), '#fee440', x, 0.24, z));
  }
  for (const [x, z] of [[-1.25, -1.25], [1.25, -1.25], [-1.25, 0.95], [1.25, 0.95]] as const) {
    group.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), '#adb5bd', x, 0.8, z));
  }
  group.add(mesh(new THREE.BoxGeometry(2.7, 0.08, 2.4), '#00bbf9', 0, 1.42, -0.15));
  const cars: THREE.Group[] = [];
  const colors = ['#ef476f', '#06d6a0', '#ffd166', '#9b5de5', '#f78c6b', '#118ab2'];
  for (let i = 0; i < 6; i++) {
    const car = new THREE.Group();
    car.add(mesh(new THREE.BoxGeometry(0.32, 0.12, 0.42), colors[i] as string, 0, 0.06, 0));
    car.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.05, 5), '#495057', 0, 0.55, -0.15));
    car.position.y = 0.18;
    cars.push(car);
    group.add(car);
  }
  let t = 0;
  const place = () =>
    cars.forEach((c, i) => {
      const a = t * (0.5 + i * 0.07) + i * 1.9;
      c.position.x = Math.sin(a) * 0.9 + Math.sin(a * 2.3 + i) * 0.2;
      c.position.z = -0.15 + Math.cos(a * 0.8 + i) * 0.8;
      c.rotation.y = a * 1.3;
    });
  place();
  return {
    group,
    animate(dt, speed) {
      t += dt * speed;
      place();
    },
  };
}

function ghostManor(): BuildingModel {
  const group = new THREE.Group();
  group.add(base(3, '#6c757d'), entranceSign(3, '#7b2cbf'));
  // A crooked old house with a tower and a gabled roof.
  group.add(mesh(new THREE.BoxGeometry(2.2, 1.2, 1.7), '#7a6a92', 0, 0.72, -0.4));
  const roof = mesh(new THREE.ConeGeometry(1.65, 0.8, 4).rotateY(Math.PI / 4), '#3d3552', 0, 1.72, -0.4);
  roof.scale.set(1, 1, 0.78);
  group.add(roof);
  group.add(mesh(new THREE.BoxGeometry(0.6, 1.9, 0.6), '#6a5a82', 0.85, 1.07, -0.9));
  group.add(mesh(new THREE.ConeGeometry(0.45, 0.7, 4).rotateY(Math.PI / 4), '#2b2d42', 0.85, 2.37, -0.9));
  group.add(mesh(new THREE.BoxGeometry(0.5, 0.7, 0.04), '#1d1b26', 0, 0.47, 0.46));
  for (const x of [-0.7, 0.7]) group.add(mesh(new THREE.BoxGeometry(0.34, 0.3, 0.04), '#ffd166', x, 0.95, 0.46));
  const ghost = new THREE.Group();
  ghost.add(mesh(new THREE.SphereGeometry(0.18, 8, 6), '#f8f9fa', 0, 0.18, 0));
  ghost.add(mesh(new THREE.ConeGeometry(0.18, 0.28, 8).rotateX(Math.PI), '#f8f9fa', 0, 0.0, 0));
  ghost.position.set(-0.6, 2.0, -0.4);
  group.add(ghost);
  let t = 0;
  return {
    group,
    animate(dt, speed) {
      t += dt * (0.3 + speed);
      ghost.position.set(-0.6 + Math.sin(t * 0.7) * 0.5, 2.0 + Math.sin(t * 2) * 0.12, -0.4 + Math.cos(t * 0.7) * 0.3);
    },
  };
}

function swingingGalleon(): BuildingModel {
  const group = new THREE.Group();
  group.add(base(3), entranceSign(3, '#8a5a3b'));
  const pivotY = 2.2;
  // Two A-frames, front and back, hold an axle that runs across the boat.
  for (const z of [-0.95, 0.75]) {
    for (const x of [-0.55, 0.55]) {
      const leg = mesh(new THREE.BoxGeometry(0.1, 2.35, 0.1), '#e63946', x, pivotY / 2 + 0.05, z);
      leg.rotation.z = x > 0 ? 0.24 : -0.24;
      group.add(leg);
    }
  }
  group.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 6).rotateX(Math.PI / 2), '#adb5bd', 0, pivotY, -0.1));
  const swing = new THREE.Group();
  swing.position.set(0, pivotY, -0.1);
  for (const z of [-0.3, 0.3]) swing.add(mesh(new THREE.BoxGeometry(0.06, 1.45, 0.06), '#adb5bd', 0, -0.72, z));
  // The boat runs left to right: a hull that narrows at the keel, raised bow and stern, and a mast.
  swing.add(mesh(new THREE.BoxGeometry(2.0, 0.26, 0.7), '#8a5a3b', 0, -1.55, 0));
  swing.add(mesh(new THREE.BoxGeometry(1.5, 0.16, 0.4), '#6b4226', 0, -1.75, 0));
  for (const x of [-1.05, 1.05]) swing.add(mesh(new THREE.BoxGeometry(0.26, 0.5, 0.6), '#8a5a3b', x, -1.42, 0));
  swing.add(mesh(new THREE.BoxGeometry(1.9, 0.04, 0.6), '#d4a373', 0, -1.41, 0));
  swing.add(mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), '#5c4b3b', 0.5, -1.05, 0));
  swing.add(mesh(new THREE.BoxGeometry(0.03, 0.34, 0.3), '#fff4e0', 0.5, -0.95, 0));
  group.add(swing);
  return {
    group,
    animate(_dt, speed, phase) {
      // Swings build up to a big arc mid-ride, then settle.
      const arc = Math.sin(Math.PI * Math.min(1, Math.max(0, phase))) * 1.15 * speed;
      swing.rotation.z = Math.sin(phase * Math.PI * 12) * arc;
    },
  };
}

function whirlwind(): BuildingModel {
  const group = new THREE.Group();
  group.add(base(3), entranceSign(3, '#f15bb5'));
  group.add(mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.6, 8), '#2b2d42', 0, 0.42, 0));
  const arm = new THREE.Group();
  arm.position.y = 0.75;
  const wheel = new THREE.Group();
  wheel.add(mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.08, 16), '#f15bb5', 0, 0, 0));
  wheel.add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.3, 8), '#fee440', 0, 0.15, 0));
  const colors = ['#00bbf9', '#fee440', '#06d6a0', '#ff595e'];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const g = mesh(new THREE.BoxGeometry(0.26, 0.3, 0.22), colors[i % 4] as string, Math.cos(a) * 1.1, 0.18, Math.sin(a) * 1.1);
    g.rotation.y = -a;
    wheel.add(g);
  }
  arm.add(wheel);
  group.add(arm);
  return {
    group,
    animate(dt, speed, phase) {
      wheel.rotation.y += dt * speed * 3;
      // Tilt up on its side in the middle of the ride.
      const tilt = phase > 0.2 && phase < 0.8 ? Math.min(1, (phase - 0.2) / 0.15, (0.8 - phase) / 0.15) : 0;
      arm.rotation.x = -tilt * 1.05 * speed;
      arm.position.y = 0.75 + tilt * 0.9 * speed;
    },
  };
}

/** Something on the stall roof that says what it sells. */
type StallProp = 'hotdog' | 'pizza' | 'floss' | 'smoothie';

function stallProp(kind: StallProp): THREE.Group {
  const g = new THREE.Group();
  g.position.y = 1.02;
  if (kind === 'hotdog') {
    g.add(mesh(new THREE.CapsuleGeometry(0.07, 0.36, 3, 8).rotateZ(Math.PI / 2), '#c1440e', 0, 0.06, 0));
    g.add(mesh(new THREE.BoxGeometry(0.42, 0.08, 0.17), '#e9c46a', 0, 0, 0));
  } else if (kind === 'pizza') {
    const slice = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 3, 1, false, 0, Math.PI / 3), '#f4a261', 0, 0.05, 0);
    slice.rotation.x = Math.PI / 2.5;
    g.add(slice);
  } else if (kind === 'floss') {
    g.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4), '#ffffff', 0, 0.1, 0));
    g.add(mesh(new THREE.IcosahedronGeometry(0.16, 1), '#ffafcc', 0, 0.32, 0));
  } else {
    g.add(mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.26, 8), '#ff8fab', 0, 0.13, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 4), '#06d6a0', 0.04, 0.3, 0));
  }
  return g;
}

function stall(roofA: string, roofB: string, sign: string, prop?: StallProp): BuildingModel {
  const group = new THREE.Group();
  if (prop) group.add(stallProp(prop));
  group.add(mesh(new THREE.BoxGeometry(0.7, 0.55, 0.6), '#fff4e0', 0, 0.275, -0.05));
  group.add(mesh(new THREE.BoxGeometry(0.74, 0.08, 0.2), '#8a5a3b', 0, 0.42, 0.28));
  const roof = stripedRoof(0.6, 0.35, roofA, roofB, 8);
  roof.rotation.y = Math.PI / 8;
  roof.position.y = 0.55;
  group.add(roof);
  group.add(mesh(new THREE.BoxGeometry(0.5, 0.16, 0.04), sign, 0, 0.75, 0.3));
  return { group, animate() {} };
}

function restrooms(): BuildingModel {
  const group = new THREE.Group();
  group.add(mesh(new THREE.BoxGeometry(0.8, 0.6, 0.7), '#dee2e6', 0, 0.3, -0.05));
  group.add(mesh(new THREE.BoxGeometry(0.86, 0.06, 0.76), '#118ab2', 0, 0.63, -0.05));
  group.add(mesh(new THREE.BoxGeometry(0.18, 0.38, 0.02), '#118ab2', -0.18, 0.19, 0.31));
  group.add(mesh(new THREE.BoxGeometry(0.18, 0.38, 0.02), '#ef476f', 0.18, 0.19, 0.31));
  return { group, animate() {} };
}

export function createModel(typeId: string): BuildingModel {
  switch (typeId) {
    case 'carousel': return carousel();
    case 'spin-cups': return spinCups();
    case 'swing-tower': return swingTower();
    case 'sky-wheel': return skyWheel();
    case 'drop-tower': return dropTower();
    case 'burger-stand': return stall('#ef476f', '#ffd166', '#8a5a3b');
    case 'popcorn-cart': return stall('#ff595e', '#ffffff', '#fee440');
    case 'lemonade-stand': return stall('#fee440', '#ffffff', '#06d6a0');
    case 'ice-cream-cart': return stall('#9bf6ff', '#ffffff', '#ffadad');
    case 'coffee-kiosk': return stall('#6f4e37', '#f5ebe0', '#e3d5ca');
    case 'bumper-cars': return bumperCars();
    case 'ghost-manor': return ghostManor();
    case 'swinging-galleon': return swingingGalleon();
    case 'whirlwind': return whirlwind();
    case 'hot-dog-cart': return stall('#e63946', '#ffffff', '#e9c46a', 'hotdog');
    case 'pizza-stand': return stall('#2a9d8f', '#ffffff', '#f4a261', 'pizza');
    case 'candy-floss': return stall('#ffafcc', '#ffffff', '#bde0fe', 'floss');
    case 'smoothie-bar': return stall('#06d6a0', '#fee440', '#ff8fab', 'smoothie');
    case 'restrooms': return restrooms();
    default: {
      const size = buildingType(typeId).size;
      const group = new THREE.Group();
      group.add(mesh(new THREE.BoxGeometry(size * 0.8, 0.6, size * 0.8), '#adb5bd', 0, 0.3, 0));
      return { group, animate() {} };
    }
  }
}

/** Rotation that turns a model's +z front toward a facing (0 N, 1 E, 2 S, 3 W). */
export function facingRotation(facing: number): number {
  return [Math.PI, Math.PI / 2, 0, -Math.PI / 2][facing] ?? 0;
}
