import test from 'node:test';
import assert from 'node:assert/strict';
import { dot, length, sub, unit } from '../src/core.js';
import {
  MINI, MINI_SCALE, LEGS, SPOON, STOOL_SIDE_BOTTOM,
  plateHeight, walkingHeight, miniatureSpawn, moveMiniature,
  appleCenter, appleContact, spoonBridgeInfo, localMiniatureState,
} from '../src/miniature.js';
import {
  PLATE_PROFILE, PLATE_METRICS, APPLE_PROFILE, APPLE_METRICS,
  PLATE_FOOT_CONTACT, PLATE_FOOT_INNER, PLATE_FOOT_OUTER,
  PLATE_TOP_END, applePoint, platePoint, plateQForRadius,
  surfacePoint, surfaceNormal, spoonBowlInfo, APPLE_FOOT_RADIUS,
} from '../src/miniatureGeometry.js';

const near = (a, b, tol = 0.035) =>
  assert.ok(Math.abs(a - b) < tol, a + ' should be near ' + b);
const local = localMiniatureState;
const move = (s, direction, distance) =>
  moveMiniature(s, direction, distance * MINI_SCALE);

function valid(s) {
  assert.ok(['ground', 'leg', 'seat', 'seatSide', 'plate', 'apple'].includes(s.surface), s.surface);
  assert.ok(s.p.every(Number.isFinite), 'finite world coordinates');
  near(length(s.n), 1, 1e-5);
  near(length(s.f), 1, 1e-5);
  near(dot(s.n, s.f), 0, 1e-5);
  if (s.surface === 'plate' || s.surface === 'apple') {
    const p = surfacePoint(s.surface, s.q, s.theta).map((v) => v * MINI_SCALE);
    near(length(sub(s.p, p)), 0, 2e-5);
  }
}

test('scale remains 4x, no implicit rescaling of the ant', () => {
  assert.equal(MINI_SCALE, 4);
  near(miniatureSpawn('ground').p[1], MINI.floorY * MINI_SCALE, 1e-6);
});

test('all six reset presets are attached to named authored surfaces', () => {
  const expected = {
    ground: 'ground', leg: 'leg', stool: 'seat', side: 'seatSide', plate: 'plate',
    apple: 'apple', spoon: 'plate',
  };
  for (const [name, surface] of Object.entries(expected)) {
    const s = miniatureSpawn(name);
    assert.equal(s.shape, 'miniature');
    assert.equal(s.surface, surface);
    valid(s);
  }
});

test('the plate ONLY touches the stool at its narrow annular foot', () => {
  const touched = PLATE_PROFILE.filter((p) => Math.abs(p[1]) < 1e-8);
  assert.equal(touched.length, 2);
  near(touched[0][0], PLATE_FOOT_OUTER, 1e-8);
  near(touched[1][0], PLATE_FOOT_INNER, 1e-8);
  assert.ok(PLATE_FOOT_OUTER < MINI.plateRadius * 0.45);
  const raised = PLATE_PROFILE.filter((p) => p[0] > PLATE_FOOT_OUTER + 0.1);
  assert.ok(raised.every((p) => p[1] > 0.055 - 1e-8),
    'all other underside/top portions are above wooden stool');
  for (const theta of [0, Math.PI / 3, Math.PI, 5]) {
    const top = platePoint(PLATE_METRICS.distances[4], theta);
    assert.ok(top[1] > MINI.seatY + 0.12);
    const below = platePoint(PLATE_METRICS.distances[11], theta);
    assert.ok(below[1] > MINI.seatY + 0.055);
  }
  const upperCenter = platePoint(0, 0);
  const lowerCenter = platePoint(PLATE_METRICS.length, 0);
  assert.ok(upperCenter[1] > lowerCenter[1] + 0.020);
});

test('approaching the plate rim on the STOOL cannot teleport onto ceramic', () => {
  const s = miniatureSpawn('stool');
  move(s, [1, 0, 0], 0.25);
  assert.equal(s.surface, 'seat');
  near(local(s).p[1], MINI.seatY, 1e-6);
  valid(s);
});

test('the stool touches the plate foot at the exterior radius only', () => {
  const s = miniatureSpawn('stool');
  const start = local(s).p;
  const towardCenter = unit([-start[0], 0, -start[2]]);
  for (let i = 0; i < 120 && s.surface === 'seat'; i += 1) {
    move(s, towardCenter, 0.01);
  }
  assert.equal(s.surface, 'plate');
  assert.ok(s.q <= PLATE_METRICS.distances[PLATE_FOOT_CONTACT]);
  valid(s);
});

