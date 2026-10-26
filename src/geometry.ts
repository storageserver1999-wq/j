import * as THREE from 'three';

export interface ShapeDefinition {
  createBaseGeometry: () => THREE.BufferGeometry;
  groundOffset: number;
  minimumTriangles: number;
  /** Triangle count used when the shape is first created. */
  defaultTriangles?: number;
  projectToSurface: (point: THREE.Vector3) => THREE.Vector3;
}

/**
 * Default crease angle, in degrees, used when a geometry does not declare one.
 * Faces whose normals meet at a wider angle than this are treated as a hard
 * edge instead of being averaged together.
 */
const DEFAULT_CREASE_ANGLE = 60;

/**
 * Rebuilds the vertex normals of an editable (non-indexed) geometry.
 *
 * `smooth` still means "average the faces that share a vertex", but averaging is
 * limited to faces that actually belong to the same surface. The old version
 * welded every coincident vertex and averaged all of its faces unconditionally,
 * so the six faces of a cube each received a corner normal pointing diagonally
 * out of the corner: a flat face then shaded as a rounded gradient, and shadow
 * normals pushed into the wrong direction, which read as a smear of shadow
 * across the box instead of a crisp silhouette.
 *
 * The crease angle comes from `geometry.userData.creaseAngle` (set per shape by
 * `createTriangleGeometry`), so a cube stays faceted, a cylinder keeps a smooth
 * barrel with hard rims, and spheres, pills and toruses stay fully smooth.
 * Normals are averaged with area weights, which keeps low-poly curved shapes
 * from developing bright and dark wedges.
 */
export function computeGeometryNormals(geometry: THREE.BufferGeometry, smooth = true) {
  const positions = geometry.getAttribute('position');
  if (!(positions instanceof THREE.BufferAttribute) || geometry.index) {
    throw new Error('Editable geometry must be non-indexed.');
  }

  const normals = new THREE.BufferAttribute(new Float32Array(positions.count * 3), 3);
  const first = new THREE.Vector3();
  const second = new THREE.Vector3();
  const third = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const faceCount = Math.floor(positions.count / 3);
  const faceNormals: THREE.Vector3[] = [];
  const faceAreas: number[] = [];

  const readTriangle = (face: number) => {
    const offset = face * 3;
    first.fromBufferAttribute(positions, offset);
    second.fromBufferAttribute(positions, offset + 1);
    third.fromBufferAttribute(positions, offset + 2);
    edgeA.subVectors(second, first);
    edgeB.subVectors(third, first);
  };

  for (let face = 0; face < faceCount; face++) {
    readTriangle(face);
    const normal = new THREE.Vector3().crossVectors(edgeA, edgeB);
    const length = normal.length();
    // Degenerate triangles carry no direction; point them up so they never
    // contribute a NaN to a neighbouring vertex.
    if (length > 1e-12) normal.divideScalar(length);
    else normal.set(0, 1, 0);
    faceNormals.push(normal);
    faceAreas.push(length * 0.5);
  }

  if (!smooth) {
    for (let face = 0; face < faceCount; face++) {
      const normal = faceNormals[face];
      for (let corner = 0; corner < 3; corner++) {
        normals.setXYZ(face * 3 + corner, normal.x, normal.y, normal.z);
      }
    }
    geometry.setAttribute('normal', normals);
    return;
  }

  // Group faces by the position they share. Quantise before hashing: duplicated
  // seam vertices (sphere poles and the u-wrap) differ only in the last float
  // bits, and an exact key would leave them split, producing a visible ridge.
  const facesByPosition = new Map<string, number[]>();
  const keyOf = (vector: THREE.Vector3) =>
    `${Math.round(vector.x * 1e4)},${Math.round(vector.y * 1e4)},${Math.round(vector.z * 1e4)}`;
  const point = new THREE.Vector3();
  const cornerKeys = new Array<string>(positions.count);
  for (let index = 0; index < positions.count; index++) {
    point.fromBufferAttribute(positions, index);
    const key = keyOf(point);
    cornerKeys[index] = key;
    const face = Math.floor(index / 3);
    const faces = facesByPosition.get(key);
    if (!faces) facesByPosition.set(key, [face]);
    else if (faces[faces.length - 1] !== face) faces.push(face);
  }

  const creaseAngle = THREE.MathUtils.degToRad(
    typeof geometry.userData.creaseAngle === 'number' ? geometry.userData.creaseAngle : DEFAULT_CREASE_ANGLE,
  );
  // A tiny epsilon keeps coplanar triangles welded even when the crease angle is
  // zero (a cube), where the dot product of two identical normals lands just
  // below 1 after normalisation.
  const creaseCosine = Math.cos(creaseAngle) - 1e-4;
  const accumulated = new THREE.Vector3();

  for (let face = 0; face < faceCount; face++) {
    const faceNormal = faceNormals[face];
    for (let corner = 0; corner < 3; corner++) {
      const index = face * 3 + corner;
      const faces = facesByPosition.get(cornerKeys[index]);
      accumulated.set(0, 0, 0);
      if (faces) {
        for (const neighbour of faces) {
          if (faceNormals[neighbour].dot(faceNormal) < creaseCosine) continue;
          accumulated.addScaledVector(faceNormals[neighbour], faceAreas[neighbour] || 1e-6);
        }
      }
      if (accumulated.lengthSq() < 1e-20) accumulated.copy(faceNormal);
      accumulated.normalize();
      normals.setXYZ(index, accumulated.x, accumulated.y, accumulated.z);
    }
  }

  geometry.setAttribute('normal', normals);
}

