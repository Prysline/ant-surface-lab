import test from 'node:test';
import assert from 'node:assert/strict';
import { dot, length, sub } from '../src/core.js';
import {
  MINI, LEGS, plateHeight, walkingHeight, walkingNormal,
  miniatureSpawn, moveMiniature, appleCenter,
} from '../src/miniature.js';

const near = (actual, expected, tol = 0.035) =>
  assert.ok(Math.abs(actual - expected) < tol, actual + ' should be near ' + expected);
const valid = (state) => {
  assert.ok(['ground', 'leg', 'seat', 'apple'].includes(state.surface), state.surface);
  assert.ok(state.p.every(Number.isFinite));
  near(length(state.n), 1, 1e-5);
  near(length(state.f), 1, 1e-5);
  near(dot(state.n, state.f), 0, 1e-5);
};

test('all miniature test positions are grounded on a real authored surface', () => {
  for (const preset of ['ground', 'leg', 'stool', 'plate', 'apple', 'spoon']) {
    const s = miniatureSpawn(preset);
    valid(s);
    assert.equal(s.shape, 'miniature');
    if (s.surface === 'seat') near(s.p[1], walkingHeight(s.p[0], s.p[2]), 1e-5);
    if (s.surface === 'ground') near(s.p[1], MINI.floorY, 1e-5);
  }
});

test('a ground ant approaches the first leg and climbs without teleportation', () => {
  const s = miniatureSpawn('ground');
  const previous = [...s.p];
  moveMiniature(s, [1, 0, 0], 0.80);
  assert.equal(s.surface, 'leg');
  assert.equal(s.leg, 0);
  near(Math.hypot(s.p[0] - LEGS[0][0], s.p[2] - LEGS[0][1]), MINI.legRadius, 1e-5);
  assert.ok(s.p[1] > MINI.floorY);
  assert.ok(length(sub(s.p, previous)) < 1);
  valid(s);
});

test('an ant can climb a stool leg onto the tabletop in a continuous route', () => {
  const s = miniatureSpawn('ground');
  moveMiniature(s, [1, 0, 0], 0.80);
  let sawSeat = false;
  for (let i = 0; i < 220; i += 1) {
    moveMiniature(s, s.f, 0.012);
    valid(s);
    if (s.surface === 'seat') { sawSeat = true; break; }
  }
  assert.equal(sawSeat, true);
  near(s.p[1], walkingHeight(s.p[0], s.p[2]), 1e-5);
  assert.ok(Math.abs(s.p[0]) <= MINI.seatHalf + 1e-5);
  assert.ok(Math.abs(s.p[2]) <= MINI.seatHalf + 1e-5);
});

test('plate has a real raised lip and a lower bowl center', () => {
  near(plateHeight(1.27, 0), MINI.seatY, 1e-5);
  assert.ok(plateHeight(0.98, 0) > plateHeight(0, 0) + 0.16);
  const s = miniatureSpawn('stool');
  moveMiniature(s, [1, 0, 0], 0.44);
  assert.equal(s.surface, 'seat');
  near(s.p[1], walkingHeight(s.p[0], s.p[2]), 1e-5);
  valid(s);
});

test('crossing the apple contact ring attaches to the upper ellipsoid', () => {
  const s = miniatureSpawn('plate');
  const goal = appleCenter();
  const direction = [goal[0] - s.p[0], 0, goal[2] - s.p[2]];
  moveMiniature(s, direction, 0.47);
  assert.equal(s.surface, 'apple');
  assert.ok(s.p[1] >= goal[1] - 1e-7);
  const q = [
    (s.p[0] - goal[0]) / MINI.appleRadius,
    (s.p[1] - goal[1]) / MINI.appleHeight,
    (s.p[2] - goal[2]) / MINI.appleRadius,
  ];
  near(length(q), 1, 1e-5);
  valid(s);
});

test('apple upper surface can be circumnavigated without penetrating plate', () => {
  const s = miniatureSpawn('apple');
  for (let i = 0; i < 85; i += 1) {
    moveMiniature(s, s.f, 0.012);
    valid(s);
    if (s.surface === 'seat') break;
    assert.ok(s.p[1] >= appleCenter()[1] - 1e-6);
  }
  assert.equal(s.surface, 'seat');
});

test('spoon handle is a narrow, raised, walkable patch in the plate', () => {
  const s = miniatureSpawn('spoon');
  assert.ok(walkingHeight(s.p[0], s.p[2]) > plateHeight(s.p[0], s.p[2]) + 0.01);
  moveMiniature(s, [1, 0, 0], 0.09);
  assert.equal(s.surface, 'seat');
  near(s.p[1], walkingHeight(s.p[0], s.p[2]), 1e-5);
  valid(s);
});

test('walking across a stool rim without a leg does not create a fictional bridge', () => {
  const s = miniatureSpawn('stool');
  moveMiniature(s, [-1, 0, 0], 1.4);
  assert.equal(s.surface, 'seat');
  near(s.p[0], -MINI.seatHalf, 1e-5);
  valid(s);
});

test('all six spawns are independent world-space states', () => {
  const a = miniatureSpawn('ground');
  const b = miniatureSpawn('ground');
  a.p[0] += 0.5;
  assert.notEqual(a.p[0], b.p[0]);
});
