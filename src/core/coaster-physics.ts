/**
 * The coaster test run: rolls a train once around the circuit under gravity,
 * friction, the chain lift and brakes, records speeds and G-forces, and turns
 * them into excitement, intensity and nausea ratings.
 *
 * Distances are in world units (one tile); METRES_PER_UNIT converts them for
 * display and for the physics constants.
 */
import type { CoasterDesign, CoasterRatings } from './coaster';
import { PIECES, sampleTrack, STATION_LENGTH, type TrackPoint } from './track';

export const METRES_PER_UNIT = 3;
const G = 9.81 / METRES_PER_UNIT;
const DT = 1 / 60;
/** Speed of the chain lift and the station's drive tyres, units/s. */
const LIFT_SPEED = 1.1;
const STATION_SPEED = 1.0;
/** Brakes slow the train to this speed. */
const BRAKE_SPEED = 1.4;
const ROLLING = 0.012;
const DRAG = 0.0035;
/** Time steps between timeline samples. */
export const TIMELINE_STEP = 6; // 0.1 s
const MAX_TIME = 400;
/** Track length over which riders' forces are averaged, units. */
const FORCE_WINDOW = 2;

export interface TestRun {
  ok: boolean;
  reason?: string;
  ratings?: CoasterRatings;
  /** Train position (distance along the track) every TIMELINE_STEP * DT seconds. */
  timeline: Float32Array;
  /** The sampled track the timeline refers to. */
  points: TrackPoint[];
}

/** Index of the last point at or before distance `s` (s within the track). */
function seek(points: readonly TrackPoint[], s: number, from: number): number {
  let i = from;
  const n = points.length;
  while (i < n - 2 && (points[i + 1] as TrackPoint).s <= s) i++;
  while (i > 0 && (points[i] as TrackPoint).s > s) i--;
  return i;
}

export function runTest(design: CoasterDesign): TestRun {
  const points = sampleTrack(design.start, design.pieces);
  const fail = (reason: string): TestRun => ({ ok: false, reason, timeline: new Float32Array(0), points });
  const last = points[points.length - 1];
  if (!last || points.length < 3) return fail('Build a track first.');
  const total = last.s;
  const stationEnd = points.filter((p) => p.piece < STATION_LENGTH).at(-1)?.s ?? 0;

  // Curvature (change of direction per unit length) at each point. Riders
  // feel forces averaged over the train's couplings, so measure the change
  // across about one train length rather than between neighbouring samples.
  let lo = 0, hi = 0;
  const curve = points.map((p) => {
    while ((points[lo] as TrackPoint).s < p.s - FORCE_WINDOW / 2) lo++;
    while (hi < points.length - 1 && (points[hi + 1] as TrackPoint).s <= p.s + FORCE_WINDOW / 2) hi++;
    const a = points[lo] as TrackPoint;
    const b = points[Math.max(hi, lo + 1)] ?? a;
    const ds = b.s - a.s || 1;
    return { x: (b.tx - a.tx) / ds, y: (b.ty - a.ty) / ds, z: (b.tz - a.tz) / ds };
  });

  let s = stationEnd;
  let v = 0;
  let t = 0;
  let idx = seek(points, s, 0);
  let maxV = 0, maxPos = 1, minVert = 1, maxLat = 0, airtime = 0;
  const timeline: number[] = [s];
  let step = 0;

  while (true) {
    const travelled = s - stationEnd;
    const p = s % total;
    idx = seek(points, p, idx);
    const pt = points[idx] as TrackPoint;
    const arriving = travelled > total * 0.5 && p < stationEnd + 1e-6 && (pt.station || travelled >= total - 1e-6);

    // Gravity along the track, rolling resistance and air drag.
    const a = -G * pt.ty - ROLLING * G - DRAG * v * v;
    v += a * DT;
    if (pt.lift && v < LIFT_SPEED) v = LIFT_SPEED;
    if (pt.brake && v > BRAKE_SPEED) v = Math.max(BRAKE_SPEED, v - 25 * DT);
    if (pt.station) {
      if (arriving) {
        // Brake to a stop at the end of the station.
        const left = total + stationEnd - s;
        v = Math.min(v, Math.max(0.15, Math.sqrt(2 * 1.5 * Math.max(left, 0))));
        if (left <= 0.02) break;
      } else if (v < STATION_SPEED) {
        v = Math.min(STATION_SPEED, v + 2 * DT);
      }
    }
    if (v <= 0.02 && !pt.station) {
      const kind = PIECES[design.pieces[pt.piece]?.kind ?? 'straight'].name.toLowerCase();
      return fail(`The train stalled on piece ${pt.piece + 1} (${kind}). Add a taller lift hill or a chain lift.`);
    }

    // Forces felt by riders: centripetal plus gravity, in the rider's frame.
    const k = curve[idx] as { x: number; y: number; z: number };
    const fx = v * v * k.x;
    const fy = v * v * k.y + G;
    const fz = v * v * k.z;
    const vert = (fx * pt.ux + fy * pt.uy + fz * pt.uz) / G;
    // Rider's right = tangent x up.
    const rx = pt.ty * pt.uz - pt.tz * pt.uy;
    const ry = pt.tz * pt.ux - pt.tx * pt.uz;
    const rz = pt.tx * pt.uy - pt.ty * pt.ux;
    const lat = Math.abs(fx * rx + fy * ry + fz * rz) / G;
    if (!pt.station) {
      maxPos = Math.max(maxPos, vert);
      minVert = Math.min(minVert, vert);
      maxLat = Math.max(maxLat, lat);
      if (vert < 0) airtime += DT;
    }
    maxV = Math.max(maxV, v);

    s += v * DT;
    t += DT;
    if (++step % TIMELINE_STEP === 0) timeline.push(s);
    if (t > MAX_TIME) return fail('The train never made it back to the station.');
  }
  timeline.push(total + stationEnd);

  const ratings = rate(design, points, {
    maxSpeed: maxV * METRES_PER_UNIT,
    length: total * METRES_PER_UNIT,
    duration: t,
    maxPositiveG: maxPos,
    maxNegativeG: minVert,
    maxLateralG: maxLat,
    airtime,
  });
  return { ok: true, ratings, timeline: Float32Array.from(timeline), points };
}

