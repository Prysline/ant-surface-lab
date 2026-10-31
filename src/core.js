// World-space surface locomotion. No camera or DOM dependencies.
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (v) => Math.hypot(v[0], v[1], v[2]);
export const unit = (v) => {
  const magnitude = length(v);
  return magnitude > 1e-10 ? mul(v, 1 / magnitude) : [0, 0, 0];
};
export const tangent = (direction, normal) => sub(direction, mul(normal, dot(direction, normal)));
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export const HALF = 1.55;
export const CYLINDER_HEIGHT = 3.1;

function basisAxis(axis, sign) {
  const v = [0, 0, 0];
  v[axis] = sign;
  return v;
}

// Minimal rotation carrying 'from' to 'to', applied to a vector.
export function transport(v, from, to) {
  const n0 = unit(from);
  const n1 = unit(to);
  const cosine = clamp(dot(n0, n1), -1, 1);
  const axis = cross(n0, n1);
  const sine = length(axis);
  if (sine < 1e-9) {
    if (cosine >= 0) return [...v];
    const alternative = Math.abs(n0[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const k = unit(cross(n0, alternative));
    return add(mul(k, 2 * dot(k, v)), mul(v, -1));
  }
  const k = mul(axis, 1 / sine);
  return add(
    add(mul(v, cosine), mul(cross(k, v), sine)),
    mul(k, dot(k, v) * (1 - cosine)),
  );
}

export function initialAnt(shape = 'cube') {
  if (shape === 'sphere') {
    return { shape, p: [0, HALF, 0], n: [0, 1, 0], f: [0, 0, -1] };
  }
  if (shape === 'cylinder') {
    return { shape, p: [HALF, 0, 0], n: [1, 0, 0], f: [0, 0, -1] };
  }
  return { shape: 'cube', p: [0, HALF, 0], n: [0, 1, 0], f: [0, 0, -1] };
}
export function cloneAnt(s) {
  return { shape: s.shape, p: [...s.p], n: [...s.n], f: [...s.f] };
}

function moveCube(state, direction, distance) {
  const normalAxis = state.n.findIndex((v) => Math.abs(v) > 0.5);
  let fraction = 1;
  let crossedAxis = -1;
  let crossedSign = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    if (axis === normalAxis || Math.abs(direction[axis]) < 1e-10) continue;
    const destination = state.p[axis] + direction[axis] * distance;
    if (Math.abs(destination) <= HALF + 1e-9) continue;
    const sign = Math.sign(direction[axis]);
    const t = (sign * HALF - state.p[axis]) / (direction[axis] * distance);
    if (t >= -1e-8 && t < fraction) {
      fraction = Math.max(0, t);
      crossedAxis = axis;
      crossedSign = sign;
    }
  }

  if (crossedAxis < 0) {
    state.p = add(state.p, mul(direction, distance));
    state.p[normalAxis] = state.n[normalAxis] * HALF;
    state.f = direction;
    return direction;
  }

  const atEdge = add(state.p, mul(direction, distance * fraction));
  atEdge[crossedAxis] = crossedSign * HALF;
  const newNormal = basisAxis(crossedAxis, crossedSign);
  const newDirection = unit(tangent(transport(direction, state.n, newNormal), newNormal));
  state.p = add(atEdge, mul(newDirection, distance * (1 - fraction)));
  state.p[crossedAxis] = crossedSign * HALF;
  state.n = newNormal;
  state.f = newDirection;
  return newDirection;
}

function moveSphere(state, direction, distance) {
  const newNormal = unit(add(state.p, mul(direction, distance)));
  state.p = mul(newNormal, HALF);
  const newDirection = unit(tangent(transport(direction, state.n, newNormal), newNormal));
  state.n = newNormal;
  state.f = newDirection;
  return newDirection;
}

function moveCylinder(state, direction, distance) {
  if (Math.abs(state.n[1]) < 0.5) {
    const angle = Math.atan2(state.p[2], state.p[0]);
    const alongRing = [-Math.sin(angle), 0, Math.cos(angle)];
    const angularChange = dot(direction, alongRing) * distance / HALF;
    const deltaY = direction[1] * distance;
    const nextAngle = angle + angularChange;
    const nextY = state.p[1] + deltaY;
    const radial = [Math.cos(nextAngle), 0, Math.sin(nextAngle)];
    if (Math.abs(nextY) <= CYLINDER_HEIGHT / 2 + 1e-8) {
      const newNormal = radial;
      state.p = [radial[0] * HALF, clamp(nextY, -HALF, HALF), radial[2] * HALF];
      const newDirection = unit(tangent(transport(direction, state.n, newNormal), newNormal));
      state.n = newNormal;
      state.f = newDirection;
      return newDirection;
    }
    const sign = Math.sign(nextY);
    const used = clamp((sign * HALF - state.p[1]) / (deltaY || 1), 0, 1);
    const edgeAngle = angle + angularChange * used;
    const edge = [Math.cos(edgeAngle) * HALF, sign * HALF, Math.sin(edgeAngle) * HALF];
    const edgeNormal = [Math.cos(edgeAngle), 0, Math.sin(edgeAngle)];
    const capNormal = [0, sign, 0];
    const directionAtEdge = transport(direction, state.n, edgeNormal);
    const capDirection = unit(tangent(transport(directionAtEdge, edgeNormal, capNormal), capNormal));
    const candidate = add(edge, mul(capDirection, distance * (1 - used)));
    const radialDistance = Math.hypot(candidate[0], candidate[2]);
    if (radialDistance > HALF) {
      candidate[0] *= HALF / radialDistance;
      candidate[2] *= HALF / radialDistance;
    }
    candidate[1] = sign * HALF;
    state.p = candidate;
    state.n = capNormal;
    state.f = capDirection;
    return capDirection;
  }

  const candidate = add(state.p, mul(direction, distance));
  const radius = Math.hypot(candidate[0], candidate[2]);
  if (radius <= HALF + 1e-8) {
    state.p = [candidate[0], state.n[1] * HALF, candidate[2]];
    state.f = direction;
    return direction;
  }
  // Intersection of the cap-plane motion with its circular rim.
  const px = state.p[0], pz = state.p[2], dx = direction[0], dz = direction[2];
  const a = dx * dx + dz * dz;
  const b = 2 * (px * dx + pz * dz);
  const c = px * px + pz * pz - HALF * HALF;
  const travelToRim = a > 1e-10 ? clamp((-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a), 0, distance) : distance;
  const edge = add(state.p, mul(direction, travelToRim));
  const newNormal = unit([edge[0], 0, edge[2]]);
  const newDirection = unit(tangent(transport(direction, state.n, newNormal), newNormal));
  const out = add(edge, mul(newDirection, distance - travelToRim));
  state.p = [newNormal[0] * HALF, clamp(out[1], -HALF, HALF), newNormal[2] * HALF];
  state.n = newNormal;
  state.f = newDirection;
  return newDirection;
}

// Move in a chosen world-space tangent direction. Substeps avoid skipping narrow edges.
export function moveOnSurface(state, requestedDirection, distance) {
  if (!Number.isFinite(distance) || distance <= 0) return state;
  let direction = unit(tangent(requestedDirection, state.n));
  if (length(direction) < 1e-8) return state;
  let remaining = Math.min(distance, 5);
  while (remaining > 1e-8) {
    const segment = Math.min(0.035, remaining);
    if (state.shape === 'sphere') direction = moveSphere(state, direction, segment);
    else if (state.shape === 'cylinder') direction = moveCylinder(state, direction, segment);
    else direction = moveCube(state, direction, segment);
    remaining -= segment;
  }
  state.n = unit(state.n);
  state.f = unit(tangent(state.f, state.n));
  return state;
}
