/**
 * Surface-connected miniature navigation (pure world geometry, independent of
 * camera and Three.js).
 *
 * The stool touches the PLATE FOOT only. The ceramic upper face does NOT meet
 * the wooden stool at its perimeter. To reach its top, the ant climbs the
 * foot's outside, traverses the underside and rolls over the ceramic lip.
 */
import {
  add, sub, mul, dot, cross, length, unit, tangent, transport, clamp,
} from './core.js';
import {
  MINI, MINI_SCALE, LEGS, SPOON,
  PLATE_PROFILE, APPLE_PROFILE, PLATE_METRICS, APPLE_METRICS,
  PLATE_FOOT_CONTACT, PLATE_FOOT_OUTER, PLATE_TOP_END,
  APPLE_FOOT_RADIUS, appleCenter, appleContact, plateQForRadius,
  plateHeight, walkingHeight, surfacePoint, surfaceNormal,
  spoonBridgeInfo,
} from './miniatureGeometry.js';

export {
  MINI, MINI_SCALE, LEGS, SPOON, PLATE_PROFILE, APPLE_PROFILE,
  PLATE_METRICS, APPLE_METRICS, APPLE_FOOT_RADIUS,
  appleCenter, appleContact, plateHeight, walkingHeight,
  spoonBridgeInfo,
} from './miniatureGeometry.js';

const UP = [0, 1, 0];
const EPS = 1e-8;

function state(surface, p, n, f, details = {}) {
  return {
    shape: 'miniature', surface, p: [...p], n: unit(n),
    f: unit(tangent(f, n)), leg: null, ...details,
  };
}
function profileState(surface, q, theta, direction) {
  const p = surfacePoint(surface, q, theta);
  const n = surfaceNormal(surface, q, theta);
  return state(surface, p, n, direction, { q, theta });
}
function topOfPlate(x, z) {
  const q = plateQForRadius(Math.hypot(x, z));
  const theta = Math.atan2(z, x);
  return { q, theta };
}

// Presets are explicitly teleport/reset operations; regular movement never
// changes surface or position except via authored geometric contacts.
function localSpawn(name = 'ground') {
  const [cx, cz] = LEGS[0];
  if (name === 'leg') {
    return state('leg', [cx - MINI.legRadius, -0.75, cz],
      [-1, 0, 0], [0, 1, 0], { leg: 0 });
  }
  if (name === 'stool') {
    return state('seat', [-1.10, MINI.seatY, 0.56], UP, [1, 0, 0]);
  }
  if (name === 'plate') {
    const x = 0.15, z = -0.94;
    const { q, theta } = topOfPlate(x, z);
    return profileState('plate', q, theta, [0, 0, 1]);
  }
  if (name === 'apple') {
    const q = APPLE_METRICS.length - 0.024;
    return profileState('apple', q, 0, [0, 0, -1]);
  }
  if (name === 'spoon') {
    const { q, theta } = topOfPlate(SPOON.start[0], SPOON.start[1]);
    return profileState('plate', q, theta,
      [SPOON.end[0] - SPOON.start[0], 0, SPOON.end[1] - SPOON.start[1]]);
  }
  return state('ground', [cx - 0.80, MINI.floorY, cz], UP, [1, 0, 0]);
}

export function miniatureSpawn(name = 'ground') {
  const local = localSpawn(name);
  return { ...local, p: mul(local.p, MINI_SCALE) };
}
export function localMiniatureState(world) {
  return { ...world, p: mul(world.p, 1 / MINI_SCALE) };
}

function setPosition(s, point, normal, direction) {
  const nextNormal = unit(normal);
  const transported = transport(direction, s.n, nextNormal);
  s.p = [...point];
  s.n = nextNormal;
  s.f = unit(tangent(transported, nextNormal));
}

function attachProfile(s, surface, q, theta, direction) {
  const newPoint = surfacePoint(surface, q, theta);
  const normal = surfaceNormal(surface, q, theta);
  setPosition(s, newPoint, normal, direction);
  s.surface = surface;
  s.q = q;
  s.theta = theta;
  s.leg = null;
}

