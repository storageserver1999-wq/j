import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { drawColorWheel, hsvToRgb, rgbToHsv } from './color-utils';
import { computeGeometryNormals, createTriangleGeometry, shapeDefinitions } from './geometry';
import { clearWorldSkybox, createWorldSkybox, createWorldSkyboxProperties, isWorldSkybox } from './world-skybox';
import { createDisplayModeController, type ObjectDisplayMode } from './display-modes';
import { MeshBasicNodeMaterial, WebGPURenderer } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import './style.css';

const viewportElement = document.querySelector<HTMLDivElement>('#viewport');
const gpuErrorElement = document.querySelector<HTMLDivElement>('#gpu-error');
const editorElement = document.querySelector<HTMLElement>('.editor');
const displayModeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.display-mode-button'));
const toolbarElement = document.querySelector<HTMLDivElement>('.toolbar');
const sidebarElement = document.querySelector<HTMLElement>('.sidebar');
const sidebarResizeElement = document.querySelector<HTMLDivElement>('.sidebar-resize');
const panelResizeElement = document.querySelector<HTMLDivElement>('.panel-resize');
const pbrDockResizeElement = document.querySelector<HTMLDivElement>('.pbr-dock-resize');
const hierarchyPanelElement = document.querySelector<HTMLElement>('.hierarchy-panel');
const propertiesPanelElement = document.querySelector<HTMLElement>('.properties-panel');
const insertButtonElement = document.querySelector<HTMLButtonElement>('.insert-button');
const insertMenuElement = document.querySelector<HTMLDivElement>('#insert-menu');
const viewButtonElement = document.querySelector<HTMLButtonElement>('.view-button');
const viewMenuElement = document.querySelector<HTMLDivElement>('#view-menu');
const renderMenuButtonElement = document.querySelector<HTMLButtonElement>('.render-menu-button');
const renderMenuElement = document.querySelector<HTMLDivElement>('#render-menu');
const gridToggleButtonElement = document.querySelector<HTMLButtonElement>('.grid-toggle-button');
const preferencesButtonElement = document.querySelector<HTMLButtonElement>('.preferences-button');
const preferencesPanelElement = document.querySelector<HTMLElement>('#preferences-panel');
const preferencesCloseElement = document.querySelector<HTMLButtonElement>('.preferences-close');
const preferencesHeaderElement = document.querySelector<HTMLElement>('.preferences-header');
const preferencesTabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.preferences-nav-button'));
const preferencesPages = Array.from(document.querySelectorAll<HTMLElement>('.preferences-page'));
const lightingTechnologyElement = document.querySelector<HTMLSelectElement>('#lighting-technology');
const autoOpenModelElement = document.querySelector<HTMLInputElement>('#auto-open-model');
const autoOpenChromaticsElement = document.querySelector<HTMLInputElement>('#auto-open-chromatics');
const uiAccentColorElement = document.querySelector<HTMLInputElement>('#ui-accent-color');
const uiBackgroundColorElement = document.querySelector<HTMLInputElement>('#ui-background-color');
const uiPanelColorElement = document.querySelector<HTMLInputElement>('#ui-panel-color');
const resetUiColorsElement = document.querySelector<HTMLButtonElement>('#reset-ui-colors');
const featureButtonElement = document.querySelector<HTMLButtonElement>('.feature-button');
const featureMenuElement = document.querySelector<HTMLDivElement>('#feature-menu');
const lightingButtonElement = document.querySelector<HTMLButtonElement>('.lighting-button');
const lightingMenuElement = document.querySelector<HTMLDivElement>('#lighting-menu');
const worldInsertButtonElement = document.querySelector<HTMLButtonElement>('.world-insert-button');
const worldInsertMenuElement = document.querySelector<HTMLDivElement>('#world-insert-menu');
const worldSkyboxInsertButtonElement = document.querySelector<HTMLButtonElement>('.world-skybox-insert');
const sceneContentsElement = document.querySelector<HTMLDivElement>('#scene-contents');
const sceneDisclosureElement = document.querySelector<HTMLButtonElement>('.scene-root');
const propertiesElement = document.querySelector<HTMLDivElement>('.properties-empty');
const distanceInputElement = document.querySelector<HTMLInputElement>('#render-distance');
const distanceOutputElement = document.querySelector<HTMLOutputElement>('#render-distance-value');
const customCursorElement = document.querySelector<HTMLDivElement>('#custom-cursor');
const snapButtonElement = document.querySelector<HTMLButtonElement>('.snap-button');
const editButtonElement = document.querySelector<HTMLButtonElement>('.edit-button');
const editMenuElement = document.querySelector<HTMLDivElement>('#edit-menu');
const eyedropperButtonElement = document.querySelector<HTMLButtonElement>('.eyedropper-button');
const pointGeoButtonElement = document.querySelector<HTMLButtonElement>('.point-geo-button');
const geoMoveButtonElement = document.querySelector<HTMLButtonElement>('.geo-move-button');
const addGeometryPointButtonElement = document.querySelector<HTMLButtonElement>('.add-geometry-point-button');
const debugButtonElement = document.querySelector<HTMLButtonElement>('.debug-button');
const debugPanelElement = document.querySelector<HTMLElement>('#debug-panel');
const debugEmptyElement = document.querySelector<HTMLDivElement>('.debug-empty');
const debugEntriesElement = document.querySelector<HTMLOListElement>('.debug-entries');
const debugClearElement = document.querySelector<HTMLButtonElement>('.debug-clear');
const objectContextMenuElement = document.querySelector<HTMLDivElement>('#object-context-menu');
const selectionBoxElement = document.querySelector<HTMLDivElement>('#selection-box');

if (!viewportElement || !gpuErrorElement || !editorElement || !toolbarElement || !sidebarElement || !sidebarResizeElement ||
  !panelResizeElement || !hierarchyPanelElement || !propertiesPanelElement ||
  !pbrDockResizeElement ||
  !insertButtonElement || !insertMenuElement || !viewButtonElement || !viewMenuElement ||
  !renderMenuButtonElement || !renderMenuElement || !gridToggleButtonElement ||
  !preferencesButtonElement || !preferencesPanelElement || !preferencesCloseElement ||
  !preferencesHeaderElement || preferencesTabButtons.length !== 2 || preferencesPages.length !== 2 ||
  !autoOpenModelElement || !autoOpenChromaticsElement || !uiAccentColorElement ||
  !uiBackgroundColorElement || !uiPanelColorElement || !resetUiColorsElement ||
  !lightingTechnologyElement || !selectionBoxElement ||
  !featureButtonElement || !featureMenuElement || !lightingButtonElement || !lightingMenuElement ||
  !worldInsertButtonElement || !worldInsertMenuElement || !worldSkyboxInsertButtonElement ||
  !sceneContentsElement || !sceneDisclosureElement || !propertiesElement ||
  !distanceInputElement || !distanceOutputElement || !customCursorElement || !snapButtonElement ||
  !editButtonElement || !editMenuElement || !eyedropperButtonElement || !pointGeoButtonElement ||
  !geoMoveButtonElement || !addGeometryPointButtonElement ||
  displayModeButtons.length !== 2 || !debugButtonElement || !debugPanelElement || !debugEmptyElement || !debugEntriesElement ||
  !debugClearElement || !objectContextMenuElement) {
  throw new Error('One or more editor interface elements could not be found.');
}

const viewport = viewportElement;
const gpuError = gpuErrorElement;
const editor = editorElement;
const toolbar = toolbarElement;
const sidebar = sidebarElement;
const sidebarResize = sidebarResizeElement;
const panelResize = panelResizeElement;
const pbrDockResize = pbrDockResizeElement;
const hierarchyPanel = hierarchyPanelElement;
const propertiesPanel = propertiesPanelElement;
const insertButton = insertButtonElement;
const insertMenu = insertMenuElement;
const viewButton = viewButtonElement;
const viewMenu = viewMenuElement;
const renderMenuButton = renderMenuButtonElement;
const renderMenu = renderMenuElement;
const gridToggleButton = gridToggleButtonElement;
const preferencesButton = preferencesButtonElement;
const preferencesPanel = preferencesPanelElement;
const preferencesClose = preferencesCloseElement;
const preferencesHeader = preferencesHeaderElement;
const lightingTechnology = lightingTechnologyElement;
const autoOpenModel = autoOpenModelElement;
const autoOpenChromatics = autoOpenChromaticsElement;
const uiAccentColor = uiAccentColorElement;
const uiBackgroundColor = uiBackgroundColorElement;
const uiPanelColor = uiPanelColorElement;
const resetUiColors = resetUiColorsElement;
const featureButton = featureButtonElement;
const featureMenu = featureMenuElement;
const lightingButton = lightingButtonElement;
const lightingMenu = lightingMenuElement;
const worldInsertButton = worldInsertButtonElement;
const worldInsertMenu = worldInsertMenuElement;
const worldSkyboxInsertButton = worldSkyboxInsertButtonElement;
const sceneContents = sceneContentsElement;
const sceneDisclosure = sceneDisclosureElement;
const properties = propertiesElement;
const distanceInput = distanceInputElement;
const distanceOutput = distanceOutputElement;
const renderDistanceOptions = [4, 10, 20, 30, 40] as const;
const customCursor = customCursorElement;
const snapButton = snapButtonElement;
const editButton = editButtonElement;
const editMenu = editMenuElement;
const eyedropperButton = eyedropperButtonElement;
const pointGeoButton = pointGeoButtonElement;
const geoMoveButton = geoMoveButtonElement;
const addGeometryPointButton = addGeometryPointButtonElement;
const debugButton = debugButtonElement;
const debugPanel = debugPanelElement;
const debugEmpty = debugEmptyElement;
const debugEntries = debugEntriesElement;
const debugClear = debugClearElement;
const objectContextMenu = objectContextMenuElement;
const selectionBox = selectionBoxElement;
const contextLockButton = objectContextMenu.querySelector<HTMLButtonElement>('[data-action="lock"]')!;
const contextGroupChildrenButton = objectContextMenu.querySelector<HTMLButtonElement>('[data-action="group-children"]')!;
const contextModelChildrenButton = objectContextMenu.querySelector<HTMLButtonElement>('[data-action="model-children"]')!;
const contextDeleteButton = objectContextMenu.querySelector<HTMLButtonElement>('[data-action="delete"]')!;
const contextShowAllWireframeButton = objectContextMenu.querySelector<HTMLButtonElement>('[data-action="show-all-wireframe"]')!;
const contextShowAllFacesButton = objectContextMenu.querySelector<HTMLButtonElement>('[data-action="show-all-faces"]')!;

function addDebugEntry(message: string, source = '') {
  const entry = document.createElement('li');
  entry.className = 'debug-entry';
  entry.textContent = message;
  if (source) {
    const sourceLabel = document.createElement('span');
    sourceLabel.className = 'debug-entry-source';
    sourceLabel.textContent = source;
    entry.appendChild(sourceLabel);
  }
  debugEntries.appendChild(entry);
  while (debugEntries.childElementCount > 100) debugEntries.firstElementChild?.remove();
  debugEmpty.hidden = debugEntries.childElementCount > 0;
}

window.addEventListener('error', (event) => {
  const source = event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : '';
  addDebugEntry(event.message || 'Uncaught application error', source);
});
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  addDebugEntry(
    reason instanceof Error ? reason.message : String(reason),
    reason instanceof Error ? reason.stack ?? '' : '',
  );
});
debugButton.addEventListener('click', () => {
  const expanded = debugButton.getAttribute('aria-expanded') === 'true';
  debugButton.setAttribute('aria-expanded', String(!expanded));
  debugPanel.hidden = expanded;
});
debugClear.addEventListener('click', () => {
  debugEntries.replaceChildren();
  debugEmpty.hidden = false;
});

const scene = new THREE.Scene();
scene.background = new THREE.Color('#000000');
scene.add(new THREE.HemisphereLight('#e2e2e2', '#666666', 0.16));

const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 45000);
camera.position.set(13, 12, 16);

const renderer = new WebGPURenderer({ antialias: true, alpha: false });
try {
  await renderer.init();
  if (!('isWebGPUBackend' in renderer.backend) || renderer.backend.isWebGPUBackend !== true) {
    throw new Error('The available graphics backend is not WebGPU.');
  }
} catch (error) {
  const details = error instanceof Error ? error.message : String(error);
  gpuError.textContent = `WebGPU is required to run this editor, but could not be initialized. Update your browser or graphics drivers and try again.\n\n${details}`;
  gpuError.hidden = false;
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.5;
controls.target.set(0, 0, 0);
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN,
};
let freeCameraEnabled = false;
let freeCameraLooking = false;
let freeCameraPointerPosition: { x: number; y: number } | null = null;
let freeCameraYaw = camera.rotation.y;
let freeCameraPitch = camera.rotation.x;
const freeCameraKeys = new Set<string>();
let boxSelectionStart: { x: number; y: number; pointerId: number } | null = null;

function syncNavigationControls() {
  controls.enabled = !freeCameraEnabled && !transformControls.dragging && !pointInteractionLocked && !boxSelectionStart;
}

function setFreeCameraEnabled(enabled: boolean) {
  if (freeCameraEnabled === enabled) return;
  freeCameraEnabled = enabled;
  freeCameraLooking = false;
  freeCameraPointerPosition = null;
  freeCameraKeys.clear();
  transformControls.enabled = !enabled;
  transformControls.getHelper().visible = !enabled;
  if (enabled) {
    const direction = camera.getWorldDirection(new THREE.Vector3());
    freeCameraYaw = Math.atan2(-direction.x, -direction.z);
    freeCameraPitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
    camera.rotation.order = 'YXZ';
    camera.rotation.set(freeCameraPitch, freeCameraYaw, 0);
  } else {
    const direction = camera.getWorldDirection(new THREE.Vector3());
    controls.target.copy(camera.position).addScaledVector(direction, 10);
  }
  syncNavigationControls();
}

renderer.domElement.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  if (freeCameraEnabled) {
    closeObjectContextMenu();
    return;
  }
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(objects, false)[0];
  if (hit?.object instanceof THREE.Mesh) showObjectContextMenu(hit.object, event.clientX, event.clientY);
  else closeObjectContextMenu();
});
let isOrbitDragging = false;
let isButtonPressed = false;
let lastCursorEvent: PointerEvent | null = null;
let pointInteractionLocked = false;
window.addEventListener('pointermove', (event) => {
  lastCursorEvent = event;
  const target = event.target instanceof Element ? event.target : null;
  isButtonPressed = Boolean(event.buttons & 1) && Boolean(target?.closest('button'));
  updateCursorAppearance(event);
});
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button === 2) isOrbitDragging = !freeCameraEnabled;
  if (!freeCameraEnabled || event.button !== 2) return;
  freeCameraLooking = true;
  freeCameraPointerPosition = { x: event.clientX, y: event.clientY };
  renderer.domElement.setPointerCapture(event.pointerId);
  lastCursorEvent = event;
  isButtonPressed = false;
  updateCursorAppearance(event);
  event.preventDefault();
  event.stopImmediatePropagation();
});
window.addEventListener('pointerdown', (event) => {
  lastCursorEvent = event;
  const target = event.target instanceof Element ? event.target : null;
  isButtonPressed = event.button === 0 && Boolean(target?.closest('button'));
  updateCursorAppearance(event);
});
renderer.domElement.addEventListener('pointermove', (event) => {
  if (!freeCameraEnabled || !freeCameraLooking || !freeCameraPointerPosition) return;
  const deltaX = event.clientX - freeCameraPointerPosition.x;
  const deltaY = event.clientY - freeCameraPointerPosition.y;
  freeCameraPointerPosition = { x: event.clientX, y: event.clientY };
  freeCameraYaw -= deltaX * 0.0025;
  freeCameraPitch = THREE.MathUtils.clamp(
    freeCameraPitch - deltaY * 0.0025,
    -Math.PI / 2 + 0.01,
    Math.PI / 2 - 0.01,
  );
  camera.rotation.set(freeCameraPitch, freeCameraYaw, 0);
});
renderer.domElement.addEventListener('lostpointercapture', () => {
  freeCameraLooking = false;
  freeCameraPointerPosition = null;
});
window.addEventListener('pointerup', (event) => {
  if (event.button === 2) isOrbitDragging = false;
  if (event.button === 2) {
    freeCameraLooking = false;
    freeCameraPointerPosition = null;
  }
  lastCursorEvent = event;
  isButtonPressed = false;
  pointInteractionLocked = false;
  syncNavigationControls();
  updateCursorAppearance(event);
});
window.addEventListener('pointercancel', () => {
  isOrbitDragging = false;
  isButtonPressed = false;
  freeCameraLooking = false;
  freeCameraPointerPosition = null;
  boxSelectionStart = null;
  selectionBox.hidden = true;
  freeCameraKeys.clear();
  syncNavigationControls();
  finishGeometryPointDrag();
  if (lastCursorEvent) updateCursorAppearance(lastCursorEvent);
});
window.addEventListener('blur', () => {
  isOrbitDragging = false;
  isButtonPressed = false;
  freeCameraLooking = false;
  freeCameraPointerPosition = null;
  boxSelectionStart = null;
  selectionBox.hidden = true;
  freeCameraKeys.clear();
  syncNavigationControls();
  finishGeometryPointDrag();
  if (lastCursorEvent) updateCursorAppearance(lastCursorEvent);
});

type TransformMode = 'select' | 'translate' | 'rotate' | 'scale';
const transformControls = new TransformControls(camera, renderer.domElement);
scene.add(transformControls.getHelper());
const pointSelectionGizmo = new THREE.Group();
scene.add(pointSelectionGizmo);
let transformMode: TransformMode = 'select';
let isTransformDragging = false;
let snappingEnabled = false;
let eyedropperEnabled = false;
let pointGeoEnabled = false;
let geoMoveEnabled = false;
let manualPointSelectionEnabled = false;
let pointEditObject: THREE.Mesh | null = null;
let selectedPointObject: THREE.Mesh | null = null;
let selectedGeometryPoints: THREE.Mesh[] = [];
let pointSelectionStartWorld = new Map<THREE.Mesh, THREE.Vector3>();
const pointSelectionStartCenter = new THREE.Vector3();
let addingGeometryPoint = false;
let pointStatusElement: HTMLDivElement | null = null;
let eyedropperColor: THREE.Color | null = null;
const recentColors: string[] = [];
const lockedObjects = new WeakSet<THREE.Mesh>();
const pointGeometryNames = new WeakMap<THREE.Mesh, string>();
const pointGeometryPoints = new WeakMap<THREE.Mesh, THREE.Vector3[]>();
const pointGeometryBasePoints = new WeakMap<THREE.Mesh, THREE.Vector3[]>();
interface PointGeometryEditState {
  basePoints: THREE.Vector3[];
  basePositions: Float32Array;
  influenceRadius: number;
  hadSavedPoints: boolean;
}
const pointGeometryEditStates = new WeakMap<THREE.Mesh, PointGeometryEditState>();
const topologyUpdateTimers = new WeakMap<THREE.Mesh, number>();
let geometryPointMarkers: THREE.Mesh[] = [];
let pointPreviewFrame: number | null = null;
const pointMarkerWorldPosition = new THREE.Vector3();
const originalEmissive = new WeakMap<THREE.Mesh, { color: THREE.Color; intensity: number }>();
let contextTargetObject: THREE.Mesh | null = null;

function isObjectLocked(mesh: THREE.Mesh): boolean {
  return lockedObjects.has(mesh);
}

function recordRecentColor(color: THREE.Color) {
  const hex = `#${color.getHexString()}`;
  const existing = recentColors.indexOf(hex);
  if (existing >= 0) recentColors.splice(existing, 1);
  recentColors.unshift(hex);
  recentColors.length = Math.min(recentColors.length, 8);
}
let selectedObject: THREE.Mesh | null = null;
let selectedObjects: THREE.Mesh[] = [];
let transformReadouts: { position: HTMLDivElement; rotation: HTMLDivElement; scale: HTMLDivElement } | null = null;
const selectionHighlight = new THREE.BoxHelper(new THREE.Object3D(), '#f0bc62');
selectionHighlight.visible = false;
const selectionHighlightMaterial = selectionHighlight.material as THREE.LineBasicMaterial;
selectionHighlightMaterial.depthTest = false;
selectionHighlightMaterial.toneMapped = false;
scene.add(selectionHighlight);
const additionalSelectionHighlights = new Map<THREE.Mesh, THREE.BoxHelper>();
const multiSelectionPivot = new THREE.Group();
scene.add(multiSelectionPivot);
let multiSelectionStart: {
  pivotMatrix: THREE.Matrix4;
  objectMatrices: Map<THREE.Mesh, THREE.Matrix4>;
} | null = null;
const hoverHighlight = new THREE.BoxHelper(new THREE.Object3D(), '#ffff00');
hoverHighlight.visible = false;
const hoverHighlightMaterial = hoverHighlight.material as THREE.LineBasicMaterial;
hoverHighlightMaterial.depthTest = false;
hoverHighlightMaterial.toneMapped = false;
hoverHighlightMaterial.transparent = true;
hoverHighlightMaterial.opacity = 0.95;
scene.add(hoverHighlight);

function getObjectHighlightColor(mesh: THREE.Mesh): THREE.Color {
  const material = mesh.material;
  if (!(material instanceof THREE.MeshStandardMaterial)) return new THREE.Color('#ffff00');
  return new THREE.Color().setHex(0xffffff ^ material.color.getHex());
}

function restoreMeshEmissive(mesh: THREE.Mesh) {
  if (!(mesh.material instanceof THREE.MeshStandardMaterial)) return;
  const material = mesh.material;
  if (!originalEmissive.has(mesh)) {
    originalEmissive.set(mesh, { color: material.emissive.clone(), intensity: material.emissiveIntensity });
  }
  const original = originalEmissive.get(mesh)!;
  material.emissive.copy(original.color);
  material.emissiveIntensity = original.intensity;
}

