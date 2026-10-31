/**
 * Shared, camera-independent geometric contract for the miniature props.
 *
 * All numbers are in model units; the scene graph and ant positions use x4
 * world coordinates. A plate with a foot ring must be a CLOSED 3-D solid, not
 * a heightfield painted on the stool. The authoring profile is reused by the
 * renderer and by the walking surfaces.
 */
import { clamp, unit, add, sub, mul, dot, cross, length } from './core.js';

export const MINI_SCALE = 4;
export const MINI = Object.freeze({
  floorY: -1.85,
  groundHalfX: 4.0,
  groundHalfZ: 3.7,
  seatY: 0.25,
  seatHalf: 1.70,
  legOffset: 1.53,
  legRadius: 0.20,
  plateRadius: 1.27,
  appleX: -0.35,
  appleZ: -0.15,
  // The new fruit is WIDER than tall, rather than the old stretched ellipsoid.
  appleRadius: 0.65,
  appleHeight: 0.86,
  spoonX: 0.89,
  spoonZ: 0.39,
});

export const LEGS = Object.freeze([
  [-MINI.legOffset, MINI.legOffset],
  [ MINI.legOffset, MINI.legOffset],
  [-MINI.legOffset,-MINI.legOffset],
  [ MINI.legOffset,-MINI.legOffset],
]);

// Radius, height above the wooden stool. A loop around this profile forms a
// real ceramic cross-section: top -> rolled lip -> underside -> outside of
// raised foot -> annular contact ring -> inner foot -> underside center.
export const PLATE_PROFILE = Object.freeze([
  [0.00, 0.104],
  [0.40, 0.104],
  [0.57, 0.106],
  [0.75, 0.120],
  [0.95, 0.164],
  [1.10, 0.204],
  [1.17, 0.218],
  [1.23, 0.212],
  [1.27, 0.176],
  [1.27, 0.110],
  [1.15, 0.083],
  [0.91, 0.064],
  [0.63, 0.061],
  [0.55, 0.063],
  [0.55, 0.000],
  [0.43, 0.000],
  [0.43, 0.055],
  [0.00, 0.078],
]);

export const PLATE_TOP_END = 8;
export const PLATE_FOOT_CONTACT = 14;
export const PLATE_FOOT_OUTER = 0.55;
export const PLATE_FOOT_INNER = 0.43;

// An apple profile, NOT a buried ellipsoid: narrower base, broad shoulders,
// slightly indented crown. The base ring matches the ceramic top exactly;
// no fruit geometry is authored underneath the plate.
export const APPLE_PROFILE = Object.freeze([
  [0.32, 0.000],
  [0.36, 0.028],
  [0.50, 0.115],
  [0.62, 0.245],
  [0.65, 0.365],
  [0.635, 0.48],
  [0.585, 0.635],
  [0.49, 0.770],
  [0.35, 0.845],
  [0.20, 0.855],
  [0.085, 0.830],
  [0.00, 0.795],
]);
export const APPLE_FOOT_RADIUS = APPLE_PROFILE[0][0];
export const APPLE_MAX_RADIUS = APPLE_PROFILE[4][0];

export const SPOON = Object.freeze({
  bowl: [0.89, 0.39],
  bowlLong: 0.265,
  bowlWide: 0.16,
  // Long raised handle begins at the bowl neck, then bridges to the apple.
  start: [0.74, 0.27],
  end: [MINI.appleX + APPLE_MAX_RADIUS, MINI.appleZ],
  halfWidth: 0.064,
});

const smoothstep = (t) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

export function profileMetrics(profile) {
  const distances = [0];
  for (let i = 1; i < profile.length; i += 1) {
    const [r0, h0] = profile[i - 1];
    const [r1, h1] = profile[i];
    distances.push(distances[i - 1] + Math.hypot(r1 - r0, h1 - h0));
  }
  return Object.freeze({ distances, length: distances[distances.length - 1] });
}
export const PLATE_METRICS = profileMetrics(PLATE_PROFILE);
export const APPLE_METRICS = profileMetrics(APPLE_PROFILE);

export function sampleProfile(profile, metrics, q) {
  const s = clamp(q, 0, metrics.length);
  let i = 0;
  while (i < profile.length - 2 && metrics.distances[i + 1] < s) i += 1;
  const from = metrics.distances[i], to = metrics.distances[i + 1];
  const t = to > from ? (s - from) / (to - from) : 0;
  const a = profile[i], b = profile[i + 1];
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ];
}

// Top-facing dish ceramic height, with a single-valued radial graph only on
// the TOP portion. Its underside is a separate surface, not a tabletop ramp.
export function plateHeight(x, z) {
  const r = Math.min(MINI.plateRadius, Math.hypot(x, z));
  for (let i = 1; i <= PLATE_TOP_END; i += 1) {
    const a = PLATE_PROFILE[i - 1], b = PLATE_PROFILE[i];
    if (r <= b[0] + 1e-9) {
      const t = b[0] === a[0] ? 0 : (r - a[0]) / (b[0] - a[0]);
      return MINI.seatY + a[1] + (b[1] - a[1]) * clamp(t, 0, 1);
    }
  }
  return MINI.seatY + PLATE_PROFILE[PLATE_TOP_END][1];
}

export function appleCenter() {
  return [MINI.appleX, plateHeight(MINI.appleX, MINI.appleZ), MINI.appleZ];
}