function stepProfile(s, direction, step) {
  const kind = s.surface;
  const metrics = kind === 'plate' ? PLATE_METRICS : APPLE_METRICS;
  const p = surfacePoint(kind, s.q, s.theta);
  const eps = 0.001;
  const a = sub(surfacePoint(kind, clamp(s.q + eps, 0, metrics.length), s.theta),
    surfacePoint(kind, clamp(s.q - eps, 0, metrics.length), s.theta));
  const b = sub(surfacePoint(kind, s.q, s.theta + eps),
    surfacePoint(kind, s.q, s.theta - eps));
  const aq = unit(a), bt = unit(b);
  const alignment = clamp(dot(aq, bt), -0.95, 0.95);
  const qVelocity = (dot(direction, aq) - alignment * dot(direction, bt)) /
    (1 - alignment * alignment);
  const thetaVelocity = (dot(direction, bt) - alignment * dot(direction, aq)) /
    (1 - alignment * alignment);

  const aScale = length(a) / (Math.min(metrics.length, s.q + eps) -
    Math.max(0, s.q - eps) || 1);
  const bScale = length(b) / (2 * eps);
  let q = s.q + qVelocity * step / Math.max(aScale, 1e-7);
  let theta = s.theta + thetaVelocity * step / Math.max(bScale, 1e-4);

  if (q < 0 && kind === 'plate') {
    // The plate upper center is a smooth point, not a wall.
    q = -q;
    theta += Math.PI;
  }
  if (q > metrics.length && kind === 'apple') {
    // Walking over the fruit crown passes through a center point.
    q = metrics.length - (q - metrics.length);
    theta += Math.PI;
  }
  q = clamp(q, 0, metrics.length);

  const next = surfacePoint(kind, q, theta);

  if (kind === 'plate') {
    const contactQ = PLATE_METRICS.distances[PLATE_FOOT_CONTACT];
    if (q >= contactQ && qVelocity > 0) {
      // Outside of raised ceramic foot meets the stool at a small ring.
      const foot = surfacePoint('plate', contactQ, theta);
      const normal = UP;
      const d = unit(tangent(transport(direction, s.n, normal), normal));
      s.surface = 'seat'; s.p = foot; s.n = normal; s.f = d;
      delete s.q; delete s.theta;
      return;
    }

    const rimQ = PLATE_METRICS.distances[PLATE_TOP_END];
    if (q <= rimQ) {
      const infoBefore = spoonBridgeInfo(p[0], p[2]);
      const info = spoonBridgeInfo(next[0], next[2]);
      const heading = sub(
        [SPOON.end[0], 0, SPOON.end[1]],
        [SPOON.start[0], 0, SPOON.start[1]],
      );
      if (infoBefore.inside && info.t >= 0.985 &&
          Math.abs(info.lateral) < SPOON.halfWidth * 0.8 &&
          dot(direction, unit(heading)) > 0.13) {
        attachProfile(s, 'apple', APPLE_METRICS.distances[4], 0, direction);
        return;
      }

      // On the upper dish, the fruit touches at its SMALL base ring.
      // The apple's widest belly overhangs but does not penetrate the dish.
      const d0 = Math.hypot(p[0] - MINI.appleX, p[2] - MINI.appleZ);
      const d1 = Math.hypot(next[0] - MINI.appleX, next[2] - MINI.appleZ);
      if (d0 >= APPLE_FOOT_RADIUS - 1e-5 && d1 < APPLE_FOOT_RADIUS &&
          dot(direction, [MINI.appleX - p[0], 0, MINI.appleZ - p[2]]) > 0) {
        const phi = Math.atan2(next[2] - MINI.appleZ, next[0] - MINI.appleX);
        attachProfile(s, 'apple', 0, phi, direction);
        return;
      }
    }
  } else {
    const contact = appleContact();
    const towardSpoon = unit([
      SPOON.start[0] - SPOON.end[0], 0,
      SPOON.start[1] - SPOON.end[1],
    ]);
    if (length(sub(p, contact)) < 0.035 &&
        dot(direction, towardSpoon) > 0.17) {
      // Fruit-to-handle contact is exactly the same authored world point.
      const { q: tipQ, theta: tipTheta } = topOfPlate(...SPOON.end);
      attachProfile(s, 'plate', tipQ, tipTheta, direction);
      return;
    }
    if (q <= 1e-7 && qVelocity < 0) {
      // Fruit base ring sits on top of the dish, not inside the plate.
      const x = next[0], z = next[2];
      const at = topOfPlate(x, z);
      attachProfile(s, 'plate', at.q, at.theta, direction);
      return;
    }
  }

  setPosition(s, next, surfaceNormal(kind, q, theta), direction);
  s.q = q;
  s.theta = theta;
}

function nearestLegAtSeat(x, z) {
  let best = -1, distance = Infinity;
  for (let i = 0; i < LEGS.length; i += 1) {
    const [cx, cz] = LEGS[i];
    const d = Math.hypot(x - cx, z - cz);
    if (d < distance) { best = i; distance = d; }
  }
  return distance <= 0.39 ? best : -1;
}

