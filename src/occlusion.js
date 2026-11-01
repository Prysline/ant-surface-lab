/**
 * Camera-local ant reveal mask.
 *
 * We intentionally DO NOT make an entire mesh transparent: doing so exposes
 * unrelated backfaces, creates sorting artifacts and destroys spatial context.
 * Instead opaque depth-writing materials use a small dithered cutout at the
 * ray hit that blocks the ant. Pixels outside that region render normally.
 *
 * One material clone per occluding mesh is reused; shaders compile once.
 * Every camera pass enables and then restores the localized reveal.
 */
import * as THREE from 'three';

const occlusionRay = new THREE.Raycaster();
const rayDirection = new THREE.Vector3();
const cachedByCamera = new WeakMap();
const REVEAL_PROGRAM_KEY = 'ant-surface-local-dither-reveal-v1';

export const DEFAULT_REVEAL_RADIUS = 0.90;

export function findBlockingMeshes(camera, antPoint, root, maxBlockers = 3) {
  rayDirection.copy(antPoint).sub(camera.position);
  const fullDistance = rayDirection.length();
  if (fullDistance < 0.4) return [];
  rayDirection.multiplyScalar(1 / fullDistance);

  occlusionRay.set(camera.position, rayDirection);
  occlusionRay.near = Math.max(0.01, camera.near || 0.01);
  // Avoid counting the supporting surface immediately beneath the ant.
  occlusionRay.far = fullDistance - 0.22;
  occlusionRay.layers.set(0);
  root.updateWorldMatrix(true, true);
  const hits = occlusionRay.intersectObject(root, true);
  const blockers = [], seen = new Set();
  for (const hit of hits) {
    const mesh = hit.object;
    if (!mesh.isMesh || mesh.userData.noAntOcclusion || seen.has(mesh)) continue;
    seen.add(mesh);
    blockers.push({
      mesh,
      point: hit.point.clone(),
      distance: hit.distance,
    });
    if (blockers.length >= maxBlockers) break;
  }
  return blockers;
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
  const moved = camera.position.distanceToSquared(entry.position) > 0.12 ** 2 ||
    antPoint.distanceToSquared(entry.target) > 0.07 ** 2;
  if (entry.frame++ % 5 === 0 || moved) {
    entry.blockers = findBlockingMeshes(camera, antPoint, root);
    entry.position.copy(camera.position);
    entry.target.copy(antPoint);
  }
  return entry.blockers;
}

// Shader injection is testable without a GPU. Outside the small reveal circle
// all fragments remain opaque, write depth and use normal rendering order.
export function injectRevealMask(shader, state) {
  const common = '#include <common>';
  const vertexAnchor = '#include <worldpos_vertex>';
  const fragmentAnchor = '#include <clipping_planes_fragment>';
  if (!shader.vertexShader.includes(vertexAnchor) ||
      !shader.fragmentShader.includes(fragmentAnchor)) {
    throw new Error('Local ant reveal requires Three.js mesh shader chunks');
  }
  shader.uniforms.aslRevealCenter = { value: state.center };
  shader.uniforms.aslRevealRadius = state.radius;
  shader.uniforms.aslRevealEnabled = state.enabled;

  shader.vertexShader = shader.vertexShader.replace(
    common, common + '\nvarying vec3 vAslRevealWorld;',
  ).replace(
    vertexAnchor,
    vertexAnchor +
      '\nvAslRevealWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
  );

  const fragDeclarations = [
    'varying vec3 vAslRevealWorld;',
    'uniform vec3 aslRevealCenter;',
    'uniform float aslRevealRadius;',
    'uniform float aslRevealEnabled;',
  ].join('\n');
  const fragCutout = [
    'if (aslRevealEnabled > 0.5) {',
    '  float revealDistance = distance(vAslRevealWorld, aslRevealCenter);',
    '  float revealAmount = 1.0 - smoothstep(',
    '    aslRevealRadius * 0.73, aslRevealRadius, revealDistance',
    '  );',
    '  // Screen-door cutout, no alpha sorting: retain a faint 6% pattern.',
    '  float dither = fract(sin(dot(gl_FragCoord.xy,',
    '    vec2(12.9898, 78.233))) * 43758.5453);',
    '  if (dither < revealAmount * 0.94) discard;',
    '}',
  ].join('\n');

  shader.fragmentShader = shader.fragmentShader.replace(
    common, common + '\n' + fragDeclarations,
  ).replace(
    fragmentAnchor, fragmentAnchor + '\n' + fragCutout,
  );
}

function ensureRevealMaterial(mesh) {
  if (mesh.userData.antRevealMaterials) return mesh.userData.antRevealMaterials;
  const original = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const states = original.map((old) => {
    const material = old.clone();
    const uniforms = {
      center: new THREE.Vector3(),
      radius: { value: DEFAULT_REVEAL_RADIUS },
      enabled: { value: 0 },
    };
    // Do not change transparent/depthWrite: avoid the ghost apple artifact.
    material.onBeforeCompile = (shader) => injectRevealMask(shader, uniforms);
    material.customProgramCacheKey = () => REVEAL_PROGRAM_KEY;
    material.needsUpdate = true;
    return { material, uniforms };
  });
  mesh.material = Array.isArray(mesh.material)
    ? states.map(({ material }) => material)
    : states[0].material;
  mesh.userData.antRevealMaterials = states;
  return states;
}

/** Draw one view and guarantee that local reveal doesn't leak to another. */
export function renderWithOcclusion(blockers, render, radius = DEFAULT_REVEAL_RADIUS) {
  const active = [];
  try {
    for (const hit of blockers) {
      const materials = ensureRevealMaterial(hit.mesh);
      for (const { uniforms } of materials) {
        uniforms.center.copy(hit.point);
        uniforms.radius.value = radius;
        uniforms.enabled.value = 1;
        active.push(uniforms);
      }
    }
    render();
  } finally {
    for (const uniforms of active) uniforms.enabled.value = 0;
  }
}
