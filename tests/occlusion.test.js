import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  findBlockingMeshes, getCachedBlockers, injectRevealMask,
  renderWithOcclusion, DEFAULT_REVEAL_RADIUS,
} from '../src/occlusion.js';

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

test('ray finds only meshes between camera and ant with a world-space hit point', () => {
  const group = new THREE.Group();
  const foreground = mesh(group, 0, 0, 3, 0xffffff);
  mesh(group, 3, 0, 3, 0x555555);
  mesh(group, 0, 0, -3, 0x555555);
  const hits = findBlockingMeshes(camera(), new THREE.Vector3(0, 0, 0), group);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].mesh, foreground);
  assert.ok(hits[0].point instanceof THREE.Vector3);
  assert.ok(hits[0].distance > 2);
  assert.ok(hits[0].distance < 7);
});

test('ray detects no obstacle when objects are off-axis', () => {
  const group = new THREE.Group();
  mesh(group, 4, 0, 3, 0xffffff);
  assert.deepEqual(findBlockingMeshes(camera(), new THREE.Vector3(), group), []);
});

test('debug marker meshes are excluded from obstruction detection', () => {
  const group = new THREE.Group();
  const marker = mesh(group, 0, 0, 3, 0xffffff);
  marker.userData.noAntOcclusion = true;
  assert.deepEqual(findBlockingMeshes(camera(), new THREE.Vector3(), group), []);
});

test('a cached result reuses hit points without rebuilding every display frame', () => {
  const cam = camera();
  const group = new THREE.Group();
  mesh(group, 0, 0, 3, 0xffffff);
  const point = new THREE.Vector3(0, 0, 0);
  const first = getCachedBlockers(cam, point, group);
  const second = getCachedBlockers(cam, point, group);
  assert.equal(first, second);
  assert.equal(first.length, 1);
  assert.ok(first[0].point.distanceTo(point) > 0);
});

test('shader inserts a local cutout without changing opacity or depth writing', () => {
  const state = {
    start: new THREE.Vector3(1, 2, 3),
    end: new THREE.Vector3(4, 5, 6),
    radius: { value: DEFAULT_REVEAL_RADIUS },
    enabled: { value: 0 },
  };
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\nvoid main() {\n#include <worldpos_vertex>\n}',
    fragmentShader: '#include <common>\nvoid main() {\n#include <clipping_planes_fragment>\n}',
  };
  injectRevealMask(shader, state);
  assert.ok(shader.vertexShader.includes('vAslRevealWorld = (modelMatrix'));
  assert.ok(shader.fragmentShader.includes('distance(vAslRevealWorld, closest)'));
  assert.ok(shader.fragmentShader.includes('aslRevealEnd - aslRevealStart'));
  assert.ok(shader.fragmentShader.includes('dot(path, path)'));
  assert.ok(shader.fragmentShader.includes('discard;'))
  assert.ok(shader.fragmentShader.includes('discard;'));
  assert.ok(shader.fragmentShader.includes('gl_FragCoord.xy'));
  assert.ok(!shader.fragmentShader.includes('gl_FragColor.a'));
  assert.equal(shader.uniforms.aslRevealStart.value, state.start);
  assert.equal(shader.uniforms.aslRevealEnd.value, state.end);
  assert.equal(shader.uniforms.aslRevealEnabled, state.enabled);
});

test('only selected occlusion mesh receives an active LOCAL mask while rendering', () => {
  const group = new THREE.Group();
  const shared = new THREE.MeshStandardMaterial({ color: 0xabcdef });
  const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared);
  const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared);
  group.add(a, b);
  const hit = { mesh: a, point: new THREE.Vector3(2, 3, 4),
    rayStart: new THREE.Vector3(2, 3, 7),
    rayEnd: new THREE.Vector3(2, 3, 0) };
  renderWithOcclusion([hit], () => {
    assert.equal(a.material.transparent, false);
    assert.equal(a.material.depthWrite, true);
    assert.equal(a.material.opacity, 1);
    assert.equal(b.material, shared, 'non-blocking mesh uses original material');
    assert.equal(b.material.opacity, 1);
    assert.ok(a.userData.antRevealMaterials);
    const uniforms = a.userData.antRevealMaterials[0].uniforms;
    assert.equal(uniforms.enabled.value, 1);
    assert.equal(uniforms.radius.value, DEFAULT_REVEAL_RADIUS);
    assert.ok(uniforms.start.equals(hit.rayStart));
    assert.ok(uniforms.end.equals(hit.rayEnd));
  });
  assert.equal(a.material.transparent, false);
  assert.equal(a.material.depthWrite, true);
  assert.equal(a.userData.antRevealMaterials[0].uniforms.enabled.value, 0);
  assert.equal(b.material.transparent, false);
});

test('two camera passes share no active reveal and reuse shader material clones', () => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1),
    new THREE.MeshStandardMaterial({ color: 0xcc4433 }));
  const first = new THREE.Vector3(0, 1, 1);
  const second = new THREE.Vector3(1, 1, 0);
  renderWithOcclusion([{ mesh: m, point: first,
    rayStart: new THREE.Vector3(0, 0, 7), rayEnd: first }], () => {});
  const material = m.material;
  assert.equal(m.userData.antRevealMaterials[0].uniforms.enabled.value, 0);
  renderWithOcclusion([{ mesh: m, point: second,
    rayStart: new THREE.Vector3(0, 0, 7), rayEnd: second }], () => {
    assert.equal(m.material, material);
    assert.ok(m.userData.antRevealMaterials[0].uniforms.end.equals(second));
    assert.equal(m.userData.antRevealMaterials[0].uniforms.enabled.value, 1);
  }, 1.2);
  assert.equal(m.userData.antRevealMaterials[0].uniforms.enabled.value, 0);
});

test('reveal mask switches off when rendering throws', () => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial());
  assert.throws(() =>
    renderWithOcclusion([{ mesh: m, point: new THREE.Vector3(),
      rayStart: new THREE.Vector3(0, 0, 7), rayEnd: new THREE.Vector3() }],
      () => { throw new Error('WebGL context lost'); }),
  /WebGL context lost/);
  assert.equal(m.material.transparent, false);
  assert.equal(m.material.depthWrite, true);
  assert.equal(m.userData.antRevealMaterials[0].uniforms.enabled.value, 0);
});

test('empty blocker list renders without modifying materials', () => {
  let calls = 0;
  renderWithOcclusion([], () => { calls += 1; });
  assert.equal(calls, 1);
});
