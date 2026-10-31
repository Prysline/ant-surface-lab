import * as THREE from 'three';
import {
  HALF, add, mul, cross, dot, unit, length, tangent, initialAnt, moveOnSurface,
} from './core.js';
import {
  SurfaceCamera, makeMonitor, updateMonitorAspect, cameraDifferenceDegrees,
} from './cameras.js';
import { calculateViewRect } from './viewports.js';
import { getCachedBlockers, renderWithOcclusion } from './occlusion.js';
import { MINI, MINI_SCALE, miniatureSpawn, moveMiniature } from './miniature.js';
import { createMiniatureScene } from './miniatureScene.js';
import './style.css';

const $ = (id) => document.getElementById(id);
const app = $('lab');
const aView = $('view-a'), bView = $('view-b');
const viewTop = $('monitor-top'), viewFront = $('monitor-front'), viewSide = $('monitor-side');
const views = [
  { element: aView, type: 'A' }, { element: bView, type: 'B' },
  { element: viewTop, type: 'top' }, { element: viewFront, type: 'front' },
  { element: viewSide, type: 'side' },
];

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.domElement.id = 'render-layer';
renderer.setClearColor(0x12222c);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x142833);
scene.add(new THREE.HemisphereLight(0xd7f9fd, 0x344455, 2.3));
const sunlight = new THREE.DirectionalLight(0xffd5a1, 2.7);
sunlight.position.set(5, 9, 7);
scene.add(sunlight);
const coolLight = new THREE.DirectionalLight(0x86c5d9, 1.7);
coolLight.position.set(-5, -2, -4);
scene.add(coolLight);

const geometryGroup = new THREE.Group();
scene.add(geometryGroup);
let miniaturePresentation = null;
let occlusionEnabled = true;
const debugGroup = new THREE.Group();
debugGroup.layers.set(1);
scene.add(debugGroup);

const axes = new THREE.AxesHelper(2.35);
axes.material.transparent = true;
axes.material.opacity = 0.58;
axes.layers.set(1);
scene.add(axes);
const grid = new THREE.GridHelper(8, 16, 0x78a0b0, 0x416070);
grid.position.y = -2.25;
grid.material.transparent = true;
grid.material.opacity = 0.24;
grid.layers.set(1);
scene.add(grid);

const cameraA = new SurfaceCamera('A');
const cameraB = new SurfaceCamera('B');
const monitors = {
  top: makeMonitor([0, 9, 0], [0, 0, -1]),
  front: makeMonitor([0, 0, 9]),
  side: makeMonitor([9, 0, 0]),
};
Object.values(monitors).forEach((cam) => cam.layers.enable(1));

const antRoot = new THREE.Group();
scene.add(antRoot);
const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xe8ac55, roughness: 0.58, metalness: 0.1 });
const headMaterial = new THREE.MeshStandardMaterial({ color: 0x6b342a, roughness: 0.55 });
const legMaterial = new THREE.MeshStandardMaterial({ color: 0x422d2b, roughness: 0.72 });
const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffe6a4 });

function orb(parent, material, x, y, z, sx, sy, sz) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}
function stick(parent, material, points, radius = 0.013) {
  for (let i = 1; i < points.length; i += 1) {
    const a = new THREE.Vector3(...points[i - 1]);
    const b = new THREE.Vector3(...points[i]);
    const difference = b.clone().sub(a);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.65, radius, difference.length(), 5),
      material,
    );
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), difference.normalize());
    parent.add(mesh);
  }
}
orb(antRoot, bodyMaterial, 0, 0.205, 0.23, 0.14, 0.115, 0.20);
orb(antRoot, bodyMaterial, 0, 0.194, 0, 0.095, 0.085, 0.11);
orb(antRoot, headMaterial, 0, 0.20, -0.205, 0.13, 0.105, 0.14);
for (const sign of [-1, 1]) {
  orb(antRoot, eyeMaterial, sign * 0.105, 0.242, -0.255, 0.018, 0.019, 0.023);
  stick(antRoot, legMaterial, [
    [sign * 0.085, 0.17, -0.085], [sign * 0.23, 0.14, -0.16],
    [sign * 0.35, 0.023, -0.26],
  ]);
  stick(antRoot, legMaterial, [
    [sign * 0.095, 0.17, 0.035], [sign * 0.27, 0.145, 0.075],
    [sign * 0.36, 0.02, 0.12],
  ]);
  stick(antRoot, legMaterial, [
    [sign * 0.088, 0.17, 0.14], [sign * 0.24, 0.15, 0.25],
    [sign * 0.32, 0.02, 0.37],
  ]);
  stick(antRoot, legMaterial, [
    [sign * 0.067, 0.27, -0.29], [sign * 0.10, 0.39, -0.43],
    [sign * 0.14, 0.32, -0.49],
  ], 0.009);
}

const normalArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.85, 0x65e0c3, 0.15, 0.08);
const facingArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 0.85, 0xf5bc65, 0.16, 0.08);
const aUpArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 0.75, 0xf18b68, 0.15, 0.07);
const bUpArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 0.75, 0x7cc7fa, 0.15, 0.07);
for (const helper of [normalArrow, facingArrow, aUpArrow, bUpArrow]) {
  helper.traverse((obj) => obj.layers.set(1));
  scene.add(helper);
}

const trailMaterial = new THREE.LineBasicMaterial({ color: 0xf3d18a, transparent: true, opacity: 0.68 });
let trail = new THREE.Line(new THREE.BufferGeometry(), trailMaterial);
trail.layers.enable(1);
scene.add(trail);
let tracePoints = [];

let ant = initialAnt('cube');
let activeCamera = 'A';
let demo = false, paused = false, demoIndex = 0, demoTime = 0, segmentStarted = false;
let showTrail = true;
const keyDown = new Set();
const joystick = { x: 0, y: 0 };
const speed = 1.12;
const fixedDt = 1 / 60;
const tour = [
  { duration: 2.3, turn: 0 },
  { duration: 2.0, turn: Math.PI / 2 },
  { duration: 2.5, turn: -Math.PI / 2 },
  { duration: 2.2, turn: Math.PI / 2 },
  { duration: 2.0, turn: Math.PI / 2 },
  { duration: 2.3, turn: -Math.PI / 2 },
];