type Measured = Pick<CoasterRatings, 'maxSpeed' | 'length' | 'duration' | 'maxPositiveG' | 'maxNegativeG' | 'maxLateralG' | 'airtime'>;

function rate(design: CoasterDesign, points: readonly TrackPoint[], m: Measured): CoasterRatings {
  // Drops: continuous descents steeper than gentle; count those over a metre.
  let drops = 0, highestDrop = 0, top = 0, falling = false;
  for (let i = 1; i < points.length; i++) {
    const p = points[i] as TrackPoint;
    const prev = points[i - 1] as TrackPoint;
    if (p.y < prev.y - 1e-6) {
      if (!falling) { falling = true; top = prev.y; }
      highestDrop = Math.max(highestDrop, (top - p.y) * METRES_PER_UNIT);
    } else if (falling) {
      if ((top - prev.y) * METRES_PER_UNIT > 1) drops++;
      falling = false;
    }
  }
  if (falling && (top - (points[points.length - 1] as TrackPoint).y) * METRES_PER_UNIT > 1) drops++;
  const inversions = design.pieces.filter((p) => p.kind === 'loop').length;
  const turns = design.pieces.filter((p) => PIECES[p.kind].turn !== 0).length;

  const negG = Math.max(0, -m.maxNegativeG);
  let excitement =
    0.6 +
    m.maxSpeed * 0.08 +
    Math.min(drops, 6) * 0.35 +
    highestDrop * 0.07 +
    inversions * 1.1 +
    Math.min(m.duration, 120) / 50 +
    Math.min(m.airtime, 4) * 0.35 +
    Math.min(turns, 12) * 0.08;
  const intensity =
    0.3 +
    Math.max(0, m.maxPositiveG - 1) * 0.9 +
    m.maxLateralG * 0.8 +
    negG * 1.5 +
    m.maxSpeed * 0.06 +
    inversions * 0.7;
  const nausea =
    0.3 +
    m.maxLateralG * 0.5 +
    Math.max(0, m.maxPositiveG - 3) * 0.3 +
    inversions * 1.2 +
    negG * 0.8 +
    Math.min(turns, 16) * 0.06;
  // Rides that are far too intense are less fun for everybody.
  if (intensity > 9) excitement *= Math.max(0.35, 1 - (intensity - 9) * 0.12);
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return {
    excitement: r2(Math.max(0, excitement)),
    intensity: r2(intensity),
    nausea: r2(nausea),
    maxSpeed: r2(m.maxSpeed),
    length: Math.round(m.length),
    duration: Math.round(m.duration),
    maxPositiveG: r2(m.maxPositiveG),
    maxNegativeG: r2(m.maxNegativeG),
    maxLateralG: r2(m.maxLateralG),
    drops,
    highestDrop: r2(highestDrop),
    inversions,
    airtime: r2(m.airtime),
  };
}

/** Where the train is `time` seconds into a run. */
export function trainPosition(timeline: Float32Array, time: number): number {
  const n = timeline.length;
  if (n === 0) return 0;
  const f = Math.max(0, time / (TIMELINE_STEP * DT));
  const i = Math.min(n - 1, Math.floor(f));
  const j = Math.min(n - 1, i + 1);
  const a = timeline[i] as number;
  const b = timeline[j] as number;
  return a + (b - a) * (f - i);
}
