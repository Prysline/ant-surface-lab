/**
 * Visible miniature props created from the SAME authored profile data as
 * src/miniature.js. No free-floating apple ellipsoid or filled plate cylinder.
 */
import * as THREE from 'three';
import {
  MINI, LEGS, SPOON, MINI_SCALE, PLATE_PROFILE, APPLE_PROFILE,
  PLATE_METRICS, APPLE_METRICS, platePoint, applePoint,
  plateHeight, walkingHeight, spoonBowlInfo, appleContact,
} from './miniatureGeometry.js';

const material = (color, roughness = 0.73, metalness = 0) =>
  new THREE.MeshStandardMaterial({
    color, roughness, metalness, side: THREE.DoubleSide,
  });

function attach(parent, geometry, surface, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, surface);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function parametricMesh(rings, slices, point, materialSide = true) {
  const positions = [], indices = [], width = slices + 1;
  for (let i = 0; i <= rings; i += 1) {
    const t = i / rings;
    for (let j = 0; j <= slices; j += 1) {
      const angle = Math.PI * 2 * j / slices;
      positions.push(...point(t, angle));
    }
  }
  for (let i = 0; i < rings; i += 1) {
    for (let j = 0; j < slices; j += 1) {
      const a = i * width + j, b = a + width;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createDish(group, ceramic, underside) {
  // Revolving this CLOSED cross section is a physical dish: raised foot ring
  // at r=0.43..0.55 is the ONLY region with y == stool seatY.
  const shell = parametricMesh(240, 120,
    (t, angle) => platePoint(t * PLATE_METRICS.length, angle), true);
  const plateMesh = attach(group, shell, ceramic);

  // Underside is subtly darker: physically separate material group only,
  // but the meshes use the same exact radial profile coordinates.
  const outerUnder = parametricMesh(110, 120,
    (t, angle) => platePoint(PLATE_METRICS.distances[9] +
      (PLATE_METRICS.distances[17] - PLATE_METRICS.distances[9]) * t, angle));
  const underMesh = attach(group, outerUnder, underside);
  underMesh.material.polygonOffset = true;
  underMesh.material.polygonOffsetFactor = -1;

  const ring = new THREE.TorusGeometry(1.22, 0.012, 6, 100);
  const rim = attach(group, ring, ceramic, 0,
    MINI.seatY + 0.212, 0);
  rim.rotation.x = Math.PI / 2;

  return { plateMesh, underMesh };
}

function createApple(group, skin, stemMaterial, leafMaterial) {
  // Single upper fruit skin above the dish. No hidden bottom hemisphere
  // entering the plate or wooden stool. Broad shoulders and top dimple.
  const geometry = parametricMesh(160, 104,
    (t, a) => applePoint(t * APPLE_METRICS.length, a));
  const appleMesh = attach(group, geometry, skin);

  const crown = applePoint(APPLE_METRICS.length, 0);
  const stem = attach(group,
    new THREE.CylinderGeometry(0.019, 0.031, 0.155, 10),
    stemMaterial, crown[0], crown[1] + 0.074, crown[2]);
  stem.rotation.z = 0.16;

  const leaf = attach(group, new THREE.SphereGeometry(1, 18, 10),
    leafMaterial, crown[0] + 0.10, crown[1] + 0.155, crown[2] - 0.015);
  leaf.scale.set(0.12, 0.026, 0.063);
  leaf.rotation.z = 0.32;
  leaf.rotation.y = -0.22;

  return appleMesh;
}

function spoonAxis() {
  const dx = SPOON.start[0] - SPOON.end[0];
  const dz = SPOON.start[1] - SPOON.end[1];
  const len = Math.hypot(dx, dz);
  return { forward: [dx / len, dz / len], side: [-dz / len, dx / len] };
}

function ellipsePoint(r, angle) {
  const { forward, side } = spoonAxis();
  const ux = r * SPOON.bowlLong * Math.cos(angle);
  const vz = r * SPOON.bowlWide * Math.sin(angle);
  const x = SPOON.bowl[0] + ux * forward[0] + vz * side[0];
  const z = SPOON.bowl[1] + ux * forward[1] + vz * side[1];
  return [x, z];
}

function createSpoon(group, silver, metalEdge) {
  // The interior is slightly depressed relative to the raised bowl rim.
  // Top, bottom and outer seam give the prop readable metal thickness.
  const top = parametricMesh(38, 80, (t, angle) => {
    const [x, z] = ellipsePoint(t, angle);
    return [x, walkingHeight(x, z) + 0.005, z];
  });
  attach(group, top, silver);

  const underside = parametricMesh(38, 80, (t, angle) => {
    const [x, z] = ellipsePoint(t, angle);
    return [x, walkingHeight(x, z) - 0.008, z];
  });
  attach(group, underside, metalEdge);

  const rimCurve = [];
  for (let i = 0; i <= 80; i += 1) {
    const [x, z] = ellipsePoint(0.94, 2 * Math.PI * i / 80);
    rimCurve.push(new THREE.Vector3(x, walkingHeight(x, z) + 0.01, z));
  }
  const edgeGeometry = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(rimCurve, true), 84, 0.009, 6, true);
  attach(group, edgeGeometry, silver);

  const steps = 64, widths = 10;
  const positions = [], undersidePositions = [], indices = [];
  const dx = SPOON.end[0] - SPOON.start[0];
  const dz = SPOON.end[1] - SPOON.start[1];
  const len = Math.hypot(dx, dz);
  const side = [-dz / len, dx / len];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const midX = SPOON.start[0] + dx * t;
    const midZ = SPOON.start[1] + dz * t;
    // Narrow throat with subtly widening end like a stamped metal spoon.
    const width = SPOON.halfWidth * (0.8 + 0.2 * Math.sin(Math.PI * t));
    for (let j = 0; j <= widths; j += 1) {
      const amount = (j / widths * 2 - 1) * width * 0.94;
      const x = midX + side[0] * amount;
      const z = midZ + side[1] * amount;
      const h = walkingHeight(x, z);
      positions.push(x, h + 0.006, z);
      undersidePositions.push(x, h - 0.008, z);
    }
  }
  const cols = widths + 1;
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < widths; j += 1) {
      const a = i * cols + j, b = a + cols;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const surface = new THREE.BufferGeometry();
  surface.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  surface.setIndex(indices);
  surface.computeVertexNormals();
  attach(group, surface, silver);

  const back = new THREE.BufferGeometry();
  back.setAttribute('position', new THREE.Float32BufferAttribute(undersidePositions, 3));
  back.setIndex(indices.map((v, i) => {
    const triangle = Math.floor(i / 3) * 3;
    return indices[triangle + (i % 3 === 1 ? 2 : i % 3 === 2 ? 1 : 0)];
  }));
  back.computeVertexNormals();
  attach(group, back, metalEdge);

  // A thin highlight line makes the raised handle visibly continuous.
  const centerline = [];
  for (let i = 0; i <= 36; i += 1) {
    const t = i / 36;
    const x = SPOON.start[0] + dx * t;
    const z = SPOON.start[1] + dz * t;
    centerline.push(new THREE.Vector3(x, walkingHeight(x, z) + 0.009, z));
  }
  attach(group, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(centerline),
    36, 0.006, 5, false),
  new THREE.MeshStandardMaterial({ color: 0xe7f0f0, metalness: 0.68, roughness: 0.2 }));
}