function makeLine(points, color, opacity = 0.35) {
  const geometry = new THREE.BufferGeometry().setFromPoints(
    points.map((p) => new THREE.Vector3(...p)),
  );
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const line = new THREE.Line(geometry, material);
  geometryGroup.add(line);
}
function sphereDecoration() {
  for (const latitude of [-60, -30, 0, 30, 60]) {
    const circle = [];
    const phi = latitude * Math.PI / 180;
    for (let i = 0; i <= 96; i += 1) {
      const theta = 2 * Math.PI * i / 96;
      circle.push([Math.cos(phi) * Math.cos(theta) * (HALF + 0.004),
        Math.sin(phi) * (HALF + 0.004), Math.cos(phi) * Math.sin(theta) * (HALF + 0.004)]);
    }
    makeLine(circle, 0x7dd9c5, 0.31);
  }
  for (let meridian = 0; meridian < 12; meridian += 1) {
    const line = [];
    const theta = Math.PI * 2 * meridian / 12;
    for (let j = 0; j <= 64; j += 1) {
      const phi = -Math.PI / 2 + Math.PI * j / 64;
      line.push([Math.cos(phi) * Math.cos(theta) * (HALF + 0.004),
        Math.sin(phi) * (HALF + 0.004), Math.cos(phi) * Math.sin(theta) * (HALF + 0.004)]);
    }
    makeLine(line, 0x7dd9c5, 0.24);
  }
}
function cylinderDecoration() {
  for (const y of [-HALF, -HALF / 2, 0, HALF / 2, HALF]) {
    const line = [];
    for (let i = 0; i <= 96; i += 1) {
      const angle = i * 2 * Math.PI / 96;
      line.push([(HALF + 0.005) * Math.cos(angle), y, (HALF + 0.005) * Math.sin(angle)]);
    }
    makeLine(line, 0x7dd9c5);
  }
  for (let i = 0; i < 16; i += 1) {
    const a = i * 2 * Math.PI / 16;
    makeLine([[Math.cos(a) * (HALF + 0.006), -HALF, Math.sin(a) * (HALF + 0.006)],
      [Math.cos(a) * (HALF + 0.006), HALF, Math.sin(a) * (HALF + 0.006)]], 0xa5e6df, 0.21);
  }
}
function cubeDecoration() {
  for (let axis = 0; axis < 3; axis += 1) {
    for (const sign of [-1, 1]) {
      for (const value of [-1, -0.5, 0, 0.5, 1]) {
        const others = [0, 1, 2].filter((i) => i !== axis);
        const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0], d = [0, 0, 0];
        a[axis] = sign * (HALF + 0.006); b[axis] = a[axis];
        c[axis] = a[axis]; d[axis] = a[axis];
        a[others[0]] = value; b[others[0]] = value;
        a[others[1]] = -HALF; b[others[1]] = HALF;
        c[others[1]] = value; d[others[1]] = value;
        c[others[0]] = -HALF; d[others[0]] = HALF;
        makeLine([a, b], 0x96d7c5, 0.21);
        makeLine([c, d], 0x96d7c5, 0.21);
      }
    }
  }
}
function createShape(shape) {
  miniaturePresentation = null;
  const isMiniature = shape === 'miniature';
  geometryGroup.scale.setScalar(isMiniature ? MINI_SCALE : 1);
  grid.visible = !isMiniature;
  axes.scale.setScalar(isMiniature ? MINI_SCALE : 1);
  for (const [name, monitor] of Object.entries(monitors)) {
    const factor = isMiniature ? MINI_SCALE : 1;
    if (name === 'top') monitor.position.set(0, 9 * factor, 0);
    else if (name === 'front') monitor.position.set(0, 0, 9 * factor);
    else monitor.position.set(9 * factor, 0, 0);
    monitor.lookAt(0, 0, 0);
    monitor.updateMatrixWorld();
  }
  for (const child of [...geometryGroup.children]) {
    geometryGroup.remove(child);
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
    else child.material?.dispose?.();
  }
  if (shape === 'miniature') {
    miniaturePresentation = createMiniatureScene(geometryGroup);
    return;
  }
  let mesh;
  if (shape === 'sphere') {
    mesh = new THREE.Mesh(new THREE.SphereGeometry(HALF, 48, 36),
      new THREE.MeshStandardMaterial({ color: 0x608f8e, roughness: 0.83 }));
    geometryGroup.add(mesh);
    sphereDecoration();
  } else if (shape === 'cylinder') {
    mesh = new THREE.Mesh(new THREE.CylinderGeometry(HALF, HALF, HALF * 2, 64, 1),
      new THREE.MeshStandardMaterial({ color: 0x648e9d, roughness: 0.83 }));
    geometryGroup.add(mesh);
    cylinderDecoration();
  } else {
    const colors = [0x739ab1, 0x668eaa, 0x548f80, 0x6f849b, 0x728fa0, 0x668d9d];
    mesh = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, HALF * 2, HALF * 2),
      colors.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.86 })));
    geometryGroup.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: 0xc6e9e3, transparent: true, opacity: 0.65 }));
    geometryGroup.add(edges);
    cubeDecoration();
  }
}
function updateTrail() {
  const material = trail.material;
  trail.geometry.dispose();
  trail.geometry = new THREE.BufferGeometry().setFromPoints(
    tracePoints.map((p) => new THREE.Vector3(...p)),
  );
  trail.visible = showTrail;
  trail.material = material;
}
function addTrace() {
  const point = add(ant.p, mul(ant.n, 0.024));
  if (tracePoints.length && length([
    point[0] - tracePoints[tracePoints.length - 1][0],
    point[1] - tracePoints[tracePoints.length - 1][1],
    point[2] - tracePoints[tracePoints.length - 1][2],
  ]) < 0.065) return;
  tracePoints.push(point);
  if (tracePoints.length > 900) tracePoints.shift();
  updateTrail();
}