/**
 * Adds a texture coordinate set to generated geometry.
 *
 * Editable geometry is built from scratch, so nothing carries UVs and a texture
 * would sample a single texel (a flat colour). Cubes get a box projection, one
 * full copy of the image per face. Every other shape gets a spherical
 * projection, which stays continuous across a curved surface instead of
 * breaking at triplanar seams.
 */
export function computeTextureCoordinates(geometry: THREE.BufferGeometry, shape: string): void {
  const positions = geometry.getAttribute('position');
  if (!(positions instanceof THREE.BufferAttribute)) return;
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) return;
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const safe = (value: number) => (Math.abs(value) < 1e-6 ? 1e-6 : value);
  const uvs = new Float32Array(positions.count * 2);
  const point = new THREE.Vector3();
  const first = new THREE.Vector3();
  const second = new THREE.Vector3();
  const third = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const triangleNormal = new THREE.Vector3();
  const boxProjected = shape === 'Cube';
  // An image block is a picture, not a surface: one copy of the image spans the
  // whole plane and is never tiled or wrapped around it.
  const planar = shape === 'ImageBlock';

  const writeBoxUV = (index: number, axis: 'x' | 'y' | 'z') => {
    const offset = index * 2;
    if (axis === 'x') {
      uvs[offset] = (point.z - center.z) / safe(size.z) + 0.5;
      uvs[offset + 1] = (point.y - center.y) / safe(size.y) + 0.5;
    } else if (axis === 'y') {
      uvs[offset] = (point.x - center.x) / safe(size.x) + 0.5;
      uvs[offset + 1] = (point.z - center.z) / safe(size.z) + 0.5;
    } else {
      uvs[offset] = (point.x - center.x) / safe(size.x) + 0.5;
      uvs[offset + 1] = (point.y - center.y) / safe(size.y) + 0.5;
    }
  };

  const writeSphericalUV = (index: number) => {
    const offset = index * 2;
    const direction = point.clone().sub(center);
    const length = direction.length() || 1;
    uvs[offset] = 0.5 + Math.atan2(direction.z, direction.x) / (Math.PI * 2);
    uvs[offset + 1] = 0.5 + Math.asin(THREE.MathUtils.clamp(direction.y / length, -1, 1)) / Math.PI;
  };

  for (let index = 0; index < positions.count; index += 3) {
    if (planar) {
      for (let vertex = 0; vertex < 3; vertex++) {
        point.fromBufferAttribute(positions, index + vertex);
        const offset = (index + vertex) * 2;
        uvs[offset] = (point.x - center.x) / safe(size.x) + 0.5;
        uvs[offset + 1] = (point.y - center.y) / safe(size.y) + 0.5;
      }
    } else if (boxProjected) {
      first.fromBufferAttribute(positions, index);
      second.fromBufferAttribute(positions, index + 1);
      third.fromBufferAttribute(positions, index + 2);
      edgeA.subVectors(second, first);
      edgeB.subVectors(third, first);
      triangleNormal.crossVectors(edgeA, edgeB);
      const lengthX = Math.abs(triangleNormal.x);
      const lengthY = Math.abs(triangleNormal.y);
      const lengthZ = Math.abs(triangleNormal.z);
      const axis = lengthX >= lengthY && lengthX >= lengthZ ? 'x' : lengthY >= lengthZ ? 'y' : 'z';
      for (let vertex = 0; vertex < 3; vertex++) {
        point.fromBufferAttribute(positions, index + vertex);
        writeBoxUV(index + vertex, axis);
      }
    } else {
      for (let vertex = 0; vertex < 3; vertex++) {
        point.fromBufferAttribute(positions, index + vertex);
        writeSphericalUV(index + vertex);
      }
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

export const shapeDefinitions: Record<string, ShapeDefinition> = {
  Cube: {
    createBaseGeometry: () => new THREE.BoxGeometry(1, 1, 1),
    groundOffset: 0.5,
    minimumTriangles: 30,
    projectToSurface: (point) => point,
  },
  Sphere: {
    // The low-resolution base is the real floor for the topology control; the
    // editor subdivides up from it, so smooth shapes are not locked to a high
    // triangle minimum.
    createBaseGeometry: () => new THREE.SphereGeometry(0.5, 8, 6),
    groundOffset: 0.5,
    minimumTriangles: 80,
    defaultTriangles: 1472,
    projectToSurface: (point) => point.normalize().multiplyScalar(0.5),
  },
  Cylinder: {
    createBaseGeometry: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1),
    groundOffset: 0.5,
    minimumTriangles: 32,
    defaultTriangles: 150,
    projectToSurface: (point) => {
      if (Math.abs(point.y) > 0.49) {
        point.y = Math.sign(point.y) * 0.5;
        const radius = Math.hypot(point.x, point.z);
        if (radius > 0) {
          point.x *= 0.5 / radius;
          point.z *= 0.5 / radius;
        }
      } else {
        point.y = THREE.MathUtils.clamp(point.y, -0.5, 0.5);
        const radius = Math.hypot(point.x, point.z);
        if (radius > 0) {
          point.x *= 0.5 / radius;
          point.z *= 0.5 / radius;
        }
      }
      return point;
    },
  },
  Cone: {
    createBaseGeometry: () => new THREE.ConeGeometry(0.5, 1, 8, 1),
    groundOffset: 0.5,
    minimumTriangles: 30,
    projectToSurface: (point) => {
      point.y = THREE.MathUtils.clamp(point.y, -0.5, 0.5);
      const radius = 0.5 * (0.5 - point.y);
      const currentRadius = Math.hypot(point.x, point.z);
      if (currentRadius > 0) {
        point.x *= radius / currentRadius;
        point.z *= radius / currentRadius;
      }
      return point;
    },
  },
  Torus: {
    createBaseGeometry: () => new THREE.TorusGeometry(0.38, 0.12, 4, 8),
    groundOffset: 0.12,
    minimumTriangles: 64,
    defaultTriangles: 150,
    projectToSurface: (point) => {
      const radial = Math.hypot(point.x, point.y) || 1;
      const centerX = point.x * (0.38 / radial);
      const centerY = point.y * (0.38 / radial);
      const offsetX = point.x - centerX;
      const offsetY = point.y - centerY;
      const offsetZ = point.z;
      const offsetLength = Math.hypot(offsetX, offsetY, offsetZ) || 1;
      return new THREE.Vector3(
        centerX + offsetX * (0.12 / offsetLength),
        centerY + offsetY * (0.12 / offsetLength),
        offsetZ * (0.12 / offsetLength),
      );
    },
  },
  ImageBlock: {
    // A flat, picture-shaped plane. It is the only shape whose texture is not
    // tiled: an image block shows exactly one copy of its picture.
    createBaseGeometry: () => new THREE.PlaneGeometry(16 / 9, 1),
    groundOffset: 0.5,
    minimumTriangles: 2,
    defaultTriangles: 2,
    projectToSurface: (point) => point,
  },
  Pill: {
    createBaseGeometry: () => new THREE.CapsuleGeometry(0.5, 1, 2, 6),
    groundOffset: 1,
    minimumTriangles: 60,
    defaultTriangles: 140,
    projectToSurface: (point) => {
      const centerY = THREE.MathUtils.clamp(point.y, -0.5, 0.5);
      const offsetY = point.y - centerY;
      const length = Math.hypot(point.x, offsetY, point.z) || 1;
      return new THREE.Vector3(point.x * (0.5 / length), centerY + offsetY * (0.5 / length), point.z * (0.5 / length));
    },
  },
};

/**
 * Imported models keep the geometry that came out of their file.
 *
 * The definition exists only so shared code that looks a shape up by name keeps
 * working; the Model section is hidden for these objects, so nothing here ever
 * rebuilds or reshapes the mesh.
 */
shapeDefinitions['Imported Model'] = {
  createBaseGeometry: () => new THREE.BufferGeometry(),
  groundOffset: 0,
  minimumTriangles: 0,
  projectToSurface: (point) => point,
};

/**
 * How far shading may bend across an edge before the edge is treated as hard.
 * A cube must never average its faces (0°), a cylinder barrel must stay round
 * while its rims stay crisp (60°), and the organic shapes smooth completely.
 */
const SHAPE_CREASE_ANGLES: Record<string, number> = {
  Cube: 0,
  ImageBlock: 0,
  Cylinder: 60,
  Cone: 60,
  Sphere: 180,
  Pill: 180,
  Torus: 180,
};

interface Triangle {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
}

interface TriangleCandidate {
  triangle: Triangle;
  edge: [keyof Triangle, keyof Triangle];
  length: number;
  index: number;
}

export function createTriangleGeometry(
  shape: string,
  targetCount: number,
  customBaseGeometry?: THREE.BufferGeometry,
): THREE.BufferGeometry {
  const definition = shapeDefinitions[shape];
  const customSource = customBaseGeometry ?? definition.createBaseGeometry();
  const sourceGeometry = customSource.index ? customSource.toNonIndexed() : customSource.clone();
  const sourcePositions = sourceGeometry.getAttribute('position');
  const sourcePoints: THREE.Vector3[] = [];
  const triangles: Triangle[] = [];
  for (let index = 0; index < sourcePositions.count; index += 3) {
    const a = new THREE.Vector3(sourcePositions.getX(index), sourcePositions.getY(index), sourcePositions.getZ(index));
    const b = new THREE.Vector3(sourcePositions.getX(index + 1), sourcePositions.getY(index + 1), sourcePositions.getZ(index + 1));
    const c = new THREE.Vector3(sourcePositions.getX(index + 2), sourcePositions.getY(index + 2), sourcePositions.getZ(index + 2));
    triangles.push({ a, b, c });
    sourcePoints.push(a, b, c);
  }
  const sourceBounds = new THREE.Box3().setFromPoints(sourcePoints);
  sourceGeometry.dispose();

  const heap: TriangleCandidate[] = [];
  const pushCandidate = (triangle: Triangle, triangleIndex: number) => {
    const edges: Array<[keyof Triangle, keyof Triangle]> = [['a', 'b'], ['b', 'c'], ['c', 'a']];
    let edge = edges[0];
    let length = triangle[edge[0]].distanceToSquared(triangle[edge[1]]);
    for (const candidateEdge of edges.slice(1)) {
      const candidateLength = triangle[candidateEdge[0]].distanceToSquared(triangle[candidateEdge[1]]);
      if (candidateLength > length) {
        edge = candidateEdge;
        length = candidateLength;
      }
    }
    const candidate = { triangle, edge, length, index: triangleIndex };
    heap.push(candidate);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (heap[parent].length >= candidate.length) break;
      heap[index] = heap[parent];
      index = parent;
    }
    heap[index] = candidate;
  };
  const popCandidate = (): TriangleCandidate => {
    const first = heap[0];
    const last = heap.pop();
    if (!last) throw new Error('Triangle refinement queue became empty.');
    if (heap.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= heap.length) break;
        const child = right < heap.length && heap[right].length > heap[left].length ? right : left;
        if (heap[child].length <= last.length) break;
        heap[index] = heap[child];
        index = child;
      }
      heap[index] = last;
    }
    return first;
  };
  triangles.forEach((triangle, index) => pushCandidate(triangle, index));

  while (triangles.length < targetCount) {
    const { index: splitIndex, edge: splitEdge } = popCandidate();
    const triangle = triangles[splitIndex];
    const [startKey, endKey] = splitEdge;
    const thirdKey = (['a', 'b', 'c'] as const).find((key) => key !== startKey && key !== endKey)!;
    const midpoint = triangle[startKey].clone().add(triangle[endKey]).multiplyScalar(0.5);
    const projectedMidpoint = customBaseGeometry ? midpoint : definition.projectToSurface(midpoint);
    const first: Triangle = { a: triangle.a.clone(), b: triangle.b.clone(), c: triangle.c.clone() };
    const second: Triangle = { a: triangle.a.clone(), b: triangle.b.clone(), c: triangle.c.clone() };
    first[startKey] = projectedMidpoint.clone();
    second[endKey] = projectedMidpoint.clone();
    first[thirdKey] = triangle[thirdKey].clone();
    second[thirdKey] = triangle[thirdKey].clone();
    triangles[splitIndex] = first;
    triangles.push(second);
    pushCandidate(first, splitIndex);
    pushCandidate(second, triangles.length - 1);
  }

  const vertices = new Float32Array(triangles.length * 9);
  const point = new THREE.Vector3();
  triangles.forEach((triangle, index) => {
    [triangle.a, triangle.b, triangle.c].forEach((vertex, vertexIndex) => {
      point.copy(vertex);
      const offset = (index * 3 + vertexIndex) * 3;
      vertices[offset] = point.x;
      vertices[offset + 1] = point.y;
      vertices[offset + 2] = point.z;
    });
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.userData.creaseAngle = SHAPE_CREASE_ANGLES[shape] ?? DEFAULT_CREASE_ANGLE;
  computeGeometryNormals(geometry);
  geometry.computeBoundingBox();

  const resultBounds = geometry.boundingBox!;
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const resultSize = resultBounds.getSize(new THREE.Vector3());
  const sourceCenter = sourceBounds.getCenter(new THREE.Vector3());
  const resultCenter = resultBounds.getCenter(new THREE.Vector3());
  const scale = new THREE.Vector3(
    sourceSize.x / (resultSize.x || 1),
    sourceSize.y / (resultSize.y || 1),
    sourceSize.z / (resultSize.z || 1),
  );
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index++) {
    point.fromBufferAttribute(positions, index).sub(resultCenter).multiply(scale).add(sourceCenter);
    positions.setXYZ(index, point.x, point.y, point.z);
  }
  positions.needsUpdate = true;
  computeGeometryNormals(geometry);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  computeTextureCoordinates(geometry, shape);
  return geometry;
}
