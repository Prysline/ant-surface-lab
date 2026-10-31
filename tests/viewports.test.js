import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateViewRect } from '../src/viewports.js';

const canvas = { left: 0, top: 0, width: 400, height: 700 };
const panel = (top, height = 220) => ({ left: 20, top, width: 360, height });

test('a visible panel fills its own viewport and clipping region', () => {
  const v = calculateViewRect(panel(200), canvas, 400, 700);
  assert.deepEqual(v.viewport, { x: 20, y: 280, width: 360, height: 220 });
  assert.deepEqual(v.scissor, v.viewport);
  assert.equal(v.aspect, 360 / 220);
});

test('scrolling panel partly off top does not modify its projection or viewport height', () => {
  const v = calculateViewRect(panel(-100), canvas, 400, 700);
  assert.equal(v.aspect, 360 / 220);
  assert.equal(v.viewport.height, 220);
  assert.equal(v.viewport.y, 580);
  assert.deepEqual(v.scissor, { x: 20, y: 580, width: 360, height: 120 });
});

test('scrolling panel partly off bottom preserves its size while clipping', () => {
  const v = calculateViewRect(panel(640), canvas, 400, 700);
  assert.equal(v.aspect, 360 / 220);
  assert.equal(v.viewport.height, 220);
  assert.equal(v.viewport.y, -160);
  assert.deepEqual(v.scissor, { x: 20, y: 0, width: 360, height: 60 });
});

test('fully offscreen panel returns null', () => {
  assert.equal(calculateViewRect(panel(-250), canvas, 400, 700), null);
  assert.equal(calculateViewRect(panel(800), canvas, 400, 700), null);
});

test('canvas DOM offset and scale map DOM coordinates into renderer CSS pixels', () => {
  const movedCanvas = { left: 15, top: 50, width: 800, height: 1400 };
  const v = calculateViewRect(
    { left: 55, top: 450, width: 720, height: 440 },
    movedCanvas,
    400,
    700,
  );
  assert.deepEqual(v.viewport, { x: 20, y: 280, width: 360, height: 220 });
  assert.deepEqual(v.scissor, v.viewport);
});

test('zero or missing dimensions safely skip rendering', () => {
  assert.equal(calculateViewRect({ left: 0, top: 0, width: 0, height: 200 }, canvas, 400, 700), null);
  assert.equal(calculateViewRect(panel(10), { left: 0, top: 0, width: 0, height: 700 }, 400, 700), null);
});
