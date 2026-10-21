import * as THREE from 'three';

export type ObjectDisplayMode = 'wireframe' | 'faces';

interface DisplayModeOptions {
  objects: THREE.Mesh[];
  isDisplayable: (mesh: THREE.Mesh) => boolean;
  buttons: HTMLButtonElement[];
  showAllWireframeButton: HTMLButtonElement;
  showAllFacesButton: HTMLButtonElement;
  getSelectedObject: () => THREE.Mesh | null;
}

export function createDisplayModeController(options: DisplayModeOptions) {
  const objectDisplayModes = new WeakMap<THREE.Mesh, ObjectDisplayMode>();
  const displayOverlayByMesh = new WeakMap<THREE.Mesh, THREE.Group>();
  const originalMaterialVisibility = new WeakMap<THREE.Mesh, boolean[]>();

  function getMeshMaterials(mesh: THREE.Mesh): THREE.Material[] {
    return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  }

  function clearDisplayOverlay(mesh: THREE.Mesh) {
    const overlay = displayOverlayByMesh.get(mesh);
    if (!overlay) return;
    overlay.removeFromParent();
    overlay.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      getMeshMaterials(child).forEach((material) => material.dispose());
      if (child.userData.displayOverlayOwnsGeometry === true) child.geometry.dispose();
    });
    displayOverlayByMesh.delete(mesh);
  }

  function createOffsetWireframeGeometry(geometry: THREE.BufferGeometry) {
    const wireframeGeometry = geometry.clone();
    const positions = wireframeGeometry.getAttribute('position');
    const normals = wireframeGeometry.getAttribute('normal');
    if (!(positions instanceof THREE.BufferAttribute) || !(normals instanceof THREE.BufferAttribute)) {
      wireframeGeometry.dispose();
      throw new Error('Wireframe display requires editable geometry positions and normals.');
    }
    wireframeGeometry.computeBoundingBox();
    const offset = Math.max(
      (wireframeGeometry.boundingBox?.getSize(new THREE.Vector3()).length() ?? 0) * 0.002,
      1e-5,
    );
    const point = new THREE.Vector3();
    const normal = new THREE.Vector3();
    for (let index = 0; index < positions.count; index++) {
      point.fromBufferAttribute(positions, index);
      normal.fromBufferAttribute(normals, index);
      if (normal.lengthSq() > 0) point.addScaledVector(normal.normalize(), offset);
      positions.setXYZ(index, point.x, point.y, point.z);
    }
    positions.needsUpdate = true;
    wireframeGeometry.computeBoundingBox();
    wireframeGeometry.computeBoundingSphere();
    return wireframeGeometry;
  }

  function updateDisplayModeButtons() {
    const selectedObject = options.getSelectedObject();
    const selectedMode = selectedObject ? objectDisplayModes.get(selectedObject) : undefined;
    options.buttons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.displayMode === selectedMode));
    });
  }

  function setObjectDisplayMode(mesh: THREE.Mesh, mode: ObjectDisplayMode | null) {
    if (!options.isDisplayable(mesh)) return;
    clearDisplayOverlay(mesh);

    const materials = getMeshMaterials(mesh);
    const originalVisibility = originalMaterialVisibility.get(mesh) ?? materials.map((material) => material.visible);
    materials.forEach((material, index) => {
      material.visible = mode === 'wireframe' ? false : (originalVisibility[index] ?? true);
    });

    if (!mode) {
      objectDisplayModes.delete(mesh);
      originalMaterialVisibility.delete(mesh);
      updateDisplayModeButtons();
      return;
    }

    if (!originalMaterialVisibility.has(mesh)) originalMaterialVisibility.set(mesh, originalVisibility);
    objectDisplayModes.set(mesh, mode);
    const overlay = new THREE.Group();
    overlay.name = `Display overlay (${mode})`;
    if (mode === 'wireframe') {
      const depthOccluder = new THREE.Mesh(
        mesh.geometry,
        new THREE.MeshBasicMaterial({
          colorWrite: false,
          depthTest: true,
          depthWrite: true,
          side: THREE.FrontSide,
        }),
      );
      depthOccluder.renderOrder = 0;
      depthOccluder.frustumCulled = mesh.frustumCulled;
      overlay.add(depthOccluder);
    }
    const wireframe = new THREE.Mesh(
      createOffsetWireframeGeometry(mesh.geometry),
      new THREE.MeshBasicMaterial({
        color: '#ffd21a',
        wireframe: true,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    wireframe.userData.displayOverlayOwnsGeometry = true;
    wireframe.renderOrder = mode === 'wireframe' ? 2 : 1;
    wireframe.frustumCulled = mesh.frustumCulled;
    overlay.add(wireframe);
    mesh.add(overlay);
    displayOverlayByMesh.set(mesh, overlay);
    updateDisplayModeButtons();
  }

  function showAllObjectsDisplayMode(mode: ObjectDisplayMode) {
    const visibleMeshes = options.objects.filter(options.isDisplayable);
    const turnOff = visibleMeshes.length > 0 && visibleMeshes.every((mesh) => objectDisplayModes.get(mesh) === mode);
    visibleMeshes.forEach((mesh) => setObjectDisplayMode(mesh, turnOff ? null : mode));
    updateDisplayModeButtons();
  }

  function updateShowAllDisplayModeMenuLabels() {
    const visibleMeshes = options.objects.filter(options.isDisplayable);
    options.showAllWireframeButton.textContent = visibleMeshes.length > 0 &&
      visibleMeshes.every((mesh) => objectDisplayModes.get(mesh) === 'wireframe')
      ? 'Hide all objects in wireframe'
      : 'Show all objects in wireframe';
    options.showAllFacesButton.textContent = visibleMeshes.length > 0 &&
      visibleMeshes.every((mesh) => objectDisplayModes.get(mesh) === 'faces')
      ? 'Hide all object triangle outlines'
      : 'Show all object triangle outlines';
  }

  return {
    objectDisplayModes,
    getOriginalMaterialVisibility: (mesh: THREE.Mesh) => originalMaterialVisibility.get(mesh),
    setObjectDisplayMode,
    showAllObjectsDisplayMode,
    updateShowAllDisplayModeMenuLabels,
    updateDisplayModeButtons,
  };
}