test('walk from stool through the narrow foot, underside, lip and onto the dish', () => {
  const s = miniatureSpawn('stool');
  const initial = local(s).p;
  const toFoot = unit([-initial[0], 0, -initial[2]]);
  for (let i = 0; i < 160 && s.surface === 'seat'; i += 1) {
    move(s, toFoot, 0.01);
  }
  assert.equal(s.surface, 'plate');
  const footQ = s.q;
  let visitedUnderside = false, visitedRim = false, visitedTop = false;
  for (let i = 0; i < 540 && s.surface === 'plate'; i += 1) {
    move(s, s.f, 0.012);
    valid(s);
    if (s.q < footQ - 0.12 && s.q > PLATE_METRICS.distances[PLATE_TOP_END] + 0.12) {
      visitedUnderside = true;
    }
    if (s.q < PLATE_METRICS.distances[PLATE_TOP_END] + 0.04) visitedRim = true;
    if (s.q < PLATE_METRICS.distances[PLATE_TOP_END] - 0.12) {
      visitedTop = true;
      break;
    }
  }
  assert.ok(visitedUnderside, 'walker must traverse underside');
  assert.ok(visitedRim, 'walker must roll over ceramic lip');
  assert.ok(visitedTop, 'walker must reach inner top');
});

test('stool upper edge rolls down onto a physical vertical side', () => {
  const s = miniatureSpawn('stool');
  move(s, [-1, 0, 0], 0.75);
  assert.equal(s.surface, 'seatSide');
  const p = local(s).p;
  near(p[0], -MINI.seatHalf, 1e-5);
  assert.ok(p[1] < MINI.seatY);
  near(s.n[0], -1, 1e-5);
  valid(s);
});

test('a walker can climb a stool side onto its top without using a leg', () => {
  const s = miniatureSpawn('side');
  const start = local(s).p;
  assert.equal(s.surface, 'seatSide');
  assert.ok(start[1] > STOOL_SIDE_BOTTOM && start[1] < MINI.seatY);
  move(s, [0, 1, 0], 0.20);
  assert.equal(s.surface, 'seat');
  near(local(s).p[1], MINI.seatY, 1e-5);
  valid(s);
});

test('stool side bottom blocks unsupported travel into empty space', () => {
  const s = miniatureSpawn('side');
  move(s, [0, -1, 0], 0.30);
  assert.equal(s.surface, 'seatSide');
  near(local(s).p[1], STOOL_SIDE_BOTTOM, 1e-5);
  valid(s);
});

test('a supporting leg joins the stool vertical side before the upper face', () => {
  const s = miniatureSpawn('ground');
  move(s, [1, 0, 0], 0.80);
  assert.equal(s.surface, 'leg');
  let visitedSide = false, visitedTop = false;
  for (let i = 0; i < 330; i += 1) {
    move(s, s.f, 0.012);
    valid(s);
    if (s.surface === 'seatSide') visitedSide = true;
    if (s.surface === 'seat') { visitedTop = true; break; }
  }
  assert.equal(visitedSide, true, 'must meet physical side of tabletop');
  assert.equal(visitedTop, true, 'must reach tabletop');
});

test('ground to stool leg is still a real geometric contact', () => {
  const s = miniatureSpawn('ground');
  move(s, [1, 0, 0], 0.80);
  assert.equal(s.surface, 'leg');
  const p = local(s).p;
  near(Math.hypot(p[0] - LEGS[0][0], p[2] - LEGS[0][1]),
    MINI.legRadius, 1e-5);
  assert.ok(p[1] > MINI.floorY);
  valid(s);
});

test('stool leg climbs to wooden seat and cannot jump into plate side', () => {
  const s = miniatureSpawn('ground');
  move(s, [1, 0, 0], 0.80);
  // The new correct route is leg -> vertical seat side -> upper seat.
  // Continue through the side instead of stopping the legacy test at its
  // first successful transition away from the cylindrical leg.
  for (let i = 0; i < 260 && s.surface !== 'seat'; i += 1) {
    move(s, s.f, 0.012);
  }
  assert.equal(s.surface, 'seat');
  near(local(s).p[1], MINI.seatY, 1e-5);
  valid(s);
});

test('the new apple skin NEVER extends below ceramic or intersects stool', () => {
  assert.ok(APPLE_PROFILE[0][0] < APPLE_PROFILE[4][0]);
  assert.ok(APPLE_PROFILE[4][0] < MINI.plateRadius);
  for (let i = 0; i <= 80; i += 1) {
    for (let j = 0; j < 24; j += 1) {
      const q = APPLE_METRICS.length * i / 80;
      const theta = Math.PI * 2 * j / 24;
      const [x, y, z] = applePoint(q, theta);
      assert.ok(y + 1e-8 >= plateHeight(x, z),
        'fruit skin always above ceramic top');
      assert.ok(Math.hypot(x, z) < MINI.plateRadius,
        'fruit remains inside plate lip');
    }
  }
  const crown = applePoint(APPLE_METRICS.length, 0);
  const shoulder = applePoint(APPLE_METRICS.distances[9], 0);
  assert.ok(crown[1] < shoulder[1], 'fruit crown has top depression');
  const support = applePoint(0, 2.14);
  near(support[1], plateHeight(support[0], support[2]), 1e-7);
});

test('fruit and ceramic meet at a small foot ring, not the full apple belly', () => {
  assert.ok(APPLE_FOOT_RADIUS < APPLE_PROFILE[4][0] * 0.55);
  const s = miniatureSpawn('apple');
  valid(s);
  const center = appleCenter();
  const crown = local(s).p;
  assert.ok(crown[1] > center[1] + 0.7);
});