function setEyedropperEnabled(enabled: boolean) {
  eyedropperEnabled = enabled;
  eyedropperColor = null;
  eyedropperButton.setAttribute('aria-pressed', String(enabled));
  eyedropperButton.textContent = enabled ? 'Pick source color…' : 'Eyedropper';
  if (lastCursorEvent) updateCursorAppearance(lastCursorEvent);
  hoverHighlight.visible = false;
  if (selectedObject) {
    (selectionHighlight.material as THREE.LineBasicMaterial).color.copy(
      enabled ? getObjectHighlightColor(selectedObject) : new THREE.Color('#f0bc62'),
    );
  }
}

function updateSelectionHighlights() {
  selectionHighlight.visible = selectedObject !== null && !isWorldSkybox(selectedObject);
  if (selectedObject && !isWorldSkybox(selectedObject)) {
    selectionHighlight.setFromObject(selectedObject);
    selectionHighlightMaterial.color.copy(
      eyedropperEnabled ? getObjectHighlightColor(selectedObject) : new THREE.Color('#f0bc62'),
    );
  }
  const secondarySelections = new Set(selectedObjects.filter((mesh) => mesh !== selectedObject));
  for (const [mesh, helper] of additionalSelectionHighlights) {
    if (secondarySelections.has(mesh)) continue;
    scene.remove(helper);
    helper.dispose();
    additionalSelectionHighlights.delete(mesh);
  }
  for (const mesh of secondarySelections) {
    if (isWorldSkybox(mesh)) continue;
    let helper = additionalSelectionHighlights.get(mesh);
    if (!helper) {
      helper = new THREE.BoxHelper(mesh, '#f0bc62');
      const material = helper.material as THREE.LineBasicMaterial;
      material.depthTest = false;
      material.toneMapped = false;
      additionalSelectionHighlights.set(mesh, helper);
      scene.add(helper);
    } else {
      helper.setFromObject(mesh);
    }
  }
}

function updateSelectedHierarchyRows() {
  sceneContents.querySelectorAll<HTMLElement>('.scene-object-row').forEach((row) => {
    const mesh = objects.find((object) => object.uuid === row.dataset.uuid);
    const button = row.querySelector('.scene-object');
    const selected = Boolean(mesh && selectedObjects.includes(mesh));
    row.classList.toggle('multi-selected', selected && mesh !== selectedObject);
    button?.classList.toggle('selected', selected);
  });
}

function updateSelectionTransformTarget() {
  if (selectedObjects.length > 1) {
    if (transformMode === 'select' || selectedObjects.some((mesh) => isObjectLocked(mesh))) {
      transformControls.detach();
      return;
    }
    const center = new THREE.Vector3();
    selectedObjects.forEach((mesh) => center.add(mesh.getWorldPosition(new THREE.Vector3())));
    multiSelectionPivot.position.copy(center.divideScalar(selectedObjects.length));
    multiSelectionPivot.quaternion.identity();
    multiSelectionPivot.scale.setScalar(1);
    multiSelectionPivot.updateMatrixWorld(true);
    transformControls.setMode(transformMode);
    transformControls.attach(multiSelectionPivot);
    return;
  }
  if (!selectedObject || transformMode === 'select' || isWorldSkybox(selectedObject) ||
    isObjectLocked(selectedObject) || pointEditObject === selectedObject) {
    transformControls.detach();
    return;
  }
  transformControls.setMode(transformMode);
  transformControls.attach(getMeshTransformTarget(selectedObject));
}

function captureMultiSelectionStart() {
  if (selectedObjects.length < 2 || transformControls.object !== multiSelectionPivot) {
    multiSelectionStart = null;
    return;
  }
  multiSelectionPivot.updateWorldMatrix(true, false);
  const objectMatrices = new Map<THREE.Mesh, THREE.Matrix4>();
  selectedObjects.forEach((mesh) => {
    mesh.updateWorldMatrix(true, false);
    objectMatrices.set(mesh, mesh.matrixWorld.clone());
  });
  multiSelectionStart = {
    pivotMatrix: multiSelectionPivot.matrixWorld.clone(),
    objectMatrices,
  };
}

function applyMultiSelectionTransform() {
  if (!multiSelectionStart) return;
  multiSelectionPivot.updateWorldMatrix(true, false);
  const delta = multiSelectionPivot.matrixWorld.clone()
    .multiply(multiSelectionStart.pivotMatrix.clone().invert());
  for (const [mesh, startMatrix] of multiSelectionStart.objectMatrices) {
    const worldMatrix = delta.clone().multiply(startMatrix);
    const parent = mesh.parent;
    const localMatrix = parent
      ? parent.matrixWorld.clone().invert().multiply(worldMatrix)
      : worldMatrix;
    localMatrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.updateMatrix();
    mesh.updateWorldMatrix(true, false);
  }
  selectedObjects.forEach((mesh) => additionalSelectionHighlights.get(mesh)?.setFromObject(mesh));
}

function updateEyedropperHover(event: Pick<PointerEvent, 'clientX' | 'clientY'>) {
  if (!eyedropperEnabled) {
    hoverHighlight.visible = false;
    return;
  }
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(objects, false)[0];
  if (!hit || !(hit.object instanceof THREE.Mesh) || isObjectLocked(hit.object)) {
    hoverHighlight.visible = false;
    return;
  }
  hoverHighlight.setFromObject(hit.object);
  hoverHighlightMaterial.color.copy(getObjectHighlightColor(hit.object));
  hoverHighlight.visible = true;
}

transformControls.addEventListener('dragging-changed', () => {
  isTransformDragging = transformControls.dragging;
  if (isTransformDragging) captureMultiSelectionStart();
  else multiSelectionStart = null;
  syncNavigationControls();
  if (!transformControls.dragging && pointEditObject &&
    transformControls.object === pointSelectionGizmo && selectedGeometryPoints.length > 0) {
    if (pointPreviewFrame !== null) {
      cancelAnimationFrame(pointPreviewFrame);
      pointPreviewFrame = null;
    }
    rebuildPointGeometry(pointEditObject);
    captureGeometryPointSelectionStart();
  }
});
transformControls.addEventListener('objectChange', () => {
  if (transformControls.object === multiSelectionPivot) applyMultiSelectionTransform();
  if (pointEditObject && transformControls.object === pointSelectionGizmo &&
    selectedGeometryPoints.length > 0) {
    const movement = pointSelectionGizmo.position.clone().sub(pointSelectionStartCenter);
    const points = pointGeometryPoints.get(pointEditObject);
    if (points) {
      for (const marker of selectedGeometryPoints) {
        const start = pointSelectionStartWorld.get(marker);
        const markerIndex = geometryPointMarkers.indexOf(marker);
        if (!start || markerIndex < 0) continue;
        const parent = marker.parent;
        if (!(parent instanceof THREE.Mesh)) continue;
        parent.updateWorldMatrix(true, false);
        marker.position.copy(parent.worldToLocal(start.clone().add(movement)));
        points[markerIndex].copy(marker.position);
      }
      updatePointGeometryPreview();
    }
  }
  if (selectedObject) {
    const light = sceneLights.get(selectedObject);
    if (light instanceof THREE.DirectionalLight) light.position.copy(selectedObject.position);
    updateAimedLight(selectedObject);
  }
  if (selectedObject && transformReadouts) {
    const transformTarget = getMeshTransformTarget(selectedObject);
    const { position, rotation } = transformTarget;
    const { scale } = selectedObject;
    transformReadouts.position.textContent = `Position: ${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}`;
    transformReadouts.rotation.textContent = `Rotation: ${THREE.MathUtils.radToDeg(rotation.x).toFixed(1)}°, ${THREE.MathUtils.radToDeg(rotation.y).toFixed(1)}°, ${THREE.MathUtils.radToDeg(rotation.z).toFixed(1)}°`;
    transformReadouts.scale.textContent = `Scale: ${scale.x.toFixed(2)}, ${scale.y.toFixed(2)}, ${scale.z.toFixed(2)}`;
    for (const axis of ['x', 'y', 'z'] as const) {
      const input = properties.querySelector<HTMLInputElement>(`[aria-label="Position ${axis.toUpperCase()}"]`);
      if (input) input.value = transformTarget.position[axis].toFixed(2);
    }
  }
});

const gridDistance = renderDistanceOptions[Number(distanceInput.value)];
const cameraPositionUniform = TSL.uniform(camera.position.clone());
const gridCoordinates = TSL.positionWorld.xz;
const minorGridCoordinates = gridCoordinates;
const majorGridCoordinates = gridCoordinates.mul(0.1);
const minorGridDistance = TSL.abs(TSL.fract(minorGridCoordinates.sub(0.5)).sub(0.5))
  .div(TSL.fwidth(minorGridCoordinates));
const majorGridDistance = TSL.abs(TSL.fract(majorGridCoordinates.sub(0.5)).sub(0.5))
  .div(TSL.fwidth(majorGridCoordinates));
const minorLine = TSL.float(1).sub(TSL.min(TSL.min(minorGridDistance.x, minorGridDistance.y), 1));
const majorLine = TSL.float(1).sub(TSL.min(TSL.min(majorGridDistance.x, majorGridDistance.y), 1));
const gridMaterial = new MeshBasicNodeMaterial({
  transparent: true,
  depthWrite: false,
});
gridMaterial.colorNode = TSL.mix(
  TSL.color('#33383d'),
  TSL.color('#636b70'),
  majorLine.mul(0.8),
);
gridMaterial.opacityNode = TSL.max(minorLine.mul(0.42), majorLine.mul(0.7));
let gridGeometry = new THREE.PlaneGeometry(gridDistance * 2, gridDistance * 2);
const grid = new THREE.Mesh(gridGeometry, gridMaterial);
grid.rotation.x = -Math.PI / 2;
grid.position.y = -0.02;
grid.frustumCulled = false;
scene.add(grid);

distanceInput.addEventListener('input', () => {
  const optionIndex = THREE.MathUtils.clamp(Math.round(Number(distanceInput.value)), 0, renderDistanceOptions.length - 1);
  distanceInput.value = String(optionIndex);
  const distance = renderDistanceOptions[optionIndex];
  distanceOutput.value = String(distance);
  gridGeometry.dispose();
  gridGeometry = new THREE.PlaneGeometry(distance * 2, distance * 2);
  grid.geometry = gridGeometry;
});
gridToggleButton.addEventListener('click', () => {
  grid.visible = !grid.visible;
  gridToggleButton.setAttribute('aria-checked', String(grid.visible));
  gridToggleButton.textContent = grid.visible ? 'Hide grid' : 'Show grid';
});