function addMarker(parent, point, color) {
  const mesh = attach(parent, new THREE.SphereGeometry(0.033, 9, 7),
    new THREE.MeshBasicMaterial({ color }), ...point);
  mesh.layers.set(1);
}

export function createMiniatureScene(group) {
  const wood = material(0xa17a58, 0.83);
  const darkWood = material(0x73503a, 0.86);
  const platform = material(0xaca391, 0.92);
  const ceramic = material(0xe7ece6, 0.39);
  const underside = material(0xc5ceca, 0.49);
  const red = material(0xc84f38, 0.57);
  const silver = material(0xd2dce0, 0.27, 0.60);
  const metalEdge = material(0x929da2, 0.34, 0.48);
  const stem = material(0x59402b, 0.90);
  const leaf = material(0x62875d, 0.76);

  attach(group, new THREE.BoxGeometry(8, 0.22, 7.4), platform,
    0, MINI.floorY - 0.11, 0);
  const platformBorder = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(8.02, 0.224, 7.42)),
    new THREE.LineBasicMaterial({
      color: 0xeee0c5, transparent: true, opacity: 0.34,
    }),
  );
  platformBorder.position.y = MINI.floorY - 0.11;
  group.add(platformBorder);

  const legHeight = MINI.seatY - MINI.floorY;
  for (const [x, z] of LEGS) {
    attach(group, new THREE.CylinderGeometry(MINI.legRadius,
      MINI.legRadius, legHeight, 24),
    wood, x, (MINI.seatY + MINI.floorY) / 2, z);
    attach(group, new THREE.CylinderGeometry(0.215, 0.215, 0.08, 24),
      darkWood, x, MINI.floorY + 0.04, z);
  }
  const thickness = 0.18;
  const seatMesh = attach(group,
    new THREE.BoxGeometry(MINI.seatHalf * 2, thickness, MINI.seatHalf * 2),
    wood, 0, MINI.seatY - thickness / 2, 0);
  const stoolEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(
      new THREE.BoxGeometry(MINI.seatHalf * 2 + 0.005,
        thickness + 0.005, MINI.seatHalf * 2 + 0.005)),
    new THREE.LineBasicMaterial({
      color: 0xeacba4, transparent: true, opacity: 0.27,
    }),
  );
  stoolEdges.position.y = MINI.seatY - thickness / 2;
  group.add(stoolEdges);

  const { plateMesh, underMesh } = createDish(group, ceramic, underside);
  const appleMesh = createApple(group, red, stem, leaf);
  createSpoon(group, silver, metalEdge);

  addMarker(group, [LEGS[0][0] - MINI.legRadius, MINI.floorY + 0.03,
    LEGS[0][1]], 0x63d2a4);
  addMarker(group, [LEGS[0][0] - MINI.legRadius - 0.004, -0.75,
    LEGS[0][1]], 0x63d2a4);
  addMarker(group, [-1.1, MINI.seatY + 0.055, 0.56], 0xeac876);
  addMarker(group, [0.15, plateHeight(0.15, -0.94) + 0.06, -0.94], 0xeac876);
  const appleTop = applePoint(APPLE_METRICS.length, 0);
  addMarker(group, [appleTop[0], appleTop[1] + 0.048, appleTop[2]], 0xff8878);
  const neck = SPOON.start;
  addMarker(group, [neck[0], walkingHeight(...neck) + 0.05, neck[1]], 0x89cefa);
  const touch = appleContact();
  addMarker(group, [touch[0], touch[1] + 0.025, touch[2]], 0x9de2fa);

  const faded = [wood, ceramic, underside, red, silver, metalEdge];
  let lastFade = null;
  return {
    updateVisibility(ant) {
      const shouldFade = ant.shape === 'miniature' &&
        (ant.surface === 'ground' ||
        (ant.surface === 'leg' && ant.p[1] < -0.15 * MINI_SCALE));
      if (shouldFade === lastFade) return;
      lastFade = shouldFade;
      for (const m of faded) {
        m.transparent = shouldFade;
        m.opacity = shouldFade ? 0.28 : 1;
        m.depthWrite = !shouldFade;
        m.needsUpdate = true;
      }
    },
    clear() { lastFade = null; },
    seatMesh, plateMesh, underMesh, appleMesh,
  };
}