test('the metal spoon has an oval hollow bowl and a long raised handle', () => {
  const center = spoonBowlInfo(...SPOON.bowl);
  near(center.radius, 0, 1e-7);
  const lip = spoonBowlInfo(SPOON.bowl[0] + 0.15, SPOON.bowl[1]);
  assert.ok(lip.radius > center.radius);
  const distance = Math.hypot(
    SPOON.end[0] - SPOON.start[0], SPOON.end[1] - SPOON.start[1]);
  assert.ok(distance > 0.5);
  const contact = appleContact();
  near(contact[0], SPOON.end[0], 1e-8);
  near(contact[2], SPOON.end[1], 1e-8);
  near(walkingHeight(...SPOON.end), contact[1], 1e-5);
});

test('walking surface on the spoon neck matches authored ceramic+metal height', () => {
  const s = miniatureSpawn('spoon');
  assert.equal(s.surface, 'plate');
  const p = local(s).p;
  near(p[1], walkingHeight(p[0], p[2]), 1e-5);
  move(s, s.f, 0.012);
  valid(s);
});

test('walk continuously along the spoon handle onto the apple shoulder', () => {
  const s = miniatureSpawn('spoon');
  const direction = unit([
    SPOON.end[0] - SPOON.start[0], 0,
    SPOON.end[1] - SPOON.start[1],
  ]);
  let transitioned = false;
  for (let i = 0; i < 130; i += 1) {
    move(s, direction, 0.012);
    valid(s);
    if (s.surface === 'apple') { transitioned = true; break; }
  }
  assert.equal(transitioned, true, 'spoon-to-apple must be traversable without a reset');
});

test('fruit contact can connect to the tip of the raised spoon', () => {
  const s = miniatureSpawn('apple');
  const contactQ = APPLE_METRICS.distances[4];
  s.q = contactQ;
  s.theta = 0;
  s.p = appleContact().map((v) => v * MINI_SCALE);
  s.n = surfaceNormal('apple', contactQ, 0);
  const d = unit([
    SPOON.start[0] - SPOON.end[0], 0,
    SPOON.start[1] - SPOON.end[1],
  ]);
  s.f = unit(sub(d, s.n.map((n) => dot(d, s.n) * n)));
  move(s, d, 0.012);
  assert.equal(s.surface, 'plate');
  valid(s);
});

test('apple base can return to plate top without crossing ceramic', () => {
  const s = miniatureSpawn('apple');
  s.q = 0.01;
  s.theta = Math.PI;
  s.p = applePoint(s.q, s.theta).map((v) => v * MINI_SCALE);
  s.n = surfaceNormal('apple', s.q, s.theta);
  const towardsFoot = sub(applePoint(0, s.theta), local(s).p);
  s.f = unit(sub(towardsFoot,
    s.n.map((n) => dot(towardsFoot, s.n) * n)));
  for (let i = 0; i < 50 && s.surface === 'apple'; i += 1) {
    move(s, s.f, 0.01);
  }
  assert.equal(s.surface, 'plate');
  valid(s);
});

test('apple-to-spoon transfer has a walkable approach zone, not a single-pixel contact', () => {
  const s = miniatureSpawn('apple');
  const goalQ = APPLE_METRICS.distances[4];
  s.q = goalQ - 0.08;
  s.theta = 0.17;
  s.p = applePoint(s.q, s.theta).map((v) => v * MINI_SCALE);
  s.n = surfaceNormal('apple', s.q, s.theta);
  let crossed = false, largestStep = 0;
  for (let i = 0; i < 150; i += 1) {
    const before = [...s.p];
    const p = local(s).p;
    const raw = [SPOON.start[0] - p[0], SPOON.start[1] * 0 + 0.02,
      SPOON.start[1] - p[2]];
    const d = unit(sub(raw, s.n.map((v) => dot(raw, s.n) * v)));
    move(s, d, 0.009);
    valid(s);
    largestStep = Math.max(largestStep, length(sub(s.p, before)) / MINI_SCALE);
    if (s.surface === 'plate') { crossed = true; break; }
  }
  assert.equal(crossed, true, 'reasonable approach from the apple shoulder reaches spoon');
  assert.ok(largestStep < 0.055, 'do not teleport across the gap');
});

test('apple moving away from spoon does not trigger an accidental transfer', () => {
  const s = miniatureSpawn('apple');
  s.q = APPLE_METRICS.distances[4];
  s.theta = 0.23;
  s.p = applePoint(s.q, s.theta).map((v) => v * MINI_SCALE);
  s.n = surfaceNormal('apple', s.q, s.theta);
  const opposite = [-1, 0, 0];
  for (let i = 0; i < 12; i += 1) move(s, opposite, 0.009);
  assert.equal(s.surface, 'apple');
  valid(s);
});

test('independent spawn states cannot mutate each other', () => {
  const a = miniatureSpawn('stool');
  const b = miniatureSpawn('stool');
  a.p[0] += 99;
  assert.notEqual(a.p[0], b.p[0]);
});
