import * as THREE from 'three';
import { dot, length, tangent, transport, unit } from './core.js';

const NORTH = [0, 0, -1];
const ALTERNATE = [0, 1, 0];

function stableTangent(reference, normal, previous = [1, 0, 0]) {
  let projected = tangent(reference, normal);
  if (length(projected) < 0.12) projected = tangent(previous, normal);
  if (length(projected) < 0.001) projected = tangent(ALTERNATE, normal);
  if (length(projected) < 0.001) projected = tangent([1, 0, 0], normal);
  return unit(projected);
}

export class SurfaceCamera {
  constructor(mode) {
    this.mode = mode; // A = fixed world-axis projection; B = parallel transport.
    this.camera = new THREE.PerspectiveCamera(43, 1, 0.05, 100);
    this.normal = [0, 1, 0];
    this.screenUp = [0, 0, -1];
    this.distance = 5.65;
  }

  reset(ant) {
    this.normal = [...ant.n];
    this.screenUp = stableTangent(NORTH, ant.n);
    this.update(ant, 1);
  }

  update(ant, aspect = 1) {
    if (this.mode === 'A') {
      this.screenUp = stableTangent(NORTH, ant.n, this.screenUp);
    } else {
      const moved = transport(this.screenUp, this.normal, ant.n);
      this.screenUp = stableTangent(moved, ant.n, this.screenUp);
    }
    this.normal = [...ant.n];
    const n = ant.n, p = ant.p;
    const camera = this.camera;
    camera.aspect = Math.max(0.2, aspect);
    camera.updateProjectionMatrix();
    camera.position.set(
      p[0] + n[0] * this.distance,
      p[1] + n[1] * this.distance,
      p[2] + n[2] * this.distance,
    );
    camera.up.set(...this.screenUp);
    camera.lookAt(p[0], p[1], p[2]);
    camera.updateMatrixWorld();
  }

  // Controls are interpreted in the active camera's local screen axes.
  direction(x, y) {
    const elements = this.camera.matrixWorld.elements;
    const right = [elements[0], elements[1], elements[2]];
    const up = [elements[4], elements[5], elements[6]];
    const value = [
      right[0] * x + up[0] * y,
      right[1] * x + up[1] * y,
      right[2] * x + up[2] * y,
    ];
    return unit(tangent(value, this.normal));
  }
}

export function makeMonitor(position, up = [0, 1, 0]) {
  const camera = new THREE.OrthographicCamera(-2.65, 2.65, 2.65, -2.65, 0.1, 60);
  camera.position.set(...position);
  camera.up.set(...up);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

export function updateMonitorAspect(camera, aspect) {
  const h = 2.65;
  const w = Math.max(2.65, aspect * h);
  camera.left = -w;
  camera.right = w;
  camera.top = h;
  camera.bottom = -h;
  camera.updateProjectionMatrix();
}

export function cameraDifferenceDegrees(a, b) {
  return Math.acos(Math.min(1, Math.max(-1, dot(a.screenUp, b.screenUp)))) * 180 / Math.PI;
}