const objects: THREE.Mesh[] = [];
const objectShapes = new WeakMap<THREE.Mesh, string>();
const joinedModels = new WeakSet<THREE.Mesh>();
const hierarchyRows = new WeakMap<THREE.Mesh, HTMLDivElement>();
const expandedGroups = new WeakSet<THREE.Mesh>();
const groupPivotByMesh = new WeakMap<THREE.Mesh, THREE.Group>();
const objectParentByMesh = new WeakMap<THREE.Mesh, THREE.Mesh>();
const displayModeController = createDisplayModeController({
  objects,
  isDisplayable: (mesh) => objectShapes.has(mesh),
  buttons: displayModeButtons,
  showAllWireframeButton: contextShowAllWireframeButton,
  showAllFacesButton: contextShowAllFacesButton,
  getSelectedObject: () => selectedObject,
});
const {
  objectDisplayModes,
  getOriginalMaterialVisibility,
  setObjectDisplayMode,
  showAllObjectsDisplayMode,
  updateShowAllDisplayModeMenuLabels,
  updateDisplayModeButtons,
} = displayModeController;
const smoothShadingByMesh = new WeakMap<THREE.Mesh, boolean>();
const lightDirectionIndicators = new WeakMap<THREE.Mesh, THREE.ArrowHelper>();
type EditableLight = THREE.PointLight | THREE.SpotLight | THREE.DirectionalLight;
type EditableLightType = 'spot' | 'directional' | 'point';
const lightTypeByMesh = new WeakMap<THREE.Mesh, EditableLightType>();
const sceneLights = new WeakMap<THREE.Mesh, EditableLight>();
const sceneLightEnabled = new WeakMap<EditableLight, boolean>();
lightingTechnology.value = 'mlight';
const defaultUiColors = { accent: '#74c5ed', background: '#101214', panel: '#191d20' };
function applyUiColors() {
  const root = document.documentElement;
  root.style.setProperty('--ui-accent', uiAccentColor.value);
  root.style.setProperty('--ui-background', uiBackgroundColor.value);
  root.style.setProperty('--ui-panel', uiPanelColor.value);
  localStorage.setItem('propeller.uiAccent', uiAccentColor.value);
  localStorage.setItem('propeller.uiBackground', uiBackgroundColor.value);
  localStorage.setItem('propeller.uiPanel', uiPanelColor.value);
}
const savedUiColors = {
  accent: localStorage.getItem('propeller.uiAccent'),
  background: localStorage.getItem('propeller.uiBackground'),
  panel: localStorage.getItem('propeller.uiPanel'),
};
if (savedUiColors.accent && /^#[0-9a-f]{6}$/i.test(savedUiColors.accent)) uiAccentColor.value = savedUiColors.accent;
if (savedUiColors.background && /^#[0-9a-f]{6}$/i.test(savedUiColors.background)) uiBackgroundColor.value = savedUiColors.background;
if (savedUiColors.panel && /^#[0-9a-f]{6}$/i.test(savedUiColors.panel)) uiPanelColor.value = savedUiColors.panel;
autoOpenModel.checked = localStorage.getItem('propeller.autoOpenModel') === 'true';
autoOpenChromatics.checked = localStorage.getItem('propeller.autoOpenChromatics') === 'true';
applyUiColors();
const lightWorldPosition = new THREE.Vector3();
const lightWorldQuaternion = new THREE.Quaternion();
const lightWorldDirection = new THREE.Vector3();
interface SunSettings {
  latitude: number;
  longitude: number;
  timeOfDay: number;
  size: number;
  flare: THREE.Mesh;
  glow: THREE.Sprite;
}
const sunSettings = new WeakMap<THREE.Mesh, SunSettings>();
let worldSkybox: THREE.Mesh | null = null;
type MaterialPreset = 'Rubber' | 'Concrete' | 'Glass';
const objectMaterialPresets = new WeakMap<THREE.Mesh, MaterialPreset>();

function getChildMeshes(mesh: THREE.Mesh): THREE.Mesh[] {
  return objects.filter((object) => {
    if (object === mesh || !isGroupableMesh(object)) return false;
    let parent = objectParentByMesh.get(object);
    while (parent) {
      if (parent === mesh) return true;
      parent = objectParentByMesh.get(parent);
    }
    return false;
  });
}

function isGroupableMesh(mesh: THREE.Mesh): boolean {
  return objectShapes.has(mesh) && !isWorldSkybox(mesh);
}

function getMeshTransformTarget(mesh: THREE.Mesh, mode = transformMode): THREE.Object3D {
  return mode !== 'scale' ? groupPivotByMesh.get(mesh) ?? mesh : mesh;
}

function ensureGroupPivot(mesh: THREE.Mesh): THREE.Group {
  const existingPivot = groupPivotByMesh.get(mesh);
  if (existingPivot) return existingPivot;
  if (!isGroupableMesh(mesh)) throw new Error(`"${mesh.name}" cannot be used as a group pivot.`);

  const parent = mesh.parent ?? scene;
  const pivot = new THREE.Group();
  pivot.name = `${mesh.name} Group Pivot`;
  pivot.position.copy(mesh.position);
  pivot.quaternion.copy(mesh.quaternion);
  pivot.scale.setScalar(1);
  parent.add(pivot);
  pivot.add(mesh);
  mesh.position.set(0, 0, 0);
  mesh.quaternion.identity();
  groupPivotByMesh.set(mesh, pivot);
  return pivot;
}

function getHierarchyChildContainer(mesh: THREE.Mesh): HTMLDivElement {
  const row = hierarchyRows.get(mesh);
  const container = row?.querySelector<HTMLDivElement>('.scene-object-children');
  if (!container) throw new Error(`The Scene Explorer row for "${mesh.name}" is unavailable.`);
  return container;
}

function moveMeshToParent(mesh: THREE.Mesh, parent: THREE.Mesh | null) {
  if (!isGroupableMesh(mesh) || (parent && !isGroupableMesh(parent))) return;
  if (parent && (mesh === parent || getChildMeshes(mesh).includes(parent))) return;
  const previousParent = objectParentByMesh.get(mesh) ?? null;
  if (parent === previousParent) return;
  const node = groupPivotByMesh.get(mesh) ?? mesh;
  const parentHadPivot = parent ? groupPivotByMesh.has(parent) : false;
  const container = parent ? ensureGroupPivot(parent) : scene;
  if (parent && !parentHadPivot && selectedObject === parent && transformMode !== 'select') {
    transformControls.attach(getMeshTransformTarget(parent));
    updateProperties(parent);
  }
  container.attach(node);
  if (parent) objectParentByMesh.set(mesh, parent);
  else objectParentByMesh.delete(mesh);

  const row = hierarchyRows.get(mesh);
  if (!row) throw new Error(`The Scene Explorer row for "${mesh.name}" is unavailable.`);
  const rowContainer = parent ? getHierarchyChildContainer(parent) : sceneContents;
  rowContainer.appendChild(row);
  if (parent) {
    expandedGroups.add(parent);
    updateGroupHierarchyRow(parent);
    if (selectedObject === parent && !groupPivotByMesh.has(parent)) ensureGroupPivot(parent);
  }
  if (previousParent) updateGroupHierarchyRow(previousParent);
  if (selectedObject && (selectedObject === parent || selectedObject === previousParent)) {
    updateProperties(selectedObject);
    if (transformMode !== 'select' && !isObjectLocked(selectedObject)) {
      transformControls.attach(getMeshTransformTarget(selectedObject));
    }
  }
}

function updateGroupHierarchyRow(mesh: THREE.Mesh) {
  const row = hierarchyRows.get(mesh);
  if (!row) return;
  const toggle = row.querySelector<HTMLButtonElement>('.scene-group-disclosure');
  const container = row.querySelector<HTMLDivElement>('.scene-object-children');
  if (!toggle || !container) throw new Error(`The Scene Explorer group controls for "${mesh.name}" are unavailable.`);
  const hasChildren = getChildMeshes(mesh).length > 0;
  toggle.hidden = !hasChildren;
  container.hidden = !hasChildren || !expandedGroups.has(mesh);
  toggle.textContent = container.hidden ? '›' : '⌄';
  toggle.setAttribute('aria-expanded', String(!container.hidden));
  row.classList.toggle('has-scene-children', hasChildren);
}

function groupChildMeshes(parent: THREE.Mesh) {
  if (!isGroupableMesh(parent)) return;
  const children = getChildMeshes(parent);
  children.forEach((child) => moveMeshToParent(child, parent));
  expandedGroups.add(parent);
  updateGroupHierarchyRow(parent);
  if (selectedObject === parent) updateProperties(parent);
}

function modelChildMeshes(parent: THREE.Mesh) {
  const children = getChildMeshes(parent);
  if (!isGroupableMesh(parent) || children.length === 0) return;
  const sources = [parent, ...children];
  const outerParent = objectParentByMesh.get(parent) ?? null;
  const parentMaterial = parent.material;
  const materialSource = parentMaterial instanceof THREE.MeshStandardMaterial
    ? parentMaterial
    : children.find((child) => child.material instanceof THREE.MeshStandardMaterial)?.material;
  if (!(materialSource instanceof THREE.MeshStandardMaterial)) {
    addDebugEntry(`The child blocks of "${parent.name}" do not have editable standard materials.`, 'Scene Explorer');
    return;
  }

  const parentPivot = ensureGroupPivot(parent);
  parentPivot.updateWorldMatrix(true, true);
  const inverseParent = parentPivot.matrixWorld.clone().invert();
  const pieces: THREE.BufferGeometry[] = [];
  try {
    for (const child of sources) {
      if (!(child.material instanceof THREE.MeshStandardMaterial)) {
        throw new Error(`"${child.name}" does not have an editable standard material.`);
      }
      child.updateWorldMatrix(true, false);
      const transformed = child.geometry.index
        ? child.geometry.toNonIndexed()
        : child.geometry.clone();
      transformed.applyMatrix4(inverseParent.clone().multiply(child.matrixWorld));
      const piece = new THREE.BufferGeometry();
      const positions = transformed.getAttribute('position');
      if (!positions) {
        transformed.dispose();
        throw new Error(`"${child.name}" has no position data.`);
      }
      piece.setAttribute('position', positions.clone());
      const normals = transformed.getAttribute('normal');
      if (normals) piece.setAttribute('normal', normals.clone());
      else piece.computeVertexNormals();
      pieces.push(piece);
      transformed.dispose();
    }
    const merged = mergeGeometries(pieces, false);
    if (!merged) throw new Error('The child geometries have incompatible vertex data.');
    pieces.forEach((piece) => piece.dispose());
    pieces.length = 0;
    const material = materialSource.clone();
    material.color.copy(parentMaterial instanceof THREE.MeshStandardMaterial
      ? parentMaterial.color
      : materialSource.color);
    material.vertexColors = false;
    const model = new THREE.Mesh(merged, material);
    model.name = parent.name;
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    model.castShadow = sources.some((child) => child.castShadow);
    model.receiveShadow = sources.some((child) => child.receiveShadow);
    model.frustumCulled = true;
    parentPivot.add(model);
    objects.push(model);
    objectShapes.set(model, 'Joined Model');
    joinedModels.add(model);
    groupPivotByMesh.set(model, parentPivot);
    if (outerParent) objectParentByMesh.set(model, outerParent);
    smoothShadingByMesh.set(model, true);
    objectMaterialPresets.set(model, objectMaterialPresets.get(parent) ?? 'Rubber');
    const parentDisplayMode = objectDisplayModes.get(parent);
    if (parentDisplayMode) setObjectDisplayMode(model, parentDisplayMode);

    sources.forEach((child) => {
      setObjectDisplayMode(child, null);
      const childPivot = groupPivotByMesh.get(child);
      if (childPivot && child !== parent) {
        childPivot.removeFromParent();
        groupPivotByMesh.delete(child);
      }
      child.removeFromParent();
      const objectIndex = objects.indexOf(child);
      if (objectIndex >= 0) objects.splice(objectIndex, 1);
      objectParentByMesh.delete(child);
      hierarchyRows.get(child)?.remove();
      hierarchyRows.delete(child);
      child.geometry.dispose();
      if (Array.isArray(child.material)) child.material.forEach((entry) => entry.dispose());
      else child.material.dispose();
    });
    groupPivotByMesh.delete(parent);
    addHierarchyRow(model);
    if (outerParent) updateGroupHierarchyRow(outerParent);
    selectObject(model);
  } catch (error) {
    pieces.forEach((piece) => piece.dispose());
    addDebugEntry(error instanceof Error ? error.message : String(error), 'Scene Explorer');
  }
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const placementPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let placementShape: string | null = null;
let previewMesh: THREE.Mesh | null = null;
let placementPosition = new THREE.Vector3(0, 0, 0);
let lastPointerPosition = new THREE.Vector2();
let placementJustCommitted = false;

function updateCursorAppearance(event: Pick<PointerEvent, 'clientX' | 'clientY' | 'target'>) {
  customCursor.style.left = `${event.clientX}px`;
  customCursor.style.top = `${event.clientY}px`;
  const target = event.target instanceof Element ? event.target : null;
  const insideViewport = Boolean(target && viewport.contains(target));
  const overButton = Boolean(target?.closest('button'));
  const pointEditLockedControl = pointEditObject !== null && Boolean(target?.closest('.point-edit-locked'));
  let hoveringLockedObject = false;

  if (insideViewport) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(objects, false)[0];
    hoveringLockedObject = hit?.object instanceof THREE.Mesh && isObjectLocked(hit.object);
  }

  const blocked = hoveringLockedObject || (placementShape !== null && !insideViewport) || pointEditLockedControl;
  const useHand = !blocked && (!insideViewport || overButton);
  const useEyedropper = !blocked && insideViewport && eyedropperEnabled;
  const usePropeller = !blocked && insideViewport && !useEyedropper && !overButton;
  customCursor.classList.toggle('hand-mode', useHand);
  customCursor.classList.toggle('blocked-mode', blocked);
  customCursor.classList.toggle('eyedropper-mode', useEyedropper);
  customCursor.classList.toggle('propeller-mode', usePropeller);
  customCursor.classList.toggle('button-pressed', useHand && isButtonPressed);
  customCursor.classList.toggle('spinning', usePropeller && isOrbitDragging);
}

function updateLightProperties(mesh: THREE.Mesh, light: EditableLight) {
  const proxyMaterial = mesh.material;
  if (!(proxyMaterial instanceof THREE.MeshBasicMaterial)) {
    throw new Error(`The display material for light "${mesh.name}" cannot be edited.`);
  }
  pointStatusElement = null;
  properties.classList.remove('properties-empty');
  properties.classList.add('properties-content');
  properties.replaceChildren();

  const form = document.createElement('div');
  form.className = 'properties-form';
  const nameLabel = document.createElement('label');
  nameLabel.className = 'property-field';
  nameLabel.textContent = 'Name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = mesh.name;
  nameInput.setAttribute('aria-label', 'Light name');
  nameInput.addEventListener('input', () => {
    mesh.name = nameInput.value;
    light.name = nameInput.value;
    const row = sceneContents.querySelector<HTMLElement>(`.scene-object-row[data-uuid="${mesh.uuid}"]`);
    const selectButton = row?.querySelector<HTMLButtonElement>('.scene-object');
    if (selectButton) selectButton.textContent = mesh.name || 'Light';
    updateObjectLockControls(mesh);
  });
  nameLabel.appendChild(nameInput);

  const makeNumberField = (
    labelText: string,
    value: number,
    min: number,
    max: number,
    step: number,
    apply: (nextValue: number) => void,
    withSlider = false,
  ) => {
    const label = document.createElement('label');
    label.className = 'property-field';
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.setAttribute('aria-label', labelText);
    let slider: HTMLInputElement | null = null;
    input.addEventListener('input', () => {
      if (input.value.trim() === '') return;
      const requested = Number(input.value);
      if (!Number.isFinite(requested)) return;
      const nextValue = THREE.MathUtils.clamp(requested, min, max);
      apply(nextValue);
      input.value = String(nextValue);
      if (slider) slider.value = String(nextValue);
    });
    label.appendChild(input);
    if (withSlider) {
      slider = document.createElement('input');
      slider.type = 'range';
      slider.min = String(min);
      slider.max = String(max);
      slider.step = String(step);
      slider.value = String(value);
      slider.className = 'light-intensity-slider';
      slider.setAttribute('aria-label', `${labelText} slider`);
      slider.addEventListener('input', () => {
        const nextValue = Number(slider!.value);
        input.value = String(nextValue);
        apply(nextValue);
      });
      label.appendChild(slider);
    }
    return label;
  };

  const makeToggleField = (labelText: string, checked: boolean, apply: (enabled: boolean) => void) => {
    const label = document.createElement('label');
    label.className = 'property-field light-toggle-field';
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.setAttribute('aria-label', labelText);
    input.addEventListener('change', () => apply(input.checked));
    label.appendChild(input);
    return label;
  };

  const colorSection = document.createElement('section');
  colorSection.className = 'property-section';
  const colorToggle = document.createElement('button');
  colorToggle.className = 'property-section-toggle';
  colorToggle.type = 'button';
  colorToggle.setAttribute('aria-expanded', 'true');
  colorToggle.innerHTML = '<span class="section-chevron">⌄</span><span>Light Color</span>';
  const colorDetails = document.createElement('div');
  colorDetails.className = 'chromatics-details';
  colorToggle.addEventListener('click', () => {
    const expanded = colorToggle.getAttribute('aria-expanded') === 'true';
    colorToggle.setAttribute('aria-expanded', String(!expanded));
    colorToggle.querySelector('.section-chevron')!.textContent = expanded ? '›' : '⌄';
    colorDetails.hidden = expanded;
  });

  const wheel = document.createElement('canvas');
  wheel.className = 'color-wheel';
  wheel.width = 144;
  wheel.height = 144;
  wheel.setAttribute('role', 'slider');
  wheel.setAttribute('aria-label', 'Light color wheel');
  wheel.setAttribute('tabindex', '0');
  drawColorWheel(wheel);
  const wheelSelector = document.createElement('span');
  wheelSelector.className = 'wheel-selector';
  const updateColor = () => {
    const hex = `#${light.color.getHexString()}`;
    hexInput.value = hex;
    wheelSelector.style.backgroundColor = hex;
    const hsl = { h: 0, s: 0, l: 0 };
    light.color.getHSL(hsl, THREE.SRGBColorSpace);
    const angle = hsl.h * Math.PI * 2;
    wheelSelector.style.left = `${50 + Math.cos(angle) * hsl.s * 50}%`;
    wheelSelector.style.top = `${50 - Math.sin(angle) * hsl.s * 50}%`;
    proxyMaterial.color.copy(light.color);
    const sun = sunSettings.get(mesh);
    const flareMaterial = sun?.flare.material;
    if (flareMaterial instanceof THREE.MeshBasicMaterial) flareMaterial.color.copy(light.color);
    const glowMaterial = sun?.glow.material;
    if (glowMaterial instanceof THREE.SpriteMaterial) glowMaterial.color.copy(light.color);
    paletteButtons.forEach((button, index) => {
      button.classList.toggle('selected', paletteColors[index] === hex);
    });
  };
  const setColorFromWheel = (event: PointerEvent) => {
    const bounds = wheel.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    const y = 1 - ((event.clientY - bounds.top) / bounds.height) * 2;
    const saturation = Math.min(1, Math.hypot(x, y));
    const hue = (Math.atan2(y, x) / (Math.PI * 2) + 1) % 1;
    light.color.setHSL(hue, saturation, 0.5, THREE.SRGBColorSpace);
    updateColor();
  };
  wheel.addEventListener('pointerdown', (event) => {
    wheel.setPointerCapture(event.pointerId);
    setColorFromWheel(event);
  });
  wheel.addEventListener('pointermove', (event) => {
    if (event.buttons & 1) setColorFromWheel(event);
  });
  const wheelRow = document.createElement('div');
  wheelRow.className = 'color-wheel-row';
  wheelRow.append(wheel, wheelSelector);

  const palette = document.createElement('div');
  palette.className = 'color-palette';
  palette.setAttribute('aria-label', '36 preset light colors');
  const paletteColors = Array.from({ length: 36 }, (_, index) =>
    `#${new THREE.Color().setHSL(index / 36, 0.72, 0.52, THREE.SRGBColorSpace).getHexString()}`);
  const paletteButtons: HTMLButtonElement[] = [];
  paletteColors.forEach((color) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'color-swatch';
    button.style.backgroundColor = color;
    button.setAttribute('aria-label', `Set light color ${color}`);
    button.addEventListener('click', () => {
      light.color.set(color);
      updateColor();
    });
    paletteButtons.push(button);
    palette.appendChild(button);
  });
  const hexLabel = document.createElement('label');
  hexLabel.className = 'property-field hex-field';
  hexLabel.textContent = 'HEX';
  const hexInput = document.createElement('input');
  hexInput.type = 'text';
  hexInput.className = 'hex-field-input';
  hexInput.maxLength = 7;
  hexInput.setAttribute('aria-label', 'Light color hex code');
  hexInput.addEventListener('change', () => {
    if (!/^#[0-9a-f]{6}$/i.test(hexInput.value)) {
      updateColor();
      return;
    }
    light.color.set(hexInput.value);
    updateColor();
  });
  hexLabel.appendChild(hexInput);
  colorDetails.append(wheelRow, palette, hexLabel);
  colorSection.append(colorToggle, colorDetails);

  const position = document.createElement('div');
  const rotation = document.createElement('div');
  const scale = document.createElement('div');
  position.className = 'transform-readout';
  rotation.className = 'transform-readout';
  scale.className = 'transform-readout';
  transformReadouts = { position, rotation, scale };
  const transformTarget = getMeshTransformTarget(mesh);
  position.textContent = `Position: ${transformTarget.position.x.toFixed(2)}, ${transformTarget.position.y.toFixed(2)}, ${transformTarget.position.z.toFixed(2)}`;
  rotation.textContent = `Rotation: ${THREE.MathUtils.radToDeg(transformTarget.rotation.x).toFixed(1)}°, ${THREE.MathUtils.radToDeg(transformTarget.rotation.y).toFixed(1)}°, ${THREE.MathUtils.radToDeg(transformTarget.rotation.z).toFixed(1)}°`;
  scale.textContent = `Scale: ${mesh.scale.x.toFixed(2)}, ${mesh.scale.y.toFixed(2)}, ${mesh.scale.z.toFixed(2)}`;

  const sun = sunSettings.get(mesh);
  const positionControls = document.createElement('section');
  positionControls.className = 'light-position-controls';
  const positionHeading = document.createElement('div');
  positionHeading.className = 'menu-heading';
  positionHeading.textContent = sun ? 'SUN POSITION' : 'POSITION';
  positionControls.appendChild(positionHeading);
  const positionInputs = new Map<'x' | 'y' | 'z', HTMLInputElement>();
  const updatePositionInputs = () => {
    for (const axis of ['x', 'y', 'z'] as const) {
      const input = positionInputs.get(axis);
      if (input) input.value = mesh.position[axis].toFixed(2);
    }
    position.textContent = `Position: ${mesh.position.x.toFixed(2)}, ${mesh.position.y.toFixed(2)}, ${mesh.position.z.toFixed(2)}`;
    if (light instanceof THREE.DirectionalLight) light.position.copy(mesh.position);
    updateAimedLight(mesh);
  };
  for (const axis of ['x', 'y', 'z'] as const) {
    const field = makeNumberField(`Position ${axis.toUpperCase()}`, mesh.position[axis], -100000, 100000, 0.1, (value) => {
      mesh.position[axis] = value;
      updatePositionInputs();
    });
    const input = field.querySelector<HTMLInputElement>('input');
    if (!input) throw new Error(`Position ${axis.toUpperCase()} field could not be created.`);
    positionInputs.set(axis, input);
    positionControls.appendChild(field);
  }

  if (sun) {
    const sunNote = document.createElement('div');
    sunNote.className = 'point-geometry-status';
    sunNote.textContent = 'The sun uses directional lighting, so its light reaches the whole scene regardless of the visible sun marker distance.';
    positionControls.appendChild(sunNote);
    positionControls.appendChild(
      makeNumberField('Sun size', sun.size, 0.25, 4, 0.05, (value) => {
        sun.size = value;
        updateSunSize(mesh, sun);
      }),
    );
    const locationHeading = document.createElement('div');
    locationHeading.className = 'menu-heading';
    locationHeading.textContent = 'SUN LOCATION & TIME';
    positionControls.appendChild(locationHeading);
    const updateSolarPosition = () => {
      if (!(light instanceof THREE.DirectionalLight)) {
        throw new Error(`Sun light "${mesh.name}" is not directional.`);
      }
      updateSunPosition(mesh, light, sun);
      updatePositionInputs();
    };
    positionControls.append(
      makeNumberField('Latitude (°)', sun.latitude, -90, 90, 0.1, (value) => {
        sun.latitude = value;
        updateSolarPosition();
      }),
      makeNumberField('Longitude (°)', sun.longitude, -180, 180, 0.1, (value) => {
        sun.longitude = value;
        updateSolarPosition();
      }),
      makeNumberField('Time of day (UTC)', sun.timeOfDay, 0, 24, 0.1, (value) => {
        sun.timeOfDay = value;
        updateSolarPosition();
      }),
      makeToggleField('Sun flare ring', sun.flare.visible, (enabled) => { sun.flare.visible = enabled; }),
      makeToggleField('Sun glow', sun.glow.visible, (enabled) => { sun.glow.visible = enabled; }),
    );
  }

  form.append(
    nameLabel,
    makeToggleField('Enabled', sceneLightEnabled.get(light) ?? light.visible, (enabled) => {
      sceneLightEnabled.set(light, enabled);
      light.visible = enabled;
      updateLightHierarchyIcon(mesh, enabled);
      updateAimedLight(mesh);
    }),
    makeNumberField(
      light instanceof THREE.DirectionalLight ? 'Brightness (lux)' : 'Brightness (cd)',
      light.intensity,
      0,
      9999,
      1,
      (value) => { light.intensity = value; },
      true,
    ),
    colorSection,
  );
  if (light instanceof THREE.PointLight || light instanceof THREE.SpotLight) {
    form.append(makeNumberField('Range', light.distance, 0, 1000, 0.1, (value) => {
      light.distance = value;
      updateAimedLight(mesh);
    }));
  } else {
    const rangeNote = document.createElement('div');
    rangeNote.className = 'point-geometry-status';
    rangeNote.textContent = 'Directional light has no range.';
    form.appendChild(rangeNote);
  }
  if (lightTypeByMesh.get(mesh) === 'point') {
    const directionNote = document.createElement('div');
    directionNote.className = 'point-geometry-status';
    directionNote.textContent = 'This point light uses a focused beam. Rotate it with the gizmo; the arrow shows the beam direction.';
    form.appendChild(directionNote);
  } else if (light instanceof THREE.SpotLight) {
    const directionNote = document.createElement('div');
    directionNote.className = 'point-geometry-status';
    directionNote.textContent = 'Rotate the light with the gizmo; the arrow shows the spotlight beam direction.';
    form.appendChild(directionNote);
  }
  form.append(
    makeToggleField('Cast Shadow', light.castShadow, (enabled) => { light.castShadow = enabled; }),
    positionControls,
    position,
    rotation,
    scale,
  );
  updateColor();
  properties.appendChild(form);
}

function updateWorldSkyboxProperties(mesh: THREE.Mesh) {
  properties.classList.remove('properties-empty');
  properties.classList.add('properties-content');
  properties.replaceChildren();
  const form = createWorldSkyboxProperties(
    mesh,
    (name) => {
      mesh.name = name;
      const row = hierarchyRows.get(mesh);
      const button = row?.querySelector<HTMLButtonElement>('.scene-object');
      if (button) button.textContent = name || 'World Skybox';
    },
    (message) => addDebugEntry(message, 'World Skybox'),
  );
  properties.appendChild(form);
}

function updateJoinedModelProperties(mesh: THREE.Mesh) {
  const material = mesh.material;
  if (!(material instanceof THREE.MeshStandardMaterial)) {
    throw new Error(`The material for joined model "${mesh.name}" cannot be edited.`);
  }
  properties.classList.remove('properties-empty');
  properties.classList.add('properties-content');
  properties.replaceChildren();
  const form = document.createElement('div');
  form.className = 'properties-form';
  const nameLabel = document.createElement('label');
  nameLabel.className = 'property-field';
  nameLabel.textContent = 'Name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = mesh.name;
  nameInput.setAttribute('aria-label', 'Object name');
  nameInput.addEventListener('input', () => {
    mesh.name = nameInput.value;
    const row = hierarchyRows.get(mesh);
    const button = row?.querySelector<HTMLButtonElement>('.scene-object');
    if (button) button.textContent = mesh.name || 'Model';
  });
  nameLabel.appendChild(nameInput);

  const chromatics = document.createElement('section');
  chromatics.className = 'property-section';
  const heading = document.createElement('h3');
  heading.className = 'joined-model-heading';
  heading.textContent = 'Chromatics';
  const colorLabel = document.createElement('label');
  colorLabel.className = 'property-field';
  colorLabel.textContent = 'Color';
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = `#${material.color.getHexString()}`;
  colorInput.setAttribute('aria-label', 'Model color');
  colorInput.addEventListener('input', () => material.color.set(colorInput.value));
  colorLabel.appendChild(colorInput);
  const makeMaterialSetting = (labelText: string, key: 'roughness' | 'metalness') => {
    const label = document.createElement('label');
    label.className = 'property-field';
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '1';
    input.step = '0.01';
    input.value = String(material[key]);
    input.setAttribute('aria-label', labelText);
    input.addEventListener('input', () => { material[key] = Number(input.value); });
    label.appendChild(input);
    return label;
  };
  chromatics.append(heading, colorLabel, makeMaterialSetting('Roughness', 'roughness'), makeMaterialSetting('Metalness', 'metalness'));
  const position = document.createElement('div');
  const rotation = document.createElement('div');
  const scale = document.createElement('div');
  position.className = 'transform-readout';
  rotation.className = 'transform-readout';
  scale.className = 'transform-readout';
  transformReadouts = { position, rotation, scale };
  const transformTarget = getMeshTransformTarget(mesh);
  position.textContent = `Position: ${transformTarget.position.x.toFixed(2)}, ${transformTarget.position.y.toFixed(2)}, ${transformTarget.position.z.toFixed(2)}`;
  rotation.textContent = `Rotation: ${THREE.MathUtils.radToDeg(transformTarget.rotation.x).toFixed(1)}°, ${THREE.MathUtils.radToDeg(transformTarget.rotation.y).toFixed(1)}°, ${THREE.MathUtils.radToDeg(transformTarget.rotation.z).toFixed(1)}°`;
  scale.textContent = `Scale: ${mesh.scale.x.toFixed(2)}, ${mesh.scale.y.toFixed(2)}, ${mesh.scale.z.toFixed(2)}`;
  form.append(nameLabel, chromatics, position, rotation, scale);
  properties.appendChild(form);
}

function updateMultiObjectProperties() {
  const eligibleObjects = selectedObjects.filter((mesh) =>
    objectShapes.has(mesh) && mesh.material instanceof THREE.MeshStandardMaterial,
  );
  properties.classList.remove('properties-empty');
  properties.classList.add('properties-content');
  properties.replaceChildren();
  transformReadouts = null;
  const form = document.createElement('div');
  form.className = 'properties-form multi-properties-form';
  const summary = document.createElement('div');
  summary.className = 'multi-selection-summary';
  summary.textContent = `${selectedObjects.length} blocks selected`;
  form.appendChild(summary);
  if (eligibleObjects.length !== selectedObjects.length || eligibleObjects.length === 0) {
    const notice = document.createElement('div');
    notice.className = 'point-geometry-status';
    notice.textContent = 'Shared Model and Chromatics controls are available when only blocks are selected.';
    form.appendChild(notice);
    properties.appendChild(form);
    return;
  }

  const makeSection = (title: string) => {
    const expanded = title === 'Model' ? autoOpenModel.checked : autoOpenChromatics.checked;
    const section = document.createElement('section');
    section.className = 'property-section';
    const toggle = document.createElement('button');
    toggle.className = 'property-section-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.innerHTML = `<span class="section-chevron">${expanded ? '⌄' : '›'}</span><span>${title}</span>`;
    const details = document.createElement('div');
    details.className = title === 'Chromatics' ? 'chromatics-details' : 'model-details';
    details.hidden = !expanded;
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      toggle.querySelector('.section-chevron')!.textContent = expanded ? '›' : '⌄';
      details.hidden = expanded;
    });
    section.append(toggle, details);
    form.appendChild(section);
    return details;
  };

  const modelDetails = makeSection('Model');
  const smoothShadingLabel = document.createElement('label');
  smoothShadingLabel.className = 'property-field smooth-shading-field';
  smoothShadingLabel.textContent = 'Smooth shading';
  const smoothShadingInput = document.createElement('input');
  smoothShadingInput.type = 'checkbox';
  smoothShadingInput.checked = smoothShadingByMesh.get(eligibleObjects[0]) ?? true;
  smoothShadingInput.setAttribute('aria-label', 'Apply smooth shading to selected blocks');
  smoothShadingInput.addEventListener('change', () => {
    eligibleObjects.forEach((mesh) => {
      smoothShadingByMesh.set(mesh, smoothShadingInput.checked);
      computeGeometryNormals(mesh.geometry, smoothShadingInput.checked);
      const displayMode = objectDisplayModes.get(mesh);
      if (displayMode) setObjectDisplayMode(mesh, displayMode);
    });
  });
  smoothShadingLabel.appendChild(smoothShadingInput);
  modelDetails.appendChild(smoothShadingLabel);
  const topologyLabel = document.createElement('label');
  topologyLabel.className = 'property-field topology-field';
  topologyLabel.textContent = 'Faces (apply to all)';
  const topologyInput = document.createElement('input');
  topologyInput.type = 'number';
  topologyInput.min = '4';
  topologyInput.max = '10000';
  topologyInput.step = '1';
  topologyInput.value = String(Math.round(
    eligibleObjects[0].geometry.getAttribute('position').count / 3,
  ));
  topologyInput.setAttribute('aria-label', 'Apply face count to selected blocks');
  topologyLabel.appendChild(topologyInput);
  const topologyStatus = document.createElement('div');
  topologyStatus.className = 'topology-update-status';
  topologyInput.addEventListener('change', () => {
    const requestedFaces = Number(topologyInput.value);
    if (!Number.isFinite(requestedFaces)) {
      topologyInput.value = String(Math.round(eligibleObjects[0].geometry.getAttribute('position').count / 3));
      return;
    }
    let pendingUpdates = 0;
    eligibleObjects.forEach((mesh) => {
      const shape = objectShapes.get(mesh);
      if (!shape) throw new Error(`The shape type for "${mesh.name}" was not found.`);
      const definition = shapeDefinitions[shape];
      const faceCount = THREE.MathUtils.clamp(
        Math.floor(requestedFaces),
        definition.minimumTriangles,
        10000,
      );
      if (faceCount === mesh.geometry.getAttribute('position').count / 3) return;
      const pendingTimer = topologyUpdateTimers.get(mesh);
      if (pendingTimer !== undefined) window.clearTimeout(pendingTimer);
      pendingUpdates += 1;
    });
    if (pendingUpdates === 0) {
      topologyStatus.textContent = '';
      return;
    }
    topologyStatus.textContent = 'Applying topology in 1.5 seconds…';
    if (!topologyStatus.isConnected) modelDetails.appendChild(topologyStatus);
    let completedUpdates = 0;
    eligibleObjects.forEach((mesh) => {
      const shape = objectShapes.get(mesh);
      if (!shape) throw new Error(`The shape type for "${mesh.name}" was not found.`);
      const definition = shapeDefinitions[shape];
      const faceCount = THREE.MathUtils.clamp(
        Math.floor(requestedFaces),
        definition.minimumTriangles,
        10000,
      );
      if (faceCount === mesh.geometry.getAttribute('position').count / 3) return;
      const timer = window.setTimeout(() => {
        const previousGeometry = mesh.geometry;
        const nextGeometry = createTriangleGeometry(shape, faceCount);
        const pointData = pointGeometryPoints.get(mesh);
        if (pointData) {
          const basePoints = pointGeometryBasePoints.get(mesh);
          if (!basePoints) throw new Error(`Base point geometry for "${mesh.name}" is missing.`);
          const position = nextGeometry.getAttribute('position');
          if (!(position instanceof THREE.BufferAttribute)) {
            throw new Error(`Geometry positions for "${mesh.name}" cannot be edited.`);
          }
          nextGeometry.computeBoundingBox();
          const bounds = nextGeometry.boundingBox;
          if (!bounds) throw new Error(`Geometry bounds for "${mesh.name}" could not be calculated.`);
          applyPointDeformationToGeometry(
            nextGeometry,
            Float32Array.from(position.array),
            basePoints,
            pointData,
            Math.max(bounds.getSize(new THREE.Vector3()).length() * 0.18, 0.1),
            smoothShadingByMesh.get(mesh) ?? true,
          );
        } else {
          computeGeometryNormals(nextGeometry, smoothShadingByMesh.get(mesh) ?? true);
        }
        mesh.geometry = nextGeometry;
        const displayMode = objectDisplayModes.get(mesh);
        if (displayMode) setObjectDisplayMode(mesh, displayMode);
        previousGeometry.dispose();
        topologyUpdateTimers.delete(mesh);
        completedUpdates += 1;
        if (completedUpdates === pendingUpdates) {
          topologyStatus.textContent = 'Topology updated.';
          updateSelectionHighlights();
        }
      }, 1500);
      topologyUpdateTimers.set(mesh, timer);
    });
  });
  modelDetails.append(topologyLabel, topologyStatus);
  const displayControls = document.createElement('div');
  displayControls.className = 'multi-display-controls';
  (['wireframe', 'faces'] as const).forEach((mode) => {
    const label = mode === 'wireframe' ? 'Wireframe' : 'Triangle outlines';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    const active = eligibleObjects.every((mesh) => objectDisplayModes.get(mesh) === mode);
    button.setAttribute('aria-pressed', String(active));
    button.addEventListener('click', () => {
      const enable = !eligibleObjects.every((mesh) => objectDisplayModes.get(mesh) === mode);
      eligibleObjects.forEach((mesh) => setObjectDisplayMode(mesh, enable ? mode : null));
      button.setAttribute('aria-pressed', String(enable));
    });
    displayControls.appendChild(button);
  });
  modelDetails.appendChild(displayControls);

  const chromaticsDetails = makeSection('Chromatics');
  const colorLabel = document.createElement('label');
  colorLabel.className = 'property-field';
  colorLabel.textContent = 'Apply color to all selected blocks';
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  const firstMaterial = eligibleObjects[0].material as THREE.MeshStandardMaterial;
  colorInput.value = `#${firstMaterial.color.getHexString()}`;
  colorInput.setAttribute('aria-label', 'Apply color to selected blocks');
  colorInput.addEventListener('input', () => {
    eligibleObjects.forEach((mesh) => {
      if (mesh.material instanceof THREE.MeshStandardMaterial) mesh.material.color.set(colorInput.value);
    });
  });
  colorLabel.appendChild(colorInput);
  chromaticsDetails.appendChild(colorLabel);

  const materialPresets = {
    Rubber: { roughness: 0.92, metalness: 0, transparent: false, opacity: 1 },
    Concrete: { roughness: 1, metalness: 0, transparent: false, opacity: 1 },
    Glass: { roughness: 0.08, metalness: 0, transparent: true, opacity: 0.35 },
  } as const;
  const materialLabel = document.createElement('label');
  materialLabel.className = 'material-field';
  materialLabel.textContent = 'Material';
  const materialSelect = document.createElement('select');
  materialSelect.setAttribute('aria-label', 'Apply material to selected blocks');
  (Object.keys(materialPresets) as Array<keyof typeof materialPresets>).forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    materialSelect.appendChild(option);
  });
  materialSelect.addEventListener('change', () => {
    const preset = materialPresets[materialSelect.value as keyof typeof materialPresets];
    if (!preset) return;
    eligibleObjects.forEach((mesh) => {
      if (!(mesh.material instanceof THREE.MeshStandardMaterial)) return;
      objectMaterialPresets.set(mesh, materialSelect.value as MaterialPreset);
      mesh.material.roughness = preset.roughness;
      mesh.material.metalness = preset.metalness;
      mesh.material.transparent = preset.transparent;
      mesh.material.opacity = preset.opacity;
      mesh.material.depthWrite = !preset.transparent;
      mesh.material.needsUpdate = true;
    });
  });
  materialLabel.appendChild(materialSelect);
  const makeSharedMaterialControl = (name: 'Roughness' | 'Metalness', key: 'roughness' | 'metalness') => {
    const label = document.createElement('label');
    label.className = 'property-field';
    label.textContent = name;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '1';
    input.step = '0.01';
    input.value = String(firstMaterial[key]);
    input.setAttribute('aria-label', `Apply ${name.toLowerCase()} to selected blocks`);
    input.addEventListener('input', () => {
      eligibleObjects.forEach((mesh) => {
        if (mesh.material instanceof THREE.MeshStandardMaterial) {
          mesh.material[key] = Number(input.value);
        }
      });
    });
    label.appendChild(input);
    return label;
  };
  chromaticsDetails.append(
    materialLabel,
    makeSharedMaterialControl('Roughness', 'roughness'),
    makeSharedMaterialControl('Metalness', 'metalness'),
  );
  properties.appendChild(form);
}