function reset(shape = $('shape').value) {
  ant = shape === 'miniature' ? miniatureSpawn($('mini-start').value) : initialAnt(shape);
  demo = false;
  demoIndex = 0;
  demoTime = 0;
  segmentStarted = false;
  paused = false;
  tracePoints = [];
  createShape(shape);
  updateTrail();
  const miniature = shape === 'miniature';
  $('miniature-start-control').hidden = !miniature;
  cameraA.distance = miniature ? 4.7 : 5.65;
  cameraB.distance = miniature ? 4.7 : 5.65;
  for (const monitor of Object.values(monitors)) {
    monitor.userData.halfHeight = miniature ? 3.7 * MINI_SCALE : 2.65;
  }
  cameraA.reset(ant);
  cameraB.reset(ant);
  $('status').textContent = '準備就緒';
  $('pause').textContent = '暫停';
  updateVisuals();
}
function turnAroundNormal(direction, normal, angle) {
  return unit(tangent(add(mul(direction, Math.cos(angle)),
    mul(cross(normal, direction), Math.sin(angle))), normal));
}
function startDemo() {
  reset($('shape').value);
  demo = true;
  $('status').textContent = '路徑演示中';
}
function stopDemo() {
  if (!demo) return;
  demo = false;
  $('status').textContent = '手動操作';
}

function movementAxes() {
  const x = Number(keyDown.has('d') || keyDown.has('arrowright')) -
    Number(keyDown.has('a') || keyDown.has('arrowleft')) + joystick.x;
  const y = Number(keyDown.has('w') || keyDown.has('arrowup')) -
    Number(keyDown.has('s') || keyDown.has('arrowdown')) + joystick.y;
  const magnitude = Math.hypot(x, y);
  return magnitude > 1 ? [x / magnitude, y / magnitude] : [x, y];
}

function advanceAnt(direction, distance) {
  if (ant.shape === 'miniature') moveMiniature(ant, direction, distance * MINI_SCALE);
  else moveOnSurface(ant, direction, distance);
}

function tick() {
  if (demo) {
    const segment = tour[demoIndex];
    if (!segment) {
      demo = false;
      $('status').textContent = '路徑演示完成';
      return;
    }
    if (!segmentStarted) {
      ant.f = turnAroundNormal(ant.f, ant.n, segment.turn);
      segmentStarted = true;
    }
    advanceAnt(ant.f, speed * fixedDt);
    addTrace();
    demoTime += fixedDt;
    if (demoTime >= segment.duration) {
      demoTime = 0;
      segmentStarted = false;
      demoIndex += 1;
    }
  } else {
    const [x, y] = movementAxes();
    if (Math.hypot(x, y) > 0.035) {
      const camera = activeCamera === 'A' ? cameraA : cameraB;
      const direction = camera.direction(x, y);
      advanceAnt(direction, speed * fixedDt);
      addTrace();
    }
  }
  cameraA.update(ant, 1);
  cameraB.update(ant, 1);
}

function updateVisuals() {
  miniaturePresentation?.updateVisibility(ant);
  const normal = new THREE.Vector3(...ant.n);
  const heading = new THREE.Vector3(...ant.f).normalize();
  const localZ = heading.clone().negate();
  const localX = new THREE.Vector3().crossVectors(normal, localZ).normalize();
  const matrix = new THREE.Matrix4().makeBasis(localX, normal, localZ);
  antRoot.quaternion.setFromRotationMatrix(matrix);
  antRoot.position.set(
    ant.p[0] + ant.n[0] * 0.018,
    ant.p[1] + ant.n[1] * 0.018,
    ant.p[2] + ant.n[2] * 0.018,
  );
  const center = new THREE.Vector3(...ant.p);
  normalArrow.position.copy(center);
  normalArrow.setDirection(normal);
  facingArrow.position.copy(center.clone().addScaledVector(normal, 0.1));
  facingArrow.setDirection(heading);
  aUpArrow.position.copy(center.clone().addScaledVector(normal, 0.9).add(new THREE.Vector3(-0.18, 0, 0)));
  aUpArrow.setDirection(new THREE.Vector3(...cameraA.screenUp));
  bUpArrow.position.copy(center.clone().addScaledVector(normal, 1.1).add(new THREE.Vector3(0.18, 0, 0)));
  bUpArrow.setDirection(new THREE.Vector3(...cameraB.screenUp));
}

