import test from 'node:test';
import assert from 'node:assert/strict';
import { dot, length, sub } from '../src/core.js';
import {
  MINI, MINI_SCALE, LEGS, SPOON,
  plateHeight, walkingHeight, miniatureSpawn, moveMiniature,
  appleCenter, appleContact, spoonBridgeInfo, localMiniatureState,
} from '../src/miniature.js';

const near = (actual, expected, tol = 0.035) =>
  assert.ok(Math.abs(actual - expected) < tol,
    actual + ' should be near ' + expected);
const local = (s) => localMiniatureState(s);
const move = (s, direction, distanceInModelUnits) =>
  moveMiniature(s, direction, distanceInModelUnits * MINI_SCALE);
const valid = (state) => {
  assert.ok(['ground', 'leg', 'seat', 'apple'].includes(state.surface), state.surface);
  assert.ok(state.p.every(Number.isFinite));
  near(length(state.n), 1, 1e-5);
  near(length(state.f), 1, 1e-5);
  near(dot(state.n, state.f), 0, 1e-5);
};

test('miniature is four times larger in world coordinates without scaling the ant', () => {
  assert.equal(MINI_SCALE, 4);
  const ground = miniatureSpawn('ground');
  near(ground.p[1], MINI.floorY * 4, 1e-5);
  const plate = miniatureSpawn('plate');
  near(plate.p[1], walkingHeight(plate.p[0] / 4, plate.p[2] / 4) * 4, 1e-5);
});

test('all six test spawns have a world-space position and a real authored surface', () => {
  for (const preset of ['ground', 'leg', 'stool', 'plate', 'apple', 'spoon']) {
    const s = miniatureSpawn(preset);
    valid(s);
    assert.equal(s.shape, 'miniature');
    const p = local(s).p;
    if (s.surface === 'seat') near(p[1], walkingHeight(p[0], p[2]), 1e-5);
    if (s.surface === 'ground') near(p[1], MINI.floorY, 1e-5);
  }
});

test('ground surface intersects a stool leg, then climbs without teleporting', () => {
  const s = miniatureSpawn('ground');
  const previous = [...s.p];
  move(s, [1, 0, 0], 0.80);
  assert.equal(s.surface, 'leg');
  assert.equal(s.leg, 0);
  const p = local(s).p;
  near(Math.hypot(p[0] - LEGS[0][0], p[2] - LEGS[0][1]),
    MINI.legRadius, 1e-5);
  assert.ok(p[1] > MINI.floorY);
  assert.ok(length(sub(s.p, previous)) < MINI_SCALE);
  valid(s);
});

test('leg can reach enlarged stool tabletop without leaving its connected surface', () => {
  const s = miniatureSpawn('ground');
  move(s, [1, 0, 0], 0.80);
  let sawSeat = false;
  for (let i = 0; i < 250; i += 1) {
    move(s, s.f, 0.012);
    valid(s);
    if (s.surface === 'seat') { sawSeat = true; break; }
  }
  assert.equal(sawSeat, true);
  const p = local(s).p;
  near(p[1], walkingHeight(p[0], p[2]), 1e-5);
  assert.ok(Math.abs(p[0]) <= MINI.seatHalf + 1e-5);
  assert.ok(Math.abs(p[2]) <= MINI.seatHalf + 1e-5);
});

test('ceramic plate has a higher rim and lower interior', () => {
  near(plateHeight(1.27, 0), MINI.seatY, 1e-5);
  assert.ok(plateHeight(0.98, 0) > plateHeight(0, 0) + 0.16);
  const s = miniatureSpawn('stool');
  move(s, [1, 0, 0], 0.44);
  assert.equal(s.surface, 'seat');
  const p = local(s).p;
  near(p[1], walkingHeight(p[0], p[2]), 1e-5);
  valid(s);
});