function stepSeat(s, direction, step) {
  const next = add(s.p, mul(direction, step));
  const px = s.p[0], pz = s.p[2], x = next[0], z = next[2];
  if (Math.abs(x) > MINI.seatHalf || Math.abs(z) > MINI.seatHalf) {
    const edgeX = clamp(x, -MINI.seatHalf, MINI.seatHalf);
    const edgeZ = clamp(z, -MINI.seatHalf, MINI.seatHalf);
    const leg = nearestLegAtSeat(edgeX, edgeZ);
    if (leg >= 0) {
      const [cx, cz] = LEGS[leg];
      const radial = unit([edgeX - cx, 0, edgeZ - cz]);
      s.leg = leg; s.surface = 'leg';
      setPosition(s, [cx + radial[0] * MINI.legRadius, MINI.seatY,
        cz + radial[2] * MINI.legRadius], radial, direction);
      return;
    }
    s.p = [edgeX, MINI.seatY, edgeZ];
    s.f = unit(tangent(direction, UP));
    return;
  }

  // Only the small annular plate foot blocks the stool. At r > 0.55 there
  // is a genuine air gap between the stool and ceramic underside.
  const r0 = Math.hypot(px, pz), r1 = Math.hypot(x, z);
  if (r0 >= PLATE_FOOT_OUTER && r1 < PLATE_FOOT_OUTER) {
    const a = direction[0] ** 2 + direction[2] ** 2;
    const b = 2 * (px * direction[0] + pz * direction[2]);
    const c = px * px + pz * pz - PLATE_FOOT_OUTER ** 2;
    const disc = Math.max(0, b * b - 4 * a * c);
    const distance = a > EPS ? clamp((-b - Math.sqrt(disc)) / (2 * a),
      0, step) : step;
    const theta = Math.atan2(pz + direction[2] * distance,
      px + direction[0] * distance);
    attachProfile(s, 'plate',
      PLATE_METRICS.distances[PLATE_FOOT_CONTACT], theta, direction);
    return;
  }
  s.p = [x, MINI.seatY, z];
  s.n = UP;
  s.f = unit(tangent(direction, UP));
}

function stepLeg(s, direction, step) {
  const [cx, cz] = LEGS[s.leg];
  const phi = Math.atan2(s.p[2] - cz, s.p[0] - cx);
  const around = [-Math.sin(phi), 0, Math.cos(phi)];
  const nextPhi = phi + dot(direction, around) * step / MINI.legRadius;
  const y = s.p[1] + direction[1] * step;
  const radial = [Math.cos(nextPhi), 0, Math.sin(nextPhi)];
  const point = [cx + radial[0] * MINI.legRadius, y,
    cz + radial[2] * MINI.legRadius];
  if (y > MINI.seatY) {
    const x = clamp(point[0], -MINI.seatHalf, MINI.seatHalf);
    const z = clamp(point[2], -MINI.seatHalf, MINI.seatHalf);
    s.surface = 'seat'; s.leg = null;
    setPosition(s, [x, MINI.seatY, z], UP, direction);
    return;
  }
  if (y < MINI.floorY) {
    s.surface = 'ground'; s.leg = null;
    setPosition(s, [point[0], MINI.floorY, point[2]], UP, direction);
    return;
  }
  setPosition(s, point, radial, direction);
}

function stepGround(s, direction, step) {
  const dx = direction[0], dz = direction[2];
  let best = null;
  for (let i = 0; i < LEGS.length; i += 1) {
    const [cx, cz] = LEGS[i];
    const ox = s.p[0] - cx, oz = s.p[2] - cz;
    const a = dx * dx + dz * dz;
    const b = 2 * (ox * dx + oz * dz);
    const c = ox * ox + oz * oz - MINI.legRadius ** 2;
    const disc = b * b - 4 * a * c;
    if (a < EPS || disc < 0 || c < -EPS) continue;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < -EPS || t > step + EPS) continue;
    if (!best || t < best.t) best = { i, t: clamp(t, 0, step) };
  }
  if (best) {
    const [cx, cz] = LEGS[best.i];
    const hit = add(s.p, mul(direction, best.t));
    const normal = unit([hit[0] - cx, 0, hit[2] - cz]);
    s.surface = 'leg'; s.leg = best.i;
    setPosition(s, [cx + normal[0] * MINI.legRadius,
      MINI.floorY, cz + normal[2] * MINI.legRadius], normal, direction);
    return;
  }
  s.p = [clamp(s.p[0] + dx * step, -MINI.groundHalfX, MINI.groundHalfX),
    MINI.floorY,
    clamp(s.p[2] + dz * step, -MINI.groundHalfZ, MINI.groundHalfZ)];
  s.f = unit(tangent(direction, UP));
}

export function moveMiniature(world, input, distance) {
  if (world.shape !== 'miniature' ||
      !Number.isFinite(distance) || distance <= 0) return world;
  const local = localMiniatureState(world);
  let direction = unit(tangent(input, local.n));
  if (length(direction) < EPS) return world;
  let remaining = Math.min(distance / MINI_SCALE, 3);
  while (remaining > EPS) {
    const step = Math.min(0.008, remaining);
    if (local.surface === 'ground') stepGround(local, direction, step);
    else if (local.surface === 'seat') stepSeat(local, direction, step);
    else if (local.surface === 'leg') stepLeg(local, direction, step);
    else if (local.surface === 'plate' || local.surface === 'apple') {
      stepProfile(local, direction, step);
    } else throw new Error('Unknown miniature surface: ' + local.surface);
    direction = unit(tangent(local.f, local.n));
    if (length(direction) < EPS) break;
    remaining -= step;
  }
  world.surface = local.surface;
  world.leg = local.leg;
  world.q = local.q;
  world.theta = local.theta;
  world.p = mul(local.p, MINI_SCALE);
  world.n = unit(local.n);
  world.f = unit(tangent(local.f, local.n));
  return world;
}
