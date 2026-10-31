// Author-defined, camera-independent navigable surfaces for the miniature scene.
// This is a connected analytic test layout, NOT a generic triangle-mesh navigator.
// It intentionally uses exaggerated 1/12-dollhouse proportions, not real units.

import {
  add, sub, mul, dot, length, unit, tangent, transport, clamp,
} from './core.js';

export const MINI = Object.freeze({
  floorY: -1.85,
  groundHalfX: 4.0,
  groundHalfZ: 3.7,
  seatY: 0.25,
  seatHalf: 1.70,
  legOffset: 1.53,
  legRadius: 0.20,
  plateRadius: 1.27,
  appleX: -0.26,
  appleZ: -0.15,
  appleRadius: 0.39,
  appleHeight: 0.59,
  spoonX: 0.53,
  spoonZ: 0.28,
});

export const LEGS = Object.freeze([
  [-MINI.legOffset, MINI.legOffset],
  [ MINI.legOffset, MINI.legOffset],
  [-MINI.legOffset,-MINI.legOffset],
  [ MINI.legOffset,-MINI.legOffset],
]);

const UP = [0, 1, 0];
const EPS = 1e-9;

function smoothstep(t) {
  const v = clamp(t, 0, 1);
  return v * v * (3 - 2 * v);
}

// Ceramic plate as a shallow bowl rising continuously from the wooden seat.
// The lip is deliberately broad enough to be walkable and visually legible.
export function plateRise(radius) {
  const r = Math.max(0, radius);
  if (r >= MINI.plateRadius) return 0;
  if (r >= 1.16) return 0.145 * (1 - smoothstep((r - 1.16) / 0.11));
  if (r >= 0.98) return 0.245 - 0.1 * smoothstep((r - 0.98) / 0.18);
  if (r >= 0.70) return 0.055 + 0.19 * smoothstep((r - 0.70) / 0.28);
  return 0.055;
}

export function plateHeight(x, z) {
  return MINI.seatY + plateRise(Math.hypot(x, z));
}

function spoonRise(x, z) {
  const u = (x - MINI.spoonX) / 0.265;
  const v = (z - MINI.spoonZ) / 0.205;
  const r = Math.hypot(u, v);
  let bowl = 0;
  if (r < 1) {
    const falloff = 1 - smoothstep((r - 0.79) / 0.21);
    // Shallow depressed bowl with a softly raised perimeter.
    bowl = (0.018 + 0.068 * Math.exp(-((r - 0.72) / 0.21) ** 2)) * falloff;
  }

  let handle = 0;
  const begin = MINI.spoonX + 0.16;
  const end = 1.19;
  if (x > begin && x < end) {
    const edgeFade = smoothstep((x - begin) / 0.12) *
      (1 - smoothstep((x - (end - 0.10)) / 0.10));
    const sideFade = 1 - smoothstep((Math.abs(z - MINI.spoonZ) - 0.055) / 0.055);
    handle = 0.039 * edgeFade * sideFade;
  }
  return Math.max(bowl, handle);
}

export function walkingHeight(x, z) {
  return plateHeight(x, z) + spoonRise(x, z);
}

export function walkingNormal(x, z) {
  const e = 0.006;
  const dhdx = (walkingHeight(x + e, z) - walkingHeight(x - e, z)) / (2 * e);
  const dhdz = (walkingHeight(x, z + e) - walkingHeight(x, z - e)) / (2 * e);
  return unit([-dhdx, 1, -dhdz]);
}

export function appleCenter() {
  return [MINI.appleX, plateHeight(MINI.appleX, MINI.appleZ), MINI.appleZ];
}

function appleNormal(position) {
  const center = appleCenter();
  return unit([
    (position[0] - center[0]) / (MINI.appleRadius ** 2),
    (position[1] - center[1]) / (MINI.appleHeight ** 2),
    (position[2] - center[2]) / (MINI.appleRadius ** 2),
  ]);
}

function state(surface, p, n, f, leg = null) {
  return { shape: 'miniature', surface, leg, p: [...p], n: [...n], f: unit(tangent(f, n)) };
}

// Spawn presets are an explicit RESET operation. Traversal itself never teleports.
export function miniatureSpawn(name = 'ground') {
  const [cx, cz] = LEGS[0];
  if (name === 'leg') {
    return state('leg', [cx - MINI.legRadius, -0.75, cz], [-1, 0, 0], [0, 1, 0], 0);
  }
  if (name === 'stool') {
    return state('seat', [-1.10, MINI.seatY, 0.56], UP, [1, 0, 0]);
  }
  if (name === 'plate') {
    const x = 0.02, z = -0.72;
    return state('seat', [x, walkingHeight(x, z), z], walkingNormal(x, z), [0, 0, 1]);
  }
  if (name === 'apple') {
    const [x, cy, z] = appleCenter();
    return state('apple', [x, cy + MINI.appleHeight, z], UP, [1, 0, 0]);
  }
  if (name === 'spoon') {
    const x = 0.87, z = MINI.spoonZ;
    return state('seat', [x, walkingHeight(x, z), z], walkingNormal(x, z), [1, 0, 0]);
  }
  return state('ground', [cx - 0.80, MINI.floorY, cz], UP, [1, 0, 0]);
}