const renderSize = new THREE.Vector2();

function renderView(element, camera) {
  const panelRect = element.getBoundingClientRect();
  const canvasRect = renderer.domElement.getBoundingClientRect();
  renderer.getSize(renderSize);
  const region = calculateViewRect(
    panelRect, canvasRect, renderSize.x, renderSize.y,
  );
  if (!region) return;

  // IMPORTANT: projection and viewport use the FULL panel dimensions.
  // Only scissor is clipped. Scrolling must never zoom or stretch the camera.
  if (camera.isPerspectiveCamera) {
    camera.aspect = region.aspect;
    camera.updateProjectionMatrix();
  } else updateMonitorAspect(camera, region.aspect);

  const vp = region.viewport, clip = region.scissor;
  renderer.setViewport(vp.x, vp.y, vp.width, vp.height);
  renderer.setScissor(clip.x, clip.y, clip.width, clip.height);
  renderer.setScissorTest(true);
  renderer.setClearColor(0x142833, 1);
  renderer.clear(true, true, true);
  if (occlusionEnabled && ant.shape === 'miniature') {
    // Different camera views fade different meshes, never the entire world.
    const antTarget = antRoot.localToWorld(new THREE.Vector3(0, 0.20, 0));
    const blockers = getCachedBlockers(camera, antTarget, geometryGroup);
    renderWithOcclusion(blockers, () => renderer.render(scene, camera));
  } else {
    renderer.render(scene, camera);
  }
}

function render() {
  renderer.setScissorTest(false);
  renderer.setClearColor(0x0b1820, 1);
  renderer.clear();
  renderView(aView, cameraA.camera);
  renderView(bView, cameraB.camera);
  renderView(viewTop, monitors.top);
  renderView(viewFront, monitors.front);
  renderView(viewSide, monitors.side);
  renderer.setScissorTest(false);
}
function telemetry() {
  const format = (v) => v.map((x) => x.toFixed(2)).join(' / ');
  $('position').textContent = format(ant.p);
  $('normal').textContent = format(ant.n);
  $('heading').textContent = format(ant.f);
  $('angle').textContent = cameraDifferenceDegrees(cameraA, cameraB).toFixed(1) + '°';
  $('motion').textContent = demo ? '預設路徑' : (paused ? '暫停' : '手動控制');
  $('surface').textContent = ant.shape === 'miniature' ? ({ ground: '展示台地面', leg: '凳腳', seat: '木凳面', seatSide: '凳面側壁', plate: '餐盤（上面／盤緣／盤底／圈足）／湯匙', apple: '蘋果表面' }[ant.surface] || '未知') : ant.shape;
}

