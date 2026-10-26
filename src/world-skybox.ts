import * as THREE from 'three';

export type WorldSkyboxShape = 'cube' | 'sphere';

const worldSkyboxes = new WeakSet<THREE.Mesh>();
const skyboxShapes = new WeakMap<THREE.Mesh, WorldSkyboxShape>();
const skyboxDimensions = new WeakMap<THREE.Mesh, { width: number; height: number; depth: number }>();
const skyboxColorsBeforeImages = new WeakMap<THREE.MeshBasicMaterial, THREE.Color>();
const faceNames = ['Right (+X)', 'Left (-X)', 'Top (+Y)', 'Bottom (-Y)', 'Front (+Z)', 'Back (-Z)'];
const acceptedImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);

function isSkyboxMaterial(material: THREE.Material): material is THREE.MeshBasicMaterial {
  return material instanceof THREE.MeshBasicMaterial;
}

export function isWorldSkybox(mesh: THREE.Mesh): boolean {
  return worldSkyboxes.has(mesh);
}

export function clearWorldSkybox(mesh: THREE.Mesh): void {
  worldSkyboxes.delete(mesh);
  skyboxShapes.delete(mesh);
  skyboxDimensions.delete(mesh);
}

function makeSkyboxMaterial(color = '#000000'): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    // Atmosphere fog shapes the scene, not the sky itself; fogging a skybox
    // that sits tens of thousands of units away would simply replace it with
    // a flat fog colour.
    fog: false,
  });
}

function disposeSkyboxMaterials(material: THREE.Material | THREE.Material[]) {
  const materials = Array.isArray(material) ? material : [material];
  const textures = new Set<THREE.Texture>();
  for (const item of materials) {
    if (item instanceof THREE.MeshBasicMaterial && item.map) textures.add(item.map);
    item.dispose();
  }
  textures.forEach((texture) => texture.dispose());
}

function setSkyboxShape(mesh: THREE.Mesh, shape: WorldSkyboxShape) {
  const previousShape = skyboxShapes.get(mesh);
  if (!previousShape) throw new Error(`Skybox shape for "${mesh.name}" is missing.`);
  if (shape === previousShape) return;

  const dimensions = skyboxDimensions.get(mesh);
  if (!dimensions) throw new Error(`Skybox dimensions for "${mesh.name}" are missing.`);
  const previousMaterials = mesh.material;
  const materials = shape === 'cube'
    ? Array.from({ length: 6 }, () => makeSkyboxMaterial())
    : makeSkyboxMaterial();
  const geometry = shape === 'cube'
    ? new THREE.BoxGeometry(dimensions.width, dimensions.height, dimensions.depth)
    : new THREE.SphereGeometry(Math.min(dimensions.width, dimensions.height, dimensions.depth) / 2, 64, 48);
  mesh.geometry.dispose();
  disposeSkyboxMaterials(previousMaterials);
  mesh.geometry = geometry;
  mesh.material = materials;
  skyboxShapes.set(mesh, shape);
}

export function createWorldSkybox(onAddHierarchyRow: (mesh: THREE.Mesh) => void, onSelect: (mesh: THREE.Mesh) => void): THREE.Mesh {
  const dimensions = { width: 40000, height: 40000, depth: 40000 };
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(dimensions.width, dimensions.height, dimensions.depth),
    Array.from({ length: 6 }, () => makeSkyboxMaterial()),
  );
  mesh.name = 'World Skybox';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = -1;
  worldSkyboxes.add(mesh);
  skyboxShapes.set(mesh, 'cube');
  skyboxDimensions.set(mesh, dimensions);
  onAddHierarchyRow(mesh);
  onSelect(mesh);
  return mesh;
}

async function makeTexture(file: File): Promise<THREE.CanvasTexture> {
  if (!acceptedImageTypes.has(file.type)) {
    throw new Error('Choose a PNG, JPEG, WebP, or AVIF image.');
  }
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the skybox image.');
    context.drawImage(bitmap, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.mapping = THREE.UVMapping;
    return texture;
  } finally {
    bitmap.close();
  }
}

function getPreviewUrl(texture: THREE.Texture): string | null {
  const image = texture.image;
  if (!(image instanceof HTMLCanvasElement)) return null;
  return image.toDataURL();
}