function updateProperties(mesh: THREE.Mesh) {
  pointStatusElement = null;
  if (selectedObjects.length > 1) {
    updateMultiObjectProperties();
    return;
  }
  const light = sceneLights.get(mesh);
  if (light) {
    updateLightProperties(mesh, light);
    return;
  }
  if (isWorldSkybox(mesh)) {
    updateWorldSkyboxProperties(mesh);
    return;
  }
  if (joinedModels.has(mesh)) {
    updateJoinedModelProperties(mesh);
    return;
  }
  if (selectedPointObject === mesh) {
    updatePointGeometryProperties(mesh);
    return;
  }
  properties.classList.remove('properties-empty');
  properties.classList.add('properties-content');
  properties.replaceChildren();

  const form = document.createElement('div');
  form.className = 'properties-form';
  const nameLabel = document.createElement('label');
  nameLabel.className = 'property-field';
  nameLabel.textContent = 'Name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = mesh.name;
  nameInput.setAttribute('aria-label', 'Object name');
  nameInput.addEventListener('input', () => {
    mesh.name = nameInput.value;
    sceneContents.querySelectorAll<HTMLElement>('.scene-object-row').forEach((row) => {
      if (row.dataset.uuid === mesh.uuid) {
        const selectButton = row.querySelector<HTMLButtonElement>('.scene-object');
        if (selectButton) selectButton.textContent = mesh.name || 'Object';
      }
    });
    updateObjectLockControls(mesh);
  });
  nameLabel.appendChild(nameInput);

  const shape = objectShapes.get(mesh);
  if (!shape) throw new Error(`The shape type for "${mesh.name}" was not found.`);
  const definition = shapeDefinitions[shape];
  const modelSection = document.createElement('section');
  modelSection.className = 'property-section';
  const modelToggle = document.createElement('button');
  modelToggle.className = 'property-section-toggle';
  modelToggle.type = 'button';
  modelToggle.setAttribute('aria-expanded', String(autoOpenModel.checked));
  modelToggle.innerHTML = `<span class="section-chevron">${autoOpenModel.checked ? '⌄' : '›'}</span><span>Model</span>`;
  const modelDetails = document.createElement('div');
  modelDetails.className = 'model-details';
  modelDetails.hidden = !autoOpenModel.checked;
  const smoothShadingLabel = document.createElement('label');
  smoothShadingLabel.className = 'property-field smooth-shading-field';
  smoothShadingLabel.textContent = 'Smooth shading';
  const smoothShadingInput = document.createElement('input');
  smoothShadingInput.type = 'checkbox';
  smoothShadingInput.checked = smoothShadingByMesh.get(mesh) ?? true;
  smoothShadingInput.setAttribute('aria-label', 'Smooth shading');
  smoothShadingInput.addEventListener('change', () => {
    smoothShadingByMesh.set(mesh, smoothShadingInput.checked);
    computeGeometryNormals(mesh.geometry, smoothShadingInput.checked);
    const displayMode = objectDisplayModes.get(mesh);
    if (displayMode) setObjectDisplayMode(mesh, displayMode);
  });
  smoothShadingLabel.appendChild(smoothShadingInput);
  modelDetails.appendChild(smoothShadingLabel);
  const topologyStatus = document.createElement('div');
  topologyStatus.className = 'topology-update-status';
  modelToggle.addEventListener('click', () => {
    const expanded = modelToggle.getAttribute('aria-expanded') === 'true';
    modelToggle.setAttribute('aria-expanded', String(!expanded));
    modelToggle.querySelector('.section-chevron')!.textContent = expanded ? '›' : '⌄';
    modelDetails.hidden = expanded;
  });
  const faceCount = mesh.geometry.getAttribute('position').count / 3;
  const isTorus = shape === 'Torus';
  const topology = {
    edges: Math.round(faceCount * 1.5),
    vertices: Math.round(faceCount / 2 + (isTorus ? 0 : 2)),
    faces: faceCount,
  };
  const topologyInputs = new Map<keyof typeof topology, HTMLInputElement>();
  const topologyLimits = {
    edges: { min: Math.ceil(definition.minimumTriangles * 1.5), max: 15000 },
    vertices: { min: Math.ceil(definition.minimumTriangles / 2 + (isTorus ? 0 : 2)), max: isTorus ? 5000 : 5002 },
    faces: { min: definition.minimumTriangles, max: 10000 },
  };
  const setFaceCount = (requested: number) => {
    const nextFaceCount = THREE.MathUtils.clamp(
      Math.floor(requested),
      definition.minimumTriangles,
      10000,
    );
    const pendingTimer = topologyUpdateTimers.get(mesh);
    if (pendingTimer !== undefined) {
      window.clearTimeout(pendingTimer);
      topologyUpdateTimers.delete(mesh);
    }
    const currentFaceCount = mesh.geometry.getAttribute('position').count / 3;
    if (nextFaceCount !== currentFaceCount) {
      topologyStatus.textContent = 'Applying topology in 1.5 seconds…';
      if (!topologyStatus.isConnected) modelDetails.appendChild(topologyStatus);
      const timer = window.setTimeout(() => {
        const pointData = pointGeometryPoints.get(mesh);
        const previousGeometry = mesh.geometry;
        mesh.geometry = createTriangleGeometry(shape, nextFaceCount);
        if (pointData) {
          const basePoints = pointGeometryBasePoints.get(mesh);
          if (!basePoints) throw new Error(`Base point geometry for "${mesh.name}" is missing.`);
          const position = mesh.geometry.getAttribute('position');
          if (!(position instanceof THREE.BufferAttribute)) {
            throw new Error(`Geometry positions for "${mesh.name}" cannot be edited.`);
          }
          mesh.geometry.computeBoundingBox();
          const bounds = mesh.geometry.boundingBox;
          if (!bounds) throw new Error(`Geometry bounds for "${mesh.name}" could not be calculated.`);
          applyPointDeformationToGeometry(
            mesh.geometry,
            Float32Array.from(position.array),
            basePoints,
            pointData,
            Math.max(bounds.getSize(new THREE.Vector3()).length() * 0.18, 0.1),
            smoothShadingByMesh.get(mesh) ?? true,
          );
        } else {
          computeGeometryNormals(mesh.geometry, smoothShadingByMesh.get(mesh) ?? true);
        }
        const displayMode = objectDisplayModes.get(mesh);
        if (displayMode) setObjectDisplayMode(mesh, displayMode);
        previousGeometry.dispose();
        const updatedFaceCount = mesh.geometry.getAttribute('position').count / 3;
        topology.edges = Math.round(updatedFaceCount * 1.5);
        topology.vertices = Math.round(updatedFaceCount / 2 + (isTorus ? 0 : 2));
        topology.faces = updatedFaceCount;
        for (const [key, input] of topologyInputs) input.value = String(topology[key]);
        topologyStatus.textContent = 'Topology updated.';
        selectionHighlight.update();
        topologyUpdateTimers.delete(mesh);
      }, 1500);
      topologyUpdateTimers.set(mesh, timer);
    } else {
      topologyStatus.textContent = '';
    }
    topology.faces = nextFaceCount;
    topology.edges = Math.round(nextFaceCount * 1.5);
    topology.vertices = Math.round(nextFaceCount / 2 + (isTorus ? 0 : 2));
    for (const [key, input] of topologyInputs) {
      input.value = String(topology[key]);
    }
    selectionHighlight.update();
  };
  (Object.keys(topology) as Array<keyof typeof topology>).forEach((key) => {
    const label = document.createElement('label');
    label.className = 'property-field topology-field';
    label.textContent = key[0].toUpperCase() + key.slice(1);
    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(topologyLimits[key].min);
    input.max = String(topologyLimits[key].max);
    input.step = '1';
    input.value = String(topology[key]);
    input.setAttribute('aria-label', key[0].toUpperCase() + key.slice(1));
    input.addEventListener('change', () => {
      const requested = Number(input.value);
      if (!Number.isFinite(requested)) {
        input.value = String(topology[key]);
        return;
      }
      const bounded = THREE.MathUtils.clamp(
        Math.floor(requested),
        topologyLimits[key].min,
        topologyLimits[key].max,
      );
      const requestedFaces = key === 'faces'
        ? bounded
        : key === 'edges'
          ? Math.round(bounded * 2 / 3)
          : Math.round((bounded - (isTorus ? 0 : 2)) * 2);
      setFaceCount(requestedFaces);
    });
    topologyInputs.set(key, input);
    label.appendChild(input);
    modelDetails.appendChild(label);
  });
  modelSection.append(modelToggle, modelDetails);

  const meshMaterial = mesh.material;
  if (!(meshMaterial instanceof THREE.MeshStandardMaterial)) {
    throw new Error(`The material for "${mesh.name}" cannot be edited in Properties.`);
  }
  const material = meshMaterial;
  const chromaticsSection = document.createElement('section');
  chromaticsSection.className = 'property-section';
  const chromaticsToggle = document.createElement('button');
  chromaticsToggle.className = 'property-section-toggle';
  chromaticsToggle.type = 'button';
  chromaticsToggle.setAttribute('aria-expanded', String(autoOpenChromatics.checked));
  chromaticsToggle.innerHTML = `<span class="section-chevron">${autoOpenChromatics.checked ? '⌄' : '›'}</span><span>Chromatics</span>`;
  const chromaticsDetails = document.createElement('div');
  chromaticsDetails.className = 'chromatics-details';
  chromaticsDetails.hidden = !autoOpenChromatics.checked;
  const applyColorToAllLabel = document.createElement('label');
  applyColorToAllLabel.className = 'apply-color-to-all';
  const applyColorToAll = document.createElement('input');
  applyColorToAll.type = 'checkbox';
  applyColorToAll.setAttribute('aria-label', 'Apply color to all child blocks');
  applyColorToAllLabel.append(applyColorToAll, document.createTextNode('Apply to all blocks'));
  applyColorToAllLabel.hidden = getChildMeshes(mesh).length === 0;
  applyColorToAll.addEventListener('change', () => {
    if (applyColorToAll.checked) {
      getChildMeshes(mesh).forEach((child) => {
        if (child.material instanceof THREE.MeshStandardMaterial) child.material.color.copy(material.color);
      });
    }
  });
  chromaticsToggle.addEventListener('click', () => {
    const expanded = chromaticsToggle.getAttribute('aria-expanded') === 'true';
    chromaticsToggle.setAttribute('aria-expanded', String(!expanded));
    chromaticsToggle.querySelector('.section-chevron')!.textContent = expanded ? '›' : '⌄';
    chromaticsDetails.hidden = expanded;
  });
  const wheel = document.createElement('canvas');
  wheel.className = 'color-wheel';
  wheel.width = 144;
  wheel.height = 144;
  wheel.setAttribute('role', 'slider');
  wheel.setAttribute('aria-label', 'Color wheel');
  wheel.setAttribute('tabindex', '0');
  drawColorWheel(wheel);
  const wheelSelector = document.createElement('span');
  wheelSelector.className = 'wheel-selector';
  const updateWheelSelector = () => {
    const hsl = { h: 0, s: 0, l: 0 };
    material.color.getHSL(hsl, THREE.SRGBColorSpace);
    const angle = hsl.h * Math.PI * 2;
    const distance = hsl.s * 50;
    wheelSelector.style.left = `${50 + Math.cos(angle) * distance}%`;
    wheelSelector.style.top = `${50 - Math.sin(angle) * distance}%`;
  };
  const updateColorFromWheel = (event: PointerEvent) => {
    const bounds = wheel.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    const y = 1 - ((event.clientY - bounds.top) / bounds.height) * 2;
    const saturation = Math.min(1, Math.hypot(x, y));
    const hue = (Math.atan2(y, x) / (Math.PI * 2) + 1) % 1;
    material.color.setHSL(hue, saturation, 0.5, THREE.SRGBColorSpace);
    updateColorControls();
  };
  wheel.addEventListener('pointerdown', (event) => {
    wheel.setPointerCapture(event.pointerId);
    updateColorFromWheel(event);
  });
  wheel.addEventListener('pointermove', (event) => {
    if (event.buttons & 1) updateColorFromWheel(event);
  });
  wheel.addEventListener('pointerup', () => {
    recordRecentColor(material.color);
    renderRecentColors();
  });
  const palette = document.createElement('div');
  palette.className = 'color-palette';
  palette.setAttribute('aria-label', '36 preset colors');
  const paletteColors = Array.from({ length: 36 }, (_, index) => {
    const hue = index / 36;
    return `#${new THREE.Color().setHSL(hue, 0.72, 0.52, THREE.SRGBColorSpace).getHexString()}`;
  });
  const paletteButtons: HTMLButtonElement[] = [];
  paletteColors.forEach((color) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = color;
    swatch.setAttribute('aria-label', `Set object color ${color}`);
    swatch.addEventListener('click', () => {
      material.color.set(color);
      updateColorControls();
      recordRecentColor(material.color);
      renderRecentColors();
    });
    paletteButtons.push(swatch);
    palette.appendChild(swatch);
  });
  function updatePaletteSelection() {
    const selectedColor = `#${material.color.getHexString()}`;
    paletteButtons.forEach((swatch, index) => {
      swatch.classList.toggle('selected', paletteColors[index] === selectedColor);
    });
  }
  const wheelRow = document.createElement('div');
  wheelRow.className = 'color-wheel-row';
  wheelRow.append(wheel, wheelSelector);

  const hexInput = document.createElement('input');
  hexInput.type = 'text';
  hexInput.className = 'hex-field-input';
  hexInput.maxLength = 7;
  hexInput.value = `#${material.color.getHexString()}`;
  hexInput.setAttribute('aria-label', 'Hex color');
  hexInput.addEventListener('change', () => {
    if (!/^#[0-9a-f]{6}$/i.test(hexInput.value)) {
      hexInput.value = `#${material.color.getHexString()}`;
      return;
    }
    material.color.set(hexInput.value);
    updateColorControls();
    recordRecentColor(material.color);
    renderRecentColors();
  });

  const rgb = new THREE.Color();
  const channelInputs = new Map<string, HTMLInputElement>();
  const colorValues = document.createElement('div');
  colorValues.className = 'color-values';
  const addChannelHeading = (heading: string) => {
    const title = document.createElement('span');
    title.className = 'channel-group-heading';
    title.textContent = heading;
    colorValues.appendChild(title);
  };
  const makeChannelInput = (labelText: string, key: string, max: number, className = '') => {
    const label = document.createElement('label');
    label.className = `property-field ${className}`.trim();
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = String(max);
    input.step = '1';
    input.setAttribute('aria-label', labelText);
    input.addEventListener('change', () => {
      const value = THREE.MathUtils.clamp(Number(input.value) || 0, 0, max);
      if (key.startsWith('rgb')) {
        material.color.getRGB(rgb, THREE.SRGBColorSpace);
        if (key === 'rgbR') rgb.r = value / 255;
        if (key === 'rgbG') rgb.g = value / 255;
        if (key === 'rgbB') rgb.b = value / 255;
        material.color.setRGB(rgb.r, rgb.g, rgb.b, THREE.SRGBColorSpace);
      } else {
        material.color.getRGB(rgb, THREE.SRGBColorSpace);
        const currentHsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        const hue = key === 'hsvH' ? value / 360 : currentHsv.h;
        const saturation = key === 'hsvS' ? value / 100 : currentHsv.s;
        const brightness = key === 'hsvV' ? value / 100 : currentHsv.v;
        const converted = hsvToRgb(hue, saturation, brightness);
        material.color.setRGB(converted.r, converted.g, converted.b, THREE.SRGBColorSpace);
      }
      updateColorControls();
      recordRecentColor(material.color);
      renderRecentColors();
    });
    channelInputs.set(key, input);
    label.appendChild(input);
    colorValues.appendChild(label);
  };
  addChannelHeading('RGB');
  makeChannelInput('R', 'rgbR', 255);
  makeChannelInput('G', 'rgbG', 255);
  makeChannelInput('B', 'rgbB', 255);
  addChannelHeading('HSV');
  makeChannelInput('H', 'hsvH', 360);
  makeChannelInput('S', 'hsvS', 100);
  makeChannelInput('V', 'hsvV', 100);
  const hexLabel = document.createElement('label');
  hexLabel.className = 'property-field hex-field';
  hexLabel.textContent = 'HEX';
  hexLabel.appendChild(hexInput);
  colorValues.appendChild(hexLabel);

  const recentRow = document.createElement('div');
  recentRow.className = 'recent-colors';
  const recentLabel = document.createElement('span');
  recentLabel.className = 'recent-colors-label';
  recentLabel.textContent = 'Recent';
  const renderRecentColors = () => {
    recentRow.replaceChildren(recentLabel);
    recentColors.forEach((recentColor) => {
      const recentButton = document.createElement('button');
      recentButton.type = 'button';
      recentButton.className = 'recent-color';
      recentButton.style.backgroundColor = recentColor;
      recentButton.title = recentColor;
      recentButton.setAttribute('aria-label', `Use recent color ${recentColor}`);
      recentButton.addEventListener('click', () => {
        material.color.set(recentColor);
        updateColorControls();
        recordRecentColor(material.color);
        renderRecentColors();
      });
      recentRow.appendChild(recentButton);
    });
  };
  function updateColorControls() {
    if (applyColorToAll.checked) {
      getChildMeshes(mesh).forEach((child) => {
        if (child.material instanceof THREE.MeshStandardMaterial) child.material.color.copy(material.color);
      });
    }
    const hex = `#${material.color.getHexString()}`;
    hexInput.value = hex;
    material.color.getRGB(rgb, THREE.SRGBColorSpace);
    const currentHsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    channelInputs.get('rgbR')!.value = String(Math.round(rgb.r * 255));
    channelInputs.get('rgbG')!.value = String(Math.round(rgb.g * 255));
    channelInputs.get('rgbB')!.value = String(Math.round(rgb.b * 255));
    channelInputs.get('hsvH')!.value = String(Math.round(currentHsv.h * 360) % 360);
    channelInputs.get('hsvS')!.value = String(Math.round(currentHsv.s * 100));
    channelInputs.get('hsvV')!.value = String(Math.round(currentHsv.v * 100));
    wheelSelector.style.backgroundColor = hex;
    updateWheelSelector();
    updatePaletteSelection();
    if (eyedropperEnabled && selectedObject === mesh) {
      selectionHighlightMaterial.color.copy(getObjectHighlightColor(mesh));
    }
  }
  const materialLabel = document.createElement('label');
  materialLabel.className = 'material-field';
  materialLabel.textContent = 'Material';
  const materialSelect = document.createElement('select');
  materialSelect.setAttribute('aria-label', 'Material type');
  const materialPresets = {
    Rubber: { roughness: 0.92, metalness: 0, transparent: false, opacity: 1 },
    Concrete: { roughness: 1, metalness: 0, transparent: false, opacity: 1 },
    Glass: { roughness: 0.08, metalness: 0, transparent: true, opacity: 0.35 },
  } as const;
  (Object.keys(materialPresets) as Array<keyof typeof materialPresets>).forEach((presetName) => {
    const option = document.createElement('option');
    option.value = presetName;
    option.textContent = presetName;
    materialSelect.appendChild(option);
  });
  materialSelect.value = objectMaterialPresets.get(mesh) ?? 'Rubber';
  materialSelect.addEventListener('change', () => {
    const preset = materialPresets[materialSelect.value as keyof typeof materialPresets];
    if (!preset) return;
    objectMaterialPresets.set(mesh, materialSelect.value as MaterialPreset);
    material.roughness = preset.roughness;
    material.metalness = preset.metalness;
    material.transparent = preset.transparent;
    material.opacity = preset.opacity;
    material.depthWrite = !preset.transparent;
    material.needsUpdate = true;
  });
  materialLabel.appendChild(materialSelect);

  chromaticsDetails.append(applyColorToAllLabel, wheelRow, palette, colorValues, recentRow, materialLabel);
  updateColorControls();
  renderRecentColors();
  chromaticsSection.append(chromaticsToggle, chromaticsDetails);

  const position = document.createElement('div');
  const rotation = document.createElement('div');
  const scale = document.createElement('div');
  position.className = 'transform-readout';
  rotation.className = 'transform-readout';
  scale.className = 'transform-readout';
  transformReadouts = { position, rotation, scale };
  const transformTarget = getMeshTransformTarget(mesh);
  const { x, y, z } = transformTarget.position;
  position.textContent = `Position: ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`;
  rotation.textContent = `Rotation: ${THREE.MathUtils.radToDeg(transformTarget.rotation.x).toFixed(1)}°, ${THREE.MathUtils.radToDeg(transformTarget.rotation.y).toFixed(1)}°, ${THREE.MathUtils.radToDeg(transformTarget.rotation.z).toFixed(1)}°`;
  scale.textContent = `Scale: ${mesh.scale.x.toFixed(2)}, ${mesh.scale.y.toFixed(2)}, ${mesh.scale.z.toFixed(2)}`;

  form.append(nameLabel, modelSection, chromaticsSection, position, rotation, scale);
  properties.appendChild(form);
}