// A smooth curved surface cannot be walked through using a world-XZ shortcut.
// The solver follows the current 3-D tangent and reprojects onto the authored
// analytic patch after every small step.
function moveApple(s, direction, step) {
  const center = appleCenter();
  const candidate = add(s.p, mul(direction, step));
  const q = unit([
    (candidate[0] - center[0]) / MINI.appleRadius,
    (candidate[1] - center[1]) / MINI.appleHeight,
    (candidate[2] - center[2]) / MINI.appleRadius,
  ]);
  if (q[1] < -EPS) {
    // Leaving the upper fruit: roll from its equator back onto the plate.
    const progress = clamp((s.p[1] - center[1]) /
      Math.max(EPS, s.p[1] - candidate[1]), 0, 1);
    const point = add(s.p, mul(direction, step * progress));
    const radial = unit([point[0] - center[0], 0, point[2] - center[2]]);
    const x = center[0] + MINI.appleRadius * radial[0];
    const z = center[2] + MINI.appleRadius * radial[2];
    const normal = walkingNormal(x, z);
    const nextDirection = unit(tangent(transport(direction, s.n, normal), normal));
    s.surface = 'seat';
    s.p = [x, walkingHeight(x, z), z];
    s.n = normal;
    s.f = nextDirection;
    if (progress < 1 - EPS) moveSeat(s, nextDirection, step * (1 - progress));
    return;
  }
  const next = [
    center[0] + MINI.appleRadius * q[0],
    center[1] + MINI.appleHeight * q[1],
    center[2] + MINI.appleRadius * q[2],
  ];
  const newNormal = appleNormal(next);
  s.f = unit(tangent(transport(direction, s.n, newNormal), newNormal));
  s.p = next;
  s.n = newNormal;
}

function nearestLegAtSeat(x, z) {
  let best = -1, distance = Infinity;
  for (let i = 0; i < LEGS.length; i += 1) {
    const [cx, cz] = LEGS[i];
    const d = Math.hypot(x - cx, z - cz);
    if (d < distance) { distance = d; best = i; }
  }
  return distance <= 0.39 ? best : -1;
}

function moveSeat(s, direction, step) {
  const candidate = add(s.p, mul(direction, step));
  const px = s.p[0], pz = s.p[2], x = candidate[0], z = candidate[2];
  const outer = Math.abs(x) > MINI.seatHalf || Math.abs(z) > MINI.seatHalf;
  if (outer) {
    // Only the corner occupied by a visible supporting leg connects to
    // the cylindrical descent. Other stool rim edges block for this greybox.
    const edgeX = clamp(x, -MINI.seatHalf, MINI.seatHalf);
    const edgeZ = clamp(z, -MINI.seatHalf, MINI.seatHalf);
    const i = nearestLegAtSeat(edgeX, edgeZ);
    if (i >= 0) {
      const [cx, cz] = LEGS[i];
      const radial = unit([edgeX - cx, 0, edgeZ - cz]);
      const newNormal = radial;
      const nextDir = unit(tangent(transport(direction, s.n, newNormal), newNormal));
      s.surface = 'leg'; s.leg = i;
      s.p = [cx + radial[0] * MINI.legRadius, MINI.seatY, cz + radial[2] * MINI.legRadius];
      s.n = newNormal; s.f = nextDir;
      return;
    }
    // No invented bridge into empty space.
    const boundedX = clamp(x, -MINI.seatHalf, MINI.seatHalf);
    const boundedZ = clamp(z, -MINI.seatHalf, MINI.seatHalf);
    const normal = walkingNormal(boundedX, boundedZ);
    s.p = [boundedX, walkingHeight(boundedX, boundedZ), boundedZ];
    s.f = unit(tangent(transport(direction, s.n, normal), normal));
    s.n = normal;
    return;
  }

  const ax = MINI.appleX, az = MINI.appleZ, radius = MINI.appleRadius;
  const wasOutside = Math.hypot(px - ax, pz - az) >= radius - 1e-7;
  const nowInside = Math.hypot(x - ax, z - az) < radius;
  if (wasOutside && nowInside) {
    // Intersect the exact authored circle, not an arbitrary nearest point.
    const dx = direction[0], dz = direction[2];
    const ox = px - ax, oz = pz - az;
    const a = dx * dx + dz * dz;
    const b = 2 * (ox * dx + oz * dz);
    const c = ox * ox + oz * oz - radius * radius;
    const discriminant = Math.max(0, b * b - 4 * a * c);
    const distance = a > EPS ? clamp((-b - Math.sqrt(discriminant)) / (2 * a), 0, step) : step;
    const hitX = px + dx * distance, hitZ = pz + dz * distance;
    const radial = unit([hitX - ax, 0, hitZ - az]);
    const newNormal = radial;
    const nextDir = unit(tangent(transport(direction, s.n, newNormal), newNormal));
    const center = appleCenter();
    s.surface = 'apple';
    s.p = [ax + radius * radial[0], center[1], az + radius * radial[2]];
    s.n = newNormal; s.f = nextDir;
    if (distance < step - EPS) moveApple(s, nextDir, step - distance);
    return;
  }

  const normal = walkingNormal(x, z);
  s.p = [x, walkingHeight(x, z), z];
  s.f = unit(tangent(transport(direction, s.n, normal), normal));
  s.n = normal;
}

