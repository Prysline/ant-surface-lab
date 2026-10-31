// Small dollhouse-style geometry for the connected miniature test surface.
// Coordinates and contact seams are authored in miniature.js (navigation source
// of truth). Geometry must follow that file; changing only the mesh is a bug.
import * as THREE from 'three';
import {
  MINI, LEGS, plateHeight, walkingHeight, appleCenter,
} from './miniature.js';

function material(color, roughness = 0.73, metalness = 0.0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, side: THREE.DoubleSide });
}

function attach(parent, geometry, surface, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, surface);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function polarSurface(radius, radialSteps, divisions, getHeight) {
  const positions = [];
  const indices = [];
  for (let j = 0; j <= radialSteps; j += 1) {
    const r = radius * j / radialSteps;
    for (let i = 0; i <= divisions; i += 1) {
      const a = Math.PI * 2 * i / divisions;
      const x = r * Math.cos(a), z = r * Math.sin(a);
      positions.push(x, getHeight(x, z), z);
    }
  }
  const width = divisions + 1;
  for (let j = 0; j < radialSteps; j += 1) {
    for (let i = 0; i < divisions; i += 1) {
      const a = j * width + i, b = a + width;
      // x/z plane: reverse winding for upper-facing normal.
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function spoonBowlGeometry() {
  const positions = [], indices = [], slices = 56, rings = 12;
  const rx = 0.265, rz = 0.205;
  for (let j = 0; j <= rings; j += 1) {
    const r = j / rings;
    for (let k = 0; k <= slices; k += 1) {
      const angle = Math.PI * 2 * k / slices;
      const x = MINI.spoonX + r * Math.cos(angle) * rx;
      const z = MINI.spoonZ + r * Math.sin(angle) * rz;
      positions.push(x, walkingHeight(x, z) + 0.0075, z);
    }
  }
  const w = slices + 1;
  for (let j = 0; j < rings; j += 1) {
    for (let k = 0; k < slices; k += 1) {
      const a = j * w + k, b = a + w;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function spoonHandleGeometry() {
  const positions = [], indices = [], nx = 28, nz = 8;
  const startX = MINI.spoonX + 0.16, endX = 1.19;
  for (let i = 0; i <= nx; i += 1) {
    const x = startX + (endX - startX) * i / nx;
    for (let j = 0; j <= nz; j += 1) {
      const z = MINI.spoonZ + (j / nz * 2 - 1) * 0.11;
      positions.push(x, walkingHeight(x, z) + 0.009, z);
    }
  }
  const w = nz + 1;
  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < nz; j += 1) {
      const a = i * w + j, b = a + w;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function addMarker(parent, x, y, z, color) {
  const mesh = attach(
    parent,
    new THREE.SphereGeometry(0.055, 8, 6),
    new THREE.MeshBasicMaterial({ color }),
    x, y, z,
  );
  // Diagnostics are visible only in the fixed monitor cameras (layer 1).
  mesh.layers.set(1);
}

export function createMiniatureScene(group) {
  const wood = material(0x9b7454, 0.83);
  const edge = material(0x6d4a37, 0.83);
  const platform = material(0xa9a18d, 0.92);
  const ceramic = material(0xe2e9dd, 0.44);
  const red = material(0xb94d3d, 0.57);
  const silver = material(0xc6cfd3, 0.24, 0.67);
  const stem = material(0x4a3d28, 0.89);
  const leaf = material(0x60825c, 0.74);

  // Miniature model base. Upper face precisely matches the ground walk plane.
  attach(group, new THREE.BoxGeometry(8, 0.22, 7.4), platform,
    0, MINI.floorY - 0.11, 0);
  const platformEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(8.02, 0.225, 7.42)),
    new THREE.LineBasicMaterial({ color: 0xe4d6b8, transparent: true, opacity: 0.35 }),
  );
  platformEdges.position.y = MINI.floorY - 0.11;
  group.add(platformEdges);

  const height = MINI.seatY - MINI.floorY;
  for (const [x, z] of LEGS) {
    attach(group, new THREE.CylinderGeometry(MINI.legRadius, MINI.legRadius, height, 20),
      wood, x, (MINI.seatY + MINI.floorY) / 2, z);
    // Simple differentiated feet make leg orientation easier to read.
    attach(group, new THREE.CylinderGeometry(0.225, 0.225, 0.085, 20),
      edge, x, MINI.floorY + 0.0425, z);
  }

  // Stool seat (not a free-floating thin plane). Its upper face is walkable.
  const seatThickness = 0.18;
  const seatMesh = attach(
    group,
    new THREE.BoxGeometry(MINI.seatHalf * 2, seatThickness, MINI.seatHalf * 2),
    wood, 0, MINI.seatY - seatThickness / 2, 0,
  );
  const seatBorder = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(MINI.seatHalf * 2 + 0.006,
      seatThickness + 0.006, MINI.seatHalf * 2 + 0.006)),
    new THREE.LineBasicMaterial({ color: 0xe9c9a0, transparent: true, opacity: 0.28 }),
  );
  seatBorder.position.y = MINI.seatY - seatThickness / 2;
  group.add(seatBorder);

  // Ceramic plate: continuous radial heightfield with a visible inner bowl/rim.
  const plateMesh = attach(group, polarSurface(MINI.plateRadius, 30, 96, plateHeight), ceramic);
  attach(group, new THREE.CylinderGeometry(MINI.plateRadius - 0.07,
    MINI.plateRadius - 0.14, 0.042, 96),
  ceramic, 0, MINI.seatY + 0.012, 0);

  // Red apple intersects the flat plate center at its equator. The upper
  // ellipsoid is a walkable patch; lower half is hidden by the plate surface.
  const [ax, ay, az] = appleCenter();
  const apple = attach(group, new THREE.SphereGeometry(1, 48, 30),
    red, ax, ay, az);
  apple.scale.set(MINI.appleRadius, MINI.appleHeight, MINI.appleRadius);
  attach(group, new THREE.CylinderGeometry(0.023, 0.029, 0.18, 8),
    stem, ax, ay + MINI.appleHeight + 0.068, az);
  const leafMesh = attach(group, new THREE.SphereGeometry(1, 14, 10),
    leaf, ax + 0.09, ay + MINI.appleHeight + 0.10, az);
  leafMesh.scale.set(0.12, 0.024, 0.066);
  leafMesh.rotation.z = 0.32;

  // Spoon is a thin metal heightfield on the dish, with a depressed bowl and
  // clearly widened handle to make its miniature path easy to test.
  attach(group, spoonBowlGeometry(), silver);
  attach(group, spoonHandleGeometry(), silver);

  // Leg and object test points, visible in the world-fixed monitors only.
  addMarker(group, LEGS[0][0] - MINI.legRadius, MINI.floorY + 0.035,
    LEGS[0][1], 0x63d2a4);
  addMarker(group, LEGS[0][0] - MINI.legRadius - 0.008, -0.75,
    LEGS[0][1], 0x63d2a4);
  addMarker(group, -1.1, MINI.seatY + 0.04, 0.56, 0xeac876);
  addMarker(group, 0.02, plateHeight(0.02, -0.72) + 0.05, -0.72, 0xeac876);
  addMarker(group, ax, ay + MINI.appleHeight + 0.055, az, 0xff7c6c);
  addMarker(group, 0.87, walkingHeight(0.87, MINI.spoonZ) + 0.04,
    MINI.spoonZ, 0x89cefa);

  const faded = [
    { m: wood, originalOpacity: 1 }, { m: ceramic, originalOpacity: 1 },
    { m: red, originalOpacity: 1 }, { m: silver, originalOpacity: 1 },
  ];
  let lastFade = null;
  return {
    updateVisibility(ant) {
      // Under the stool, its seat/props can hide the ant from both top-down
      // cameras. A temporary translucent presentation makes the test leg
      // observable; the physical surfaces remain solid.
      const shouldFade = ant.shape === 'miniature' &&
        (ant.surface === 'ground' || (ant.surface === 'leg' && ant.p[1] < -0.15));
      if (shouldFade === lastFade) return;
      lastFade = shouldFade;
      for (const { m } of faded) {
        m.transparent = shouldFade;
        m.opacity = shouldFade ? 0.3 : 1;
        m.depthWrite = !shouldFade;
        m.needsUpdate = true;
      }
    },
    clear() { lastFade = null; },
    seatMesh, plateMesh,
  };
}