editButton.addEventListener('click', () => {
  const expanded = editButton.getAttribute('aria-expanded') === 'true';
  editButton.setAttribute('aria-expanded', String(!expanded));
  editMenu.hidden = expanded;
});

eyedropperButton.addEventListener('click', () => setEyedropperEnabled(!eyedropperEnabled));
pointGeoButton.addEventListener('click', () => setPointGeometryEnabled(!pointGeoEnabled));
geoMoveButton.addEventListener('click', () => setGeoMoveEnabled(!geoMoveEnabled));
addGeometryPointButton.addEventListener('click', () => {
  if (!pointEditObject) return;
  addingGeometryPoint = true;
  setGeometryPointSelection([]);
  transformControls.detach();
  if (pointStatusElement) pointStatusElement.textContent = 'Click on the object surface to add a point.';
  addGeometryPointButton.classList.add('active');
});

document.addEventListener('pointerdown', (event) => {
  if (!editMenu.contains(event.target as Node) && !editButton.contains(event.target as Node)) {
    editMenu.hidden = true;
    editButton.setAttribute('aria-expanded', 'false');
  }
});

function selectObject(mesh: THREE.Mesh | null) {
  if (pointEditObject && mesh !== pointEditObject && !finishPointEditing(true)) return;
  selectedPointObject = null;
  selectedObjects.forEach((selected) => {
    if (selected !== mesh) restoreMeshEmissive(selected);
  });
  selectedObject = mesh;
  selectedObjects = mesh ? [mesh] : [];
  updateDisplayModeButtons();
  clearGeometryPointMarkers();
  if (mesh && pointGeometryPoints.has(mesh)) {
    pointGeometryPoints.get(mesh)!.forEach((point) => addGeometryPointMarker(mesh, point));
  }
  if (mesh) restoreMeshEmissive(mesh);
  updateSelectionHighlights();
  updateSelectedHierarchyRows();
  if (!mesh) {
    transformReadouts = null;
    transformControls.detach();
    multiSelectionStart = null;
    properties.classList.remove('properties-content');
    properties.classList.add('properties-empty');
    properties.textContent = 'Nothing selected';
    return;
  }
  updateProperties(mesh);
  updateSelectionTransformTarget();
}

function setSelectedObjects(meshes: THREE.Mesh[]) {
  const unique = [...new Set(meshes)].filter((mesh) =>
    objects.includes(mesh) && objectShapes.has(mesh) && !isWorldSkybox(mesh),
  );
  if (unique.length === 0) {
    selectObject(null);
    return;
  }
  if (pointEditObject && !finishPointEditing(true)) return;
  selectObject(unique[0]);
  selectedObjects = unique;
  selectedObject = unique[0];
  updateSelectionHighlights();
  updateSelectedHierarchyRows();
  updateProperties(selectedObject);
  updateSelectionTransformTarget();
}

function updatePointGeometryHierarchy(mesh: THREE.Mesh) {
  const row = sceneContents.querySelector<HTMLElement>(`.scene-object-row[data-uuid="${mesh.uuid}"]`);
  const child = row?.querySelector<HTMLButtonElement>('.point-geometry-child');
  const childName = child?.querySelector<HTMLElement>('.point-geometry-name');
  if (childName) childName.textContent = pointGeometryNames.get(mesh) ?? 'pointGeometryTriangleFillin';
  if (child) child.hidden = !pointGeometryPoints.has(mesh);
}

function updateLightHierarchyIcon(mesh: THREE.Mesh, enabled: boolean) {
  const icon = sceneContents.querySelector<HTMLImageElement>(`.scene-object-row[data-uuid="${mesh.uuid}"] .light-hierarchy-icon`);
  if (icon) icon.src = enabled ? './light-enabled.png' : './light-disabled.png';
}

function updateObjectLockControls(mesh: THREE.Mesh) {
  const row = sceneContents.querySelector<HTMLElement>(`.scene-object-row[data-uuid="${mesh.uuid}"]`);
  if (!row) return;
  const locked = isObjectLocked(mesh);
  row.classList.toggle('locked', locked);
  const lockButton = row.querySelector<HTMLButtonElement>('.object-lock-button');
  if (lockButton) {
    lockButton.hidden = !locked;
    lockButton.setAttribute('aria-pressed', String(locked));
    lockButton.setAttribute('aria-label', locked ? `Unlock ${mesh.name}` : `Lock ${mesh.name}`);
    lockButton.title = locked ? 'Unlock object' : 'Lock object';
    lockButton.innerHTML = locked
      ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 7V5a3 3 0 0 1 6 0v2M4 7h8v7H4z"/><path d="M8 10v2"/></svg>'
      : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 7V5a3 3 0 0 1 5.8-1M4 7h8v7H4z"/><path d="M8 10v2"/></svg>';
  }
}

function setObjectLocked(mesh: THREE.Mesh, locked: boolean) {
  if (locked && pointEditObject === mesh && !finishPointEditing(true)) return;
  if (locked) lockedObjects.add(mesh);
  else lockedObjects.delete(mesh);
  updateObjectLockControls(mesh);
  if (selectedObject === mesh) {
    if (locked) transformControls.detach();
    else if (transformMode !== 'select') {
      transformControls.setMode(transformMode);
      transformControls.attach(getMeshTransformTarget(mesh));
    }
  }
}

function updateContextLockButton(mesh: THREE.Mesh) {
  const locked = isObjectLocked(mesh);
  contextLockButton.innerHTML = `${locked
    ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 7V5a3 3 0 0 1 6 0v2M4 7h8v7H4z"/><path d="M8 10v2"/></svg>'
    : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 7V5a3 3 0 0 1 5.8-1M4 7h8v7H4z"/><path d="M8 10v2"/></svg>'}<span>${locked ? 'Unlock' : 'Lock'}</span>`;
}

function showObjectContextMenu(mesh: THREE.Mesh, clientX: number, clientY: number) {
  contextTargetObject = mesh;
  selectObject(mesh);
  updateShowAllDisplayModeMenuLabels();
  updateContextLockButton(mesh);
  contextLockButton.hidden = false;
  const hasChildren = getChildMeshes(mesh).length > 0;
  contextGroupChildrenButton.hidden = !isGroupableMesh(mesh) || !hasChildren;
  contextModelChildrenButton.hidden = !isGroupableMesh(mesh) || !hasChildren;
  contextDeleteButton.hidden = false;
  contextShowAllWireframeButton.hidden = false;
  contextShowAllFacesButton.hidden = false;
  objectContextMenu.hidden = false;
  const menuBounds = objectContextMenu.getBoundingClientRect();
  objectContextMenu.style.left = `${Math.min(clientX, window.innerWidth - menuBounds.width - 8)}px`;
  objectContextMenu.style.top = `${Math.min(clientY, window.innerHeight - menuBounds.height - 8)}px`;
}

function showDisplayModeContextMenu(mode: ObjectDisplayMode, clientX: number, clientY: number) {
  contextTargetObject = null;
  updateShowAllDisplayModeMenuLabels();
  contextLockButton.hidden = true;
  contextGroupChildrenButton.hidden = true;
  contextModelChildrenButton.hidden = true;
  contextDeleteButton.hidden = true;
  contextShowAllWireframeButton.hidden = mode !== 'wireframe';
  contextShowAllFacesButton.hidden = mode !== 'faces';
  objectContextMenu.hidden = false;
  const menuBounds = objectContextMenu.getBoundingClientRect();
  objectContextMenu.style.left = `${Math.min(clientX, window.innerWidth - menuBounds.width - 8)}px`;
  objectContextMenu.style.top = `${Math.min(clientY, window.innerHeight - menuBounds.height - 8)}px`;
}

function closeObjectContextMenu() {
  objectContextMenu.hidden = true;
  contextTargetObject = null;
}

contextGroupChildrenButton.addEventListener('click', () => {
  const parent = contextTargetObject;
  closeObjectContextMenu();
  if (parent) groupChildMeshes(parent);
});
contextModelChildrenButton.addEventListener('click', () => {
  const parent = contextTargetObject;
  closeObjectContextMenu();
  if (parent) modelChildMeshes(parent);
});

contextLockButton.addEventListener('click', () => {
  if (!contextTargetObject) return;
  setObjectLocked(contextTargetObject, !isObjectLocked(contextTargetObject));
  updateContextLockButton(contextTargetObject);
});
contextDeleteButton.addEventListener('click', () => {
  const target = contextTargetObject;
  closeObjectContextMenu();
  if (!target) return;
  selectObject(target);
  deleteSelectedObject();
});
contextShowAllWireframeButton.addEventListener('click', () => {
  closeObjectContextMenu();
  showAllObjectsDisplayMode('wireframe');
});
contextShowAllFacesButton.addEventListener('click', () => {
  closeObjectContextMenu();
  showAllObjectsDisplayMode('faces');
});
displayModeButtons.forEach((button) => {
  const mode = button.dataset.displayMode;
  if (mode !== 'wireframe' && mode !== 'faces') {
    throw new Error(`Unknown display mode "${mode ?? ''}".`);
  }
  button.addEventListener('click', () => {
    if (!selectedObject || !objectShapes.has(selectedObject)) return;
    setObjectDisplayMode(selectedObject, objectDisplayModes.get(selectedObject) === mode ? null : mode);
  });
  button.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    showDisplayModeContextMenu(mode, event.clientX, event.clientY);
  });
});
document.addEventListener('pointerdown', (event) => {
  if (!objectContextMenu.hidden && !objectContextMenu.contains(event.target as Node)) closeObjectContextMenu();
});

function addHierarchyRow(mesh: THREE.Mesh) {
  const isLight = sceneLights.has(mesh);
  const row = document.createElement('div');
  row.className = 'scene-object-row';
  row.setAttribute('data-uuid', mesh.uuid);
  const line = document.createElement('div');
  line.className = 'scene-object-line';
  const groupDisclosure = document.createElement('button');
  groupDisclosure.type = 'button';
  groupDisclosure.className = 'scene-group-disclosure';
  groupDisclosure.textContent = '›';
  groupDisclosure.setAttribute('aria-label', `Expand children of ${mesh.name}`);
  groupDisclosure.hidden = true;
  groupDisclosure.addEventListener('click', () => {
    if (expandedGroups.has(mesh)) expandedGroups.delete(mesh);
    else expandedGroups.add(mesh);
    updateGroupHierarchyRow(mesh);
  });
  const pointDisclosure = document.createElement('button');
  pointDisclosure.type = 'button';
  pointDisclosure.className = 'point-geometry-disclosure';
  pointDisclosure.textContent = '›';
  pointDisclosure.setAttribute('aria-label', `Expand point geometry for ${mesh.name}`);
  pointDisclosure.hidden = isLight || isWorldSkybox(mesh) || !pointGeoEnabled;
  const pointChild = document.createElement('button');
  pointChild.type = 'button';
  pointChild.className = 'point-geometry-child';
  const pointIcon = document.createElement('img');
  pointIcon.className = 'point-geometry-icon';
  pointIcon.src = './point-geometry.png';
  pointIcon.alt = '';
  pointIcon.setAttribute('aria-hidden', 'true');
  const pointName = document.createElement('span');
  pointName.className = 'point-geometry-name';
  pointName.textContent = pointGeometryNames.get(mesh) ?? 'pointGeometryTriangleFillin';
  pointChild.append(pointIcon, pointName);
  pointChild.hidden = isLight || isWorldSkybox(mesh) || !pointGeometryPoints.has(mesh);
  pointDisclosure.addEventListener('click', () => {
    if (!pointGeometryPoints.has(mesh)) {
      beginPointEditing(mesh);
      pointDisclosure.textContent = '⌄';
      pointDisclosure.setAttribute('aria-expanded', 'true');
      return;
    }
    pointChild.hidden = !pointChild.hidden;
    pointDisclosure.textContent = pointChild.hidden ? '›' : '⌄';
    pointDisclosure.setAttribute('aria-expanded', String(!pointChild.hidden));
  });
  pointChild.addEventListener('click', () => selectPointGeometry(mesh));
  const selectButton = document.createElement('button');
  selectButton.type = 'button';
  selectButton.className = 'scene-object';
  selectButton.draggable = !isLight && !isWorldSkybox(mesh);
  selectButton.textContent = mesh.name || 'Object';
  selectButton.addEventListener('click', () => selectObject(mesh));
  selectButton.addEventListener('dragstart', (event) => {
    if (!event.dataTransfer) return;
    event.dataTransfer.setData('text/plain', mesh.uuid);
    event.dataTransfer.effectAllowed = 'move';
    row.classList.add('dragging');
  });
  selectButton.addEventListener('dragend', () => row.classList.remove('dragging'));
  row.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types.includes('text/plain') || !isGroupableMesh(mesh)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    row.classList.add('drop-target');
  });
  row.addEventListener('dragleave', (event) => {
    if (!row.contains(event.relatedTarget as Node | null)) row.classList.remove('drop-target');
  });
  row.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();
    row.classList.remove('drop-target');
    const source = objects.find((object) => object.uuid === event.dataTransfer?.getData('text/plain'));
    if (source && source !== mesh) moveMeshToParent(source, mesh);
  });
  selectButton.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    showObjectContextMenu(mesh, event.clientX, event.clientY);
  });
  if (isLight) {
    const icon = document.createElement('img');
    icon.className = 'light-hierarchy-icon';
    const light = sceneLights.get(mesh);
    if (!light) throw new Error(`Light data for "${mesh.name}" is missing.`);
    icon.src = (sceneLightEnabled.get(light) ?? light.visible) ? './light-enabled.png' : './light-disabled.png';
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');
    line.appendChild(icon);
  }
  const lockButton = document.createElement('button');
  lockButton.type = 'button';
  lockButton.className = 'object-lock-button';
  lockButton.addEventListener('click', () => setObjectLocked(mesh, !isObjectLocked(mesh)));
  lockButton.hidden = true;
  const children = document.createElement('div');
  children.className = 'scene-object-children';
  children.hidden = true;
  line.append(groupDisclosure, pointDisclosure, selectButton, lockButton);
  row.append(line, pointChild, children);
  hierarchyRows.set(mesh, row);
  const parent = objectParentByMesh.get(mesh) ?? null;
  if (parent && hierarchyRows.has(parent)) {
    getHierarchyChildContainer(parent).appendChild(row);
    expandedGroups.add(parent);
    updateGroupHierarchyRow(parent);
  } else {
    sceneContents.appendChild(row);
  }
  updateGroupHierarchyRow(mesh);
  updateObjectLockControls(mesh);
}

function setPointGeometryEnabled(enabled: boolean) {
  pointGeoEnabled = enabled;
  pointGeoButton.setAttribute('aria-pressed', String(enabled));
  sceneContents.querySelectorAll<HTMLButtonElement>('.point-geometry-disclosure').forEach((button) => {
    const row = button.closest<HTMLElement>('.scene-object-row');
    const uuid = row?.dataset.uuid;
    const mesh = objects.find((object) => object.uuid === uuid);
    button.hidden = !enabled || !mesh || sceneLights.has(mesh);
  });
  if (!enabled) {
    if (pointEditObject && !finishPointEditing(true)) {
      pointGeoEnabled = true;
      pointGeoButton.setAttribute('aria-pressed', 'true');
      sceneContents.querySelectorAll<HTMLButtonElement>('.point-geometry-disclosure').forEach((button) => {
        const row = button.closest<HTMLElement>('.scene-object-row');
        const mesh = objects.find((object) => object.uuid === row?.dataset.uuid);
        button.hidden = !mesh || sceneLights.has(mesh);
      });
      return;
    }
    setGeoMoveEnabled(false);
    selectedPointObject = null;
    if (selectedObject) updateProperties(selectedObject);
  }
  updatePointEditToolbar();
}

