import test from 'node:test';
import assert from 'node:assert/strict';
import { SurfaceCamera } from '../src/cameras.js';
import { dot, initialAnt, moveOnSurface } from '../src/core.js';

const epsilon = 1e-5;
for (const mode of ['A', 'B']) {
  test('camera ' + mode + ' smoothly reaches new surface pose without altering ant', () => {
    const ant = initialAnt('cube');
    const cam = new SurfaceCamera(mode);
    cam.reset(ant);
    const originalPosition = cam.camera.position.clone();
    const originalQuaternion = cam.camera.quaternion.clone();
    moveOnSurface(ant, [1, 0, 0], 1.9);
    const antPosition = [...ant.p];
    cam.update(ant);
    const targetAngle = originalQuaternion.angleTo(cam.target.quaternion);
    const targetDistance = originalPosition.distanceTo(cam.target.position);
    assert.ok(targetAngle > 0.3);
    assert.ok(targetDistance > 0.3);
    // Logical surface jumps at the hard edge. Only the visual pose is smoothed.
    assert.ok(cam.camera.position.distanceTo(originalPosition) < epsilon);
    assert.ok(cam.camera.quaternion.angleTo(originalQuaternion) < epsilon);
    cam.present(1 / 60);
    assert.ok(cam.camera.quaternion.angleTo(cam.target.quaternion) < targetAngle);
    assert.ok(cam.camera.quaternion.angleTo(cam.target.quaternion) > 0.05);
    assert.ok(cam.camera.position.distanceTo(cam.target.position) < targetDistance);
    for (let i = 0; i < 120; i += 1) cam.present(1 / 60);
    assert.ok(cam.camera.quaternion.angleTo(cam.target.quaternion) < 0.002);
    assert.ok(cam.camera.position.distanceTo(cam.target.position) < 0.002);
    assert.deepEqual(ant.p, antPosition);
  });

  test('camera ' + mode + ' never follows an ant heading-only turn', () => {
    const ant = initialAnt('sphere');
    const cam = new SurfaceCamera(mode);
    cam.reset(ant);
    const orientation = cam.camera.quaternion.clone();
    ant.f = [1, 0, 0];
    cam.update(ant);
    cam.present(1 / 60);
    assert.ok(cam.camera.quaternion.angleTo(orientation) < epsilon);
  });

  test('camera ' + mode + ' allows immediate comparison mode', () => {
    const ant = initialAnt('cube');
    const cam = new SurfaceCamera(mode);
    cam.reset(ant);
    cam.setTransitionMilliseconds(0);
    moveOnSurface(ant, [1, 0, 0], 1.9);
    cam.update(ant);
    cam.present(1 / 60);
    assert.ok(cam.camera.quaternion.angleTo(cam.target.quaternion) < epsilon);
    assert.ok(cam.camera.position.distanceTo(cam.target.position) < epsilon);
    const direction = cam.direction(1, 0);
    assert.ok(Math.abs(dot(direction, ant.n)) < epsilon);
  });
}