function moveLeg(s, direction, step) {
  const [cx, cz] = LEGS[s.leg];
  const phi = Math.atan2(s.p[2] - cz, s.p[0] - cx);
  const around = [-Math.sin(phi), 0, Math.cos(phi)];
  const newPhi = phi + dot(direction, around) * step / MINI.legRadius;
  const y = s.p[1] + direction[1] * step;
  const radial = [Math.cos(newPhi), 0, Math.sin(newPhi)];
  const normal = radial;
  const newDirection = unit(tangent(transport(direction, s.n, normal), normal));

  if (y > MINI.seatY) {
    // Leg meets the miniature stool's tabletop edge.
    const used = direction[1] > EPS ? clamp((MINI.seatY - s.p[1]) / (step * direction[1]), 0, 1) : 1;
    const enterX = clamp(cx + radial[0] * MINI.legRadius, -MINI.seatHalf, MINI.seatHalf);
    const enterZ = clamp(cz + radial[2] * MINI.legRadius, -MINI.seatHalf, MINI.seatHalf);
    const seatNormal = walkingNormal(enterX, enterZ);
    const d = unit(tangent(transport(newDirection, normal, seatNormal), seatNormal));
    s.surface = 'seat'; s.leg = null;
    s.p = [enterX, walkingHeight(enterX, enterZ), enterZ];
    s.n = seatNormal; s.f = d;
    if (used < 1 - EPS) moveSeat(s, d, step * (1 - used));
    return;
  }
  if (y < MINI.floorY) {
    const newNormal = UP;
    const d = unit(tangent(transport(newDirection, normal, newNormal), newNormal));
    s.surface = 'ground'; s.leg = null;
    s.p = [cx + radial[0] * MINI.legRadius, MINI.floorY, cz + radial[2] * MINI.legRadius];
    s.n = newNormal; s.f = d;
    return;
  }
  s.p = [cx + radial[0] * MINI.legRadius, y, cz + radial[2] * MINI.legRadius];
  s.n = normal; s.f = newDirection;
}

function moveGround(s, direction, step) {
  const dx = direction[0], dz = direction[2];
  let best = null;
  for (let i = 0; i < LEGS.length; i += 1) {
    const [cx, cz] = LEGS[i];
    const ox = s.p[0] - cx, oz = s.p[2] - cz;
    const a = dx * dx + dz * dz;
    const b = 2 * (ox * dx + oz * dz);
    const c = ox * ox + oz * oz - MINI.legRadius ** 2;
    const discriminant = b * b - 4 * a * c;
    if (a < EPS || discriminant < 0 || c < -EPS) continue;
    const travel = (-b - Math.sqrt(discriminant)) / (2 * a);
    if (travel < -EPS || travel > step + EPS) continue;
    if (!best || travel < best.travel) best = { i, travel: clamp(travel, 0, step) };
  }

  if (best) {
    const [cx, cz] = LEGS[best.i];
    const hit = add(s.p, mul(direction, best.travel));
    const newNormal = unit([hit[0] - cx, 0, hit[2] - cz]);
    const d = unit(tangent(transport(direction, UP, newNormal), newNormal));
    s.surface = 'leg'; s.leg = best.i;
    s.p = [cx + newNormal[0] * MINI.legRadius, MINI.floorY,
      cz + newNormal[2] * MINI.legRadius];
    s.n = newNormal; s.f = d;
    if (best.travel < step - EPS) moveLeg(s, d, step - best.travel);
    return;
  }

  s.p = [
    clamp(s.p[0] + dx * step, -MINI.groundHalfX, MINI.groundHalfX),
    MINI.floorY,
    clamp(s.p[2] + dz * step, -MINI.groundHalfZ, MINI.groundHalfZ),
  ];
  s.f = unit(tangent(direction, UP));
  s.n = UP;
}

// Public entry point: advances one camera-independent ant state in world space.
export function moveMiniature(s, input, distance) {
  if (s.shape !== 'miniature' || !Number.isFinite(distance) || distance <= 0) return s;
  let d = unit(tangent(input, s.n));
  if (length(d) < EPS) return s;
  let left = Math.min(distance, 3);
  while (left > EPS) {
    const step = Math.min(0.012, left);
    if (s.surface === 'ground') moveGround(s, d, step);
    else if (s.surface === 'leg') moveLeg(s, d, step);
    else if (s.surface === 'seat') moveSeat(s, d, step);
    else if (s.surface === 'apple') moveApple(s, d, step);
    else throw new Error('Unknown miniature surface: ' + s.surface);
    d = unit(tangent(s.f, s.n));
    if (length(d) < EPS) break;
    left -= step;
  }
  s.n = unit(s.n);
  s.f = unit(tangent(s.f, s.n));
  return s;
}
