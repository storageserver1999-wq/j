import * as THREE from 'three';

export interface ShapeDefinition {
  createBaseGeometry: () => THREE.BufferGeometry;
  groundOffset: number;
  minimumTriangles: number;
  projectToSurface: (point: THREE.Vector3) => THREE.Vector3;
}

export function computeGeometryNormals(geometry: THREE.BufferGeometry, smooth = true) {
  if (!smooth) {
    geometry.computeVertexNormals();
    return;
  }

  const positions = geometry.getAttribute('position');
  if (!(positions instanceof THREE.BufferAttribute) || geometry.index) {
    throw new Error('Smooth shading requires non-indexed editable geometry.');
  }

  const vertexIndices = new Map<string, number>();
  const uniquePositions: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const key = `${x},${y},${z}`;
    let vertexIndex = vertexIndices.get(key);
    if (vertexIndex === undefined) {
      vertexIndex = uniquePositions.length / 3;
      vertexIndices.set(key, vertexIndex);
      uniquePositions.push(x, y, z);
    }
    indices.push(vertexIndex);
  }

  const weldedGeometry = new THREE.BufferGeometry();
  weldedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(uniquePositions, 3));
  weldedGeometry.setIndex(indices);
  weldedGeometry.computeVertexNormals();
  const weldedNormals = weldedGeometry.getAttribute('normal');
  let normals = geometry.getAttribute('normal');
  if (!(normals instanceof THREE.BufferAttribute) || normals.count !== positions.count) {
    normals = new THREE.BufferAttribute(new Float32Array(positions.count * 3), 3);
    geometry.setAttribute('normal', normals);
  }
  for (let index = 0; index < positions.count; index++) {
    const weldedIndex = indices[index];
    normals.setXYZ(
      index,
      weldedNormals.getX(weldedIndex),
      weldedNormals.getY(weldedIndex),
      weldedNormals.getZ(weldedIndex),
    );
  }
  normals.needsUpdate = true;
  weldedGeometry.dispose();
}

export const shapeDefinitions: Record<string, ShapeDefinition> = {
  Cube: {
    createBaseGeometry: () => new THREE.BoxGeometry(1, 1, 1),
    groundOffset: 0.5,
    minimumTriangles: 30,
    projectToSurface: (point) => point,
  },
  Sphere: {
    createBaseGeometry: () => new THREE.SphereGeometry(0.5, 32, 24),
    groundOffset: 0.5,
    minimumTriangles: 1472,
    projectToSurface: (point) => point.normalize().multiplyScalar(0.5),
  },
  Cylinder: {
    createBaseGeometry: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1),
    groundOffset: 0.5,
    minimumTriangles: 150,
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
    minimumTriangles: 150,
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
  Pill: {
    createBaseGeometry: () => new THREE.CapsuleGeometry(0.5, 1, 2, 6),
    groundOffset: 1,
    minimumTriangles: 140,
    projectToSurface: (point) => {
      const centerY = THREE.MathUtils.clamp(point.y, -0.5, 0.5);
      const offsetY = point.y - centerY;
      const length = Math.hypot(point.x, offsetY, point.z) || 1;
      return new THREE.Vector3(point.x * (0.5 / length), centerY + offsetY * (0.5 / length), point.z * (0.5 / length));
    },
  },
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
  return geometry;
}
