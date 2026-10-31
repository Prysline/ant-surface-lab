// View-dependent visibility assistance. Transparency never changes the world
// simulation, collision geometry, or camera-frame mathematics.
import * as THREE from 'three';

const occlusionRay = new THREE.Raycaster();
const rayDirection = new THREE.Vector3();
const rayTarget = new THREE.Vector3();

// Reused by A/B render views; camera render order must not leak transparency.
const cachedByCamera = new WeakMap();

export function findBlockingMeshes(camera, antPoint, root, maxBlockers = 3) {
  rayDirection.copy(antPoint).sub(camera.position);
  const fullDistance = rayDirection.length();
  if (fullDistance < 0.4) return [];
  rayDirection.multiplyScalar(1 / fullDistance);
  occlusionRay.set(camera.position, rayDirection);
  occlusionRay.near = Math.max(0.01, camera.near || 0.01);
  // Don't classify the surface *beneath* the ant as an occluder.
  occlusionRay.far = fullDistance - 0.22;
  occlusionRay.layers.set(0);
  root.updateWorldMatrix(true, true);
  const hits = occlusionRay.intersectObject(root, true);
  const out = [], seen = new Set();
  for (const hit of hits) {
    const mesh = hit.object;
    if (!mesh.isMesh || mesh.userData.noAntOcclusion || seen.has(mesh)) continue;
    seen.add(mesh);
    out.push(mesh);
    if (out.length >= maxBlockers) break;
  }
  return out;
}

export function getCachedBlockers(camera, antPoint, root) {
  let entry = cachedByCamera.get(camera);
  if (!entry) {
    entry = {
      frame: 0,
      position: new THREE.Vector3(Infinity, Infinity, Infinity),
      target: new THREE.Vector3(Infinity, Infinity, Infinity),
      blockers: [],
    };
    cachedByCamera.set(camera, entry);
  }
  const moved = camera.position.distanceToSquared(entry.position) > 0.15 ** 2 ||
    antPoint.distanceToSquared(entry.target) > 0.08 ** 2;
  if (entry.frame++ % 6 === 0 || moved) {
    entry.blockers = findBlockingMeshes(camera, antPoint, root);
    entry.position.copy(camera.position);
    entry.target.copy(antPoint);
  }
  return entry.blockers;
}

// Restore material flags even if the rendering pass throws. Shared materials
// are cloned once per obstruction mesh so fading a stool panel never fades
// every stool leg and apple mesh that happens to share that material.
export function renderWithOcclusion(meshes, render, opacity = 0.20) {
  const modified = [];
  try {
    for (const mesh of meshes) {
      if (!mesh.userData.antUniqueMaterial) {
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map((m) => m.clone())
          : mesh.material.clone();
        mesh.userData.antUniqueMaterial = true;
      }
      const materials = Array.isArray(mesh.material)
        ? mesh.material : [mesh.material];
      for (const material of materials) {
        modified.push({
          material, opacity: material.opacity,
          transparent: material.transparent, depthWrite: material.depthWrite,
        });
        material.opacity = Math.min(opacity, material.opacity);
        material.transparent = true;
        material.depthWrite = false;
        material.needsUpdate = true;
      }
    }
    render();
  } finally {
    for (const entry of modified) {
      const m = entry.material;
      m.opacity = entry.opacity;
      m.transparent = entry.transparent;
      m.depthWrite = entry.depthWrite;
      m.needsUpdate = true;
    }
  }
}
