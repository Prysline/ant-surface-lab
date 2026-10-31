import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { findBlockingMeshes, renderWithOcclusion } from '../src/occlusion.js';

function camera() {
  const c = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  c.position.set(0, 0, 7);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  return c;
}
function mesh(group, x, y, z, color) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 1.5, 0.7),
    new THREE.MeshStandardMaterial({ color }),
  );
  m.position.set(x, y, z);
  group.add(m);
  return m;
}

test('camera ray selects only meshes between camera and ant', () => {
  const group = new THREE.Group();
  const foreground = mesh(group, 0, 0, 3, 0xffffff);
  mesh(group, 3, 0, 3, 0x555555);
  mesh(group, 0, 0, -3, 0x555555);
  const blockers = findBlockingMeshes(camera(), new THREE.Vector3(0, 0, 0), group);
  assert.equal(blockers.length, 1);
  assert.equal(blockers[0], foreground);
});

test('no obstacle means no transparency changes', () => {
  const group = new THREE.Group();
  mesh(group, 4, 0, 3, 0xffffff);
  assert.deepEqual(findBlockingMeshes(camera(), new THREE.Vector3(), group), []);
});

test('a mesh flagged as an ant debug marker never blocks the view', () => {
  const group = new THREE.Group();
  const debug = mesh(group, 0, 0, 3, 0xffffff);
  debug.userData.noAntOcclusion = true;
  assert.deepEqual(findBlockingMeshes(camera(), new THREE.Vector3(), group), []);
});

test('fade affects only the selected mesh and restores flags after each view', () => {
  const group = new THREE.Group();
  const shared = new THREE.MeshStandardMaterial({ color: 0xabcdef });
  const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared);
  const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared);
  group.add(a, b);
  renderWithOcclusion([a], () => {
    assert.equal(a.material.transparent, true);
    assert.equal(a.material.depthWrite, false);
    assert.ok(a.material.opacity <= 0.20);
    assert.equal(b.material.transparent, false);
    assert.equal(b.material.opacity, 1);
  });
  assert.equal(a.material.opacity, 1);
  assert.equal(a.material.transparent, false);
  assert.equal(a.material.depthWrite, true);
  assert.equal(b.material.opacity, 1);
});

test('transparency state restores even if rendering throws', () => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  assert.throws(() => renderWithOcclusion([m], () => { throw new Error('WebGL context lost'); }),
    /WebGL context lost/);
  assert.equal(m.material.opacity, 1);
  assert.equal(m.material.transparent, false);
  assert.equal(m.material.depthWrite, true);
});