function appleLobes(q, theta) {
  // Fruit lobes grow towards the shoulder and vanish near the supporting
  // foot and top dimple. Both renderer and navigation sample this same value.
  const normalized = q / APPLE_METRICS.length;
  return 1 + 0.027 * Math.cos(5 * theta) *
    Math.sin(Math.PI * normalized) ** 2;
}
export function platePoint(q, theta, includeSpoon = false) {
  const [r, h] = sampleProfile(PLATE_PROFILE, PLATE_METRICS, q);
  const x = r * Math.cos(theta), z = r * Math.sin(theta);
  const isTop = q <= PLATE_METRICS.distances[PLATE_TOP_END] + 1e-8;
  return [x, MINI.seatY + h +
    (includeSpoon && isTop ? spoonRise(x, z) : 0), z];
}

export function applePoint(q, theta) {
  const [radius, height] = sampleProfile(APPLE_PROFILE, APPLE_METRICS, q);
  const r = radius * appleLobes(q, theta);
  const x = MINI.appleX + r * Math.cos(theta);
  const z = MINI.appleZ + r * Math.sin(theta);
  return [x, plateHeight(x, z) + height, z];
}

export function appleContact() {
  return applePoint(APPLE_METRICS.distances[4], 0);
}

export function spoonBridgeInfo(x, z) {
  const dx = SPOON.end[0] - SPOON.start[0];
  const dz = SPOON.end[1] - SPOON.start[1];
  const vx = x - SPOON.start[0], vz = z - SPOON.start[1];
  const length2 = dx * dx + dz * dz;
  const t = (vx * dx + vz * dz) / length2;
  const lateral = (dx * vz - dz * vx) / Math.sqrt(length2);
  return {
    t,
    lateral,
    inside: t >= 0 && t <= 1 && Math.abs(lateral) <= SPOON.halfWidth,
  };
}
export function spoonBowlInfo(x, z) {
  const dx = SPOON.start[0] - SPOON.end[0], dz = SPOON.start[1] - SPOON.end[1];
  const longitudinal = unit([dx, 0, dz]);
  const lateral = [-longitudinal[2], 0, longitudinal[0]];
  const vx = x - SPOON.bowl[0], vz = z - SPOON.bowl[1];
  const u = (vx * longitudinal[0] + vz * longitudinal[2]) / SPOON.bowlLong;
  const v = (vx * lateral[0] + vz * lateral[2]) / SPOON.bowlWide;
  return { u, v, radius: Math.hypot(u, v) };
}

// Deliberately shallow depressed spoon bowl + raised rim, and one continuous
// narrow ramp to the apple shoulder. Height is measured above CERAMIC top.
export function spoonRise(x, z) {
  const b = spoonBowlInfo(x, z);
  let bowl = 0;
  if (b.radius < 1) {
    const rim = smoothstep((b.radius - 0.68) / 0.24);
    const taper = 1 - smoothstep((b.radius - 0.91) / 0.09);
    bowl = (0.018 + 0.040 * rim) * taper;
  }

  const bridge = spoonBridgeInfo(x, z);
  if (bridge.t < 0 || bridge.t > 1) return bowl;
  const widthFactor = 1 - smoothstep((Math.abs(bridge.lateral) -
    SPOON.halfWidth * 0.8) / (SPOON.halfWidth * 0.2));
  const riseAtTip = appleContact()[1] - plateHeight(...SPOON.end);
  const ramp = (0.021 + (riseAtTip - 0.021) * smoothstep(bridge.t)) *
    smoothstep(bridge.t / 0.075);
  return Math.max(bowl, ramp * widthFactor);
}

export function walkingHeight(x, z) {
  // Only valid on the ceramic's upper face. Stool is separately at seatY.
  return plateHeight(x, z) + spoonRise(x, z);
}

export function surfacePoint(kind, q, theta) {
  if (kind === 'apple') return applePoint(q, theta);
  if (kind === 'plate') return platePoint(q, theta, true);
  throw new Error('Unknown profile surface: ' + kind);
}

export function surfaceNormal(kind, q, theta) {
  const metrics = kind === 'plate' ? PLATE_METRICS : APPLE_METRICS;
  const dq = 0.001;
  const da = 0.001;
  const p0 = surfacePoint(kind, Math.max(0, q - dq), theta);
  const p1 = surfacePoint(kind, Math.min(metrics.length, q + dq), theta);
  const a0 = surfacePoint(kind, q, theta - da);
  const a1 = surfacePoint(kind, q, theta + da);
  const along = sub(p1, p0);
  const around = sub(a1, a0);
  const n = kind === 'plate' ? cross(around, along) : cross(along, around);
  return length(n) > 1e-10 ? unit(n) : [0, 1, 0];
}

// For reset, equator bridge and apple-foot transitions, recover profile
// coordinates from a horizontal radius; no nearest unrelated surface snap.
export function plateQForRadius(r) {
  const clamped = clamp(r, 0, MINI.plateRadius);
  for (let i = 1; i <= PLATE_TOP_END; i += 1) {
    const a = PLATE_PROFILE[i - 1], b = PLATE_PROFILE[i];
    if (clamped <= b[0]) {
      const t = b[0] > a[0] ? (clamped - a[0]) / (b[0] - a[0]) : 0;
      return PLATE_METRICS.distances[i - 1] + t *
        (PLATE_METRICS.distances[i] - PLATE_METRICS.distances[i - 1]);
    }
  }
  return PLATE_METRICS.distances[PLATE_TOP_END];
}

export function plateIsGroundedOnlyByFoot() {
  // Useful for topology tests: only a small bottom annulus touches seatY.
  return PLATE_PROFILE.filter((point) => Math.abs(point[1]) < 1e-9);
}