function setActive(mode) {
  activeCamera = mode;
  for (const m of ['A', 'B']) {
    const button = $('control-' + m.toLowerCase());
    button.classList.toggle('selected', m === mode);
    button.setAttribute('aria-pressed', String(m === mode));
    $('view-' + m.toLowerCase()).classList.toggle('driving', m === mode);
    $('view-' + m.toLowerCase()).querySelector('.drive-indicator').textContent =
      m === mode ? '控制來源' : '同步觀察';
  }
}
$('control-a').addEventListener('click', () => setActive('A'));
$('control-b').addEventListener('click', () => setActive('B'));
$('shape').addEventListener('change', (event) => {
  $('mini-start').value = 'ground';
  reset(event.target.value);
});
$('mini-start').addEventListener('change', () => reset('miniature'));
$('reset').addEventListener('click', () => reset());
$('demo').addEventListener('click', startDemo);
$('replay').addEventListener('click', startDemo);
$('pause').addEventListener('click', () => {
  paused = !paused;
  $('pause').textContent = paused ? '繼續' : '暫停';
  $('status').textContent = paused ? '已暫停' : (demo ? '路徑演示中' : '手動操作');
});
$('occlusion').addEventListener('change', (event) => {
  occlusionEnabled = event.target.checked;
});
$('trail').addEventListener('change', (event) => {
  showTrail = event.target.checked;
  trail.visible = showTrail;
});
$('quality').addEventListener('change', resize);
$('transition').addEventListener('change', (event) => {
  const milliseconds = Number(event.target.value);
  cameraA.setTransitionMilliseconds(milliseconds);
  cameraB.setTransitionMilliseconds(milliseconds);
  // In instant mode, immediately show the normal-aligned target.
  if (milliseconds === 0) {
    cameraA.present(0, true);
    cameraB.present(0, true);
  }
});
for (const view of [viewTop, viewFront, viewSide]) {
  view.addEventListener('click', () => {
    const expand = !view.classList.contains('expanded');
    [viewTop, viewFront, viewSide].forEach((v) => v.classList.remove('expanded'));
    if (expand) view.classList.add('expanded');
  });
}

const keyMap = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLElement &&
      ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(event.target.tagName)) return;
  const key = event.key.toLowerCase();
  if (keyMap.has(key)) {
    event.preventDefault();
    keyDown.add(key);
    stopDemo();
  }
  if (key === ' ') {
    event.preventDefault();
    $('pause').click();
  }
});
window.addEventListener('keyup', (event) => keyDown.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => {
  keyDown.clear();
  joystick.x = 0;
  joystick.y = 0;
  $('joystick-knob').style.transform = 'translate(0px, 0px)';
});

const pad = $('joystick');
const knob = $('joystick-knob');
let padPointer = null;
function updatePad(event) {
  const rect = pad.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const maxDistance = rect.width * 0.33;
  let x = (event.clientX - cx) / maxDistance;
  let y = (cy - event.clientY) / maxDistance;
  const norm = Math.hypot(x, y);
  if (norm > 1) { x /= norm; y /= norm; }
  joystick.x = x;
  joystick.y = y;
  knob.style.transform = 'translate(' + (x * maxDistance) + 'px,' + (-y * maxDistance) + 'px)';
}
pad.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  padPointer = event.pointerId;
  pad.setPointerCapture(event.pointerId);
  updatePad(event);
  stopDemo();
});
pad.addEventListener('pointermove', (event) => {
  if (event.pointerId === padPointer) updatePad(event);
});
function releasePad(event) {
  if (event.pointerId !== padPointer) return;
  padPointer = null;
  joystick.x = 0;
  joystick.y = 0;
  knob.style.transform = 'translate(0px, 0px)';
}
pad.addEventListener('pointerup', releasePad);
pad.addEventListener('pointercancel', releasePad);

function resize() {
  const quality = $('quality').value;
  const cap = quality === 'low' ? 0.85 : quality === 'high' ? 2 : 1.35;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
  // CSS canvas size MUST equal renderer's CSS-pixel dimensions. 100vh on
  // mobile can differ from innerHeight while the browser toolbar collapses.
  renderer.setSize(window.innerWidth, window.innerHeight, true);
}
window.addEventListener('resize', resize);
// Android / iOS browser chrome can change the visible viewport on scroll.
window.visualViewport?.addEventListener('resize', resize);
resize();
setActive('A');
reset('cube');
let lastFrame = performance.now();
let accumulator = 0, lastTelemetry = 0;
function animate(now) {
  const elapsed = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (!paused && document.visibilityState !== 'hidden') {
    accumulator += elapsed;
    for (let i = 0; accumulator >= fixedDt && i < 6; i += 1) {
      tick();
      accumulator -= fixedDt;
    }
  } else accumulator = 0;
  cameraA.present(elapsed);
  cameraB.present(elapsed);
  updateVisuals();
  render();
  if (now - lastTelemetry > 120) {
    telemetry();
    lastTelemetry = now;
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
