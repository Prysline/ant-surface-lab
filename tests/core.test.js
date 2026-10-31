import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HALF, initialAnt, cloneAnt, dot, length, transport, moveOnSurface,
} from '../src/core.js';

const close = (actual, expected, eps = 1e-5) => assert.ok(
  Math.abs(actual - expected) < eps,
  'Expected ' + actual + ' to be near ' + expected,
);

test('cube crosses a right-angle edge without teleporting', () => {
  const ant = initialAnt('cube');
  moveOnSurface(ant, [1, 0, 0], 1.8);
  close(ant.p[0], HALF);
  close(ant.p[1], HALF - 0.25);
  close(ant.n[0], 1);
  close(ant.f[1], -1);
});

test('cube travel stays constrained to a face and preserves the radius', () => {
  const ant = initialAnt('cube');
  for (let i = 0; i < 200; i++) moveOnSurface(ant, ant.f, 0.035);
  close(Math.max(...ant.p.map(Math.abs)), HALF);
  close(dot(ant.f, ant.n), 0);
});

test('sphere travel keeps surface attachment and tangent heading', () => {
  const ant = initialAnt('sphere');
  for (let i = 0; i < 700; i++) moveOnSurface(ant, ant.f, 0.025);
  close(length(ant.p), HALF);
  close(length(ant.n), 1);
  close(dot(ant.f, ant.n), 0);
});

test('cylinder lateral movement follows circular wall', () => {
  const ant = initialAnt('cylinder');
  moveOnSurface(ant, [0, 0, 1], 1.9);
  close(Math.hypot(ant.p[0], ant.p[2]), HALF);
  close(ant.p[1], 0);
  close(dot(ant.f, ant.n), 0);
});

test('cylinder can cross from side to cap', () => {
  const ant = initialAnt('cylinder');
  moveOnSurface(ant, [0, 1, 0], 1.9);
  close(ant.p[1], HALF);
  close(ant.n[1], 1);
  assert.ok(Math.hypot(ant.p[0], ant.p[2]) < HALF);
});

test('parallel transport preserves tangent lengths across 90-degree change', () => {
  const result = transport([1, 0, 0], [0, 1, 0], [1, 0, 0]);
  close(result[1], -1);
  close(length(result), 1);
  close(dot(result, [1, 0, 0]), 0);
});

test('cloneAnt creates independent snapshot arrays', () => {
  const original = initialAnt('cube');
  const copy = cloneAnt(original);
  copy.p[0] = 99;
  assert.notEqual(original.p[0], copy.p[0]);
});