function updatePointEditToolbar() {
  const editing = pointEditObject !== null;
  addGeometryPointButton.hidden = !editing;
  addGeometryPointButton.classList.toggle('active', addingGeometryPoint);
  insertButton.classList.toggle('point-edit-locked', editing);
  insertButton.setAttribute('aria-disabled', String(editing));
  insertMenu.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    button.classList.toggle('point-edit-locked', editing);
    button.setAttribute('aria-disabled', String(editing));
  });
  document.querySelectorAll<HTMLButtonElement>('.tool-button[data-mode="select"], .tool-button[data-mode="rotate"], .tool-button[data-mode="scale"], .tool-button[data-mode="translate"]')
    .forEach((button) => {
      button.classList.toggle('point-edit-locked', editing);
      button.setAttribute('aria-disabled', String(editing));
    });
  geoMoveButton.disabled = !editing;
  geoMoveButton.setAttribute('aria-pressed', String(geoMoveEnabled));
  if (lastCursorEvent) updateCursorAppearance(lastCursorEvent);
}

function setGeoMoveEnabled(enabled: boolean) {
  geoMoveEnabled = enabled && pointEditObject !== null;
  geoMoveButton.setAttribute('aria-pressed', String(geoMoveEnabled));
  if (!geoMoveEnabled) transformControls.detach();
  else if (selectedGeometryPoints.length > 0) setGeometryPointSelection(selectedGeometryPoints);
  if (selectedPointObject) updatePointGeometryProperties(selectedPointObject);
  updatePointEditToolbar();
}

function placePointOnSurface(event: Pick<PointerEvent, 'clientX' | 'clientY'>): THREE.Vector3 | null {
  if (!pointEditObject) return null;
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  pointEditObject.updateWorldMatrix(true, false);
  const planeNormal = camera.getWorldDirection(new THREE.Vector3());
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    planeNormal,
    pointEditObject.getWorldPosition(new THREE.Vector3()),
  );
  const worldPoint = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  return worldPoint ? pointEditObject.worldToLocal(worldPoint) : null;
}

function getGeometryPointAtPointer(event: Pick<PointerEvent, 'clientX' | 'clientY'>): THREE.Mesh | null {
  if (!pointEditObject) return null;
  const bounds = renderer.domElement.getBoundingClientRect();
  const pointerX = event.clientX;
  const pointerY = event.clientY;
  const pointWorldPosition = new THREE.Vector3();
  let closestMarker: THREE.Mesh | null = null;
  let closestDistance = 15;
  let closestDepth = Number.POSITIVE_INFINITY;
  for (const marker of geometryPointMarkers) {
    marker.getWorldPosition(pointWorldPosition);
    const depth = camera.position.distanceTo(pointWorldPosition);
    pointWorldPosition.project(camera);
    const screenX = bounds.left + (pointWorldPosition.x + 1) * bounds.width * 0.5;
    const screenY = bounds.top + (1 - pointWorldPosition.y) * bounds.height * 0.5;
    const screenDistance = Math.hypot(pointerX - screenX, pointerY - screenY);
    if (screenDistance < closestDistance || (screenDistance === closestDistance && depth < closestDepth)) {
      closestDistance = screenDistance;
      closestDepth = depth;
      closestMarker = marker;
    }
  }
  return closestMarker;
}

function captureGeometryPointSelectionStart() {
  pointSelectionStartWorld.clear();
  pointSelectionStartCenter.set(0, 0, 0);
  if (selectedGeometryPoints.length === 0) return;
  let count = 0;
  for (const marker of selectedGeometryPoints) {
    marker.updateWorldMatrix(true, false);
    const worldPosition = marker.getWorldPosition(new THREE.Vector3());
    pointSelectionStartWorld.set(marker, worldPosition);
    pointSelectionStartCenter.add(worldPosition);
    count++;
  }
  pointSelectionStartCenter.divideScalar(count);
}

function updatePointGeometryPreview() {
  if (pointPreviewFrame !== null) cancelAnimationFrame(pointPreviewFrame);
  pointPreviewFrame = requestAnimationFrame(() => {
    pointPreviewFrame = null;
    const mesh = pointEditObject;
    const points = mesh ? pointGeometryPoints.get(mesh) : undefined;
    if (!mesh || !points || points.length < 4) return;
    applyPointGeometryDeformation(mesh);
    const displayMode = objectDisplayModes.get(mesh);
    if (displayMode) setObjectDisplayMode(mesh, displayMode);
    selectionHighlight.update();
  });
}

function setGeometryPointSelection(markers: THREE.Mesh[]) {
  for (const marker of geometryPointMarkers) {
    (marker.material as THREE.MeshBasicMaterial).color.set('#ffe36b');
  }
  selectedGeometryPoints = [...new Set(markers)].filter((marker) => geometryPointMarkers.includes(marker));
  for (const marker of selectedGeometryPoints) {
    (marker.material as THREE.MeshBasicMaterial).color.set('#ff3b3b');
  }
  if (selectedGeometryPoints.length > 0 && (geoMoveEnabled || transformMode === 'translate')) {
    captureGeometryPointSelectionStart();
    pointSelectionGizmo.position.copy(pointSelectionStartCenter);
    pointSelectionGizmo.rotation.set(0, 0, 0);
    pointSelectionGizmo.scale.set(1, 1, 1);
    pointSelectionGizmo.updateMatrixWorld(true);
    transformControls.setMode('translate');
    transformControls.attach(pointSelectionGizmo);
  } else {
    pointSelectionStartWorld.clear();
    transformControls.detach();
  }
}

function finishGeometryPointDrag() {
  pointInteractionLocked = false;
  syncNavigationControls();
}

function getEditablePoints(mesh: THREE.Mesh): THREE.Vector3[] {
  const existing = pointGeometryPoints.get(mesh);
  if (existing) return existing.map((point) => point.clone());
  return getBaseEditablePoints(mesh);
}