export function createWorldSkyboxProperties(
  mesh: THREE.Mesh,
  onNameChange: (name: string) => void,
  reportError: (message: string) => void,
): HTMLDivElement {
  if (!worldSkyboxes.has(mesh)) throw new Error(`Skybox settings for "${mesh.name}" are missing.`);
  const form = document.createElement('div');
  form.className = 'properties-form skybox-properties';
  const nameLabel = document.createElement('label');
  nameLabel.className = 'property-field';
  nameLabel.textContent = 'Name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = mesh.name;
  nameInput.setAttribute('aria-label', 'Skybox name');
  nameInput.addEventListener('input', () => onNameChange(nameInput.value));
  nameLabel.appendChild(nameInput);
  form.appendChild(nameLabel);

  const shapeLabel = document.createElement('label');
  shapeLabel.className = 'property-field';
  shapeLabel.textContent = 'Shape';
  const shapeSelect = document.createElement('select');
  shapeSelect.setAttribute('aria-label', 'Skybox shape');
  [
    { value: 'cube', label: 'Cube' },
    { value: 'sphere', label: 'Sphere' },
  ].forEach(({ value, label }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    shapeSelect.appendChild(option);
  });
  const shape = skyboxShapes.get(mesh);
  if (!shape) throw new Error(`Skybox shape for "${mesh.name}" is missing.`);
  shapeSelect.value = shape;
  shapeLabel.appendChild(shapeSelect);
  form.appendChild(shapeLabel);

  const dimensions = skyboxDimensions.get(mesh);
  if (!dimensions) throw new Error(`Skybox dimensions for "${mesh.name}" are missing.`);
  const dimensionsPanel = document.createElement('div');
  dimensionsPanel.className = 'skybox-dimensions';
  const dimensionFields = new Map<'width' | 'height' | 'depth', HTMLInputElement>();
  ([
    ['width', 'Width'],
    ['height', 'Height'],
    ['depth', 'Depth'],
  ] as const).forEach(([key, labelText]) => {
    const label = document.createElement('label');
    label.className = 'property-field';
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.max = '100000';
    input.step = '100';
    input.value = String(dimensions[key]);
    input.setAttribute('aria-label', `Skybox ${labelText.toLowerCase()}`);
    dimensionFields.set(key, input);
    label.appendChild(input);
    dimensionsPanel.appendChild(label);
  });
  const updateDimensions = () => {
    const next = {
      width: Math.max(1, Math.min(100000, Number(dimensionFields.get('width')!.value) || 1)),
      height: Math.max(1, Math.min(100000, Number(dimensionFields.get('height')!.value) || 1)),
      depth: Math.max(1, Math.min(100000, Number(dimensionFields.get('depth')!.value) || 1)),
    };
    skyboxDimensions.set(mesh, next);
    const currentShape = skyboxShapes.get(mesh);
    if (currentShape === 'cube') {
      mesh.geometry.dispose();
      mesh.geometry = new THREE.BoxGeometry(next.width, next.height, next.depth);
    } else {
      mesh.geometry.dispose();
      mesh.geometry = new THREE.SphereGeometry(Math.min(next.width, next.height, next.depth) / 2, 64, 48);
    }
  };
  dimensionFields.forEach((input) => input.addEventListener('change', updateDimensions));
  form.appendChild(dimensionsPanel);

  const imageSettings = document.createElement('div');
  imageSettings.className = 'skybox-image-settings';
  form.appendChild(imageSettings);
  const updateMaterialPreview = (
    section: HTMLElement,
    material: THREE.MeshBasicMaterial,
    imageInput: HTMLInputElement,
    removeButton: HTMLButtonElement,
    colorLabel: HTMLLabelElement,
    colorInput: HTMLInputElement,
    preview: HTMLImageElement,
  ) => {
    const hasImage = material.map !== null;
    colorLabel.hidden = hasImage;
    preview.hidden = !hasImage;
    preview.src = hasImage ? getPreviewUrl(material.map!) ?? '' : '';
    removeButton.hidden = !hasImage;
    section.classList.toggle('has-image', hasImage);
    if (!hasImage) colorInput.value = `#${material.color.getHexString()}`;
    if (!hasImage) imageInput.value = '';
  };
  const addImageControls = (
    section: HTMLElement,
    material: THREE.MeshBasicMaterial,
    label: string,
    showColor: boolean,
  ) => {
    const preview = document.createElement('img');
    preview.className = 'skybox-image-preview';
    preview.alt = `${label} preview`;
    preview.hidden = true;
    const colorLabel = document.createElement('label');
    colorLabel.className = 'property-field skybox-face-color';
    colorLabel.textContent = 'Color';
    colorLabel.hidden = !showColor || Boolean(material.map);
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = `#${material.color.getHexString()}`;
    colorInput.setAttribute('aria-label', `${label} skybox color`);
    colorInput.addEventListener('input', () => material.color.set(colorInput.value));
    colorLabel.appendChild(colorInput);

    const imageLabel = document.createElement('label');
    imageLabel.className = 'property-field skybox-image-field';
    imageLabel.textContent = 'Image';
    const imageInput = document.createElement('input');
    imageInput.type = 'file';
    imageInput.accept = 'image/png,image/jpeg,image/webp,image/avif';
    imageInput.setAttribute('aria-label', `Choose ${label} skybox image`);
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'skybox-remove-image';
    removeButton.textContent = 'Remove image';
    removeButton.hidden = !material.map;
    removeButton.addEventListener('click', () => {
      material.map?.dispose();
      material.map = null;
      const originalColor = skyboxColorsBeforeImages.get(material);
      if (originalColor) {
        material.color.copy(originalColor);
        skyboxColorsBeforeImages.delete(material);
      }
      material.needsUpdate = true;
      updateMaterialPreview(section, material, imageInput, removeButton, colorLabel, colorInput, preview);
    });
    imageInput.addEventListener('change', async () => {
      const file = imageInput.files?.[0];
      if (!file) return;
      let texture: THREE.CanvasTexture | null = null;
      try {
        texture = await makeTexture(file);
        material.map?.dispose();
        material.map = texture;
        if (!skyboxColorsBeforeImages.has(material)) {
          skyboxColorsBeforeImages.set(material, material.color.clone());
        }
        material.color.set('#ffffff');
        colorInput.value = '#ffffff';
        material.needsUpdate = true;
        updateMaterialPreview(section, material, imageInput, removeButton, colorLabel, colorInput, preview);
      } catch (error) {
        texture?.dispose();
        const message = error instanceof Error ? error.message : String(error);
        reportError(`Could not load the ${label} skybox image: ${message}`);
        imageInput.value = '';
      }
    });
    imageLabel.appendChild(imageInput);
    const controls = document.createElement('div');
    controls.className = 'skybox-face-controls';
    controls.append(imageLabel, removeButton);
    section.append(preview, colorLabel, controls);
    updateMaterialPreview(section, material, imageInput, removeButton, colorLabel, colorInput, preview);
    return { preview, colorInput, imageInput, removeButton, colorLabel };
  };

  const renderImageSettings = () => {
    imageSettings.replaceChildren();
    const currentShape = skyboxShapes.get(mesh);
    if (!currentShape) throw new Error(`Skybox shape for "${mesh.name}" is missing.`);
    if (currentShape === 'sphere') {
      if (!(mesh.material instanceof THREE.MeshBasicMaterial)) {
        throw new Error(`The sphere skybox material for "${mesh.name}" is invalid.`);
      }
      const section = document.createElement('section');
      section.className = 'skybox-face-section skybox-sphere-image';
      const heading = document.createElement('strong');
      heading.textContent = 'Sphere image';
      section.appendChild(heading);
      addImageControls(section, mesh.material, 'Sphere', true);
      imageSettings.appendChild(section);
      return;
    }
    const faceMaterials = mesh.material;
    if (!Array.isArray(faceMaterials) || faceMaterials.length !== 6 ||
      !faceMaterials.every(isSkyboxMaterial)) {
      throw new Error(`The six-face material set for "${mesh.name}" is invalid.`);
    }
    const atlasSection = document.createElement('section');
    atlasSection.className = 'skybox-atlas-section';
    const atlasHeading = document.createElement('strong');
    atlasHeading.textContent = 'Import 4×3 cross image';
    const atlasDescription = document.createElement('div');
    atlasDescription.className = 'point-geometry-status';
    atlasDescription.textContent = 'Split a cubemap cross into its six sides.';
    const atlasLayoutLabel = document.createElement('label');
    atlasLayoutLabel.className = 'property-field';
    atlasLayoutLabel.textContent = 'Layout';
    const atlasLayout = document.createElement('select');
    atlasLayout.setAttribute('aria-label', 'Skybox cross layout');
    [
      { value: 'shown', label: 'Reference: +Y top, −Y bottom' },
      { value: 'standard', label: 'Standard cubemap cross' },
    ].forEach(({ value, label }) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      atlasLayout.appendChild(option);
    });
    const atlasInput = document.createElement('input');
    atlasInput.type = 'file';
    atlasInput.accept = 'image/png,image/jpeg,image/webp,image/avif';
    atlasInput.setAttribute('aria-label', 'Choose skybox cross image');
    const atlasFileLabel = document.createElement('label');
    atlasFileLabel.className = 'property-field skybox-atlas-file';
    atlasFileLabel.textContent = 'Image';
    atlasFileLabel.appendChild(atlasInput);
    const atlasStatus = document.createElement('div');
    atlasStatus.className = 'point-geometry-status';
    atlasStatus.setAttribute('role', 'status');
    atlasInput.addEventListener('change', async () => {
      const file = atlasInput.files?.[0];
      if (!file) return;
      let bitmap: ImageBitmap | null = null;
      const textures: THREE.CanvasTexture[] = [];
      try {
        if (!acceptedImageTypes.has(file.type)) {
          throw new Error('Choose a PNG, JPEG, WebP, or AVIF cross image.');
        }
        bitmap = await createImageBitmap(file);
        const cellWidth = bitmap.width / 4;
        const cellHeight = bitmap.height / 3;
        if (bitmap.width % 4 !== 0 || bitmap.height % 3 !== 0 ||
          Math.abs(cellWidth - cellHeight) / Math.max(cellWidth, cellHeight) > 0.02) {
          throw new Error('The cross image must be a 4×3 grid with square face cells.');
        }
        const faceCells = atlasLayout.value === 'shown'
          ? [[1, 1], [3, 1], [0, 1], [2, 1], [2, 0], [2, 2]]
          : [[2, 1], [0, 1], [1, 0], [1, 2], [1, 1], [3, 1]];
        const faceSize = Math.floor(Math.min(cellWidth, cellHeight));
        for (const [column, row] of faceCells) {
          const canvas = document.createElement('canvas');
          canvas.width = faceSize;
          canvas.height = faceSize;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Could not prepare the skybox cross image.');
          const insetX = (cellWidth - faceSize) / 2;
          const insetY = (cellHeight - faceSize) / 2;
          context.drawImage(
            bitmap,
            column * cellWidth + insetX,
            row * cellHeight + insetY,
            faceSize,
            faceSize,
            0,
            0,
            faceSize,
            faceSize,
          );
          const texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.mapping = THREE.UVMapping;
          textures.push(texture);
        }
        faceMaterials.forEach((material, index) => {
          material.map?.dispose();
          if (!skyboxColorsBeforeImages.has(material)) {
            skyboxColorsBeforeImages.set(material, material.color.clone());
          }
          material.map = textures[index];
          material.color.set('#ffffff');
          material.needsUpdate = true;
        });
        renderImageSettings();
        const status = imageSettings.querySelector<HTMLElement>('.skybox-atlas-section [role="status"]');
        if (!status) throw new Error('The skybox cross-image status control is unavailable.');
        status.textContent = `Imported six faces from ${file.name}.`;
      } catch (error) {
        textures.forEach((texture) => texture.dispose());
        const message = error instanceof Error ? error.message : String(error);
        reportError(`Could not import the skybox cross image: ${message}`);
        atlasStatus.textContent = 'The cross image could not be imported.';
        atlasInput.value = '';
      } finally {
        bitmap?.close();
      }
    });
    atlasLayoutLabel.appendChild(atlasLayout);
    atlasSection.append(atlasHeading, atlasDescription, atlasLayoutLabel, atlasFileLabel, atlasStatus);
    imageSettings.appendChild(atlasSection);

    const allSides = document.createElement('section');
    allSides.className = 'skybox-face-section skybox-all-sides-image';
    const allHeading = document.createElement('strong');
    allHeading.textContent = 'Apply one image to all six sides';
    const allPreview = document.createElement('img');
    allPreview.className = 'skybox-image-preview';
    allPreview.alt = 'All-sides skybox image preview';
    allPreview.hidden = true;
    const allLabel = document.createElement('label');
    allLabel.className = 'property-field skybox-image-field';
    allLabel.textContent = 'Image';
    const allInput = document.createElement('input');
    allInput.type = 'file';
    allInput.accept = 'image/png,image/jpeg,image/webp,image/avif';
    allInput.setAttribute('aria-label', 'Choose image for all skybox sides');
    const removeAll = document.createElement('button');
    removeAll.type = 'button';
    removeAll.className = 'skybox-remove-image';
    removeAll.textContent = 'Remove all images';
    removeAll.hidden = !faceMaterials.some((material) => material.map !== null);
    const refreshAll = () => {
      const currentMaterials = mesh.material;
      if (!Array.isArray(currentMaterials) || !currentMaterials.every(isSkyboxMaterial)) {
        throw new Error('Skybox face materials are unavailable.');
      }
      const firstMap = currentMaterials.find((material) => material.map)?.map;
      allPreview.src = firstMap ? getPreviewUrl(firstMap) ?? '' : '';
      allPreview.hidden = !firstMap;
      removeAll.hidden = !currentMaterials.some((material) => material.map);
    };
    allInput.addEventListener('change', async () => {
      const file = allInput.files?.[0];
      if (!file) return;
      let source: THREE.CanvasTexture | null = null;
      const copies: THREE.Texture[] = [];
      try {
        source = await makeTexture(file);
        const currentMaterials = mesh.material;
        if (!Array.isArray(currentMaterials) || !currentMaterials.every(isSkyboxMaterial)) {
          throw new Error('The skybox has changed shape. Reopen its settings and try again.');
        }
        currentMaterials.forEach((material, index) => {
          const texture = index === 0 ? source! : source!.clone();
          texture.needsUpdate = true;
          material.map?.dispose();
          material.map = texture;
          if (!skyboxColorsBeforeImages.has(material)) {
            skyboxColorsBeforeImages.set(material, material.color.clone());
          }
          material.color.set('#ffffff');
          material.needsUpdate = true;
          copies.push(texture);
        });
        refreshAll();
        renderImageSettings();
      } catch (error) {
        if (source && !copies.includes(source)) source.dispose();
        const message = error instanceof Error ? error.message : String(error);
        reportError(`Could not apply the all-sides skybox image: ${message}`);
        allInput.value = '';
      }
    });
    removeAll.addEventListener('click', () => {
      const currentMaterials = mesh.material;
      if (!Array.isArray(currentMaterials) || !currentMaterials.every(isSkyboxMaterial)) return;
      const textures = new Set<THREE.Texture>();
      currentMaterials.forEach((material) => {
        if (material.map) {
          textures.add(material.map);
          material.map = null;
          const originalColor = skyboxColorsBeforeImages.get(material);
          if (originalColor) {
            material.color.copy(originalColor);
            skyboxColorsBeforeImages.delete(material);
          }
          material.needsUpdate = true;
        }
      });
      textures.forEach((texture) => texture.dispose());
      allInput.value = '';
      renderImageSettings();
    });
    allLabel.appendChild(allInput);
    refreshAll();
    allSides.append(allHeading, allPreview, allLabel, removeAll);
    faceMaterials.forEach((material, index) => {
      const section = document.createElement('section');
      section.className = 'skybox-face-section';
      const heading = document.createElement('strong');
      heading.textContent = faceNames[index];
      section.appendChild(heading);
      addImageControls(section, material, faceNames[index], true);
      imageSettings.appendChild(section);
    });
    imageSettings.appendChild(allSides);
  };

  shapeSelect.addEventListener('change', () => {
    const nextShape = shapeSelect.value as WorldSkyboxShape;
    if (nextShape !== 'cube' && nextShape !== 'sphere') {
      reportError('Choose Cube or Sphere for the world skybox.');
      return;
    }
    setSkyboxShape(mesh, nextShape);
    dimensionsPanel.hidden = nextShape === 'sphere';
    renderImageSettings();
  });
  renderImageSettings();
  return form;
}