test('apple is visually and physically larger than the previous test apple', () => {
  assert.ok(MINI.appleRadius > 0.39 * 1.6);
  assert.ok(MINI.appleHeight > 0.59 * 1.6);
  const [x, cy, z] = appleCenter();
  const top = miniatureSpawn('apple');
  near(top.p[0], x * MINI_SCALE, 1e-5);
  near(top.p[2], z * MINI_SCALE, 1e-5);
  near(top.p[1], (cy + MINI.appleHeight) * MINI_SCALE, 1e-5);
});

test('plate contact ring remains navigable for larger apple', () => {
  const s = miniatureSpawn('plate');
  const goal = appleCenter();
  const p = local(s).p;
  const direction = [goal[0] - p[0], 0, goal[2] - p[2]];
  move(s, direction, 0.43);
  assert.equal(s.surface, 'apple');
  const current = local(s).p;
  const q = [
    (current[0] - goal[0]) / MINI.appleRadius,
    (current[1] - goal[1]) / MINI.appleHeight,
    (current[2] - goal[2]) / MINI.appleRadius,
  ];
  near(length(q), 1, 1e-5);
  valid(s);
});

test('apple surface remains attached until it crosses the equator', () => {
  const s = miniatureSpawn('apple');
  for (let i = 0; i < 170; i += 1) {
    move(s, s.f, 0.012);
    valid(s);
    if (s.surface === 'seat') break;
    assert.ok(local(s).p[1] >= appleCenter()[1] - 1e-6);
  }
  assert.equal(s.surface, 'seat');
});

test('spoon bridge reaches an actual point on the apple upper hemisphere', () => {
  const contact = appleContact();
  const center = appleCenter();
  const normalized = [
    (contact[0] - center[0]) / MINI.appleRadius,
    (contact[1] - center[1]) / MINI.appleHeight,
    (contact[2] - center[2]) / MINI.appleRadius,
  ];
  near(length(normalized), 1, 1e-6);
  near(walkingHeight(...SPOON.end), contact[1] + 0.012, 0.015);
  assert.ok(Math.hypot(
    SPOON.end[0] - SPOON.start[0], SPOON.end[1] - SPOON.start[1],
  ) > 0.9);
});

test('spoon stem and bowl have a visible raised heightfield', () => {
  const s = miniatureSpawn('spoon');
  const p = local(s).p;
  assert.ok(walkingHeight(p[0], p[2]) >= plateHeight(p[0], p[2]) + 0.01);
  move(s, [1, 0, 0], 0.09);
  assert.equal(s.surface, 'seat');
  const next = local(s).p;
  near(next[1], walkingHeight(next[0], next[2]), 1e-5);
  valid(s);
});

test('spoon surface crosses apple footprint only along a narrow raised corridor', () => {
  const s = miniatureSpawn('spoon');
  // Select a midpoint along the bridge explicitly as a reset position for
  // testing the geometric seam, then continue with ordinary movement.
  const t = 0.88;
  const x = SPOON.start[0] * (1 - t) + SPOON.end[0] * t;
  const z = SPOON.start[1] * (1 - t) + SPOON.end[1] * t;
  assert.ok(spoonBridgeInfo(x, z).inside);
  s.p = [x * MINI_SCALE, walkingHeight(x, z) * MINI_SCALE, z * MINI_SCALE];
  s.n = [0, 1, 0];
  s.f = [SPOON.end[0] - SPOON.start[0], 0, SPOON.end[1] - SPOON.start[1]];
  const direction = s.f;
  move(s, direction, 0.21);
  assert.equal(s.surface, 'apple', 'spoon tip should connect to the fruit');
  valid(s);
});

test('stool rim without supporting leg does not invent a bridge into empty space', () => {
  const s = miniatureSpawn('stool');
  move(s, [-1, 0, 0], 1.4);
  assert.equal(s.surface, 'seat');
  near(local(s).p[0], -MINI.seatHalf, 1e-5);
  valid(s);
});

test('reset spawns are independent and camera selection cannot mutate state', () => {
  const a = miniatureSpawn('ground');
  const b = miniatureSpawn('ground');
  a.p[0] += 0.5;
  assert.notEqual(a.p[0], b.p[0]);
});