function getBaseEditablePoints(mesh: THREE.Mesh): THREE.Vector3[] {
  const base = shapeDefinitions[objectShapes.get(mesh)!].createBaseGeometry();
  const positions = base.getAttribute('position');
  const points: THREE.Vector3[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < positions.count; index++) {
    const point = new THREE.Vector3().fromBufferAttribute(positions, index);
    const key = `${point.x.toFixed(4)},${point.y.toFixed(4)},${point.z.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push(point);
  }
  base.dispose();
  return points;
}

function clearGeometryPointMarkers() {
  if (transformControls.object === pointSelectionGizmo) transformControls.detach();
  geometryPointMarkers.forEach((marker) => {
    marker.parent?.remove(marker);
    marker.geometry.dispose();
    (marker.material as THREE.Material).dispose();
  });
  geometryPointMarkers = [];
  selectedGeometryPoints = [];
  pointSelectionStartWorld.clear();
}

function addGeometryPointMarker(parent: THREE.Mesh, point: THREE.Vector3) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 8, 6),
    new THREE.MeshBasicMaterial({ color: '#ffe36b', depthTest: false }),
  );
  marker.userData.isGeometryPoint = true;
  marker.position.copy(point);
  marker.renderOrder = 1000;
  parent.add(marker);
  geometryPointMarkers.push(marker);
}

function updateGeometryPointMarkerScale() {
  for (const marker of geometryPointMarkers) {
    marker.getWorldPosition(pointMarkerWorldPosition);
    const distance = camera.position.distanceTo(pointMarkerWorldPosition);
    const scale = THREE.MathUtils.clamp(distance / 12, 0.35, 1.4);
    marker.scale.setScalar(scale);
  }
}

function selectPointGeometry(mesh: THREE.Mesh) {
  if (isObjectLocked(mesh)) return;
  if (pointEditObject && pointEditObject !== mesh && !finishPointEditing(true)) return;
  selectObject(mesh);
  selectedPointObject = mesh;
  updatePointGeometryProperties(mesh);
}

function beginPointEditing(mesh: THREE.Mesh) {
  if (isObjectLocked(mesh)) return;
  if (pointEditObject && pointEditObject !== mesh && !finishPointEditing(true)) return;
  manualPointSelectionEnabled = false;
  geoMoveEnabled = true;
  pointEditObject = mesh;
  selectedPointObject = mesh;
  const hadSavedPoints = pointGeometryPoints.has(mesh);
  const points = getEditablePoints(mesh);
  pointGeometryPoints.set(mesh, points);
  if (!pointGeometryBasePoints.has(mesh)) {
    pointGeometryBasePoints.set(mesh, getBaseEditablePoints(mesh));
  }
  const positions = mesh.geometry.getAttribute('position');
  if (!(positions instanceof THREE.BufferAttribute)) {
    throw new Error(`Geometry positions for "${mesh.name}" cannot be edited.`);
  }
  mesh.geometry.computeBoundingBox();
  const bounds = mesh.geometry.boundingBox;
  if (!bounds) throw new Error(`Geometry bounds for "${mesh.name}" could not be calculated.`);
  pointGeometryEditStates.set(mesh, {
    basePoints: points.map((point) => point.clone()),
    basePositions: Float32Array.from(positions.array),
    influenceRadius: Math.max(bounds.getSize(new THREE.Vector3()).length() * 0.18, 0.1),
    hadSavedPoints,
  });
  updatePointGeometryHierarchy(mesh);
  clearGeometryPointMarkers();
  points.forEach((point) => addGeometryPointMarker(mesh, point));
  addingGeometryPoint = false;
  transformControls.detach();
  syncNavigationControls();
  updatePointEditToolbar();
  updatePointGeometryProperties(mesh);
}

function applyPointGeometryDeformation(mesh: THREE.Mesh) {
  const points = pointGeometryPoints.get(mesh);
  const state = pointGeometryEditStates.get(mesh);
  if (!points || !state) return;
  applyPointDeformationToGeometry(
    mesh.geometry,
    state.basePositions,
    state.basePoints,
    points,
    state.influenceRadius,
    smoothShadingByMesh.get(mesh) ?? true,
  );
}

function applyPointDeformationToGeometry(
  geometry: THREE.BufferGeometry,
  basePositions: Float32Array,
  basePoints: THREE.Vector3[],
  points: THREE.Vector3[],
  influenceRadius: number,
  smoothShading: boolean,
) {
  const position = geometry.getAttribute('position');
  if (!(position instanceof THREE.BufferAttribute)) throw new Error('Geometry positions cannot be edited.');
  const influences = points.flatMap((point, index) => {
    const basePoint = basePoints[index];
    if (!basePoint) return [];
    const delta = point.clone().sub(basePoint);
    return delta.lengthSq() > 1e-12 ? [{ basePoint, delta }] : [];
  });
  const source = basePositions;
  const vertex = new THREE.Vector3();
  const offset = new THREE.Vector3();
  for (let index = 0; index < position.count; index++) {
    const arrayOffset = index * 3;
    vertex.set(source[arrayOffset], source[arrayOffset + 1], source[arrayOffset + 2]);
    offset.set(0, 0, 0);
    let weightTotal = 0;
    for (const influence of influences) {
      const distance = vertex.distanceTo(influence.basePoint);
      if (distance >= influenceRadius) continue;
      const t = distance / influenceRadius;
      const weight = (1 - t) * (1 - t) * (1 + 2 * t);
      offset.addScaledVector(influence.delta, weight);
      weightTotal += weight;
    }
    if (weightTotal > 0) {
      vertex.add(offset);
    }
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }
  position.needsUpdate = true;
  computeGeometryNormals(geometry, smoothShading);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

function rebuildPointGeometry(mesh: THREE.Mesh) {
  const points = pointGeometryPoints.get(mesh);
  if (!points || points.length < 4) {
    if (pointStatusElement) pointStatusElement.textContent = 'Add at least four points to create point geometry.';
    return false;
  }
  applyPointGeometryDeformation(mesh);
  pointGeometryPoints.set(mesh, points.map((point) => point.clone()));
  updatePointGeometryHierarchy(mesh);
  selectionHighlight.update();
  if (pointStatusElement) pointStatusElement.textContent = 'Point geometry saved.';
  return true;
}

function finishPointEditing(save: boolean) {
  const mesh = pointEditObject;
  if (!mesh) return true;
  if (pointPreviewFrame !== null) {
    cancelAnimationFrame(pointPreviewFrame);
    pointPreviewFrame = null;
  }
  if (save) {
    if (!rebuildPointGeometry(mesh)) return false;
    pointGeometryEditStates.delete(mesh);
  } else {
    const state = pointGeometryEditStates.get(mesh);
    const position = mesh.geometry.getAttribute('position');
    if (state && position instanceof THREE.BufferAttribute) {
      position.array.set(state.basePositions);
      position.needsUpdate = true;
      computeGeometryNormals(mesh.geometry, smoothShadingByMesh.get(mesh) ?? true);
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
    }
    pointGeometryEditStates.delete(mesh);
    if (state?.hadSavedPoints) {
      pointGeometryPoints.set(mesh, state.basePoints.map((point) => point.clone()));
    } else {
      pointGeometryPoints.delete(mesh);
      pointGeometryBasePoints.delete(mesh);
    }
    updatePointGeometryHierarchy(mesh);
  }
  transformControls.detach();
  manualPointSelectionEnabled = false;
  setGeometryPointSelection([]);
  pointEditObject = null;
  selectedGeometryPoints = [];
  pointSelectionStartWorld.clear();
  addingGeometryPoint = false;
  geoMoveEnabled = false;
  syncNavigationControls();
  pointStatusElement = null;
  updatePointEditToolbar();
  if (selectedObject === mesh) {
    selectedPointObject = null;
    updateProperties(mesh);
    if (transformMode !== 'select' && !isObjectLocked(mesh)) {
      transformControls.setMode(transformMode);
      transformControls.attach(getMeshTransformTarget(mesh));
    }
  }
  return true;
}

function updatePointGeometryProperties(mesh: THREE.Mesh) {
  properties.classList.remove('properties-empty');
  properties.classList.add('properties-content');
  properties.replaceChildren();
  const form = document.createElement('div');
  form.className = 'properties-form';
  const label = document.createElement('label');
  label.className = 'property-field';
  label.textContent = 'Name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = pointGeometryNames.get(mesh) ?? 'pointGeometryTriangleFillin';
  nameInput.setAttribute('aria-label', 'Point geometry name');
  nameInput.addEventListener('input', () => {
    const name = nameInput.value || 'pointGeometryTriangleFillin';
    pointGeometryNames.set(mesh, name);
    updatePointGeometryHierarchy(mesh);
  });
  label.appendChild(nameInput);
  if (pointEditObject !== mesh) {
    const configure = document.createElement('button');
    configure.type = 'button';
    configure.className = 'configure-points-button';
    configure.textContent = 'Configure points';
    configure.disabled = isObjectLocked(mesh);
    configure.addEventListener('click', () => beginPointEditing(mesh));
    form.append(label, configure);
  } else {
    form.appendChild(label);
  }
  if (pointEditObject === mesh) {
    const status = document.createElement('div');
    status.className = 'point-geometry-status';
    pointStatusElement = status;
    status.textContent = `${pointGeometryPoints.get(mesh)?.length ?? 0} points configured. Select points and use the Move gizmo to reposition them freely.`;
    const exit = document.createElement('button');
    exit.type = 'button';
    exit.className = 'configure-points-button';
    exit.textContent = 'Exit and save';
    exit.addEventListener('click', () => finishPointEditing(true));
    form.append(status, exit);
  } else {
    pointStatusElement = null;
  }
  properties.appendChild(form);
}

function addObject(name: string, position: THREE.Vector3) {
  const definition = shapeDefinitions[name];
  if (!definition) throw new Error(`Unknown shape "${name}".`);
  const material = new THREE.MeshStandardMaterial({
    color: '#aeb7bd',
    roughness: 0.92,
    metalness: 0,
    flatShading: false,
  });
  const mesh = new THREE.Mesh(
    createTriangleGeometry(name, definition.minimumTriangles),
    material,
  );
  mesh.name = uniqueObjectName(name);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  objectShapes.set(mesh, name);
  smoothShadingByMesh.set(mesh, true);
  objectMaterialPresets.set(mesh, 'Rubber');
  mesh.position.copy(position);
  mesh.position.y += definition.groundOffset;
  scene.add(mesh);
  objects.push(mesh);
  addHierarchyRow(mesh);
  selectObject(mesh);
}

function getSunPosition(settings: SunSettings): THREE.Vector3 {
  const latitude = THREE.MathUtils.degToRad(settings.latitude);
  const hourAngle = THREE.MathUtils.degToRad((settings.timeOfDay - 12) * 15 + settings.longitude);
  const direction = new THREE.Vector3(
    -Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.cos(latitude),
    -Math.cos(hourAngle) * Math.sin(latitude),
  ).normalize();
  return direction.multiplyScalar(40000);
}

function updateSunPosition(proxy: THREE.Mesh, light: THREE.DirectionalLight, settings: SunSettings) {
  proxy.position.copy(getSunPosition(settings));
  proxy.visible = true;
  light.position.copy(proxy.position);
  light.target.position.set(0, 0, 0);
}

function createSunGlow(): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create the sun glow texture.');
  const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,235,1)');
  gradient.addColorStop(0.12, 'rgba(255,235,175,0.9)');
  gradient.addColorStop(0.32, 'rgba(255,180,80,0.35)');
  gradient.addColorStop(1, 'rgba(255,125,30,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    color: '#fff0c0',
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }));
  glow.scale.set(4400, 4400, 1);
  glow.renderOrder = 999;
  glow.frustumCulled = false;
  return glow;
}

function updateSunSize(proxy: THREE.Mesh, settings: SunSettings) {
  proxy.geometry.dispose();
  proxy.geometry = new THREE.SphereGeometry(275 * settings.size, 20, 14);
  settings.flare.geometry.dispose();
  settings.flare.geometry = new THREE.TorusGeometry(400 * settings.size, 17.5 * settings.size, 8, 48);
  settings.glow.scale.set(4400 * settings.size, 4400 * settings.size, 1);
}

function updateAimedLight(proxy: THREE.Mesh) {
  const light = sceneLights.get(proxy);
  if (!(light instanceof THREE.SpotLight)) return;
  proxy.updateWorldMatrix(true, false);
  proxy.getWorldPosition(lightWorldPosition);
  proxy.getWorldQuaternion(lightWorldQuaternion);
  lightWorldDirection.set(0, -1, 0).applyQuaternion(lightWorldQuaternion).normalize();
  light.target.position.copy(lightWorldPosition)
    .addScaledVector(lightWorldDirection, light.distance || 20);
  light.target.updateMatrixWorld(true);

  const indicator = lightDirectionIndicators.get(proxy);
  if (!indicator) return;
  indicator.position.copy(lightWorldPosition).addScaledVector(lightWorldDirection, 0.18);
  indicator.setDirection(lightWorldDirection);
  indicator.setLength(
    Math.max(Math.min(light.distance || 4, 8), 0.5),
    0.35,
    0.2,
  );
  indicator.visible = light.visible && proxy.visible;
}

function addWorldSkybox(): THREE.Mesh {
  if (worldSkybox) {
    selectObject(worldSkybox);
    return worldSkybox;
  }
  const skybox = createWorldSkybox((mesh) => {
    scene.add(mesh);
    addHierarchyRow(mesh);
  }, selectObject);
  worldSkybox = skybox;
  return skybox;
}

function addLight(type: 'spot' | 'directional' | 'point'): THREE.Mesh {
  const lightName = type === 'spot'
    ? 'Spot Light'
    : type === 'directional'
      ? 'Universal Light'
      : 'Point Light';
  const material = new THREE.MeshBasicMaterial({
    color: '#fff0a8',
    wireframe: true,
    depthTest: false,
  });
  const proxy = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), material);
  proxy.name = uniqueObjectName(lightName);
  proxy.position.set(0, 2, 0);
  proxy.renderOrder = 998;
  proxy.castShadow = false;
  proxy.receiveShadow = false;
  const light: EditableLight = type === 'spot'
    ? new THREE.SpotLight('#ffffff', 2, 20, Math.PI / 6, 0.2)
    : type === 'directional'
      ? new THREE.DirectionalLight('#ffffff', 2)
      : new THREE.SpotLight('#ffffff', 2, 20, Math.PI / 6, 0.2);
  light.name = proxy.name;
  light.castShadow = type !== 'directional';
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.bias = -0.0001;
  light.shadow.normalBias = 0.02;
  lightTypeByMesh.set(proxy, type);
  if (light instanceof THREE.DirectionalLight) {
    proxy.frustumCulled = false;
    proxy.geometry.dispose();
    proxy.geometry = new THREE.SphereGeometry(275, 20, 14);
    material.dispose();
    proxy.material = new THREE.MeshBasicMaterial({ color: '#ffe188', depthTest: false });
    const flare = new THREE.Mesh(
      new THREE.TorusGeometry(400, 17.5, 8, 48),
      new THREE.MeshBasicMaterial({ color: '#ffd37a', transparent: true, opacity: 0.75, depthTest: false }),
    );
    flare.visible = false;
    flare.renderOrder = 999;
    proxy.add(flare);
    const glow = createSunGlow();
    proxy.add(glow);
    const settings: SunSettings = { latitude: 35, longitude: 0, timeOfDay: 12, size: 1, flare, glow };
    sunSettings.set(proxy, settings);
    updateSunPosition(proxy, light, settings);
    scene.add(light);
    scene.add(light.target);
  } else {
    proxy.add(light);
    const directionIndicator = new THREE.ArrowHelper(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(),
      2,
      '#ffd37a',
      0.35,
      0.2,
    );
    directionIndicator.traverse((child) => {
      child.castShadow = false;
      child.receiveShadow = false;
      child.renderOrder = 999;
      const indicatorMaterial = (child as THREE.Mesh | THREE.Line).material;
      if (Array.isArray(indicatorMaterial)) {
        indicatorMaterial.forEach((entry) => {
          entry.depthTest = false;
          entry.toneMapped = false;
        });
      } else if (indicatorMaterial) {
        indicatorMaterial.depthTest = false;
        indicatorMaterial.toneMapped = false;
      }
    });
    scene.add(directionIndicator);
    lightDirectionIndicators.set(proxy, directionIndicator);
    scene.add(light.target);
  }
  sceneLights.set(proxy, light);
  sceneLightEnabled.set(light, true);
  scene.add(proxy);
  updateAimedLight(proxy);
  objects.push(proxy);
  addHierarchyRow(proxy);
  selectObject(proxy);
  return proxy;
}

function uniqueObjectName(baseName: string): string {
  const existingNames = new Set(objects.map((mesh) => mesh.name));
  if (worldSkybox) existingNames.add(worldSkybox.name);
  if (!existingNames.has(baseName)) return baseName;
  let suffix = 2;
  while (existingNames.has(`${baseName} ${suffix}`)) suffix += 1;
  return `${baseName} ${suffix}`;
}

function cloneSelectedObject() {
  if (!selectedObject) return;
  const source = selectedObject;
  if (isWorldSkybox(source)) {
    addDebugEntry('The World Skybox is a unique scene environment and cannot be cloned.', 'Scene Explorer');
    return;
  }
  const sourceLight = sceneLights.get(source);
  if (sourceLight) {
    const type = lightTypeByMesh.get(source) ?? (
      sourceLight instanceof THREE.SpotLight
        ? 'spot'
        : sourceLight instanceof THREE.DirectionalLight
          ? 'directional'
          : 'point'
    );
    const clone = addLight(type);
    const cloneLight = sceneLights.get(clone)!;
    clone.name = uniqueObjectName(`${source.name} Copy`);
    cloneLight.name = clone.name;
    clone.position.copy(source.position);
    clone.position.x += 0.5;
    clone.rotation.copy(source.rotation);
    clone.visible = source.visible;
    if (cloneLight instanceof THREE.DirectionalLight) {
      const sourceSun = sunSettings.get(source);
      const cloneSun = sunSettings.get(clone);
      cloneLight.position.copy(clone.position);
      if (sourceSun && cloneSun) {
        cloneSun.latitude = sourceSun.latitude;
        cloneSun.longitude = sourceSun.longitude;
        cloneSun.timeOfDay = sourceSun.timeOfDay;
        cloneSun.size = sourceSun.size;
        updateSunSize(clone, cloneSun);
        cloneSun.flare.visible = sourceSun.flare.visible;
        cloneSun.glow.visible = sourceSun.glow.visible;
      }
    }
    cloneLight.color.copy(sourceLight.color);
    cloneLight.intensity = sourceLight.intensity;
    const sourceEnabled = sceneLightEnabled.get(sourceLight) ?? sourceLight.visible;
    sceneLightEnabled.set(cloneLight, sourceEnabled);
    cloneLight.visible = sourceEnabled;
    updateLightHierarchyIcon(clone, sourceEnabled);
    cloneLight.castShadow = sourceLight.castShadow;
    if ((cloneLight instanceof THREE.PointLight || cloneLight instanceof THREE.SpotLight) &&
      (sourceLight instanceof THREE.PointLight || sourceLight instanceof THREE.SpotLight)) {
      cloneLight.distance = sourceLight.distance;
    }
    if (cloneLight instanceof THREE.SpotLight && sourceLight instanceof THREE.SpotLight) {
      cloneLight.angle = sourceLight.angle;
      cloneLight.penumbra = sourceLight.penumbra;
    }
    updateAimedLight(clone);
    const cloneMaterial = clone.material;
    if (!(cloneMaterial instanceof THREE.MeshBasicMaterial)) {
      throw new Error(`The display material for light "${clone.name}" cannot be cloned.`);
    }
    cloneMaterial.color.copy(cloneLight.color);
    const cloneRow = sceneContents.querySelector<HTMLElement>(`.scene-object-row[data-uuid="${clone.uuid}"]`);
    const cloneButton = cloneRow?.querySelector<HTMLButtonElement>('.scene-object');
    if (cloneButton) cloneButton.textContent = clone.name;
    updateObjectLockControls(clone);
    selectObject(clone);
    return;
  }
  const sourceMaterial = source.material;
  if (!(sourceMaterial instanceof THREE.MeshStandardMaterial)) {
    throw new Error(`Cannot clone the material for "${source.name}".`);
  }
  source.updateWorldMatrix(true, false);
  const bounds = new THREE.Box3().setFromObject(source);
  const offsetX = Math.max(bounds.getSize(new THREE.Vector3()).x, 1) + 0.1;
  const cloneTree = (sourceMesh: THREE.Mesh, destinationParent: THREE.Mesh | null, isRoot: boolean): THREE.Mesh => {
    const sourceChildren = objects.filter((candidate) => objectParentByMesh.get(candidate) === sourceMesh);
    const sourceMeshMaterial = sourceMesh.material;
    if (!(sourceMeshMaterial instanceof THREE.MeshStandardMaterial)) {
      throw new Error(`Cannot clone the material for "${sourceMesh.name}".`);
    }
    const cloneMaterial = sourceMeshMaterial.clone();
    const sourceEmissive = originalEmissive.get(sourceMesh);
    if (sourceEmissive) {
      cloneMaterial.emissive.copy(sourceEmissive.color);
      cloneMaterial.emissiveIntensity = sourceEmissive.intensity;
    }
    const cloneMesh = new THREE.Mesh(sourceMesh.geometry.clone(), cloneMaterial);
    const sourceMaterialVisibility = getOriginalMaterialVisibility(sourceMesh)?.[0];
    if (sourceMaterialVisibility !== undefined) cloneMaterial.visible = sourceMaterialVisibility;
    cloneMesh.name = uniqueObjectName(`${sourceMesh.name} Copy`);
    cloneMesh.position.copy(sourceMesh.position);
    cloneMesh.rotation.copy(sourceMesh.rotation);
    cloneMesh.scale.copy(sourceMesh.scale);
    objectShapes.set(cloneMesh, objectShapes.get(sourceMesh)!);
    if (joinedModels.has(sourceMesh)) joinedModels.add(cloneMesh);
    smoothShadingByMesh.set(cloneMesh, smoothShadingByMesh.get(sourceMesh) ?? true);
    objectMaterialPresets.set(cloneMesh, objectMaterialPresets.get(sourceMesh) ?? 'Rubber');
    const displayMode = objectDisplayModes.get(sourceMesh);
    if (displayMode) setObjectDisplayMode(cloneMesh, displayMode);
    const savedPoints = pointGeometryPoints.get(sourceMesh);
    if (savedPoints) pointGeometryPoints.set(cloneMesh, savedPoints.map((point) => point.clone()));
    const savedBasePoints = pointGeometryBasePoints.get(sourceMesh);
    if (savedBasePoints) pointGeometryBasePoints.set(cloneMesh, savedBasePoints.map((point) => point.clone()));
    const savedPointName = pointGeometryNames.get(sourceMesh);
    if (savedPointName) pointGeometryNames.set(cloneMesh, savedPointName);
    const sourcePivot = groupPivotByMesh.get(sourceMesh);
    if (sourcePivot) {
      const clonePivot = new THREE.Group();
      clonePivot.name = `${cloneMesh.name} Group Pivot`;
      clonePivot.position.copy(sourcePivot.position);
      clonePivot.quaternion.copy(sourcePivot.quaternion);
      clonePivot.scale.setScalar(1);
      const destination = destinationParent ? ensureGroupPivot(destinationParent) : scene;
      destination.add(clonePivot);
      clonePivot.add(cloneMesh);
      groupPivotByMesh.set(cloneMesh, clonePivot);
    } else {
      const destination = destinationParent ? ensureGroupPivot(destinationParent) : scene;
      destination.add(cloneMesh);
    }
    if (destinationParent) objectParentByMesh.set(cloneMesh, destinationParent);
    objects.push(cloneMesh);
    addHierarchyRow(cloneMesh);
    if (isRoot) {
      const pivot = groupPivotByMesh.get(cloneMesh);
      if (pivot) pivot.position.x += offsetX;
      else cloneMesh.position.x += offsetX;
    }
    sourceChildren.forEach((child) => cloneTree(child, cloneMesh, false));
    return cloneMesh;
  };

  const clone = cloneTree(source, objectParentByMesh.get(source) ?? null, true);
  selectObject(clone);
}

function deleteSelectedObject() {
  if (!selectedObject) return;
  if (pointEditObject === selectedObject) finishPointEditing(false);
  clearGeometryPointMarkers();
  setEyedropperEnabled(false);
  const mesh = selectedObject;
  const formerParent = objectParentByMesh.get(mesh) ?? null;
  const descendants = getChildMeshes(mesh);
  descendants.forEach((child) => {
    setObjectDisplayMode(child, null);
    const childPivot = groupPivotByMesh.get(child);
    childPivot?.removeFromParent();
    if (childPivot) groupPivotByMesh.delete(child);
    child.removeFromParent();
    const index = objects.indexOf(child);
    if (index >= 0) objects.splice(index, 1);
    objectParentByMesh.delete(child);
    hierarchyRows.get(child)?.remove();
    hierarchyRows.delete(child);
    child.geometry.dispose();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
    else child.material.dispose();
  });
  const topologyTimer = topologyUpdateTimers.get(mesh);
  if (topologyTimer !== undefined) window.clearTimeout(topologyTimer);
  transformControls.detach();
  const light = sceneLights.get(mesh);
  if (light instanceof THREE.DirectionalLight) scene.remove(light);
  if (light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight) scene.remove(light.target);
  const directionIndicator = lightDirectionIndicators.get(mesh);
  directionIndicator?.removeFromParent();
  directionIndicator?.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    }
  });
  const groupPivot = groupPivotByMesh.get(mesh);
  if (groupPivot) {
    groupPivot.removeFromParent();
    groupPivotByMesh.delete(mesh);
  }
  scene.remove(mesh);
  const objectIndex = objects.indexOf(mesh);
  if (objectIndex >= 0) objects.splice(objectIndex, 1);
  hierarchyRows.delete(mesh);
  objectParentByMesh.delete(mesh);
  if (formerParent) updateGroupHierarchyRow(formerParent);
  if (worldSkybox === mesh) {
    worldSkybox = null;
    clearWorldSkybox(mesh);
  }
  sceneContents.querySelector(`.scene-object-row[data-uuid="${mesh.uuid}"]`)?.remove();
  sunSettings.get(mesh)?.flare.geometry.dispose();
  const flare = sunSettings.get(mesh)?.flare;
  if (flare?.material instanceof THREE.Material) flare.material.dispose();
  const glow = sunSettings.get(mesh)?.glow;
  if (glow?.material instanceof THREE.SpriteMaterial) {
    glow.material.map?.dispose();
    glow.material.dispose();
  }
  setObjectDisplayMode(mesh, null);
  mesh.geometry.dispose();
  if (Array.isArray(mesh.material)) mesh.material.forEach((material) => {
    if (material instanceof THREE.MeshBasicMaterial) material.map?.dispose();
    material.dispose();
  });
  else mesh.material.dispose();
  hoverHighlight.visible = false;
  selectObject(null);
}

function setPlacementMode(shape: string | null) {
  if (shape) setEyedropperEnabled(false);
  if (shape && pointEditObject && !finishPointEditing(true)) return;
  if (shape && pointGeoEnabled) setPointGeometryEnabled(false);
  placementShape = shape;
  toolbar.classList.toggle('is-placement-locked', shape !== null);
  sidebar.classList.toggle('is-placement-locked', shape !== null);

  if (shape) {
    transformControls.detach();
  }

  if (previewMesh) {
    scene.remove(previewMesh);
    previewMesh.geometry.dispose();
    (previewMesh.material as THREE.Material).dispose();
    previewMesh = null;
  }

  if (shape) {
    const definition = shapeDefinitions[shape];
    const previewColor = selectedObject?.material instanceof THREE.MeshStandardMaterial
      ? selectedObject.material.color
      : new THREE.Color('#d7d7d7');
    previewMesh = new THREE.Mesh(
      createTriangleGeometry(shape, definition.minimumTriangles),
      new THREE.MeshStandardMaterial({
        color: previewColor,
        transparent: true,
        opacity: 0.45,
        roughness: 0.65,
        flatShading: false,
        depthWrite: false,
      }),
    );
    placementPosition.set(0, definition.groundOffset, 0);
    previewMesh.position.copy(placementPosition);
    scene.add(previewMesh);
  } else if (selectedObjects.length > 0) {
    updateSelectionTransformTarget();
  }
  if (lastCursorEvent) updateCursorAppearance(lastCursorEvent);
}

insertButton.addEventListener('click', () => {
  if (pointEditObject) return;
  const isOpen = insertButton.getAttribute('aria-expanded') === 'true';
  insertButton.setAttribute('aria-expanded', String(!isOpen));
  insertMenu.hidden = isOpen;
  worldInsertButton.setAttribute('aria-expanded', 'false');
  worldInsertMenu.hidden = true;
  featureMenu.hidden = true;
  featureButton.setAttribute('aria-expanded', 'false');
  lightingMenu.hidden = true;
  lightingButton.setAttribute('aria-expanded', 'false');
});

featureButton.addEventListener('click', () => {
  const isOpen = featureButton.getAttribute('aria-expanded') === 'true';
  featureButton.setAttribute('aria-expanded', String(!isOpen));
  featureMenu.hidden = isOpen;
  if (isOpen) {
    lightingMenu.hidden = true;
    lightingButton.setAttribute('aria-expanded', 'false');
  }
});

worldInsertButton.addEventListener('click', () => {
  const isOpen = worldInsertButton.getAttribute('aria-expanded') === 'true';
  worldInsertButton.setAttribute('aria-expanded', String(!isOpen));
  worldInsertMenu.hidden = isOpen;
  if (isOpen) {
    lightingMenu.hidden = true;
    lightingButton.setAttribute('aria-expanded', 'false');
  }
});

worldSkyboxInsertButton.addEventListener('click', () => {
  if (pointEditObject && !finishPointEditing(true)) return;
  worldInsertMenu.hidden = true;
  worldInsertButton.setAttribute('aria-expanded', 'false');
  lightingMenu.hidden = true;
  lightingButton.setAttribute('aria-expanded', 'false');
  addWorldSkybox();
});

viewButton.addEventListener('click', () => {
  const isOpen = viewButton.getAttribute('aria-expanded') === 'true';
  viewButton.setAttribute('aria-expanded', String(!isOpen));
  viewMenu.hidden = isOpen;
  renderMenu.hidden = true;
  renderMenuButton.setAttribute('aria-expanded', 'false');
  insertMenu.hidden = true;
  insertButton.setAttribute('aria-expanded', 'false');
  featureMenu.hidden = true;
  featureButton.setAttribute('aria-expanded', 'false');
  lightingMenu.hidden = true;
  lightingButton.setAttribute('aria-expanded', 'false');
  worldInsertMenu.hidden = true;
  worldInsertButton.setAttribute('aria-expanded', 'false');
});

function closePreferences() {
  preferencesPanel.hidden = true;
  viewButton.focus();
}

preferencesButton.addEventListener('click', () => {
  viewMenu.hidden = true;
  viewButton.setAttribute('aria-expanded', 'false');
  preferencesPanel.hidden = false;
  const savedLeft = Number(localStorage.getItem('propeller.preferencesLeft'));
  const savedTop = Number(localStorage.getItem('propeller.preferencesTop'));
  if (Number.isFinite(savedLeft) && Number.isFinite(savedTop) &&
    localStorage.getItem('propeller.preferencesLeft') !== null &&
    localStorage.getItem('propeller.preferencesTop') !== null) {
    preferencesPanel.style.left = `${savedLeft}%`;
    preferencesPanel.style.top = `${savedTop}%`;
    preferencesPanel.style.transform = 'none';
  }
  preferencesClose.focus();
});
preferencesClose.addEventListener('click', closePreferences);
preferencesTabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const tab = button.dataset.preferencesTab;
    preferencesTabButtons.forEach((tabButton) => {
      const selected = tabButton === button;
      tabButton.classList.toggle('active', selected);
      tabButton.setAttribute('aria-selected', String(selected));
    });
    preferencesPages.forEach((page) => { page.hidden = page.dataset.preferencesPage !== tab; });
  });
});
preferencesHeader.addEventListener('pointerdown', (event) => {
  if (event.target instanceof Element && event.target.closest('.preferences-close')) return;
  event.preventDefault();
  const editorBounds = editor.getBoundingClientRect();
  const panelBounds = preferencesPanel.getBoundingClientRect();
  const startX = event.clientX;
  const startY = event.clientY;
  const originLeft = panelBounds.left - editorBounds.left;
  const originTop = panelBounds.top - editorBounds.top;
  preferencesHeader.setPointerCapture(event.pointerId);
  const move = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== event.pointerId) return;
    const maxLeft = Math.max(0, editor.clientWidth - preferencesPanel.offsetWidth);
    const maxTop = Math.max(0, editor.clientHeight - preferencesPanel.offsetHeight);
    const left = THREE.MathUtils.clamp(originLeft + moveEvent.clientX - startX, 0, maxLeft);
    const top = THREE.MathUtils.clamp(originTop + moveEvent.clientY - startY, 0, maxTop);
    preferencesPanel.style.left = `${left}px`;
    preferencesPanel.style.top = `${top}px`;
    preferencesPanel.style.transform = 'none';
  };
  const finish = (upEvent: PointerEvent) => {
    if (upEvent.pointerId !== event.pointerId) return;
    preferencesHeader.removeEventListener('pointermove', move);
    preferencesHeader.removeEventListener('pointerup', finish);
    preferencesHeader.removeEventListener('pointercancel', finish);
    localStorage.setItem('propeller.preferencesLeft', String((preferencesPanel.offsetLeft / editor.clientWidth) * 100));
    localStorage.setItem('propeller.preferencesTop', String((preferencesPanel.offsetTop / editor.clientHeight) * 100));
  };
  preferencesHeader.addEventListener('pointermove', move);
  preferencesHeader.addEventListener('pointerup', finish);
  preferencesHeader.addEventListener('pointercancel', finish);
});
for (const input of [uiAccentColor, uiBackgroundColor, uiPanelColor]) {
  input.addEventListener('input', applyUiColors);
}
resetUiColors.addEventListener('click', () => {
  uiAccentColor.value = defaultUiColors.accent;
  uiBackgroundColor.value = defaultUiColors.background;
  uiPanelColor.value = defaultUiColors.panel;
  applyUiColors();
});
autoOpenModel.addEventListener('change', () => {
  localStorage.setItem('propeller.autoOpenModel', String(autoOpenModel.checked));
});
autoOpenChromatics.addEventListener('change', () => {
  localStorage.setItem('propeller.autoOpenChromatics', String(autoOpenChromatics.checked));
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !preferencesPanel.hidden) closePreferences();
});

renderMenuButton.addEventListener('click', () => {
  const isOpen = renderMenuButton.getAttribute('aria-expanded') === 'true';
  renderMenuButton.setAttribute('aria-expanded', String(!isOpen));
  renderMenu.hidden = isOpen;
});

document.addEventListener('pointerdown', (event) => {
  const target = event.target as Node;
  if (!viewMenu.contains(target) && !viewButton.contains(target)) {
    viewMenu.hidden = true;
    viewButton.setAttribute('aria-expanded', 'false');
    renderMenu.hidden = true;
    renderMenuButton.setAttribute('aria-expanded', 'false');
  }
});

lightingButton.addEventListener('click', () => {
  if (pointEditObject) return;
  const isOpen = lightingButton.getAttribute('aria-expanded') === 'true';
  lightingButton.setAttribute('aria-expanded', String(!isOpen));
  lightingMenu.hidden = isOpen;
});

lightingMenu.querySelectorAll<HTMLButtonElement>('[data-light]').forEach((button) => {
  button.addEventListener('click', () => {
    const type = button.dataset.light;
    if (type !== 'spot' && type !== 'directional' && type !== 'point') return;
    if (pointEditObject && !finishPointEditing(true)) return;
    lightingMenu.hidden = true;
    lightingButton.setAttribute('aria-expanded', 'false');
    worldInsertMenu.hidden = true;
    worldInsertButton.setAttribute('aria-expanded', 'false');
    insertMenu.hidden = true;
    insertButton.setAttribute('aria-expanded', 'false');
    addLight(type);
  });
});

document.addEventListener('pointerdown', (event) => {
  const target = event.target as Node;
  if (!insertMenu.contains(target) && !insertButton.contains(target)) {
    insertMenu.hidden = true;
    insertButton.setAttribute('aria-expanded', 'false');
  }
  if (!featureMenu.contains(target) && !featureButton.contains(target)) {
    featureMenu.hidden = true;
    featureButton.setAttribute('aria-expanded', 'false');
  }
  if (!worldInsertMenu.contains(target) && !worldInsertButton.contains(target)) {
    lightingMenu.hidden = true;
    lightingButton.setAttribute('aria-expanded', 'false');
  } else if (!lightingMenu.contains(target) && !lightingButton.contains(target)) {
    lightingMenu.hidden = true;
    lightingButton.setAttribute('aria-expanded', 'false');
  }
  if (!worldInsertMenu.contains(target) && !worldInsertButton.contains(target)) {
    worldInsertMenu.hidden = true;
    worldInsertButton.setAttribute('aria-expanded', 'false');
  }
});

insertMenu.querySelectorAll<HTMLButtonElement>('[data-shape]').forEach((button) => {
  button.addEventListener('click', () => {
    if (pointEditObject) return;
    const shape = button.dataset.shape;
    if (!shape || !shapeDefinitions[shape]) return;
    insertMenu.hidden = true;
    insertButton.setAttribute('aria-expanded', 'false');
    featureMenu.hidden = true;
    featureButton.setAttribute('aria-expanded', 'false');
    lightingMenu.hidden = true;
    lightingButton.setAttribute('aria-expanded', 'false');
    setPlacementMode(shape);
  });
});

sceneDisclosure.addEventListener('click', () => {
  const expanded = sceneDisclosure.getAttribute('aria-expanded') === 'true';
  sceneDisclosure.setAttribute('aria-expanded', String(!expanded));
  sceneDisclosure.querySelector('.chevron')!.textContent = expanded ? '›' : '⌄';
  sceneContents.hidden = expanded;
});

sceneContents.addEventListener('dragover', (event) => {
  if (event.target !== sceneContents || !event.dataTransfer?.types.includes('text/plain')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  sceneContents.classList.add('drop-target');
});
sceneContents.addEventListener('dragleave', (event) => {
  if (event.target === sceneContents) sceneContents.classList.remove('drop-target');
});
sceneContents.addEventListener('drop', (event) => {
  if (event.target !== sceneContents) return;
  event.preventDefault();
  sceneContents.classList.remove('drop-target');
  const source = objects.find((object) => object.uuid === event.dataTransfer?.getData('text/plain'));
  if (source) moveMeshToParent(source, null);
});
sceneDisclosure.addEventListener('dragover', (event) => {
  if (!event.dataTransfer?.types.includes('text/plain')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
});
sceneDisclosure.addEventListener('drop', (event) => {
  event.preventDefault();
  const source = objects.find((object) => object.uuid === event.dataTransfer?.getData('text/plain'));
  if (source) moveMeshToParent(source, null);
});

document.querySelectorAll<HTMLButtonElement>('.tool-button').forEach((button) => {
  button.addEventListener('click', () => {
    const mode = button.dataset.mode as TransformMode | undefined;
    if (!mode) return;
    if (pointEditObject && mode !== 'translate') return;
    if (pointEditObject && mode === 'translate') setGeoMoveEnabled(true);
    setEyedropperEnabled(false);
    transformMode = mode;
    document.querySelectorAll('.tool-button').forEach((tool) => {
      tool.classList.remove('active');
      tool.setAttribute('aria-pressed', 'false');
    });
    button.classList.add('active');
    button.setAttribute('aria-pressed', 'true');
    if (selectedObject) {
      if (selectedObjects.length > 1) {
        updateSelectionTransformTarget();
      } else if (pointEditObject === selectedObject) {
        if (selectedGeometryPoints.length > 0) setGeometryPointSelection(selectedGeometryPoints);
        else transformControls.detach();
      } else if (mode === 'select' || isWorldSkybox(selectedObject) || isObjectLocked(selectedObject)) {
        transformControls.detach();
      } else {
        transformControls.setMode(mode);
        transformControls.attach(getMeshTransformTarget(selectedObject, mode));
      }
    }
  });
});

function updatePlacementPoint(event: Pick<PointerEvent, 'clientX' | 'clientY'>) {
  if (!placementShape || !previewMesh) return;
  lastPointerPosition.set(event.clientX, event.clientY);
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  const surfaceHit = raycaster.intersectObjects(objects, false)[0];
  if (surfaceHit?.face) {
    const normal = surfaceHit.face.normal.clone()
      .applyMatrix3(new THREE.Matrix3().getNormalMatrix(surfaceHit.object.matrixWorld))
      .normalize();
    const support = getMeshSupport(previewMesh, normal);
    placementPosition.copy(surfaceHit.point).addScaledVector(normal, support + 0.001);
    if (snappingEnabled) snapPlacementPosition(placementPosition, shapeDefinitions[placementShape].groundOffset);
    previewMesh.position.copy(placementPosition);
    return;
  }

  const hit = raycaster.ray.intersectPlane(placementPlane, new THREE.Vector3());
  if (!hit) return;
  const groundOffset = shapeDefinitions[placementShape].groundOffset;
  placementPosition.set(hit.x, groundOffset, hit.z);
  if (snappingEnabled) snapPlacementPosition(placementPosition, groundOffset);
  previewMesh.position.copy(placementPosition);
}

function getMeshSupport(mesh: THREE.Mesh, direction: THREE.Vector3): number {
  mesh.geometry.computeBoundingBox();
  const bounds = mesh.geometry.boundingBox;
  if (!bounds) throw new Error(`Geometry bounds for "${mesh.name || 'preview'}" could not be computed.`);
  let support = 0;
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const corner = new THREE.Vector3(x, y, z)
          .multiply(mesh.scale)
          .applyQuaternion(mesh.quaternion);
        support = Math.max(support, Math.abs(corner.dot(direction)));
      }
    }
  }
  return support;
}

function snapPlacementPosition(position: THREE.Vector3, groundOffset: number) {
  const step = 0.5;
  position.x = Math.round(position.x / step) * step;
  position.y = groundOffset + Math.round((position.y - groundOffset) / step) * step;
  position.z = Math.round(position.z / step) * step;
}

function setSnappingEnabled(enabled: boolean) {
  snappingEnabled = enabled;
  snapButton.setAttribute('aria-pressed', String(enabled));
  transformControls.setTranslationSnap(enabled ? 1 : null);
  transformControls.setRotationSnap(enabled ? THREE.MathUtils.degToRad(15) : null);
  transformControls.setScaleSnap(enabled ? 0.25 : null);
}

snapButton.addEventListener('click', () => setSnappingEnabled(!snappingEnabled));

renderer.domElement.addEventListener('pointermove', (event) => {
  updatePlacementPoint(event);
  updateEyedropperHover(event);
});
renderer.domElement.addEventListener('pointerleave', () => {
  hoverHighlight.visible = false;
});
let selectionPointerStart: { x: number; y: number } | null = null;
function updateSelectionBox(event: Pick<PointerEvent, 'clientX' | 'clientY'>) {
  if (!boxSelectionStart) return;
  const bounds = viewport.getBoundingClientRect();
  const left = Math.min(boxSelectionStart.x, event.clientX) - bounds.left;
  const top = Math.min(boxSelectionStart.y, event.clientY) - bounds.top;
  selectionBox.style.left = `${left}px`;
  selectionBox.style.top = `${top}px`;
  selectionBox.style.width = `${Math.abs(event.clientX - boxSelectionStart.x)}px`;
  selectionBox.style.height = `${Math.abs(event.clientY - boxSelectionStart.y)}px`;
}

function getObjectsInSelectionBox(start: { x: number; y: number }, end: { x: number; y: number }) {
  const selection = {
    left: Math.min(start.x, end.x),
    right: Math.max(start.x, end.x),
    top: Math.min(start.y, end.y),
    bottom: Math.max(start.y, end.y),
  };
  const viewportBounds = renderer.domElement.getBoundingClientRect();
  const selected: THREE.Mesh[] = [];
  const worldBounds = new THREE.Box3();
  const projected = new THREE.Vector3();
  for (const mesh of objects) {
    if (!objectShapes.has(mesh) || isObjectLocked(mesh)) continue;
    worldBounds.setFromObject(mesh);
    if (worldBounds.isEmpty()) continue;
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    let minDepth = Infinity;
    let maxDepth = -Infinity;
    for (let x = 0; x <= 1; x += 1) {
      for (let y = 0; y <= 1; y += 1) {
        for (let z = 0; z <= 1; z += 1) {
          projected.set(
            x ? worldBounds.max.x : worldBounds.min.x,
            y ? worldBounds.max.y : worldBounds.min.y,
            z ? worldBounds.max.z : worldBounds.min.z,
          ).project(camera);
          left = Math.min(left, viewportBounds.left + (projected.x + 1) * viewportBounds.width / 2);
          right = Math.max(right, viewportBounds.left + (projected.x + 1) * viewportBounds.width / 2);
          top = Math.min(top, viewportBounds.top + (1 - projected.y) * viewportBounds.height / 2);
          bottom = Math.max(bottom, viewportBounds.top + (1 - projected.y) * viewportBounds.height / 2);
          minDepth = Math.min(minDepth, projected.z);
          maxDepth = Math.max(maxDepth, projected.z);
        }
      }
    }
    if (minDepth > 1 || maxDepth < -1) continue;
    if (left >= selection.left && right <= selection.right &&
      top >= selection.top && bottom <= selection.bottom) selected.push(mesh);
  }
  return selected;
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button !== 1 || freeCameraEnabled || placementShape || pointEditObject ||
    addingGeometryPoint || isTransformDragging) return;
  boxSelectionStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  pointInteractionLocked = true;
  selectionBox.hidden = false;
  updateSelectionBox(event);
  renderer.domElement.setPointerCapture(event.pointerId);
  syncNavigationControls();
  event.preventDefault();
  event.stopImmediatePropagation();
});
window.addEventListener('pointermove', (event) => {
  if (!boxSelectionStart || event.pointerId !== boxSelectionStart.pointerId) return;
  updateSelectionBox(event);
  event.preventDefault();
});
window.addEventListener('pointerup', (event) => {
  if (!boxSelectionStart || event.pointerId !== boxSelectionStart.pointerId || event.button !== 1) return;
  const start = { x: boxSelectionStart.x, y: boxSelectionStart.y };
  boxSelectionStart = null;
  pointInteractionLocked = false;
  selectionBox.hidden = true;
  const end = { x: event.clientX, y: event.clientY };
  const selected = Math.hypot(end.x - start.x, end.y - start.y) > 4
    ? getObjectsInSelectionBox(start, end)
    : [];
  setSelectedObjects(selected);
  syncNavigationControls();
});
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (!placementShape || event.button !== 0) return;
  updatePlacementPoint(event);
  const shape = placementShape;
  addObject(shape, placementPosition.clone().setY(placementPosition.y - shapeDefinitions[shape].groundOffset));
  setPlacementMode(null);
  placementJustCommitted = true;
});

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (!addingGeometryPoint || !pointEditObject || event.button !== 0) return;
  event.stopImmediatePropagation();
  pointInteractionLocked = true;
  syncNavigationControls();
  const mesh = pointEditObject;
  const localPoint = placePointOnSurface(event);
  if (!localPoint) {
    if (pointStatusElement) pointStatusElement.textContent = 'Point could not be placed on the view plane.';
    return;
  }
  const points = pointGeometryPoints.get(mesh);
  if (!points) throw new Error('Point geometry data is unavailable while adding a point.');
  points.push(localPoint.clone());
  pointGeometryEditStates.get(mesh)?.basePoints.push(localPoint.clone());
  pointGeometryBasePoints.get(mesh)?.push(localPoint.clone());
  addGeometryPointMarker(mesh, localPoint);
  updatePointGeometryHierarchy(mesh);
  addingGeometryPoint = false;
  updatePointEditToolbar();
  updatePointGeometryProperties(mesh);
  event.preventDefault();
});

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (!pointEditObject || isObjectLocked(pointEditObject) || event.button !== 0) return;
  if (transformControls.dragging) return;
  pointInteractionLocked = true;
  syncNavigationControls();
  const point = getGeometryPointAtPointer(event);
  if (!point) {
    if (manualPointSelectionEnabled) {
      setGeometryPointSelection([]);
      if (pointStatusElement) pointStatusElement.textContent = 'No points selected. Click points to select them.';
    }
    event.stopImmediatePropagation();
    event.preventDefault();
    return;
  }
  if (manualPointSelectionEnabled) {
    const nextSelection = selectedGeometryPoints.includes(point)
      ? selectedGeometryPoints.filter((selectedPoint) => selectedPoint !== point)
      : [...selectedGeometryPoints, point];
    setGeometryPointSelection(nextSelection);
  } else {
    setGeometryPointSelection([point]);
  }
  if (manualPointSelectionEnabled && pointStatusElement) {
    pointStatusElement.textContent = `${selectedGeometryPoints.length} point${selectedGeometryPoints.length === 1 ? '' : 's'} selected. Move the selection with the gizmo.`;
  }
  event.stopImmediatePropagation();
  event.preventDefault();
});

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (placementShape || placementJustCommitted || pointEditObject || addingGeometryPoint || event.button !== 0) {
    selectionPointerStart = null;
    placementJustCommitted = false;
    return;
  }
  selectionPointerStart = { x: event.clientX, y: event.clientY };
});
renderer.domElement.addEventListener('pointerup', (event) => {
  if (!selectionPointerStart) return;
  if (placementShape || isTransformDragging) {
    selectionPointerStart = null;
    return;
  }
  const movedX = event.clientX - selectionPointerStart.x;
  const movedY = event.clientY - selectionPointerStart.y;
  selectionPointerStart = null;
  if (Math.hypot(movedX, movedY) > 4) return;

  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  if (pointEditObject) {
    setGeometryPointSelection([]);
    return;
  }
  const [hit] = raycaster.intersectObjects(objects, false);
  if (eyedropperEnabled) {
    const sampledObject = hit?.object instanceof THREE.Mesh ? hit.object : null;
    if (!sampledObject || isObjectLocked(sampledObject)) return;
    const sampledMaterial = sampledObject.material;
    if (!(sampledMaterial instanceof THREE.MeshStandardMaterial)) {
      throw new Error(`Cannot sample color from "${sampledObject.name}".`);
    }
    if (!eyedropperColor) {
      eyedropperColor = sampledMaterial.color.clone();
      eyedropperButton.textContent = `Painting #${eyedropperColor.getHexString()}…`;
      recordRecentColor(eyedropperColor);
      selectObject(sampledObject);
      return;
    }
    sampledMaterial.color.copy(eyedropperColor);
    recordRecentColor(eyedropperColor);
    eyedropperButton.textContent = `Painting #${eyedropperColor.getHexString()}…`;
    selectObject(sampledObject);
    return;
  }
  selectObject(hit?.object instanceof THREE.Mesh ? hit.object : null);
});

window.addEventListener('keydown', (event) => {
  const target = event.target;
  const isEditingText = target instanceof HTMLElement &&
    (target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement);
  if (isEditingText) return;

  if (!event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey &&
    (event.code === 'Backquote' || event.key === '`')) {
    event.preventDefault();
    setFreeCameraEnabled(!freeCameraEnabled);
    return;
  }
  if (event.repeat) return;

  if (freeCameraEnabled &&
    ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyC', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
    event.preventDefault();
    freeCameraKeys.add(event.code);
    return;
  }

  if (pointEditObject && event.altKey && event.key.toLowerCase() === 'a') {
    event.preventDefault();
    manualPointSelectionEnabled = !manualPointSelectionEnabled;
    setGeoMoveEnabled(true);
    transformMode = 'translate';
    document.querySelectorAll<HTMLButtonElement>('.tool-button').forEach((button) => {
      const active = button.dataset.mode === 'translate';
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (!manualPointSelectionEnabled) setGeometryPointSelection([]);
    if (pointStatusElement) {
      pointStatusElement.textContent = manualPointSelectionEnabled
        ? 'Manual point selection enabled. Click points to add or remove them from the selection, then move them with the gizmo.'
        : 'Manual point selection disabled.';
    }
    return;
  }

  if (pointEditObject && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
    event.preventDefault();
    manualPointSelectionEnabled = false;
    setGeoMoveEnabled(true);
    transformMode = 'translate';
    document.querySelectorAll<HTMLButtonElement>('.tool-button').forEach((button) => {
      const active = button.dataset.mode === 'translate';
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    setGeometryPointSelection(geometryPointMarkers);
    if (pointStatusElement) {
      pointStatusElement.textContent = `${selectedGeometryPoints.length} points selected. Move the selection with the gizmo.`;
    }
    return;
  }

  if (event.key === 'Escape' && eyedropperEnabled) {
    setEyedropperEnabled(false);
    return;
  }
  if (event.key === 'Escape' && !objectContextMenu.hidden) {
    closeObjectContextMenu();
    return;
  }
  if (event.key === 'Escape' && freeCameraEnabled) {
    setFreeCameraEnabled(false);
    return;
  }

  if (!placementShape && (event.key === 'Delete' || event.key === 'Backspace') && selectedObject) {
    event.preventDefault();
    deleteSelectedObject();
    return;
  }
  if (!placementShape && (event.ctrlKey || event.metaKey) &&
    !event.shiftKey && event.key.toLowerCase() === 'c' && selectedObject) {
    event.preventDefault();
    cloneSelectedObject();
    return;
  }

  if (event.key.toLowerCase() === 'q') {
    event.preventDefault();
    setSnappingEnabled(!snappingEnabled);
    if (placementShape) updatePlacementPoint({
      clientX: lastPointerPosition.x,
      clientY: lastPointerPosition.y,
    });
    return;
  }
  if (!placementShape) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    addObject(placementShape, new THREE.Vector3(0, 0, 0));
    setPlacementMode(null);
  } else if (event.key === 'Escape') {
    setPlacementMode(null);
  }
});

window.addEventListener('keyup', (event) => {
  freeCameraKeys.delete(event.code);
});

function resizeViewport() {
  const { clientWidth, clientHeight } = viewport;
  if (clientWidth === 0 || clientHeight === 0) return;
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(clientWidth, clientHeight);
}

const resizeObserver = new ResizeObserver(resizeViewport);
resizeObserver.observe(viewport);

let resizingSidebar = false;
sidebarResize.addEventListener('pointerdown', (event) => {
  resizingSidebar = true;
  sidebarResize.setPointerCapture(event.pointerId);
  event.preventDefault();
});
sidebarResize.addEventListener('pointermove', (event) => {
  if (!resizingSidebar) return;
  const sidebarWidth = THREE.MathUtils.clamp(
    sidebar.getBoundingClientRect().right - event.clientX,
    180,
    window.innerWidth * 0.55,
  );
  sidebar.style.width = `${sidebarWidth}px`;
  sidebar.style.flexBasis = `${sidebarWidth}px`;
  sidebarResize.setAttribute('aria-valuenow', String(Math.round(sidebarWidth)));
});
sidebarResize.addEventListener('pointerup', () => {
  resizingSidebar = false;
});
sidebarResize.addEventListener('pointercancel', () => {
  resizingSidebar = false;
});
sidebarResize.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  const direction = event.key === 'ArrowLeft' ? 1 : -1;
  const width = THREE.MathUtils.clamp(sidebar.clientWidth + direction * 20, 180, window.innerWidth * 0.55);
  sidebar.style.width = `${width}px`;
  sidebar.style.flexBasis = `${width}px`;
  sidebarResize.setAttribute('aria-valuenow', String(Math.round(width)));
});

function setHierarchyPanelHeight(clientY: number) {
  const bounds = sidebar.getBoundingClientRect();
  const percent = THREE.MathUtils.clamp((clientY - bounds.top) / bounds.height, 0.15, 0.85) * 100;
  hierarchyPanel.style.flex = `0 0 ${percent}%`;
  propertiesPanel.style.flex = '1 1 0';
  panelResize.setAttribute('aria-valuenow', String(Math.round(percent)));
}
let resizingPanels = false;
panelResize.addEventListener('pointerdown', (event) => {
  resizingPanels = true;
  panelResize.setPointerCapture(event.pointerId);
  setHierarchyPanelHeight(event.clientY);
  event.preventDefault();
});
panelResize.addEventListener('pointermove', (event) => {
  if (resizingPanels) setHierarchyPanelHeight(event.clientY);
});
panelResize.addEventListener('pointerup', () => {
  resizingPanels = false;
});
panelResize.addEventListener('pointercancel', () => {
  resizingPanels = false;
});
panelResize.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  event.preventDefault();
  const bounds = hierarchyPanel.getBoundingClientRect();
  const delta = event.key === 'ArrowUp' ? -20 : 20;
  setHierarchyPanelHeight(bounds.bottom + delta);
});

function setPbrDockHeight(height: number) {
  const editorBounds = editor.getBoundingClientRect();
  const maximumHeight = Math.min(420, editorBounds.height * 0.6);
  const dockHeight = THREE.MathUtils.clamp(height, 96, maximumHeight);
  editor.style.setProperty('--pbr-dock-height', `${dockHeight}px`);
  pbrDockResize.setAttribute('aria-valuemax', String(Math.round(maximumHeight)));
  pbrDockResize.setAttribute('aria-valuenow', String(Math.round(dockHeight)));
}

let resizingPbrDock = false;
pbrDockResize.addEventListener('pointerdown', (event) => {
  resizingPbrDock = true;
  pbrDockResize.setPointerCapture(event.pointerId);
  event.preventDefault();
});
pbrDockResize.addEventListener('pointermove', (event) => {
  if (!resizingPbrDock) return;
  const editorBounds = editor.getBoundingClientRect();
  setPbrDockHeight(editorBounds.bottom - event.clientY);
});
pbrDockResize.addEventListener('pointerup', () => {
  resizingPbrDock = false;
});
pbrDockResize.addEventListener('pointercancel', () => {
  resizingPbrDock = false;
});
pbrDockResize.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  event.preventDefault();
  const currentHeight = Number.parseFloat(getComputedStyle(editor).getPropertyValue('--pbr-dock-height'));
  setPbrDockHeight(currentHeight + (event.key === 'ArrowUp' ? 20 : -20));
});

function render() {
  const now = performance.now();
  const deltaSeconds = Math.min((now - previousFrameTime) / 1000, 0.05);
  previousFrameTime = now;
  if (freeCameraEnabled && freeCameraKeys.size > 0) {
    const forward = camera.getWorldDirection(new THREE.Vector3()).normalize();
    const right = forward.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    const movement = new THREE.Vector3();
    if (freeCameraKeys.has('KeyW')) movement.add(forward);
    if (freeCameraKeys.has('KeyS')) movement.sub(forward);
    if (freeCameraKeys.has('KeyD')) movement.add(right);
    if (freeCameraKeys.has('KeyA')) movement.sub(right);
    if (freeCameraKeys.has('Space')) movement.y += 1;
    if (freeCameraKeys.has('KeyC')) movement.y -= 1;
    if (movement.lengthSq() > 0) {
      movement.normalize();
      const speed = freeCameraKeys.has('ShiftLeft') || freeCameraKeys.has('ShiftRight') ? 24 : 8;
      camera.position.addScaledVector(movement, speed * deltaSeconds);
    }
  }
  if (!freeCameraEnabled) controls.update();
  if (selectedObject && selectionHighlight.visible) selectionHighlight.update();
  additionalSelectionHighlights.forEach((helper) => helper.update());
  updateGeometryPointMarkerScale();
  grid.position.x = camera.position.x;
  grid.position.z = camera.position.z;
  cameraPositionUniform.value.copy(camera.position);
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

let previousFrameTime = performance.now();
render();
