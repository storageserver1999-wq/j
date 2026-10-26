import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { drawColorWheel, hsvToRgb, rgbToHsv } from './color-utils';
import { computeGeometryNormals, createTriangleGeometry, shapeDefinitions } from './geometry';
import { clearWorldSkybox, createWorldSkybox, createWorldSkyboxProperties, isWorldSkybox } from './world-skybox';
import { createDisplayModeController, type ObjectDisplayMode } from './display-modes';
import { ScenePipeline } from './scene-pipeline';
import { ViewGizmo, type ViewGizmoDirection } from './view-gizmo';
import {
  DEFAULT_TEXTURE_SETTINGS,
  MAX_TEXTURE_SIZE,
  createTexturePreview,
  createTextureWorkspace,
  saveSurfaceDefaults,
  type TextureApplyDetail,
  type TextureEntry,
  type TextureMap,
  type TextureMapKey,
  type TexturePreview,
  type TextureSettings,
} from './texture-workspace';
import {
  buildAlphaMask,
  isSupportedModelFile,
  loadModel,
  type ImportedContentNode,
  type ImportedMissingTexture,
  type ImportedPieceRange,
} from './model-import';
import type { RayTracedLight, RayTracingQuality } from './ray-tracing';
import type { GodRaysQuality } from './god-rays';
import { MeshBasicNodeMaterial, PMREMGenerator, WebGPURenderer } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import './style.css';

const viewportElement = document.querySelector<HTMLDivElement>('#viewport');
const gpuErrorElement = document.querySelector<HTMLDivElement>('#gpu-error');
const editorElement = document.querySelector<HTMLElement>('.editor');
const displayModeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.display-mode-button'));
const toolbarElement = document.querySelector<HTMLDivElement>('.toolbar');
const sidebarElement = document.querySelector<HTMLElement>('.sidebar-right');
const leftSidebarElement = document.querySelector<HTMLElement>('.sidebar-left');
const sidebarResizeElement = document.querySelector<HTMLDivElement>('.sidebar-resize-right');
const leftSidebarResizeElement = document.querySelector<HTMLDivElement>('.sidebar-resize-left');

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
const rayTracingQualityElement = document.querySelector<HTMLSelectElement>('#ray-tracing-quality');
const rayTracingQualityFieldElement = document.querySelector<HTMLElement>('#ray-tracing-quality-field');
const rayTracingNoteElement = document.querySelector<HTMLElement>('#ray-tracing-note');
const autoOpenModelElement = document.querySelector<HTMLInputElement>('#auto-open-model');
const autoOpenChromaticsElement = document.querySelector<HTMLInputElement>('#auto-open-chromatics');
const uiAccentColorElement = document.querySelector<HTMLInputElement>('#ui-accent-color');
const uiBackgroundColorElement = document.querySelector<HTMLInputElement>('#ui-background-color');
const uiPanelColorElement = document.querySelector<HTMLInputElement>('#ui-panel-color');
const resetUiColorsElement = document.querySelector<HTMLButtonElement>('#reset-ui-colors');
const featureButtonElement = document.querySelector<HTMLButtonElement>('.feature-button');
const featureMenuElement = document.querySelector<HTMLDivElement>('#feature-menu');
const sunRaysButtonElement = document.querySelector<HTMLButtonElement>('.sun-rays-button');
const worldInsertButtonElement = document.querySelector<HTMLButtonElement>('.world-insert-button');
const worldInsertMenuElement = document.querySelector<HTMLDivElement>('#world-insert-menu');
const insertSearchElement = document.querySelector<HTMLInputElement>('#insert-search');
const insertEmptyElement = document.querySelector<HTMLParagraphElement>('.insert-empty');
const shadowsSettingsInsertElement = document.querySelector<HTMLButtonElement>('.shadows-settings-insert');
const atmosphereSettingsInsertElement = document.querySelector<HTMLButtonElement>('.atmosphere-settings-insert');
const monitorSettingsInsertElement = document.querySelector<HTMLButtonElement>('.monitor-settings-insert');
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
const playButtonElement = document.querySelector<HTMLButtonElement>('.play-button');
const playStopButtonElement = document.querySelector<HTMLButtonElement>('.play-stop-button');
const cameraInsertButtonElement = document.querySelector<HTMLButtonElement>('.camera-insert-button');
const workspaceCanvasElement = document.querySelector<HTMLCanvasElement>('#pbr-workspace-canvas');
const workspaceWrapElement = document.querySelector<HTMLElement>('.texture-grid-wrap');
const workspaceGridElement = document.querySelector<HTMLElement>('.texture-grid');
const workspaceTabsElement = document.querySelector<HTMLDivElement>('.workspace-tabs');
const workspaceAddButtonElement = document.querySelector<HTMLButtonElement>('.workspace-add-button');
const workspaceAddMenuElement = document.querySelector<HTMLDivElement>('#workspace-add-menu');
const workspaceFileInputElement = document.querySelector<HTMLInputElement>('#workspace-file-input');
const workspaceStatusElement = document.querySelector<HTMLElement>('.pbr-texture-name');
const workspaceEmptyElement = document.querySelector<HTMLParagraphElement>('.workspace-empty');
const pbrDockElement = document.querySelector<HTMLElement>('.pbr-dock');
const workspaceCloseElement = document.querySelector<HTMLButtonElement>('.workspace-close-button');
const pbrMenuButtonElement = document.querySelector<HTMLButtonElement>('.pbr-menu-button');
const pbrMenuElement = document.querySelector<HTMLDivElement>('#pbr-menu');
const pbrDockToggleElement = document.querySelector<HTMLButtonElement>('.pbr-dock-toggle');
const modelFileInputElement = document.querySelector<HTMLInputElement>('#model-file-input');

if (!viewportElement || !gpuErrorElement || !editorElement || !toolbarElement || !sidebarElement ||
  !leftSidebarElement || !sidebarResizeElement || !leftSidebarResizeElement ||
  !hierarchyPanelElement || !propertiesPanelElement ||
  !pbrDockResizeElement ||
  !insertButtonElement || !insertMenuElement || !viewButtonElement || !viewMenuElement ||
  !renderMenuButtonElement || !renderMenuElement || !gridToggleButtonElement ||
  !preferencesButtonElement || !preferencesPanelElement || !preferencesCloseElement ||
  !preferencesHeaderElement || preferencesTabButtons.length !== 2 || preferencesPages.length !== 2 ||
  !autoOpenModelElement || !autoOpenChromaticsElement || !uiAccentColorElement ||
  !uiBackgroundColorElement || !uiPanelColorElement || !resetUiColorsElement ||
  !lightingTechnologyElement || !selectionBoxElement ||
  !featureButtonElement || !featureMenuElement || !sunRaysButtonElement ||
  !worldInsertButtonElement || !worldInsertMenuElement || !insertSearchElement || !insertEmptyElement ||
  !shadowsSettingsInsertElement || !atmosphereSettingsInsertElement || !monitorSettingsInsertElement || !worldSkyboxInsertButtonElement ||
  !sceneContentsElement || !sceneDisclosureElement || !propertiesElement ||
  !distanceInputElement || !distanceOutputElement || !customCursorElement || !snapButtonElement ||
  !editButtonElement || !editMenuElement || !eyedropperButtonElement || !pointGeoButtonElement ||
  !geoMoveButtonElement || !addGeometryPointButtonElement ||
  displayModeButtons.length !== 2 || !debugButtonElement || !debugPanelElement || !debugEmptyElement || !debugEntriesElement ||
  !debugClearElement || !objectContextMenuElement ||
  !playButtonElement || !playStopButtonElement || !cameraInsertButtonElement ||
  !workspaceCanvasElement || !workspaceWrapElement || !workspaceGridElement || !workspaceTabsElement ||
  !workspaceAddButtonElement || !workspaceAddMenuElement || !workspaceFileInputElement ||
  !workspaceStatusElement || !workspaceEmptyElement ||
  !pbrDockElement || !workspaceCloseElement || !pbrMenuButtonElement || !pbrMenuElement ||
  !pbrDockToggleElement || !modelFileInputElement) {
  throw new Error('One or more editor interface elements could not be found.');
}

const viewport = viewportElement;
const gpuError = gpuErrorElement;
const editor = editorElement;
const toolbar = toolbarElement;
const sidebar = sidebarElement;
const leftSidebar = leftSidebarElement;
const sidebarResize = sidebarResizeElement;
const leftSidebarResize = leftSidebarResizeElement;
const pbrDockResize = pbrDockResizeElement;
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
const sunRaysButton = sunRaysButtonElement;
const worldInsertButton = worldInsertButtonElement;
const worldInsertMenu = worldInsertMenuElement;
const insertSearch = insertSearchElement;
const insertEmpty = insertEmptyElement;
const shadowsSettingsInsertButton = shadowsSettingsInsertElement;
const atmosphereSettingsInsertButton = atmosphereSettingsInsertElement;
const monitorSettingsInsertButton = monitorSettingsInsertElement;
const worldSkyboxInsertButton = worldSkyboxInsertButtonElement;
const sceneContents = sceneContentsElement;
const sceneDisclosure = sceneDisclosureElement;
const properties = propertiesElement;
const workspaceCanvas = workspaceCanvasElement;
const workspaceWrap = workspaceWrapElement;
const workspaceGrid = workspaceGridElement;
const workspaceTabs = workspaceTabsElement;
const workspaceAddButton = workspaceAddButtonElement;
const workspaceAddMenu = workspaceAddMenuElement;
const workspaceFileInput = workspaceFileInputElement;
const workspaceStatus = workspaceStatusElement;
const workspaceEmpty = workspaceEmptyElement;
const pbrDock = pbrDockElement;
const workspaceClose = workspaceCloseElement;
const pbrMenuButton = pbrMenuButtonElement;
const pbrMenu = pbrMenuElement;
const pbrDockToggle = pbrDockToggleElement;
const modelFileInput = modelFileInputElement;

/** Paints the filled portion of a range bar and keeps it in sync with its value. */
function syncRangeBar(input: HTMLInputElement) {
  const min = Number(input.min || '0');
  const max = Number(input.max || '100');
  const value = Number(input.value);
  const ratio = max > min ? (value - min) / (max - min) : 0;
  input.style.setProperty('--bar-fill', `${(THREE.MathUtils.clamp(ratio, 0, 1) * 100).toFixed(2)}%`);
}

document.addEventListener('input', (event) => {
  if (event.target instanceof HTMLInputElement && event.target.type === 'range') {
    syncRangeBar(event.target);
  }
});

const rangeBarObserver = new MutationObserver(() => {
  properties.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach(syncRangeBar);
});
rangeBarObserver.observe(properties, { childList: true, subtree: true });

interface SliderFieldOptions {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  apply: (value: number) => void;
}

interface SliderField {
  field: HTMLLabelElement;
  setValue: (value: number) => void;
}

/** Compact labelled bar with arrow steppers, shared by the property panels. */
function createSliderField(options: SliderFieldOptions): SliderField {
  const { label, min, max, step, apply } = options;
  const field = document.createElement('label');
  field.className = 'property-field numeric-field';

  const head = document.createElement('div');
  head.className = 'numeric-field-head';
  const caption = document.createElement('span');
  caption.className = 'numeric-field-label';
  caption.textContent = label;
  const stepper = document.createElement('span');
  stepper.className = 'numeric-stepper';

  const input = document.createElement('input');
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(options.value);
  input.setAttribute('aria-label', label);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(options.value);
  slider.className = 'light-intensity-slider';
  slider.setAttribute('aria-label', `${label} slider`);

  const setValue = (value: number) => {
    const clamped = THREE.MathUtils.clamp(value, min, max);
    input.value = String(clamped);
    slider.value = String(clamped);
    syncRangeBar(slider);
  };

  slider.addEventListener('input', () => {
    const value = Number(slider.value);
    setValue(value);
    apply(value);
  });
  input.addEventListener('input', () => {
    if (input.value.trim() === '') return;
    const requested = Number(input.value);
    if (!Number.isFinite(requested)) return;
    setValue(requested);
    apply(THREE.MathUtils.clamp(requested, min, max));
  });

  const makeStepButton = (direction: -1 | 1) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.tabIndex = -1;
    button.textContent = direction < 0 ? '◀' : '▶';
    button.setAttribute('aria-label', `${direction < 0 ? 'Decrease' : 'Increase'} ${label}`);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const current = Number(input.value);
      const multiplier = event.shiftKey ? 10 : 1;
      const next = THREE.MathUtils.clamp(
        (Number.isFinite(current) ? current : options.value) + step * direction * multiplier,
        min,
        max,
      );
      setValue(Number(next.toFixed(4)));
      apply(next);
    });
    return button;
  };

  stepper.append(makeStepButton(-1), input, makeStepButton(1));
  head.append(caption, stepper);
  field.append(head, slider);
  syncRangeBar(slider);
  return { field, setValue };
}
const distanceInput = distanceInputElement;
const distanceOutput = distanceOutputElement;
const renderDistanceOptions = [5, 10, 20, 30, 50, 100, 250] as const;
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
const playButton = playButtonElement;
const playStopButton = playStopButtonElement;
const cameraInsertButton = cameraInsertButtonElement;
const contextLockButton = objectContextMenu.querySelector<HTMLButtonElement>('[data-action="lock"]')!;
const contextGroupChildrenButton = objectContextMenu.querySelector<HTMLButtonElement>('[data-action="group-children"]')!;
const contextUngroupButton = objectContextMenu.querySelector<HTMLButtonElement>('[data-action="ungroup"]')!;
const contextUngroupAllButton = objectContextMenu.querySelector<HTMLButtonElement>('[data-action="ungroup-all"]')!;
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

// The editor draws its own context menus. Stop the browser's Copy/Paste/Inspect
// menu from appearing over the custom UI (inputs still support keyboard paste).
window.addEventListener('contextmenu', (event) => {
  event.preventDefault();
}, { capture: true });

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
/** The baseline fill light. The Atmosphere settings drive its colours and strength. */
const ambientLight = new THREE.HemisphereLight('#e2e2e2', '#666666', 0.16);
scene.add(ambientLight);
/**
 * The editor's studio key and rim.
 *
 * The PBR ball in the texture panel is lit by a key/rim pair. Without an
 * equivalent in the scene, a textured wall or floor received only the even
 * environment, so sliding Roughness on a roughness map changed almost nothing
 * except how milky the surface looked — while the same material on the ball
 * showed a clear highlight. These never cast shadows and are not part of
 * `objects`, so they cannot be selected, cloned or traced as a user light.
 */
const studioKeyLight = new THREE.DirectionalLight('#ffffff', 0.9);
studioKeyLight.position.set(2.4, 3, 4);
studioKeyLight.castShadow = false;
scene.add(studioKeyLight);
const studioRimLight = new THREE.DirectionalLight('#bfd0e2', 0.3);
studioRimLight.position.set(-3, -1, 4);
studioRimLight.castShadow = false;
scene.add(studioRimLight);
const DEFAULT_TONE_MAPPING_EXPOSURE = 1.15;

/**
 * Procedural studio environment so metallic ("Reflectance") materials have
 * something to reflect. Without an environment map, metalness only removes the
 * diffuse response and the surface reads as black instead of reflective.
 */
function createStudioEnvironment(): THREE.DataTexture {
  const width = 256;
  const height = 128;
  // Half float, not float: WebGPU only guarantees filtering on half-float
  // textures, and a 32-bit float environment samples as black through the
  // PMREM blur chain on backends without `float32-filterable`.
  const data = new Uint16Array(width * height * 4);
  // The studio set carries its own brightness (HDR half-float data) instead of
  // relying on `scene.environmentIntensity`. The live reflection probe below
  // renders the real scene at 1:1, so its result has to be sampled at 1:1 as
  // well: an intensity above 1 would re-brighten every reflection and wash the
  // viewport out to white.
  // Ambient fill is deliberately restrained: a bright, even environment mixes
  // into a rough surface as a milky wash, so the key in the gradient has to be
  // brighter than the fill for roughness to read as shading instead of haze.
  const gain = 1.6;
  const ground = [42, 48, 56];
  const horizon = [139, 152, 168];
  const zenith = [195, 210, 228];
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const smoothstep = (edge0: number, edge1: number, value: number) => {
    const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const toLinear = (value: number) => {
    const c = THREE.MathUtils.clamp(value / 255, 0, 1);
    return (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) * gain;
  };
  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    // Continuous vertical gradient: ground -> horizon -> zenith. Every stop is
    // blended with a smoothstep, so a mirror ball never shows a hard seam or a
    // black line where two bands meet.
    const above = smoothstep(0.36, 0.72, v);
    const below = smoothstep(0.0, 0.36, v);
    const baseR = mix(mix(ground[0], horizon[0], below), zenith[0], above);
    const baseG = mix(mix(ground[1], horizon[1], below), zenith[1], above);
    const baseB = mix(mix(ground[2], horizon[2], below), zenith[2], above);
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      // Soft, wide key light: gives reflections direction without a hard edge.
      const key = Math.pow(Math.max(0, Math.cos((u - 0.3) * Math.PI * 2)), 4)
        * Math.exp(-Math.pow((v - 0.72) / 0.28, 2));
      const index = (y * width + x) * 4;
      data[index] = THREE.DataUtils.toHalfFloat(toLinear(baseR + key * 70));
      data[index + 1] = THREE.DataUtils.toHalfFloat(toLinear(baseG + key * 72));
      data[index + 2] = THREE.DataUtils.toHalfFloat(toLinear(baseB + key * 76));
      data[index + 3] = THREE.DataUtils.toHalfFloat(1);
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
const studioEnvironmentTexture = createStudioEnvironment();
scene.environmentIntensity = 1;

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

// WebGPU samples environment maps in the pre-filtered cube-UV layout, so the
// equirectangular studio texture has to go through PMREM before it can light or
// be mirrored by a material.
// `@types/three` still describes the WebGL PMREMGenerator, so the WebGPU one is
// typed through a narrow local interface.
interface WebGpuPmrem {
  fromEquirectangular(texture: THREE.Texture): { texture: THREE.Texture };
  fromScene(
    scene: THREE.Scene,
    sigma?: number,
    near?: number,
    far?: number,
    options?: {
      size?: number;
      position?: THREE.Vector3;
      renderTarget?: { texture: THREE.Texture } | null;
    },
  ): { texture: THREE.Texture };
}
const environmentGenerator = new PMREMGenerator(renderer) as unknown as WebGpuPmrem;
// The untouched studio set. It is the scene environment until the probe has a
// capture, and it is swapped back in for every capture (and restored after) so
// the probe can never sample its own previous output.
const pristineEnvironment = environmentGenerator.fromEquirectangular(studioEnvironmentTexture).texture;
scene.environment = pristineEnvironment;

/**
 * Live reflection probe.
 *
 * The scene is captured into a pre-filtered environment map every frame from the
 * camera, so a reflective surface mirrors the skybox, the grid and the blocks
 * around it in real time. The capture writes one target that is handed to the
 * reflective materials as their own `envMap`; mirror surfaces are hidden while
 * the capture runs, so a sphere cannot reflect itself either.
 *
 * The probe is deliberately *not* the scene environment. When it was, the whole
 * scene's image-based lighting depended on where the camera stood: standing next
 * to a wall filled the capture with that wall and dimmed every surface, while
 * looking out at open sky blew the very same surfaces out.
 */
let reflectionTarget: { texture: THREE.Texture } | null = null;
/** Surfaces that mirror the probe instead of the fixed world environment. */
const probeMaterials = new Set<THREE.MeshStandardMaterial>();
/** Metalness from which a surface counts as a mirror for the probe. */
const REFLECTIVE_METALNESS = 0.5;
/** Roughness at which a non-metal still reflects the room like a polished surface. */
const REFLECTIVE_GLOSS = 0.2;
const reflectionFocus = new THREE.Vector3();
/**
 * Paints the room the probe sees when the scene has no World Skybox.
 *
 * A flat fill gave every shiny surface one pale tone, so a metal object in the
 * viewport had none of the softbox highlights the PBR ball preview shows. This
 * gradient carries two softboxes and a horizon band: harmless as a backdrop,
 * but it gives a reflection shapes to read.
 */
function createReflectionSkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not draw the reflection sky.');
  const sky = context.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, '#d8e4f1');
  sky.addColorStop(0.34, '#a7b9cd');
  sky.addColorStop(0.5, '#7d90a6');
  sky.addColorStop(0.62, '#485565');
  sky.addColorStop(1, '#12161c');
  context.fillStyle = sky;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const softbox = (x: number, y: number, rx: number, ry: number, brightness: number) => {
    context.save();
    context.translate(x, y);
    context.scale(rx, ry);
    const glow = context.createRadialGradient(0, 0, 0, 0, 0, 1);
    glow.addColorStop(0, `rgba(255, 255, 255, ${brightness})`);
    glow.addColorStop(0.42, `rgba(240, 247, 255, ${brightness * 0.72})`);
    glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = glow;
    context.fillRect(-1, -1, 2, 2);
    context.restore();
  };
  softbox(146, 70, 84, 46, 1);
  softbox(378, 102, 52, 30, 0.8);
  const horizon = context.createLinearGradient(0, 142, 0, 168);
  horizon.addColorStop(0, 'rgba(224, 238, 255, 0)');
  horizon.addColorStop(0.5, 'rgba(224, 238, 255, 0.5)');
  horizon.addColorStop(1, 'rgba(224, 238, 255, 0)');
  context.fillStyle = horizon;
  context.fillRect(0, 142, canvas.width, 26);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// Studio shell shown only while capturing, so a scene without a skybox still
// produces readable reflections instead of a black room. A real World Skybox is
// captured instead, which keeps its image in the reflection.
const reflectionSkyDome = new THREE.Mesh(
  new THREE.SphereGeometry(30000, 32, 16),
  new MeshBasicNodeMaterial({
    map: createReflectionSkyTexture(),
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
  }),
);
reflectionSkyDome.name = 'Reflection Probe Sky';
reflectionSkyDome.frustumCulled = false;
let lastReflectionCapture = Number.NEGATIVE_INFINITY;
// Real-time: refresh the probe at most once per frame.
const reflectionInterval = 150;
// One capture re-renders the whole scene into six cube faces and rebuilds the
// pre-filtered mip chain inside a single frame, which is a visible hitch. A
// still camera cannot produce a different reflection from the same spot, so
// while the view is static the probe only refreshes on a slow tick to pick up
// scene edits instead of hitching every 150 ms.
const reflectionIdleInterval = 2000;
const reflectionMovementThresholdSq = 0.02 * 0.02;

/**
 * Whether a surface should mirror the live probe.
 *
 * Metals always do. A smooth dielectric does too: the Reflectance and
 * Roughness sliders are expected to visibly change what an object reflects, not
 * only what the preview ball reflects, and a low-roughness surface reflects the
 * room just as a polished floor does.
 */
function isMirrorMaterial(material: THREE.Material | undefined): material is THREE.MeshStandardMaterial {
  if (!(material instanceof THREE.MeshStandardMaterial)) return false;
  if (material.metalness > REFLECTIVE_METALNESS) return true;
  // Keep a smooth surface on the live probe at any Reflectance above zero.
  // The old `envMapIntensity >= 0.5` condition meant lowering Reflectance past
  // half silently swapped the probe for the world environment at full strength.
  return material.roughness <= REFLECTIVE_GLOSS && material.envMapIntensity > 0.001;
}

/** Every material whose surface mirrors the probe. */
function collectReflectiveMaterials(): Set<THREE.MeshStandardMaterial> {
  const found = new Set<THREE.MeshStandardMaterial>();
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (isMirrorMaterial(material)) found.add(material);
    }
  });
  return found;
}

/**
 * Hands the captured probe to the mirrors and puts everything else back on the
 * world environment, so diffuse light stays constant wherever you stand.
 */
function applyReflectiveEnvironment(probe: THREE.Texture | null): void {
  const mirrors = collectReflectiveMaterials();
  if (probe) {
    for (const material of mirrors) {
      if (material.envMap === probe) continue;
      material.envMap = probe;
      material.needsUpdate = true;
    }
  }
  for (const material of [...probeMaterials]) {
    if (mirrors.has(material)) continue;
    // Hand it back to the world environment rather than clearing the slot: an
    // envMap-less material ignores `envMapIntensity`, so clearing here made a
    // low Reflectance jump back to full scene brightness instead of fading out.
    if (material.envMap !== scene.environment) {
      material.envMap = scene.environment;
      material.needsUpdate = true;
    }
  }
  probeMaterials.clear();
  mirrors.forEach((material) => probeMaterials.add(material));
}

function updateReflectionProbe(now: number): void {
  const sinceLastCapture = now - lastReflectionCapture;
  if (sinceLastCapture < reflectionInterval) return;
  const viewMoved = reflectionFocus.distanceToSquared(camera.position) > reflectionMovementThresholdSq;
  if (!viewMoved && sinceLastCapture < reflectionIdleInterval) return;
  // A capture re-renders every object into six cube faces and rebuilds the
  // pre-filtered mip chain, which is by far the most expensive thing in the
  // frame. With nothing mirror-like in the scene its result is invisible, so
  // skip it instead of paying for six hidden scene renders.
  if (collectReflectiveMaterials().size === 0) {
    if (probeMaterials.size > 0) applyReflectiveEnvironment(null);
    lastReflectionCapture = now;
    return;
  }
  lastReflectionCapture = now;
  // Captured from the camera, never from the selected object: a probe placed
  // inside a wall-sized block looks at its own interior and every reflection in
  // the scene turns into garbage. The camera position keeps what you see and
  // what is mirrored consistent, and the screen-space pass below handles the
  // close-range accuracy that a single probe point cannot.
  const focus = reflectionFocus.copy(camera.position);
  // Editor helpers must not show up inside a reflection.
  const hiddenHelpers: THREE.Object3D[] = [transformControls.getHelper()];
  if (selectionHighlight.visible) hiddenHelpers.push(selectionHighlight);
  additionalSelectionHighlights.forEach((helper) => hiddenHelpers.push(helper));
  cameraHelpers.forEach((helper) => { if (helper.visible) hiddenHelpers.push(helper); });
  const helperVisibility = hiddenHelpers.map((helper) => helper.visible);
  hiddenHelpers.forEach((helper) => { helper.visible = false; });
  // A mirror must not appear in its own reflection: hide every metallic surface
  // while the probe looks around.
  const hiddenMirrors: THREE.Mesh[] = [];
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true || mesh === reflectionSkyDome) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.some((material) => isMirrorMaterial(material))) hiddenMirrors.push(mesh);
  });
  const mirrorVisibility = hiddenMirrors.map((mesh) => mesh.visible);
  hiddenMirrors.forEach((mesh) => { mesh.visible = false; });
  const hasSkybox = scene.children.some(
    (child) => (child as THREE.Mesh).isMesh === true && isWorldSkybox(child as THREE.Mesh),
  );
  // Metallic surfaces are hidden for the capture, and every other surface keeps
  // the fixed studio environment, so the capture can never sample its own
  // previous result and grow brighter with every pass.
  if (!hasSkybox) scene.add(reflectionSkyDome);
  // The probe's own shadow pass would re-render every shadow-casting light six
  // times per capture, and the cube render builds a fresh node state in which a
  // shadow node can reach its update before its depth map exists (three then
  // throws on a null `shadowMap.depthTexture`, aborting the capture). The
  // environment is blurred anyway, so pause the per-light shadow update for the
  // capture and restore it afterwards; the next normal frame refreshes it.
  const pausedShadows: Array<{ shadow: THREE.LightShadow; autoUpdate: boolean; needsUpdate: boolean }> = [];
  scene.traverse((object) => {
    const light = object as THREE.Light;
    if (light.isLight !== true || light.castShadow !== true || !light.shadow) return;
    pausedShadows.push({
      shadow: light.shadow,
      autoUpdate: light.shadow.autoUpdate,
      needsUpdate: light.shadow.needsUpdate,
    });
    light.shadow.autoUpdate = false;
    light.shadow.needsUpdate = false;
  });
  try {
    // A small blur hides texture seams (skybox face edges, the ground horizon)
    // that would otherwise read as a hard black line across a mirror surface.
    reflectionTarget = environmentGenerator.fromScene(scene, 0.006, 0.25, 60000, {
      // 128 is enough for a blurred environment probe and renders four times
      // fewer cube pixels than 256, which keeps the capture off the frame
      // budget while the view is moving.
      size: 128,
      position: focus,
      renderTarget: reflectionTarget,
    });
  } finally {
    if (!hasSkybox) scene.remove(reflectionSkyDome);
    pausedShadows.forEach(({ shadow, autoUpdate, needsUpdate }) => {
      shadow.autoUpdate = autoUpdate;
      shadow.needsUpdate = needsUpdate;
    });
    hiddenHelpers.forEach((helper, index) => {
      helper.visible = helperVisibility[index];
    });
    hiddenMirrors.forEach((mesh, index) => {
      mesh.visible = mirrorVisibility[index];
    });
  }
  applyReflectiveEnvironment(reflectionTarget.texture);
}


viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.5;
controls.target.set(0, 0, 0);
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  // Right-drag is handled below so the pointer can be locked to the viewport
  // while panning; OrbitControls cannot pan from locked pointer movement.
  RIGHT: null,
};
const initialCameraPosition = camera.position.clone();
const initialControlsTarget = controls.target.clone();

interface CameraMove {
  from: THREE.Vector3;
  to: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  startedAt: number;
  duration: number;
}
let cameraMove: CameraMove | null = null;

function startCameraMove(to: THREE.Vector3, toTarget: THREE.Vector3, duration = 700): void {
  cameraMove = {
    from: camera.position.clone(),
    to: to.clone(),
    fromTarget: controls.target.clone(),
    toTarget: toTarget.clone(),
    startedAt: performance.now(),
    duration,
  };
}

const viewGizmoCanvas = document.querySelector<HTMLCanvasElement>('#view-gizmo-canvas');
const viewAxisDirections: Record<Exclude<ViewGizmoDirection, 'reset'>, THREE.Vector3> = {
  'x+': new THREE.Vector3(1, 0, 0),
  'x-': new THREE.Vector3(-1, 0, 0),
  'y+': new THREE.Vector3(0, 1, 0),
  'y-': new THREE.Vector3(0, -1, 0),
  'z+': new THREE.Vector3(0, 0, 1),
  'z-': new THREE.Vector3(0, 0, -1),
};
const viewGizmo = viewGizmoCanvas
  ? new ViewGizmo(viewGizmoCanvas, camera, (direction) => {
    if (direction === 'reset') {
      startCameraMove(initialCameraPosition, initialControlsTarget);
      return;
    }
    const distance = Math.max(camera.position.distanceTo(controls.target), 6);
    const target = controls.target.clone();
    startCameraMove(target.clone().addScaledVector(viewAxisDirections[direction], distance), target);
  })
  : null;

interface PlayState {
  mesh: THREE.Mesh;
  settings: SceneCameraSettings;
  yaw: number;
  pitch: number;
  lookPointerId: number | null;
  lastClientX: number;
  lastClientY: number;
  savedPosition: THREE.Vector3;
  savedQuaternion: THREE.Quaternion;
  savedTarget: THREE.Vector3;
  savedFov: number;
  savedRotationOrder: THREE.EulerOrder;
  hiddenIndicators: THREE.Object3D[];
  hiddenLightMarkers: THREE.Mesh[];
  gridVisible: boolean;
  gizmoVisible: boolean;
}
let playState: PlayState | null = null;
/** Held keys that walk the played camera object while Play is running. */
const playMoveKeys = new Set<string>();

let freeCameraEnabled = false;
let freeCameraLooking = false;
let freeCameraPointerPosition: { x: number; y: number } | null = null;
let freeCameraYaw = camera.rotation.y;
let freeCameraPitch = camera.rotation.x;
const freeCameraKeys = new Set<string>();
let boxSelectionStart: { x: number; y: number; pointerId: number } | null = null;

function syncNavigationControls() {
  controls.enabled = !playState && !freeCameraEnabled && !transformControls.dragging &&
    !pointInteractionLocked && !boxSelectionStart;
}

function setFreeCameraEnabled(enabled: boolean) {
  if (freeCameraEnabled === enabled) return;
  freeCameraEnabled = enabled;
  freeCameraLooking = false;
  freeCameraPointerPosition = null;
  freeCameraKeys.clear();
  // The transform gizmo stays available in free-fly mode, so objects can still
  // be moved, turned and scaled with the left mouse button while the camera
  // flies around; the right mouse button is reserved for looking.
  transformControls.enabled = true;
  transformControls.getHelper().visible = true;
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
  // The editor owns right-click menus. The browser menu never appears, and a
  // model menu is opened on button release below only when the click did not
  // turn into a camera pan. Do not close here: on some platforms contextmenu
  // is delivered after pointerup, which would hide the menu just opened.
  event.preventDefault();
});

// Disable OrbitControls input for the duration of a right-drag before its own
// pointerdown handler runs, so it cannot grab the pointer capture we need for
// pointer lock. The window pointerup handler restores it through sync below.
window.addEventListener('pointerdown', (event) => {
  if (event.button !== 2 || playState || event.target !== renderer.domElement) return;
  controls.enabled = false;
}, { capture: true });

let rightDrag: {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
} | null = null;
const panRight = new THREE.Vector3();
const panUp = new THREE.Vector3();
const panOffset = new THREE.Vector3();

function captureViewportPointer(pointerId: number): void {
  try {
    renderer.domElement.setPointerCapture(pointerId);
  } catch {
    // Synthetic events and already-released pointers have no capture target.
  }
}

function lockPointer(element: HTMLElement): void {
  try {
    // Chrome returns a promise from this call; older browsers return nothing.
    const request = element.requestPointerLock() as unknown as Promise<void> | undefined;
    if (request && typeof request.catch === 'function') {
      request.catch(() => {
        addDebugEntry('The browser refused to lock the pointer; dragging still works.', 'Camera');
      });
    }
  } catch {
    addDebugEntry('The browser refused to lock the pointer; dragging still works.', 'Camera');
  }
}

function requestViewportPointerLock() {
  if (playState || document.pointerLockElement === renderer.domElement) return;
  lockPointer(renderer.domElement);
}

/** Screen-space pan for right-drag, matching what OrbitControls used to do. */
function panEditorView(deltaX: number, deltaY: number) {
  camera.updateMatrixWorld();
  panRight.setFromMatrixColumn(camera.matrixWorld, 0);
  panUp.setFromMatrixColumn(camera.matrixWorld, 1);
  const distance = Math.max(camera.position.distanceTo(controls.target), 0.001);
  const scale = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.max(viewport.clientHeight, 1);
  panOffset.copy(panRight).multiplyScalar(-deltaX * scale).addScaledVector(panUp, deltaY * scale);
  camera.position.add(panOffset);
  controls.target.add(panOffset);
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button !== 2 || playState) return;
  rightDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    moved: false,
  };
  // The OS cursor is hidden for the whole right-drag. With pointer lock the
  // pointer stays in the viewport; without it the drag still uses raw deltas.
  document.body.classList.add('is-dragging-view');
});
window.addEventListener('pointermove', (event) => {
  if (!rightDrag || !(event.buttons & 2)) return;
  const locked = document.pointerLockElement === renderer.domElement;
  const deltaX = locked ? event.movementX : event.clientX - rightDrag.lastX;
  const deltaY = locked ? event.movementY : event.clientY - rightDrag.lastY;
  rightDrag.lastX = event.clientX;
  rightDrag.lastY = event.clientY;
  if (!rightDrag.moved) {
    const travelled = Math.hypot(event.clientX - rightDrag.startX, event.clientY - rightDrag.startY);
    if (travelled < 4 && !locked) return;
    rightDrag.moved = true;
    // Lock only once the drag starts: a plain right-click must still be able to
    // open the object menu after the button is released.
    requestViewportPointerLock();
  }
  // In free-camera mode the listener below turns the movement into look.
  if (!freeCameraEnabled) panEditorView(deltaX, deltaY);
});
window.addEventListener('pointerup', (event) => {
  if (event.button !== 2) return;
  const drag = rightDrag;
  rightDrag = null;
  document.body.classList.remove('is-dragging-view');
  if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
  if (!drag || drag.moved || playState || freeCameraEnabled || pointEditObject || placementShape) return;
  const bounds = renderer.domElement.getBoundingClientRect();
  if (drag.startX < bounds.left || drag.startX > bounds.right ||
    drag.startY < bounds.top || drag.startY > bounds.bottom) return;
  pointer.set(
    ((drag.startX - bounds.left) / bounds.width) * 2 - 1,
    -((drag.startY - bounds.top) / bounds.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(objects, false)[0];
  const mesh = hit?.object instanceof THREE.Mesh ? hit.object : null;
  if (!mesh || !objectShapes.has(mesh) || isObjectLocked(mesh)) return;
  showObjectContextMenu(mesh, drag.startX, drag.startY);
});
let isOrbitDragging = false;
let isButtonPressed = false;
let lastCursorEvent: PointerEvent | null = null;
let pointInteractionLocked = false;
let pointEditPointerStart: { x: number; y: number } | null = null;
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
  if (!freeCameraEnabled || !freeCameraLooking) return;
  let deltaX = 0;
  let deltaY = 0;
  if (document.pointerLockElement === renderer.domElement) {
    deltaX = event.movementX;
    deltaY = event.movementY;
  } else {
    if (!freeCameraPointerPosition) return;
    deltaX = event.clientX - freeCameraPointerPosition.x;
    deltaY = event.clientY - freeCameraPointerPosition.y;
    freeCameraPointerPosition = { x: event.clientX, y: event.clientY };
  }
  freeCameraYaw -= deltaX * 0.0025;
  freeCameraPitch = THREE.MathUtils.clamp(
    freeCameraPitch - deltaY * 0.0025,
    -Math.PI / 2 + 0.01,
    Math.PI / 2 - 0.01,
  );
  camera.rotation.set(freeCameraPitch, freeCameraYaw, 0);
});
renderer.domElement.addEventListener('lostpointercapture', () => {
  // Pointer lock releases the drag capture on some browsers; keep looking
  // while the button is still down and the pointer is locked.
  if (document.pointerLockElement === renderer.domElement) return;
  freeCameraLooking = false;
  freeCameraPointerPosition = null;
});
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  document.body.classList.toggle('is-pointer-locked', locked);
  if (locked) return;
  if (!playState) rightDrag = null;
  document.body.classList.remove('is-dragging-view');
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
  rightDrag = null;
  document.body.classList.remove('is-dragging-view');
  if (document.pointerLockElement === renderer.domElement && !playState) document.exitPointerLock();
  boxSelectionStart = null;
  selectionBox.hidden = true;
  freeCameraKeys.clear();
  playMoveKeys.clear();
  syncNavigationControls();
  finishGeometryPointDrag();
  if (lastCursorEvent) updateCursorAppearance(lastCursorEvent);
});
window.addEventListener('blur', () => {
  isOrbitDragging = false;
  isButtonPressed = false;
  freeCameraLooking = false;
  freeCameraPointerPosition = null;
  rightDrag = null;
  document.body.classList.remove('is-dragging-view');
  boxSelectionStart = null;
  selectionBox.hidden = true;
  freeCameraKeys.clear();
  playMoveKeys.clear();
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

function findPlayCamera(): THREE.Mesh | null {
  if (selectedObject && sceneCameras.has(selectedObject)) return selectedObject;
  return objects.find((mesh) => sceneCameras.has(mesh)) ?? null;
}

const playWorldPosition = new THREE.Vector3();
const playWorldQuaternion = new THREE.Quaternion();
const playForward = new THREE.Vector3();
const playUp = new THREE.Vector3();
const playTarget = new THREE.Vector3();
const playLensTip = new THREE.Vector3();
const playMoveQuaternion = new THREE.Quaternion();
const playMoveForward = new THREE.Vector3();
const playMoveRight = new THREE.Vector3();
const playMoveVector = new THREE.Vector3();
const playMoveParentMatrix = new THREE.Matrix4();

/** Places the editor camera exactly where the camera object looks from. */
function updatePlayCamera() {
  const state = playState;
  if (!state) return;
  state.mesh.updateWorldMatrix(true, false);
  playWorldPosition.setFromMatrixPosition(state.mesh.matrixWorld);
  playWorldQuaternion.setFromRotationMatrix(state.mesh.matrixWorld);
  playForward.set(0, 0, -1).applyQuaternion(playWorldQuaternion);
  playUp.set(0, 1, 0).applyQuaternion(playWorldQuaternion);
  if (state.settings.viewMode === 'first') {
    // Stand at the lens tip instead of the body centre: the camera's own shell
    // stays in the scene (so it is still visible while playing) but can never
    // fill the shot at any scale.
    playLensTip.set(0, 0, -0.5).applyMatrix4(state.mesh.matrixWorld);
    camera.position.copy(playLensTip);
    camera.quaternion.copy(playWorldQuaternion);
  } else if (state.settings.viewMode === 'third') {
    camera.position.copy(playWorldPosition)
      .addScaledVector(playUp, state.settings.height)
      .addScaledVector(playForward, -state.settings.followDistance);
    playTarget.copy(playWorldPosition).addScaledVector(playUp, 0.35);
    camera.lookAt(playTarget);
  } else {
    camera.position.copy(playWorldPosition)
      .addScaledVector(playUp, state.settings.height * 2)
      .addScaledVector(playForward, -state.settings.followDistance * 0.35);
    camera.lookAt(playWorldPosition);
  }
  camera.rotateY(state.yaw);
  camera.rotateX(state.pitch);
  if (camera.fov !== state.settings.fov) {
    camera.fov = state.settings.fov;
    camera.updateProjectionMatrix();
  }
}

/**
 * Walks the played camera object with WASD when "Allow movement" is on. The
 * object itself moves, so the frustum, shadows and the view all stay in sync;
 * with the toggle off the shot is completely static.
 */
function updatePlayMovement(deltaSeconds: number) {
  const state = playState;
  if (!state || !state.settings.allowMovement || playMoveKeys.size === 0) return;
  const mesh = state.mesh;
  mesh.updateWorldMatrix(true, false);
  playMoveQuaternion.setFromRotationMatrix(mesh.matrixWorld);
  playMoveForward.set(0, 0, -1).applyQuaternion(playMoveQuaternion);
  playMoveRight.set(1, 0, 0).applyQuaternion(playMoveQuaternion);
  playMoveVector.set(0, 0, 0);
  if (playMoveKeys.has('KeyW')) playMoveVector.add(playMoveForward);
  if (playMoveKeys.has('KeyS')) playMoveVector.sub(playMoveForward);
  if (playMoveKeys.has('KeyD')) playMoveVector.add(playMoveRight);
  if (playMoveKeys.has('KeyA')) playMoveVector.sub(playMoveRight);
  if (playMoveKeys.has('Space')) playMoveVector.y += 1;
  if (playMoveKeys.has('KeyC')) playMoveVector.y -= 1;
  if (playMoveVector.lengthSq() === 0) return;
  playMoveVector.normalize();
  const parent = mesh.parent;
  if (parent) {
    // Convert the world-space step into the parent's local space, so nesting the
    // camera inside a turned group still walks where the view points.
    parent.updateWorldMatrix(true, false);
    playMoveParentMatrix.copy(parent.matrixWorld).invert();
    playMoveVector.transformDirection(playMoveParentMatrix).normalize();
  }
  const sprint = playMoveKeys.has('ShiftLeft') || playMoveKeys.has('ShiftRight') ? 2.5 : 1;
  mesh.position.addScaledVector(playMoveVector, state.settings.moveSpeed * sprint * deltaSeconds);
  mesh.updateMatrixWorld(true);
}

function startPlayMode() {
  if (playState) return;
  const mesh = findPlayCamera();
  if (!mesh) {
    addDebugEntry('No Camera in the scene. Add one from Insert → Camera, then press Play.', 'Camera');
    return;
  }
  const settings = sceneCameras.get(mesh);
  if (!settings) return;
  const savedPosition = camera.position.clone();
  const savedQuaternion = camera.quaternion.clone();
  const savedTarget = controls.target.clone();
  const savedFov = camera.fov;
  const savedRotationOrder = camera.rotation.order;
  if (freeCameraEnabled) setFreeCameraEnabled(false);
  cameraMove = null;
  if (placementShape) setPlacementMode(null);
  closeObjectContextMenu();
  closeInsertMenu();
  const hiddenIndicators: THREE.Object3D[] = [];
  const hiddenLightMarkers: THREE.Mesh[] = [];
  for (const object of objects) {
    const indicator = lightDirectionIndicators.get(object);
    if (indicator?.visible) {
      indicator.visible = false;
      hiddenIndicators.push(indicator);
    }
    // Spot/point markers are wireframe shells around the real light. Hide only
    // the shell material so the light child keeps illuminating the shot.
    if (sceneLights.has(object) && lightTypeByMesh.get(object) !== 'directional' &&
      object.material instanceof THREE.MeshBasicMaterial && object.material.visible) {
      object.material.visible = false;
      hiddenLightMarkers.push(object);
    }
  }
  playState = {
    mesh,
    settings,
    yaw: 0,
    pitch: 0,
    lookPointerId: null,
    lastClientX: 0,
    lastClientY: 0,
    savedPosition,
    savedQuaternion,
    savedTarget,
    savedFov,
    savedRotationOrder,
    hiddenIndicators,
    hiddenLightMarkers,
    gridVisible: grid.visible,
    gizmoVisible: transformControls.getHelper().visible,
  };
  playMoveKeys.clear();
  // Play mode hides editor helpers, deselects the object and removes gizmos.
  selectObject(null);
  document.body.classList.add('is-playing');
  playStopButton.hidden = false;
  playButton.blur();
  playStopButton.focus();
  grid.visible = false;
  hoverHighlight.visible = false;
  transformControls.enabled = false;
  transformControls.getHelper().visible = false;
  controls.enabled = false;
  camera.rotation.order = 'YXZ';
  updatePlayCamera();
  addDebugEntry(`Playing from "${mesh.name}".`, 'Camera');
}

function stopPlayMode() {
  const state = playState;
  if (!state) return;
  playState = null;
  playMoveKeys.clear();
  if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
  document.body.classList.remove('is-playing');
  playStopButton.hidden = true;
  camera.position.copy(state.savedPosition);
  camera.rotation.order = state.savedRotationOrder;
  camera.quaternion.copy(state.savedQuaternion);
  camera.fov = state.savedFov;
  camera.updateProjectionMatrix();
  controls.target.copy(state.savedTarget);
  syncNavigationControls();
  controls.update();
  grid.visible = state.gridVisible;
  transformControls.enabled = true;
  transformControls.getHelper().visible = state.gizmoVisible;
  state.hiddenIndicators.forEach((indicator) => { indicator.visible = true; });
  state.hiddenLightMarkers.forEach((marker) => {
    const materials = Array.isArray(marker.material) ? marker.material : [marker.material];
    materials.forEach((material) => { material.visible = true; });
  });
  resizeViewport();
  addDebugEntry('Stopped camera view.', 'Camera');
}

const helperPosition = new THREE.Vector3();
const helperQuaternion = new THREE.Quaternion();
const helperScale = new THREE.Vector3();

/** Mirrors each camera object's transform into its frustum helper. */
function updateSceneCameraHelpers() {
  const aspect = viewport.clientWidth / Math.max(viewport.clientHeight, 1);
  for (const mesh of objects) {
    const settings = sceneCameras.get(mesh);
    if (!settings) continue;
    mesh.updateWorldMatrix(true, false);
    settings.viewCamera.aspect = aspect;
    settings.viewCamera.fov = settings.fov;
    settings.viewCamera.updateProjectionMatrix();
    // CameraHelper aliases its own matrix to the viewed camera's matrixWorld and
    // turns matrixAutoUpdate off, so writing helper.position does nothing. Drive
    // the view camera instead and let the helper follow it exactly.
    mesh.matrixWorld.decompose(helperPosition, helperQuaternion, helperScale);
    settings.viewCamera.position.copy(helperPosition);
    settings.viewCamera.quaternion.copy(helperQuaternion);
    settings.viewCamera.scale.copy(helperScale);
    settings.viewCamera.updateMatrixWorld(true);
    settings.helper.visible = playState === null;
    settings.helper.update();
  }
}


playButton.addEventListener('click', startPlayMode);
playStopButton.addEventListener('click', stopPlayMode);

renderer.domElement.addEventListener('pointerdown', (event) => {
  const state = playState;
  if (!state) return;
  if (state.settings.lookMode === 'click') {
    if (event.button === 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
      state.lookPointerId = event.pointerId;
      state.lastClientX = event.clientX;
      state.lastClientY = event.clientY;
      captureViewportPointer(event.pointerId);
      lockPointer(renderer.domElement);
    }
    return;
  }
  const wantedButton = state.settings.lookMode === 'left' ? 0 : 2;
  if (event.button !== wantedButton) return;
  state.lookPointerId = event.pointerId;
  state.lastClientX = event.clientX;
  state.lastClientY = event.clientY;
  captureViewportPointer(event.pointerId);
  event.preventDefault();
  event.stopImmediatePropagation();
}, { capture: true });

renderer.domElement.addEventListener('pointermove', (event) => {
  const state = playState;
  if (!state) return;
  let deltaX = 0;
  let deltaY = 0;
  if (state.settings.lookMode === 'click') {
    if (document.pointerLockElement === renderer.domElement) {
      deltaX = event.movementX;
      deltaY = event.movementY;
    } else if (state.lookPointerId === event.pointerId) {
      // Fallback when pointer lock is unavailable: drag-to-look still works.
      deltaX = event.clientX - state.lastClientX;
      deltaY = event.clientY - state.lastClientY;
      state.lastClientX = event.clientX;
      state.lastClientY = event.clientY;
    } else {
      return;
    }
  } else {
    if (state.lookPointerId !== event.pointerId) return;
    deltaX = event.clientX - state.lastClientX;
    deltaY = event.clientY - state.lastClientY;
    state.lastClientX = event.clientX;
    state.lastClientY = event.clientY;
  }
  if (deltaX === 0 && deltaY === 0) return;
  const sensitivity = 0.0024;
  state.yaw -= deltaX * sensitivity;
  state.pitch = THREE.MathUtils.clamp(state.pitch - deltaY * sensitivity, -1.45, 1.45);
  updatePlayCamera();
  event.preventDefault();
}, { capture: true });

window.addEventListener('pointerup', (event) => {
  if (!playState) return;
  if (playState.lookPointerId === event.pointerId) playState.lookPointerId = null;
});

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
interface MultiSelectionObjectStart {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  depth: number;
}
let multiSelectionStart: {
  pivotPosition: THREE.Vector3;
  pivotQuaternion: THREE.Quaternion;
  pivotScale: THREE.Vector3;
  objects: MultiSelectionObjectStart[];
} | null = null;
/** Meshes the pivot is currently centred for; a changed set re-centres it. */
let multiSelectionPivotMeshes: THREE.Mesh[] = [];
const multiSelectionPivotPosition = new THREE.Vector3();
const multiSelectionPivotQuaternion = new THREE.Quaternion();
const multiSelectionPivotScale = new THREE.Vector3();
const multiSelectionWorldPosition = new THREE.Vector3();
const multiSelectionWorldQuaternion = new THREE.Quaternion();
const multiSelectionWorldScale = new THREE.Vector3();
const multiSelectionWorldMatrix = new THREE.Matrix4();
const multiSelectionLocalMatrix = new THREE.Matrix4();
const multiSelectionParentInverse = new THREE.Matrix4();
const multiSelectionDeltaQuaternion = new THREE.Quaternion();
const multiSelectionDeltaScale = new THREE.Vector3();
const multiSelectionStartInverseQuaternion = new THREE.Quaternion();
const multiSelectionBounds = new THREE.Box3();
const multiSelectionMeshBounds = new THREE.Box3();
const multiSelectionFallbackCenter = new THREE.Vector3();
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

/**
 * Visual middle of a multi-selection: the centre of the combined world bounds.
 * Averaging the object origins lands off to one side as soon as the blocks
 * differ in size, sit inside a group pivot or have off-centre geometry.
 */
function getMultiSelectionCenter(target: THREE.Vector3): THREE.Vector3 {
  multiSelectionBounds.makeEmpty();
  for (const mesh of selectedObjects) {
    if (isWorldSkybox(mesh)) continue;
    multiSelectionMeshBounds.setFromObject(mesh);
    if (!multiSelectionMeshBounds.isEmpty()) multiSelectionBounds.union(multiSelectionMeshBounds);
  }
  if (!multiSelectionBounds.isEmpty()) return multiSelectionBounds.getCenter(target);
  multiSelectionFallbackCenter.set(0, 0, 0);
  selectedObjects.forEach((mesh) => multiSelectionFallbackCenter.add(mesh.getWorldPosition(new THREE.Vector3())));
  return target.copy(multiSelectionFallbackCenter.divideScalar(Math.max(selectedObjects.length, 1)));
}

function getSceneDepth(object: THREE.Object3D): number {
  let depth = 0;
  for (let parent = object.parent; parent; parent = parent.parent) depth += 1;
  return depth;
}

function applyTransformSpace(mode: TransformMode): void {
  // Rotate and scale drag in the handle's own axes, so the rings follow how the
  // block is actually turned instead of snapping back to the world axes.
  // Translation stays world-aligned, which is what dragging an arrow across the
  // grid is expected to do.
  transformControls.setSpace(mode === 'rotate' || mode === 'scale' ? 'local' : 'world');
}

function updateSelectionTransformTarget() {
  applyTransformSpace(transformMode);
  if (selectedObjects.length > 1) {
    if (transformMode === 'select' || selectedObjects.some((mesh) => isObjectLocked(mesh))) {
      multiSelectionPivotMeshes = [];
      transformControls.detach();
      return;
    }
    const selectionChanged = multiSelectionPivotMeshes.length !== selectedObjects.length ||
      multiSelectionPivotMeshes.some((mesh, index) => selectedObjects[index] !== mesh);
    if (selectionChanged) {
      multiSelectionPivot.position.copy(getMultiSelectionCenter(multiSelectionPivotPosition));
      multiSelectionPivot.quaternion.identity();
      multiSelectionPivot.scale.setScalar(1);
      multiSelectionPivotMeshes = [...selectedObjects];
    }
    multiSelectionPivot.updateMatrixWorld(true);
    transformControls.setMode(transformMode);
    transformControls.attach(multiSelectionPivot);
    return;
  }
  multiSelectionPivotMeshes = [];
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
  multiSelectionPivot.matrixWorld.decompose(
    multiSelectionPivotPosition,
    multiSelectionPivotQuaternion,
    multiSelectionPivotScale,
  );
  const objectsStart: MultiSelectionObjectStart[] = [];
  for (const mesh of selectedObjects) {
    mesh.updateWorldMatrix(true, false);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    mesh.matrixWorld.decompose(position, quaternion, scale);
    objectsStart.push({ mesh, position, quaternion, scale, depth: getSceneDepth(mesh) });
  }
  // Parents must be written before their children: a child's local matrix is
  // solved against its parent's already-updated world matrix, so processing the
  // child first would leave it displaced once the parent catches up.
  objectsStart.sort((a, b) => a.depth - b.depth);
  multiSelectionStart = {
    pivotPosition: multiSelectionPivotPosition.clone(),
    pivotQuaternion: multiSelectionPivotQuaternion.clone(),
    pivotScale: multiSelectionPivotScale.clone(),
    objects: objectsStart,
  };
}

function applyMultiSelectionTransform() {
  const start = multiSelectionStart;
  if (!start) return;
  multiSelectionPivot.updateWorldMatrix(true, false);
  multiSelectionPivot.matrixWorld.decompose(
    multiSelectionPivotPosition,
    multiSelectionPivotQuaternion,
    multiSelectionPivotScale,
  );
  // Compose the group delta from position, rotation and scale instead of
  // multiplying matrices. A raw matrix product encodes shear for rotated blocks
  // under a non-uniform scale, and decomposing that shear back into TRS throws
  // the block's orientation around. Working in TRS keeps every block's shape
  // and heading intact.
  multiSelectionDeltaQuaternion.copy(multiSelectionPivotQuaternion)
    .multiply(multiSelectionStartInverseQuaternion.copy(start.pivotQuaternion).invert());
  multiSelectionDeltaScale.set(
    multiSelectionPivotScale.x / (start.pivotScale.x || 1),
    multiSelectionPivotScale.y / (start.pivotScale.y || 1),
    multiSelectionPivotScale.z / (start.pivotScale.z || 1),
  );

  for (const { mesh, position, quaternion, scale } of start.objects) {
    // The pivot is the handle; each block keeps its offset from it, scaled and
    // rotated with the group, so rotate and scale both act around the middle.
    // The offset is scaled inside the pivot's own frame, which is what makes a
    // rotated group scale along its turned axes instead of the world axes.
    multiSelectionWorldPosition.copy(position)
      .sub(start.pivotPosition)
      .applyQuaternion(multiSelectionStartInverseQuaternion.copy(start.pivotQuaternion).invert())
      .multiply(multiSelectionDeltaScale)
      .applyQuaternion(multiSelectionPivotQuaternion)
      .add(multiSelectionPivotPosition);
    multiSelectionWorldQuaternion.copy(multiSelectionDeltaQuaternion).multiply(quaternion);
    multiSelectionWorldScale.copy(scale).multiply(multiSelectionDeltaScale);
    multiSelectionWorldMatrix.compose(
      multiSelectionWorldPosition,
      multiSelectionWorldQuaternion,
      multiSelectionWorldScale,
    );
    const parent = mesh.parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      multiSelectionParentInverse.copy(parent.matrixWorld).invert();
      multiSelectionLocalMatrix.copy(multiSelectionParentInverse).multiply(multiSelectionWorldMatrix);
    } else {
      multiSelectionLocalMatrix.copy(multiSelectionWorldMatrix);
    }
    multiSelectionLocalMatrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.updateMatrix();
    mesh.updateWorldMatrix(true, false);
  }
  selectedObjects.forEach((mesh) => {
    additionalSelectionHighlights.get(mesh)?.setFromObject(mesh);
    // Lights are separate objects for directional lights and aim their targets
    // from the proxy, so a grouped move has to carry them along too.
    const light = sceneLights.get(mesh);
    if (light instanceof THREE.DirectionalLight) {
      syncSunLightDirection(mesh);
    }
    updateAimedLight(mesh);
  });
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
  if (isTransformDragging) {
    captureMultiSelectionStart();
    beginTransformHistory();
  } else {
    multiSelectionStart = null;
    commitTransformHistory();
  }
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
    if (light instanceof THREE.DirectionalLight) syncSunLightDirection(selectedObject);
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

/* -------------------------------------------------------------------------- */
/* Undo / redo                                                                 */
/* -------------------------------------------------------------------------- */

interface TransformSnapshotEntry {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

interface TransformHistoryEntry {
  before: TransformSnapshotEntry[];
  after: TransformSnapshotEntry[];
}

const transformHistory: TransformHistoryEntry[] = [];
const transformRedoStack: TransformHistoryEntry[] = [];
let pendingTransformBefore: TransformSnapshotEntry[] | null = null;

function captureTransformSnapshot(): TransformSnapshotEntry[] {
  return objects.map((mesh) => ({
    mesh,
    position: mesh.position.clone(),
    quaternion: mesh.quaternion.clone(),
    scale: mesh.scale.clone(),
  }));
}

function beginTransformHistory(): void {
  pendingTransformBefore = captureTransformSnapshot();
}

function commitTransformHistory(): void {
  const before = pendingTransformBefore;
  pendingTransformBefore = null;
  if (!before) return;
  const after = captureTransformSnapshot();
  const changed = after.length !== before.length || after.some((entry, index) => {
    const previous = before[index];
    return !previous ||
      previous.mesh !== entry.mesh ||
      !previous.position.equals(entry.position) ||
      !previous.quaternion.equals(entry.quaternion) ||
      !previous.scale.equals(entry.scale);
  });
  if (!changed) return;
  transformHistory.push({ before, after });
  if (transformHistory.length > 100) transformHistory.shift();
  transformRedoStack.length = 0;
}

function applyTransformSnapshot(snapshot: readonly TransformSnapshotEntry[]): void {
  for (const entry of snapshot) {
    if (!objects.includes(entry.mesh)) continue;
    entry.mesh.position.copy(entry.position);
    entry.mesh.quaternion.copy(entry.quaternion);
    entry.mesh.scale.copy(entry.scale);
    entry.mesh.updateMatrix();
    entry.mesh.updateWorldMatrix(true, false);
    if (sceneLights.get(entry.mesh) instanceof THREE.DirectionalLight) syncSunLightDirection(entry.mesh);
    updateAimedLight(entry.mesh);
  }
  updateSelectionHighlights();
  updateTexturedMeshUVs();
  refreshSunShadowBounds();
  // The group gizmo is centred when the selection changes, so an undo has to
  // ask it to re-centre on the restored blocks.
  if (selectedObjects.length > 1) {
    multiSelectionPivotMeshes = [];
    updateSelectionTransformTarget();
  }
  if (selectedObject) updateProperties(selectedObject);
}

/** Steps one transform edit back. Returns true when there was something to undo. */
function undoTransform(): boolean {
  const entry = transformHistory.pop();
  if (!entry) return false;
  transformRedoStack.push(entry);
  applyTransformSnapshot(entry.before);
  return true;
}

/** Steps one transform edit forward again (Ctrl+X). */
function redoTransform(): boolean {
  const entry = transformRedoStack.pop();
  if (!entry) return false;
  transformHistory.push(entry);
  applyTransformSnapshot(entry.after);
  return true;
}

const gridDistance = renderDistanceOptions[Number(distanceInput.value)];
const gridRadiusUniform = TSL.uniform(gridDistance);
const cameraPositionUniform = TSL.uniform(camera.position.clone());
const gridCoordinates = TSL.positionWorld.xz;
const microGridCoordinates = gridCoordinates.mul(2);
const minorGridCoordinates = gridCoordinates;
const midGridCoordinates = gridCoordinates.mul(0.2);
const majorGridCoordinates = gridCoordinates.mul(0.1);
const gridLineDistance = (coordinates: typeof gridCoordinates) =>
  TSL.abs(TSL.fract(coordinates.sub(0.5)).sub(0.5)).div(TSL.fwidth(coordinates));
const microGridDistance = gridLineDistance(microGridCoordinates);
const minorGridDistance = gridLineDistance(minorGridCoordinates);
const midGridDistance = gridLineDistance(midGridCoordinates);
const majorGridDistance = gridLineDistance(majorGridCoordinates);
const lineCoverage = (distance: typeof microGridDistance) =>
  TSL.float(1).sub(TSL.min(TSL.min(distance.x, distance.y), 1));
const microLine = lineCoverage(microGridDistance);
const minorLine = lineCoverage(minorGridDistance);
const midLine = lineCoverage(midGridDistance);
const majorLine = lineCoverage(majorGridDistance);
const xAxisLine = TSL.float(1).sub(TSL.min(
  TSL.abs(TSL.positionWorld.z).div(TSL.fwidth(TSL.positionWorld.z)),
  1,
));
const zAxisLine = TSL.float(1).sub(TSL.min(
  TSL.abs(TSL.positionWorld.x).div(TSL.fwidth(TSL.positionWorld.x)),
  1,
));
const cameraXZ = TSL.vec2(cameraPositionUniform.x, cameraPositionUniform.z);
const cameraDistance = TSL.length(TSL.positionWorld.xz.sub(cameraXZ));
const edgeFade = TSL.float(1).sub(TSL.smoothstep(
  0.68,
  0.98,
  cameraDistance.div(gridRadiusUniform),
));
// Far away the fine line spacings would alias into moire, so the sub-metre
// lines fall away with view distance and only the coarse ones carry to the horizon.
const microDetailFade = TSL.float(1).sub(TSL.smoothstep(22, 65, cameraDistance));
const minorDetailFade = TSL.float(1).sub(TSL.smoothstep(90, 300, cameraDistance));
const gridMaterial = new MeshBasicNodeMaterial({
  transparent: true,
  depthWrite: false,
  // Two-sided so the grid stays readable when the camera drops below it.
  side: THREE.DoubleSide,
});
const gridColor = TSL.mix(
  TSL.color('#2c3238'),
  TSL.color('#8a949a'),
  TSL.max(midLine.mul(0.4), majorLine.mul(0.9)),
);
const axisColor = TSL.mix(TSL.color('#b06a58'), TSL.color('#5f93b8'), zAxisLine);
const axisStrength = TSL.max(xAxisLine, zAxisLine).mul(0.92);
gridMaterial.colorNode = TSL.mix(gridColor, axisColor, axisStrength);
gridMaterial.opacityNode = TSL.max(
  TSL.max(microLine.mul(0.14).mul(microDetailFade), minorLine.mul(0.4).mul(minorDetailFade)),
  TSL.max(midLine.mul(0.58), TSL.max(majorLine.mul(0.86), axisStrength)),
).mul(edgeFade);
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
  gridRadiusUniform.value = distance;
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
/** Meshes imported from a 3D file: raw geometry, no texture or topology tools. */
const importedModels = new Set<THREE.Mesh>();
/** The file's node/material tree, shown under the imported object's Configurations. */
const importedModelContents = new WeakMap<THREE.Mesh, ImportedContentNode>();
/** Where each file piece lives in an imported object's merged geometry. */
const importedModelPieceRanges = new WeakMap<THREE.Mesh, Map<number, ImportedPieceRange>>();
/** File texture slots that reference a picture which was not loaded. */
const importedModelMissingTextures = new WeakMap<THREE.Mesh, ImportedMissingTexture[]>();
/** Imported files whose UVs come from the file and must not be re-projected. */
const importedModelAuthoredUVs = new WeakSet<THREE.Mesh>();
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
const scenePipeline = new ScenePipeline(
  renderer,
  scene,
  camera,
  () => objects.filter((mesh) => !sceneLights.has(mesh) && !sunSettings.has(mesh) && !sceneCameras.has(mesh)),
);
const godRays = scenePipeline.godRays;
const smoothShadingByMesh = new WeakMap<THREE.Mesh, boolean>();
const lightDirectionIndicators = new WeakMap<THREE.Mesh, THREE.ArrowHelper>();
type EditableLight = THREE.PointLight | THREE.SpotLight | THREE.DirectionalLight;
type EditableLightType = 'spot' | 'directional' | 'point';
const lightTypeByMesh = new WeakMap<THREE.Mesh, EditableLightType>();
const sceneLights = new WeakMap<THREE.Mesh, EditableLight>();
const sceneLightEnabled = new WeakMap<EditableLight, boolean>();
lightingTechnology.value = 'mlight';

const rayTracedLights: RayTracedLight[] = [];
function collectRayTracedLights(): RayTracedLight[] {
  rayTracedLights.length = 0;
  for (const mesh of objects) {
    const light = sceneLights.get(mesh);
    if (!light || !light.visible) continue;
    // Cast Shadow is the single switch the user expects: a light with its
    // shadow off must not trace a screen-space shadow either.
    if (!lightShadowIsActive(light)) continue;
    rayTracedLights.push({ light, kind: lightTypeByMesh.get(mesh) ?? 'point' });
    if (rayTracedLights.length === 3) break;
  }
  return rayTracedLights;
}

function applyLightingTechnology() {
  const rayTraced = lightingTechnology.value === 'ray-traced';
  const quality = (rayTracingQualityElement?.value ?? 'medium') as RayTracingQuality;
  scenePipeline.setRayTracingQuality(rayTraced ? quality : 'off');
  if (rayTracingQualityFieldElement) rayTracingQualityFieldElement.hidden = !rayTraced;
  if (rayTracingNoteElement) rayTracingNoteElement.hidden = !rayTraced;
}

lightingTechnology.addEventListener('change', applyLightingTechnology);
rayTracingQualityElement?.addEventListener('change', applyLightingTechnology);
applyLightingTechnology();
const defaultUiColors = { accent: '#d9dde0', background: '#050505', panel: '#0a0a0a' };
const uiColorStorageKeys = {
  accent: 'propeller.uiAccent.v2',
  background: 'propeller.uiBackground.v2',
  panel: 'propeller.uiPanel.v2',
} as const;
function applyUiColors() {
  const root = document.documentElement;
  root.style.setProperty('--ui-accent', uiAccentColor.value);
  root.style.setProperty('--ui-background', uiBackgroundColor.value);
  root.style.setProperty('--ui-panel', uiPanelColor.value);
  localStorage.setItem(uiColorStorageKeys.accent, uiAccentColor.value);
  localStorage.setItem(uiColorStorageKeys.background, uiBackgroundColor.value);
  localStorage.setItem(uiColorStorageKeys.panel, uiPanelColor.value);
}
const savedUiColors = {
  accent: localStorage.getItem(uiColorStorageKeys.accent),
  background: localStorage.getItem(uiColorStorageKeys.background),
  panel: localStorage.getItem(uiColorStorageKeys.panel),
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
  glow: THREE.Group;
  glowMaterial: MeshBasicNodeMaterial;
}
const sunSettings = new WeakMap<THREE.Mesh, SunSettings>();
const sunMeshes = new Set<THREE.Mesh>();
const godRaysAttachments = new WeakMap<THREE.Mesh, THREE.Object3D>();

type CameraViewMode = 'first' | 'third' | 'bird';
type CameraLookMode = 'left' | 'right' | 'click';

interface SceneCameraSettings {
  fov: number;
  viewMode: CameraViewMode;
  lookMode: CameraLookMode;
  followDistance: number;
  height: number;
  /** Walk the camera object with WASD while Play is running. Off by default. */
  allowMovement: boolean;
  /** Metres per second while walking in Play mode. */
  moveSpeed: number;
  /** Camera that draws the field-of-view frustum in the editor. */
  viewCamera: THREE.PerspectiveCamera;
  helper: THREE.CameraHelper;
}

/** Cameras spawned from Insert. They are ordinary transformable scene objects. */
const sceneCameras = new WeakMap<THREE.Mesh, SceneCameraSettings>();
const cameraHelpers = new Set<THREE.CameraHelper>();
let activeSun: THREE.Mesh | null = null;
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
  const hasGodRaysChild = container.querySelector('.god-rays-child') !== null;
  // Imported files put their node/material tree in this same container.
  const hasFileContents = container.querySelector(':scope > .file-scene-row') !== null;
  const hasVisibleChildren = hasChildren || hasGodRaysChild || hasFileContents;
  toggle.hidden = !hasVisibleChildren;
  container.hidden = !hasVisibleChildren || !expandedGroups.has(mesh);
  toggle.textContent = container.hidden ? '›' : '⌄';
  toggle.setAttribute('aria-expanded', String(!container.hidden));
  row.classList.toggle('has-scene-children', hasVisibleChildren);
}

function groupChildMeshes(parent: THREE.Mesh) {
  if (!isGroupableMesh(parent)) return;
  const children = getChildMeshes(parent);
  children.forEach((child) => moveMeshToParent(child, parent));
  expandedGroups.add(parent);
  updateGroupHierarchyRow(parent);
  if (selectedObject === parent) updateProperties(parent);
}

/**
 * Releases a group, including groups nested inside it.
 *
 * Every descendant is detached to the scene with its world transform kept, so a
 * child that itself has children is dissolved too instead of staying grouped.
 * On a block with no children this simply unparents the block from its own
 * group, which is what right-click → Ungroup means there.
 */
function ungroupChildMeshes(parent: THREE.Mesh) {
  if (!isGroupableMesh(parent)) return;
  const descendants = getChildMeshes(parent);
  const targets = descendants.length > 0 ? descendants : [parent];
  // Deepest first: a grandchild is released before its parent, so each detach
  // is a single world-space move and no pivot is carried around twice.
  [...targets].reverse().forEach((child) => moveMeshToParent(child, null));
  expandedGroups.delete(parent);
  updateGroupHierarchyRow(parent);
  if (selectedObject === parent) {
    updateProperties(parent);
    if (transformMode !== 'select' && !isObjectLocked(parent)) {
      transformControls.attach(getMeshTransformTarget(parent));
    }
  }
  addDebugEntry(
    `Ungrouped ${targets.length} block${targets.length === 1 ? '' : 's'}${descendants.length === 0 ? ' from its parent' : ''}.`,
    'Scene Explorer',
  );
}

/** File nodes that can become 3D objects: nodes/meshes with merged pieces. */
function importedFileParts(node: ImportedContentNode): ImportedContentNode[] {
  return node.children.filter((child) =>
    (child.kind === 'mesh' || child.kind === 'node') && (child.pieces?.length ?? 0) > 0);
}

function canUngroupImportedModel(mesh: THREE.Mesh): boolean {
  const contents = importedModelContents.get(mesh);
  if (!contents || !importedModelPieceRanges.has(mesh)) return false;
  return importedFileParts(contents).length > 0;
}

interface ImportedExtraction {
  geometry: THREE.BufferGeometry;
  materials: THREE.MeshStandardMaterial[];
  ranges: Map<number, ImportedPieceRange>;
  /** Local material index -> original material slot it came from. */
  sourceMaterials: number[];
}

/**
 * Copies a set of merged pieces into a standalone geometry.
 *
 * Pieces are non-overlapping vertex ranges of the source object's non-indexed
 * geometry, so extraction is a straight copy of each attribute plus one group
 * per piece. `withWorld` bakes the owner's transform so the new part stays in
 * place when it leaves the imported file object.
 */
function extractImportedPieces(
  owner: THREE.Mesh,
  lookup: ReadonlyMap<number, ImportedPieceRange>,
  pieceIndexes: readonly number[],
  withWorld: boolean,
): ImportedExtraction | null {
  const position = owner.geometry.getAttribute('position');
  if (!(position instanceof THREE.BufferAttribute)) return null;
  const ownerMaterials = getStandardMaterials(owner);
  if (ownerMaterials.length === 0) return null;

  const entries: Array<{ index: number; range: ImportedPieceRange }> = [];
  for (const index of new Set(pieceIndexes)) {
    const range = lookup.get(index);
    if (!range || range.count <= 0 || range.start + range.count > position.count) continue;
    entries.push({ index, range });
  }
  entries.sort((a, b) => a.range.start - b.range.start);
  if (entries.length === 0) return null;

  const materialClones = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();
  const localIndexes = new Map<THREE.MeshStandardMaterial, number>();
  const materials: THREE.MeshStandardMaterial[] = [];
  const sourceMaterials: number[] = [];
  const groups: Array<{ start: number; count: number; material: number }> = [];
  const ranges = new Map<number, ImportedPieceRange>();
  let total = 0;
  for (const { index, range } of entries) {
    const source = ownerMaterials[range.material] ?? ownerMaterials[0];
    let clone = materialClones.get(source);
    if (!clone) {
      clone = source.clone();
      if (shadowsSettingsRow) applyShadowTintToMaterial(clone);
      clone.needsUpdate = true;
      materialClones.set(source, clone);
      localIndexes.set(source, materials.length);
      materials.push(clone);
      sourceMaterials.push(range.material);
    }
    const material = localIndexes.get(source)!;
    groups.push({ start: total, count: range.count, material });
    ranges.set(index, { start: total, count: range.count, material });
    total += range.count;
  }

  const geometry = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv'] as const) {
    const attribute = owner.geometry.getAttribute(name);
    if (!(attribute instanceof THREE.BufferAttribute)) continue;
    const itemSize = attribute.itemSize;
    const array = new Float32Array(total * itemSize);
    const sourceArray = attribute.array as ArrayLike<number>;
    let offset = 0;
    for (const { range } of entries) {
      const start = range.start * itemSize;
      const end = start + range.count * itemSize;
      for (let source = start; source < end; source++) array[offset++] = sourceArray[source];
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize, attribute.normalized));
  }
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  groups.forEach((group) => geometry.addGroup(group.start, group.count, group.material));
  if (withWorld) {
    owner.updateWorldMatrix(true, false);
    geometry.applyMatrix4(owner.matrixWorld);
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, materials, ranges, sourceMaterials };
}

/** Builds one imported-style scene object from a file-tree node. */
function createImportedPart(owner: THREE.Mesh, node: ImportedContentNode): THREE.Mesh | null {
  const lookup = importedModelPieceRanges.get(owner);
  if (!lookup || (node.pieces?.length ?? 0) === 0) return null;
  const extraction = extractImportedPieces(owner, lookup, node.pieces!, true);
  if (!extraction) return null;

  const mesh = new THREE.Mesh(
    extraction.geometry,
    extraction.materials.length === 1 ? extraction.materials[0] : extraction.materials,
  );
  mesh.name = uniqueObjectName(node.name || 'Imported Part');
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  objectShapes.set(mesh, 'Imported Model');
  importedModels.add(mesh);
  importedModelContents.set(mesh, node);
  importedModelPieceRanges.set(mesh, extraction.ranges);
  importedModelMaps.set(mesh, extraction.materials.map((material) => material.map ?? null));
  if (importedModelAuthoredUVs.has(owner)) importedModelAuthoredUVs.add(mesh);
  const missing = importedModelMissingTextures.get(owner) ?? [];
  importedModelMissingTextures.set(mesh, missing.flatMap((slot) => {
    const local = extraction.sourceMaterials.indexOf(slot.materialIndex);
    return local < 0 ? [] : [{ ...slot, materialIndex: local }];
  }));
  smoothShadingByMesh.set(mesh, true);
  objectMaterialPresets.set(mesh, 'Rubber');
  scene.add(mesh);
  objects.push(mesh);
  addHierarchyRow(mesh);
  return mesh;
}

/**
 * Splits one imported model level into separate scene objects.
 *
 * The object's file-tree root is replaced by its immediate node/mesh children:
 * a file becomes its "Scene", a Scene becomes its tree meshes, and a single
 * mesh stays a leaf (no further split). The new objects inherit the source's
 * materials (and therefore its file textures), so ungrouping never strips a
 * tree of its pictures. Returns the created parts.
 */
function splitImportedModel(mesh: THREE.Mesh): THREE.Mesh[] {
  const contents = importedModelContents.get(mesh);
  if (!contents || !importedModelPieceRanges.has(mesh)) return [];
  const nodes = importedFileParts(contents);
  if (nodes.length === 0) return [];
  const created = nodes
    .map((node) => createImportedPart(mesh, node))
    .filter((part): part is THREE.Mesh => part !== null);
  if (created.length === 0) return [];
  // Scene-tree children of the imported block must survive the ungroup, so
  // release them before the source object is deleted.
  getChildMeshes(mesh).forEach((child) => moveMeshToParent(child, null));
  selectObject(mesh);
  deleteSelectedObject();
  return created;
}

/**
 * Ungroups a model one level (right-click → Ungroup) or all the way down
 * (right-click → Ungroup all levels).
 *
 * "All levels" keeps splitting every created node that still has children in
 * the file tree, which turns a file → Scene → Tree_1/Tree_2 into two movable
 * leaves. Nodes that have no further file parts stay as they are, so nothing
 * is lost or duplicated.
 */
function ungroupImportedModel(mesh: THREE.Mesh, allLevels = false): void {
  const created = splitImportedModel(mesh);
  if (created.length === 0) {
    addDebugEntry(`"${mesh.name}" has no deeper file parts to ungroup.`, 'Model');
    return;
  }

  let leaves = created;
  if (allLevels) {
    const queue = [...created];
    leaves = [];
    while (queue.length > 0) {
      const target = queue.shift()!;
      const parts = splitImportedModel(target);
      if (parts.length === 0) leaves.push(target);
      else queue.push(...parts);
    }
  }

  refreshSunShadowBounds();
  if (leaves.length > 0) selectObject(leaves[0]);
  addDebugEntry(
    `Ungrouped "${mesh.name}" into ${leaves.length} part${leaves.length === 1 ? '' : 's'}${allLevels ? ' (all levels)' : ''}.`,
    'Model',
  );
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
      const uvs = transformed.getAttribute('uv');
      if (uvs) piece.setAttribute('uv', uvs.clone());
      pieces.push(piece);
      transformed.dispose();
    }
    const merged = mergeGeometries(pieces, false);
    if (!merged) throw new Error('The child geometries have incompatible vertex data.');
    pieces.forEach((piece) => piece.dispose());
    pieces.length = 0;
    const material = materialSource.clone();
    if (shadowsSettingsRow) applyShadowTintToMaterial(material);
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
    label.className = withSlider ? 'property-field numeric-field' : 'property-field';
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
      if (slider) {
        slider.value = String(nextValue);
        syncRangeBar(slider);
      }
    });
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

      const head = document.createElement('div');
      head.className = 'numeric-field-head';
      const caption = document.createElement('span');
      caption.className = 'numeric-field-label';
      caption.textContent = labelText;
      const stepper = document.createElement('span');
      stepper.className = 'numeric-stepper';
      const makeStepButton = (direction: -1 | 1) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.tabIndex = -1;
        button.textContent = direction < 0 ? '◀' : '▶';
        button.setAttribute('aria-label', `${direction < 0 ? 'Decrease' : 'Increase'} ${labelText}`);
        button.addEventListener('click', (event) => {
          event.preventDefault();
          const current = Number(input.value);
          const multiplier = event.shiftKey ? 10 : 1;
          const requested = (Number.isFinite(current) ? current : value) + step * direction * multiplier;
          const nextValue = THREE.MathUtils.clamp(Number(requested.toFixed(4)), min, max);
          input.value = String(nextValue);
          slider!.value = String(nextValue);
          syncRangeBar(slider!);
          apply(nextValue);
        });
        return button;
      };
      stepper.append(makeStepButton(-1), input, makeStepButton(1));
      head.append(caption, stepper);
      label.append(head, slider);
      syncRangeBar(slider);
    } else {
      label.textContent = labelText;
      label.appendChild(input);
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
    if (sun) sun.glowMaterial.color.copy(light.color);
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
    if (light instanceof THREE.DirectionalLight) syncSunLightDirection(mesh);
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

  let godRaysControls: HTMLElement | null = null;
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

    godRaysControls = document.createElement('section');
    godRaysControls.className = 'property-section god-rays-controls';
    const godRaysHeading = document.createElement('div');
    godRaysHeading.className = 'god-rays-heading';
    const godRaysTitle = document.createElement('strong');
    godRaysTitle.textContent = 'GOD RAYS';
    const godRaysStatus = document.createElement('span');
    godRaysStatus.textContent = godRaysAttachments.has(mesh) ? 'Sun child' : 'Not attached';
    godRaysHeading.append(godRaysTitle, godRaysStatus);
    const godRaysBody = document.createElement('div');
    godRaysBody.className = 'god-rays-body';
    const godRaysQualityField = document.createElement('label');
    godRaysQualityField.className = 'property-field';
    godRaysQualityField.textContent = 'Quality';
    const godRaysQualitySelect = document.createElement('select');
    godRaysQualitySelect.setAttribute('aria-label', 'God rays quality');
    const godRaysQualityOptions: Array<{ value: GodRaysQuality; label: string }> = [
      { value: 'low', label: 'Low — 16 taps, 40% res' },
      { value: 'medium', label: 'Medium — 32 taps, 55% res' },
      { value: 'high', label: 'High — 64 taps, full res' },
    ];
    godRaysQualityOptions.forEach(({ value, label }) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      godRaysQualitySelect.appendChild(option);
    });
    godRaysQualitySelect.value = godRays.quality;
    godRaysQualitySelect.addEventListener('change', () => {
      godRays.setQuality(godRaysQualitySelect.value as GodRaysQuality);
    });
    godRaysQualityField.appendChild(godRaysQualitySelect);
    godRaysBody.append(
      makeToggleField('Enable God Rays', godRays.enabled && activeSun === mesh, (enabled) => {
        setGodRaysEnabled(enabled, mesh);
      }),
      godRaysQualityField,
      makeNumberField('Intensity', godRays.settings.intensity, 0, 2, 0.01, (value) => {
        godRays.settings.intensity = value;
        godRays.applySettings();
      }, true),
      makeNumberField('Spread', godRays.settings.spread, 0.05, 1.2, 0.01, (value) => {
        godRays.settings.spread = value;
        godRays.applySettings();
      }, true),
      makeNumberField('Decay', godRays.settings.decay, 0.7, 0.995, 0.005, (value) => {
        godRays.settings.decay = value;
        godRays.applySettings();
      }, true),
      makeNumberField('Brightness', godRays.settings.brightness, 0, 1, 0.01, (value) => {
        godRays.settings.brightness = value;
        godRays.applySettings();
      }, true),
    );
    const tintField = document.createElement('label');
    tintField.className = 'property-field god-rays-tint-field';
    tintField.textContent = 'Ray tint';
    const tintInput = document.createElement('input');
    tintInput.type = 'color';
    tintInput.value = godRays.settings.tint;
    tintInput.setAttribute('aria-label', 'God rays tint color');
    tintInput.addEventListener('input', () => {
      godRays.settings.tint = tintInput.value;
      godRays.applySettings();
    });
    tintField.appendChild(tintInput);
    godRaysBody.appendChild(tintField);
    const godRaysNote = document.createElement('div');
    godRaysNote.className = 'point-geometry-status';
    godRaysNote.textContent = 'Attached as a God Rays child of this sun. The march runs in a reduced-resolution buffer and stops completely while the sun is behind the camera, so Quality is the main cost knob. Orbit until the sun is in frame; shafts are occluded by scene geometry in screen space.';
    godRaysBody.appendChild(godRaysNote);
    godRaysControls.append(godRaysHeading, godRaysBody);
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
    makeToggleField('Cast Shadow', lightShadowEnabled.get(light) ?? light.castShadow, (enabled) => {
      setLightCastsShadow(light, enabled);
    }),
    positionControls,
    ...(godRaysControls ? [godRaysControls] : []),
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
    objectShapes.has(mesh) && !importedModels.has(mesh) && mesh.material instanceof THREE.MeshStandardMaterial,
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
      const faceCount = Math.max(definition.minimumTriangles, Math.floor(requestedFaces));
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
      const faceCount = Math.max(definition.minimumTriangles, Math.floor(requestedFaces));
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

/** One row of the imported file tree in Scene Explorer, with nested children. */
function appendFileSceneRow(container: HTMLElement, node: ImportedContentNode, owner: THREE.Mesh): void {
  const row = document.createElement('div');
  row.className = 'scene-object-row file-scene-row';
  row.dataset.fileContent = node.kind;
  const line = document.createElement('div');
  line.className = 'scene-object-line';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'scene-group-disclosure';
  toggle.textContent = '›';
  toggle.hidden = node.children.length === 0;
  toggle.setAttribute('aria-label', `Expand ${node.name}`);
  toggle.setAttribute('aria-expanded', 'false');

  const name = document.createElement('button');
  name.type = 'button';
  name.className = 'scene-object file-content-object';
  name.textContent = node.name;
  name.title = node.name;

  const detail = document.createElement('span');
  detail.className = 'file-content-detail';
  detail.textContent = node.detail ?? '';
  line.append(toggle, name, detail);

  row.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
    showFileContentContextMenu(owner, event.clientX, event.clientY);
  });

  const children = document.createElement('div');
  children.className = 'scene-object-children';
  children.hidden = true;
  row.append(line, children);
  container.appendChild(row);

  if (node.children.length > 0) {
    const setOpen = (open: boolean) => {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', `${open ? 'Collapse' : 'Expand'} ${node.name}`);
      toggle.textContent = open ? '⌄' : '›';
      children.hidden = !open;
    };
    toggle.addEventListener('click', () => setOpen(children.hidden));
    // The row is informational, so clicking its name opens the branch too.
    name.addEventListener('click', () => setOpen(children.hidden));
  }
  node.children.forEach((child) => appendFileSceneRow(children, child, owner));
}

/**
 * Puts the imported file's own node/material/texture tree under its row in
 * Scene Explorer. The rows are nested with the same disclosures as groups, so
 * a node can contain a mesh, which can contain materials and textures, and so on.
 */
function installFileSceneContents(mesh: THREE.Mesh): void {
  const contents = importedModelContents.get(mesh);
  const row = hierarchyRows.get(mesh);
  const container = row?.querySelector<HTMLDivElement>('.scene-object-children');
  if (!contents || !container) return;
  container.querySelectorAll(':scope > .file-scene-row').forEach((element) => element.remove());
  contents.children.forEach((child) => appendFileSceneRow(container, child, mesh));
  expandedGroups.add(mesh);
  updateGroupHierarchyRow(mesh);
}

/**
 * Configurations for an imported file.
 *
 * The file is one engine block, so topology and face-count controls do not
 * apply. The file's own tree lives in Scene Explorer; this panel keeps the name,
 * a texture slot (the file's maps or a picture dropped onto every part) and the
 * transform readouts.
 */
function updateImportedModelProperties(mesh: THREE.Mesh) {
  properties.classList.remove('properties-empty');
  properties.classList.add('properties-content');
  properties.replaceChildren();

  const form = document.createElement('div');
  form.className = 'properties-form imported-model-form';
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
    const selectButton = row?.querySelector<HTMLButtonElement>('.scene-object');
    if (selectButton) selectButton.textContent = mesh.name || 'Object';
    updateObjectLockControls(mesh);
  });
  nameLabel.appendChild(nameInput);

  const hint = document.createElement('p');
  hint.className = 'point-geometry-status';
  hint.textContent = 'File contents are in Scene Explorer: expand this object to walk the file’s nodes, materials and textures. A map that reads “missing image” can be filled in below, with the image files or the whole folder they live in.';

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

  const geometryPositions = mesh.geometry.getAttribute('position');
  const geometryVertexCount = mesh.geometry.index?.count ?? geometryPositions?.count ?? 0;
  const stats = document.createElement('p');
  stats.className = 'point-geometry-status';
  stats.textContent = `${Math.floor(geometryVertexCount / 3).toLocaleString()} triangles · ${geometryVertexCount.toLocaleString()} vertices.`;
  const missingTextures = createImportedMissingTexturesSection(mesh);
  form.append(
    nameLabel,
    stats,
    hint,
    ...(missingTextures ? [missingTextures] : []),
    createObjectTextureSection(mesh),
    position,
    rotation,
    scale,
  );
  properties.appendChild(form);
}

/** Configurations for a spawned Camera: lens, view mode and look controls. */
function updateCameraProperties(mesh: THREE.Mesh, settings: SceneCameraSettings) {
  properties.classList.remove('properties-empty');
  properties.classList.add('properties-content');
  properties.replaceChildren();
  const form = document.createElement('div');
  form.className = 'properties-form camera-settings-form';

  const nameLabel = document.createElement('label');
  nameLabel.className = 'property-field';
  nameLabel.textContent = 'Name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = mesh.name;
  nameInput.setAttribute('aria-label', 'Camera name');
  nameInput.addEventListener('input', () => {
    mesh.name = nameInput.value;
    const row = sceneContents.querySelector<HTMLElement>(`.scene-object-row[data-uuid="${mesh.uuid}"] .scene-object`);
    if (row) row.textContent = mesh.name || 'Camera';
  });
  nameLabel.appendChild(nameInput);
  form.appendChild(nameLabel);

  const section = document.createElement('section');
  section.className = 'property-section';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'property-section-toggle';
  toggle.setAttribute('aria-expanded', 'true');
  toggle.innerHTML = '<span class="section-chevron">⌄</span><span>Camera</span>';
  const details = document.createElement('div');
  details.className = 'camera-details';

  const fovField = createSliderField({
    label: 'Field of view',
    value: settings.fov,
    min: 20,
    max: 120,
    step: 1,
    apply: (value) => {
      settings.fov = value;
      if (playState?.mesh === mesh) updatePlayCamera();
    },
  });

  const viewLabel = document.createElement('label');
  viewLabel.className = 'property-field camera-select-field';
  viewLabel.textContent = 'View';
  const viewSelect = document.createElement('select');
  viewSelect.setAttribute('aria-label', 'Camera view mode');
  [
    ['first', 'First person'],
    ['third', 'Third person'],
    ['bird', "Bird's eye"],
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    viewSelect.appendChild(option);
  });
  viewSelect.value = settings.viewMode;
  viewLabel.appendChild(viewSelect);

  const lookLabel = document.createElement('label');
  lookLabel.className = 'property-field camera-select-field';
  lookLabel.textContent = 'Look around while playing';
  const lookSelect = document.createElement('select');
  lookSelect.setAttribute('aria-label', 'Camera look control');
  [
    ['right', 'Hold right mouse'],
    ['left', 'Hold left mouse'],
    ['click', 'Click to lock pointer'],
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    lookSelect.appendChild(option);
  });
  lookSelect.value = settings.lookMode;
  lookLabel.appendChild(lookSelect);

  const distanceField = createSliderField({
    label: 'Follow distance',
    value: settings.followDistance,
    min: 1,
    max: 40,
    step: 0.5,
    apply: (value) => { settings.followDistance = value; },
  });
  const heightField = createSliderField({
    label: 'View height',
    value: settings.height,
    min: 0,
    max: 20,
    step: 0.25,
    apply: (value) => { settings.height = value; },
  });

  const moveSpeedField = createSliderField({
    label: 'Move speed',
    value: settings.moveSpeed,
    min: 1,
    max: 20,
    step: 0.5,
    apply: (value) => { settings.moveSpeed = value; },
  });
  moveSpeedField.field.hidden = !settings.allowMovement;

  const movementToggle = createSettingsToggle('Allow movement (WASD)', settings.allowMovement, (enabled) => {
    settings.allowMovement = enabled;
    moveSpeedField.field.hidden = !enabled;
    if (!enabled) playMoveKeys.clear();
  });

  const syncViewFields = () => {
    const firstPerson = settings.viewMode === 'first';
    distanceField.field.hidden = firstPerson;
    heightField.field.hidden = firstPerson;
  };
  syncViewFields();
  viewSelect.addEventListener('change', () => {
    settings.viewMode = viewSelect.value as CameraViewMode;
    syncViewFields();
    if (playState?.mesh === mesh) updatePlayCamera();
  });
  lookSelect.addEventListener('change', () => {
    settings.lookMode = lookSelect.value as CameraLookMode;
  });

  const playThisCamera = document.createElement('button');
  playThisCamera.type = 'button';
  playThisCamera.className = 'camera-play-button';
  playThisCamera.textContent = '▶ Play this camera';
  playThisCamera.addEventListener('click', () => {
    selectObject(mesh);
    startPlayMode();
  });

  const hint = document.createElement('p');
  hint.className = 'camera-hint';
  hint.textContent = 'Move, rotate and scale the camera like any object. Press the play button in the toolbar (or Play this camera) to look through it; the editor UI hides until you press STOP or Esc. With Allow movement on, WASD walks the camera, Space/C rise and fall, and Shift sprints — the view follows the object as it moves.';

  const viewHint = document.createElement('p');
  viewHint.className = 'camera-hint';
  viewHint.textContent = 'The frustum drawn in the viewport is the real field of view of this camera.';

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    toggle.querySelector('.section-chevron')!.textContent = expanded ? '›' : '⌄';
    details.hidden = expanded;
  });

  details.append(
    fovField.field,
    viewLabel,
    distanceField.field,
    heightField.field,
    lookLabel,
    movementToggle,
    moveSpeedField.field,
    viewHint,
    playThisCamera,
    hint,
  );
  section.append(toggle, details);
  form.appendChild(section);
  properties.appendChild(form);
}

function updateProperties(mesh: THREE.Mesh) {
  pointStatusElement = null;
  if (selectedObjects.length > 1) {
    updateMultiObjectProperties();
    return;
  }
  if (importedModels.has(mesh)) {
    updateImportedModelProperties(mesh);
    return;
  }
  const cameraSettings = sceneCameras.get(mesh);
  if (cameraSettings) {
    updateCameraProperties(mesh, cameraSettings);
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
  const importedModel = importedModels.has(mesh);
  const modelSection = document.createElement('section');
  modelSection.className = 'property-section';
  // An image block is two triangles showing one picture; topology and shading
  // controls would only distort it. An imported model keeps its own triangle
  // soup, so the face-count controls are hidden for it too.
  modelSection.hidden = shape === 'ImageBlock' || importedModel;
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
  // No upper limit: the topology fields used to stop at 10 000 faces, so a
  // shape could never be dense enough for a close-up. Only the shape's own
  // minimum is enforced, to keep the geometry valid.
  const topologyLimits = {
    edges: { min: Math.ceil(definition.minimumTriangles * 1.5) },
    vertices: { min: Math.ceil(definition.minimumTriangles / 2 + (isTorus ? 0 : 2)) },
    faces: { min: definition.minimumTriangles },
  };
  const setFaceCount = (requested: number) => {
    const nextFaceCount = Math.max(definition.minimumTriangles, Math.floor(requested));
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
    input.step = '1';
    input.value = String(topology[key]);
    input.setAttribute('aria-label', key[0].toUpperCase() + key.slice(1));
    input.addEventListener('change', () => {
      const requested = Number(input.value);
      if (!Number.isFinite(requested)) {
        input.value = String(topology[key]);
        return;
      }
      const bounded = Math.max(topologyLimits[key].min, Math.floor(requested));
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
  const reflectanceField = createSliderField({
    label: 'Reflectance',
    value: material.metalness,
    min: 0,
    max: 1,
    step: 0.01,
    apply: (value) => {
      // Metalness drives the reflected component; lowering roughness in step
      // keeps the reflection readable instead of a dull, diffuse grey.
      if (material.map) {
        // A texture owns the albedo. Going metallic would delete the picture,
        // so Reflectance only adds a light sheen (and a hint of the sun /
        // surroundings) on top of the mapped colour.
        material.metalness = value * 0.15;
        material.roughness = THREE.MathUtils.lerp(0.72, 0.05, value);
        return;
      }
      material.metalness = value;
      material.roughness = THREE.MathUtils.lerp(0.9, 0.08, value);
    },
  });
  const transparencyField = createSliderField({
    label: 'Transparency',
    value: 1 - material.opacity,
    min: 0,
    max: 1,
    step: 0.01,
    apply: (value) => {
      const transparent = value > 0.001;
      material.opacity = 1 - value;
      material.transparent = transparent;
      material.depthWrite = !transparent;
      material.needsUpdate = true;
    },
  });
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
    reflectanceField.setValue(preset.metalness);
    transparencyField.setValue(1 - preset.opacity);
  });
  materialLabel.appendChild(materialSelect);

  chromaticsDetails.append(
    applyColorToAllLabel,
    wheelRow,
    palette,
    colorValues,
    recentRow,
    materialLabel,
    reflectanceField.field,
    transparencyField.field,
  );
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

  // Imported files get their own panel (name, file tree hint, texture and
  // transform), so this generic form only builds the slot for shaped blocks.
  const textureSection = importedModel ? null : createObjectTextureSection(mesh);
  form.append(
    nameLabel,
    modelSection,
    chromaticsSection,
    ...(textureSection ? [textureSection] : []),
    position,
    rotation,
    scale,
  );
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
  // Picking anything in the scene leaves the texture library; its rows keep a
  // stale highlight otherwise.
  if (selectedTextureId !== null) {
    selectedTextureId = null;
    updateTextureRowSelection();
  }
  if (shadowsSettingsSelected) {
    shadowsSettingsSelected = false;
    shadowsSettingsRow?.classList.remove('is-selected');
  }
  if (atmosphereSettingsSelected) {
    atmosphereSettingsSelected = false;
    atmosphereSettingsRow?.classList.remove('is-selected');
  }
  if (monitorSettingsSelected) {
    monitorSettingsSelected = false;
    monitorSettingsRow?.classList.remove('is-selected');
  }
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
  const imported = importedModels.has(mesh);
  // The object menu stays short: lock, the two ungroup actions and delete.
  // Grouping and merging remain available through the hierarchy drag-and-drop.
  contextGroupChildrenButton.hidden = true;
  contextModelChildrenButton.hidden = true;
  const hasParent = objectParentByMesh.has(mesh);
  if (imported) {
    const canSplit = canUngroupImportedModel(mesh);
    contextUngroupButton.hidden = !canSplit && !hasParent;
    contextUngroupButton.textContent = canSplit ? 'Ungroup one level' : 'Remove from group';
    contextUngroupAllButton.hidden = !canSplit;
    contextUngroupAllButton.textContent = 'Ungroup all levels';
  } else {
    contextUngroupButton.hidden = !isGroupableMesh(mesh) || !(hasChildren || hasParent);
    contextUngroupButton.textContent = hasChildren ? 'Ungroup children' : 'Remove from group';
    contextUngroupAllButton.hidden = !hasChildren;
    contextUngroupAllButton.textContent = 'Ungroup all levels';
  }
  contextDeleteButton.hidden = false;
  // These two act on every object, so they live in the Wireframe/Faces toolbar
  // menus rather than in the much shorter object menu.
  contextShowAllWireframeButton.hidden = true;
  contextShowAllFacesButton.hidden = true;
  objectContextMenu.hidden = false;
  const menuBounds = objectContextMenu.getBoundingClientRect();
  objectContextMenu.style.left = `${Math.min(clientX, window.innerWidth - menuBounds.width - 8)}px`;
  objectContextMenu.style.top = `${Math.min(clientY, window.innerHeight - menuBounds.height - 8)}px`;
}

/** A one-action menu for a row inside an imported file tree. */
function showFileContentContextMenu(owner: THREE.Mesh, clientX: number, clientY: number) {
  if (!canUngroupImportedModel(owner)) return;
  contextTargetObject = owner;
  selectObject(owner);
  contextLockButton.hidden = true;
  contextGroupChildrenButton.hidden = true;
  contextModelChildrenButton.hidden = true;
  contextDeleteButton.hidden = true;
  contextShowAllWireframeButton.hidden = true;
  contextShowAllFacesButton.hidden = true;
  contextUngroupButton.hidden = false;
  contextUngroupButton.textContent = 'Ungroup one level';
  contextUngroupAllButton.hidden = false;
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
  contextUngroupButton.hidden = true;
  contextUngroupAllButton.hidden = true;
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
contextUngroupButton.addEventListener('click', () => {
  const target = contextTargetObject;
  closeObjectContextMenu();
  if (!target) return;
  if (importedModels.has(target) && canUngroupImportedModel(target)) ungroupImportedModel(target);
  else ungroupChildMeshes(target);
});
contextUngroupAllButton.addEventListener('click', () => {
  const target = contextTargetObject;
  closeObjectContextMenu();
  if (!target) return;
  if (importedModels.has(target) && canUngroupImportedModel(target)) ungroupImportedModel(target, true);
  else ungroupChildMeshes(target);
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
  pointDisclosure.hidden = isLight || isWorldSkybox(mesh) || sceneCameras.has(mesh) || !pointGeoEnabled;
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
  pointChild.hidden = isLight || isWorldSkybox(mesh) || sceneCameras.has(mesh) || !pointGeometryPoints.has(mesh);
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
    // Insert ahead of the texture folder so DOM order (focus, screen readers,
    // drag-drop) matches what the tree shows.
    sceneContents.insertBefore(row, textureTreeGroup);
  }
  updateGroupHierarchyRow(mesh);
  updateObjectLockControls(mesh);
  if (importedModels.has(mesh)) installFileSceneContents(mesh);
}

function setPointGeometryEnabled(enabled: boolean) {
  pointGeoEnabled = enabled;
  pointGeoButton.setAttribute('aria-pressed', String(enabled));
  sceneContents.querySelectorAll<HTMLButtonElement>('.point-geometry-disclosure').forEach((button) => {
    const row = button.closest<HTMLElement>('.scene-object-row');
    const uuid = row?.dataset.uuid;
    const mesh = objects.find((object) => object.uuid === uuid);
    button.hidden = !enabled || !mesh || sceneLights.has(mesh) || sceneCameras.has(mesh);
  });
  if (!enabled) {
    if (pointEditObject && !finishPointEditing(true)) {
      pointGeoEnabled = true;
      pointGeoButton.setAttribute('aria-pressed', 'true');
      sceneContents.querySelectorAll<HTMLButtonElement>('.point-geometry-disclosure').forEach((button) => {
        const row = button.closest<HTMLElement>('.scene-object-row');
        const mesh = objects.find((object) => object.uuid === row?.dataset.uuid);
        button.hidden = !mesh || sceneLights.has(mesh) || sceneCameras.has(mesh);
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
  // An imported model has no procedural base shape; its own vertices are the
  // points to edit, so rigging still works without rebuilding the file.
  const base = importedModels.has(mesh)
    ? mesh.geometry.clone()
    : shapeDefinitions[objectShapes.get(mesh)!].createBaseGeometry();
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
  if (shadowsSettingsRow) applyShadowTintToMaterial(material);
  const mesh = new THREE.Mesh(
    createTriangleGeometry(name, definition.defaultTriangles ?? definition.minimumTriangles),
    material,
  );
  mesh.name = uniqueObjectName(name === 'ImageBlock' ? 'Image Block' : name);
  mesh.castShadow = name !== 'ImageBlock';
  mesh.receiveShadow = true;
  if (name === 'ImageBlock') {
    // A picture plane has no thickness: show it from both sides, and do not let
    // a fully metallic response swallow the image.
    material.side = THREE.DoubleSide;
    material.roughness = 1;
    material.metalness = 0;
  }
  objectShapes.set(mesh, name);
  smoothShadingByMesh.set(mesh, true);
  objectMaterialPresets.set(mesh, 'Rubber');
  mesh.position.copy(position);
  mesh.position.y += definition.groundOffset;
  scene.add(mesh);
  objects.push(mesh);
  // A sun that is already shadowing has to widen its shadow box to include the
  // new block, or the newcomer is lit while everything else casts a shadow.
  refreshSunShadowBounds();
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

/** Smallest radius, in world units, of the box the sun's shadow map covers. */
const SUN_SHADOW_MIN_RADIUS = 18;
/** Upper bound so a stray block far from the origin cannot blur the sun out entirely. */
const SUN_SHADOW_MAX_RADIUS = 1200;

/**
 * World-space bounds of everything that can cast or receive a shadow. The sun's
 * shadow camera is fitted to this box every frame, so blocks that are moved,
 * scaled or added after the sun was created are always inside the map. The old
 * version measured the scene once, from the origin, when an object was added:
 * stretching a floor or building a second room outside that fixed square left
 * half the scene lit with no shadow, which read as "shadows break with more
 * than one object".
 */
function computeShadowSceneBounds(): { center: THREE.Vector3; radius: number } {
  const bounds = new THREE.Box3();
  const box = new THREE.Box3();
  for (const mesh of objects) {
    if (mesh.isMesh !== true || mesh.visible !== true) continue;
    if (sunSettings.has(mesh) || sceneLights.has(mesh) || isWorldSkybox(mesh)) continue;
    if (mesh.castShadow !== true && mesh.receiveShadow !== true) continue;
    if (!mesh.geometry.getAttribute('position')) continue;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    if (!mesh.geometry.boundingBox) continue;
    mesh.updateWorldMatrix(true, false);
    box.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
    bounds.union(box);
  }
  if (bounds.isEmpty()) return { center: new THREE.Vector3(), radius: SUN_SHADOW_MIN_RADIUS };
  const center = bounds.getCenter(new THREE.Vector3());
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  return {
    center,
    radius: THREE.MathUtils.clamp(sphere.radius, SUN_SHADOW_MIN_RADIUS, SUN_SHADOW_MAX_RADIUS),
  };
}

/**
 * Fits a directional light's shadow camera to the scene.
 *
 * A directional light shines along (position - target); only that direction is
 * physical. The marker the user sees sits 40 000 units away, but parking the
 * light there put the shadow map's near/far slab tens of thousands of units from
 * the camera and left far less depth precision than the scene needs — flat
 * triangulated surfaces then broke into acne bands. The light is therefore moved
 * to a short distance along the same direction, the orthographic box is centred
 * on the scene and sized to its bounding sphere, and the near/far planes bracket
 * that sphere. Consecutive frames only touch the camera when the fitted box
 * really changed, so a still scene keeps a stable map instead of shimmering.
 */
function fitDirectionalShadow(
  light: THREE.DirectionalLight,
  bounds: { center: THREE.Vector3; radius: number } = computeShadowSceneBounds(),
): void {
  const direction = light.userData.sunDirection instanceof THREE.Vector3
    ? (light.userData.sunDirection as THREE.Vector3).clone()
    : light.position.clone().sub(light.target.position);
  if (direction.lengthSq() < 1e-8) direction.set(0, 1, 0);
  direction.normalize();

  const { center, radius } = bounds;
  const distance = radius * 2 + 50;

  const shadowCamera = light.shadow.camera;
  const extent = radius * 1.08;
  const texelWorldSize = (extent * 2) / Math.max(light.shadow.mapSize.x, 1);

  // Snap the fitted box to whole shadow texels in the light's own plane. Without
  // this the box slides by fractions of a texel while an object is dragged, so
  // every shadow edge crawls and small overlapping surfaces appear to flicker.
  const forward = direction.clone().negate();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  else right.normalize();
  const up = new THREE.Vector3().crossVectors(forward, right).normalize();
  const snappedCenter = center.clone();
  for (const axis of [right, up]) {
    const offset = center.dot(axis);
    snappedCenter.addScaledVector(axis, Math.round(offset / texelWorldSize) * texelWorldSize - offset);
  }

  light.target.position.copy(snappedCenter);
  light.position.copy(snappedCenter).addScaledVector(direction, distance);
  light.updateMatrixWorld();
  const fitted = {
    left: -extent,
    right: extent,
    top: extent,
    bottom: -extent,
    near: Math.max(distance - radius * 1.6, 0.1),
    far: distance + radius * 1.6 + 1,
  };
  const unchanged = shadowCamera.left === fitted.left &&
    shadowCamera.right === fitted.right &&
    shadowCamera.top === fitted.top &&
    shadowCamera.bottom === fitted.bottom &&
    shadowCamera.near === fitted.near &&
    shadowCamera.far === fitted.far;
  shadowCamera.left = fitted.left;
  shadowCamera.right = fitted.right;
  shadowCamera.top = fitted.top;
  shadowCamera.bottom = fitted.bottom;
  shadowCamera.near = fitted.near;
  shadowCamera.far = fitted.far;
  if (!unchanged) shadowCamera.updateProjectionMatrix();

  // Bias is expressed in normalised depth across the fitted slab, and the
  // normal bias in world units per shadow texel. Both scale with the box, which
  // is what stops a flat, triangulated wall from self-shadowing in stripes.
  light.shadow.bias = -0.0004;
  light.shadow.normalBias = THREE.MathUtils.clamp(texelWorldSize * 3, 0.02, 1.2);
  light.shadow.needsUpdate = true;
}

/** Keeps the directional light's direction in step with the visible sun marker. */
function syncSunLightDirection(proxy: THREE.Mesh): void {
  const light = sceneLights.get(proxy);
  if (!(light instanceof THREE.DirectionalLight)) return;
  proxy.updateWorldMatrix(true, false);
  const position = proxy.getWorldPosition(new THREE.Vector3());
  if (position.lengthSq() > 1e-6) light.userData.sunDirection = position.normalize();
  fitDirectionalShadow(light);
}

function updateSunPosition(proxy: THREE.Mesh, light: THREE.DirectionalLight, settings: SunSettings) {
  proxy.position.copy(getSunPosition(settings));
  proxy.visible = true;
  light.userData.sunDirection = proxy.position.clone().normalize().multiplyScalar(1);
  light.target.position.set(0, 0, 0);
  fitDirectionalShadow(light);
}

/**
 * Re-fits every light whose shadow box depends on the current scene.
 *
 * Measuring the scene walks every object and transforms its bounding box, which
 * is wasted work on the frames where nothing moved: a still scene produced the
 * same box a thousand times a second. The fit runs at most ~11 times a second
 * unless an edit forces it, which is still far more often than anything can
 * visibly drift.
 */
let lastShadowFitTime = Number.NEGATIVE_INFINITY;
const SHADOW_FIT_INTERVAL = 90;

function updateDirectionalShadowBounds(force = false): void {
  const now = performance.now();
  if (!force && now - lastShadowFitTime < SHADOW_FIT_INTERVAL) return;
  lastShadowFitTime = now;
  // Measure the scene once even when several suns are shadowing: the box is a
  // property of the geometry, not of the light.
  let bounds: { center: THREE.Vector3; radius: number } | null = null;
  for (const mesh of objects) {
    const light = sceneLights.get(mesh);
    if (!(light instanceof THREE.DirectionalLight)) continue;
    if (light.castShadow !== true || !lightShadowIsActive(light)) continue;
    bounds ??= computeShadowSceneBounds();
    fitDirectionalShadow(light, bounds);
  }
}

/**
 * A light's shadow contribution is compiled into the receiving material's shader
 * the first time that material renders. Turning `castShadow` on later therefore
 * changed nothing until something else forced a rebuild, which is why the Cast
 * Shadow toggle looked dead. Bump every receiving material so the shadow node is
 * created (or dropped) at the next frame.
 */
function refreshShadowReceivingMaterials(): void {
  const refreshed = new Set<THREE.Material>();
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true || mesh.receiveShadow !== true) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial && !refreshed.has(material)) {
        refreshed.add(material);
        material.needsUpdate = true;
      }
    }
  });
}

/** Scene-wide appearance controls exposed by the inserted Shadows settings. */
interface ShadowAppearance {
  enabled: boolean;
  color: string;
  resolution: number;
  blocky: boolean;
  strength: number;
  softness: number;
}

const shadowAppearance: ShadowAppearance = {
  enabled: true,
  // The colour a shadowed surface keeps instead of going black.
  color: '#000000',
  resolution: 2048,
  blocky: false,
  strength: 1,
  softness: 1,
};

let shadowsSettingsRow: HTMLDivElement | null = null;
let shadowsSettingsSelected = false;

/**
 * Colours the light a surface keeps where a shadow falls. The shadow factor is
 * 1 in full light and 0 in deep shadow, so mixing the tint against white leaves
 * lit pixels untouched and colours shadowed ones — the standard node technique
 * for coloured shadows, applied to every standard material in the scene.
 */
const shadowTintColor = TSL.uniform(new THREE.Color(shadowAppearance.color));
const shadowTintNode = (shadowFactor: ReturnType<typeof TSL.vec3>) =>
  TSL.mix(shadowTintColor, TSL.vec3(1), shadowFactor);

function applyShadowTintToMaterial(material: THREE.MeshStandardMaterial): void {
  // `receivedShadowNode` is a node-material hook copied onto the node material
  // the renderer builds from this standard material; the runtime setter is not
  // in the plain material typings.
  const tintMaterial = material as unknown as { receivedShadowNode: unknown };
  if (tintMaterial.receivedShadowNode === shadowTintNode) return;
  tintMaterial.receivedShadowNode = shadowTintNode;
  material.needsUpdate = true;
}

/** The light records are keyed by their proxy meshes, so walk the objects. */
function forEachSceneLight(apply: (light: EditableLight) => void): void {
  for (const mesh of objects) {
    const light = sceneLights.get(mesh);
    if (light) apply(light);
  }
}

function applyShadowTintToMaterials(): void {
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial) applyShadowTintToMaterial(material);
    }
  });
}

/**
 * The user-facing Cast Shadow state, per light.
 *
 * `castShadow` only ever moves from off to on. Turning it back off makes three
 * dispose the light's shadow render target while every compiled material keeps
 * the texture it was built with: WebGPU then warns about a destroyed texture
 * used in a submit, the shader samples a dead map, and the next re-enable throws
 * `Cannot read properties of null (reading 'depthTexture')` inside
 * `ShadowNode.updateShadow`, which stops the whole render loop. Hiding a shadow
 * by zeroing `shadow.intensity` keeps the node, the map and the bindings alive,
 * takes effect on the next frame in both directions, and needs no recompile.
 */
const lightShadowEnabled = new WeakMap<THREE.Light, boolean>();

function lightShadowIsActive(light: THREE.Light): boolean {
  return (lightShadowEnabled.get(light) ?? light.castShadow) && shadowAppearance.enabled;
}

function applyShadowAppearanceToLight(light: THREE.Light): void {
  if (!light.shadow) return;
  const active = lightShadowIsActive(light);
  if (active && light.castShadow !== true) {
    light.castShadow = true;
    if (light instanceof THREE.DirectionalLight) fitDirectionalShadow(light);
  }
  light.shadow.mapSize.set(shadowAppearance.resolution, shadowAppearance.resolution);
  light.shadow.intensity = active ? shadowAppearance.strength : 0;
  light.shadow.radius = shadowAppearance.softness;
  // Skip the depth pass for a hidden shadow, but only once a map exists: the
  // map is created by the first shadow update, and freezing before that leaves
  // the shader bound to nothing.
  light.shadow.autoUpdate = active || light.shadow.map === null;
  light.shadow.needsUpdate = active;
}

/** The Cast Shadow toggle of one light. */
function setLightCastsShadow(light: THREE.Light, enabled: boolean): void {
  const compiled = light.castShadow;
  lightShadowEnabled.set(light, enabled);
  applyShadowAppearanceToLight(light);
  // A material compiled while the light cast no shadow has no shadow node to
  // hide, so adding one is the only case that needs a rebuild.
  if (enabled && !compiled) refreshShadowReceivingMaterials();
}

/** Re-fits every sun that is currently shadowing after the scene changed. */
function refreshSunShadowBounds(): void {
  updateDirectionalShadowBounds(true);
}

function applyShadowAppearance(refreshMaterials = false): void {
  // `renderer.shadowMap.enabled` is deliberately left on: switching it drops the
  // shadow nodes from every compiled material, and turning it back on left them
  // sampling a stale map. Visibility is driven per light by `shadow.intensity`.
  renderer.shadowMap.type = shadowAppearance.blocky ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
  shadowTintColor.value.set(shadowAppearance.color);
  forEachSceneLight((light) => applyShadowAppearanceToLight(light));
  // Bias is sized from a shadow texel, so it changes with the map resolution.
  refreshSunShadowBounds();
  applyShadowTintToMaterials();
  // Only a changed filter or map size alters the compiled shadow path; colour
  // and strength are live uniforms.
  if (refreshMaterials) refreshShadowReceivingMaterials();
}

function selectShadowsSettings(): void {
  if (!shadowsSettingsRow) return;
  shadowsSettingsSelected = false;
  selectObject(null);
  shadowsSettingsSelected = true;
  shadowsSettingsRow.classList.add('is-selected');
  updateShadowsSettingsProperties();
}

function addShadowsSettings(): void {
  if (shadowsSettingsRow) {
    selectShadowsSettings();
    return;
  }
  const row = document.createElement('div');
  row.className = 'scene-object-row shadows-settings-row';
  row.dataset.shadowsSettings = 'true';
  const line = document.createElement('div');
  line.className = 'scene-object-line';
  const icon = document.createElement('span');
  icon.className = 'shadows-hierarchy-icon';
  icon.setAttribute('aria-hidden', 'true');
  const selectButton = document.createElement('button');
  selectButton.type = 'button';
  selectButton.className = 'scene-object';
  selectButton.textContent = 'Shadows';
  selectButton.addEventListener('click', selectShadowsSettings);
  line.append(icon, selectButton);
  row.append(line);
  sceneContents.appendChild(row);
  shadowsSettingsRow = row;
  applyShadowAppearance(true);
  selectShadowsSettings();
}

function removeShadowsSettings(): void {
  shadowsSettingsRow?.remove();
  shadowsSettingsRow = null;
  shadowsSettingsSelected = false;
  shadowAppearance.enabled = true;
  shadowAppearance.color = '#000000';
  shadowAppearance.resolution = 2048;
  shadowAppearance.blocky = false;
  shadowAppearance.strength = 1;
  shadowAppearance.softness = 1;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  shadowTintColor.value.set(shadowAppearance.color);
  // Per-light Cast Shadow choices survive the removal of the scene-wide panel.
  forEachSceneLight((light) => applyShadowAppearanceToLight(light));
  refreshSunShadowBounds();
  refreshShadowReceivingMaterials();
  selectObject(null);
}

function updateShadowsSettingsProperties(): void {
  properties.classList.remove('properties-empty');
  properties.classList.add('properties-content');
  properties.replaceChildren();
  const form = document.createElement('div');
  form.className = 'properties-form shadows-settings-form';

  const note = document.createElement('div');
  note.className = 'point-geometry-status';
  note.textContent = 'Scene-wide shadow appearance for the sun, spot and point lights. Adding more lights picks these settings up automatically.';
  form.appendChild(note);

  const toggle = (labelText: string, checked: boolean, apply: (enabled: boolean) => void) => {
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

  const colorField = document.createElement('label');
  colorField.className = 'property-field';
  colorField.textContent = 'Shadow color';
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = shadowAppearance.color;
  colorInput.setAttribute('aria-label', 'Shadow color');
  colorInput.addEventListener('input', () => {
    shadowAppearance.color = colorInput.value;
    applyShadowAppearance();
  });
  colorField.appendChild(colorInput);

  const resolutionField = document.createElement('label');
  resolutionField.className = 'property-field';
  resolutionField.textContent = 'Resolution';
  const resolutionSelect = document.createElement('select');
  resolutionSelect.setAttribute('aria-label', 'Shadow resolution');
  for (const [value, label] of [
    ['512', '512 · Low'],
    ['1024', '1024 · Medium'],
    ['2048', '2048 · High'],
    ['4096', '4096 · Ultra'],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = Number(value) === shadowAppearance.resolution;
    resolutionSelect.appendChild(option);
  }
  resolutionSelect.addEventListener('change', () => {
    shadowAppearance.resolution = Number(resolutionSelect.value);
    applyShadowAppearance();
  });
  resolutionField.appendChild(resolutionSelect);

  const rangeField = (
    labelText: string,
    value: number,
    min: number,
    max: number,
    step: number,
    format: (value: number) => string,
    apply: (value: number) => void,
  ) => {
    const label = document.createElement('label');
    label.className = 'property-field shadows-range-field';
    const header = document.createElement('span');
    header.className = 'shadows-field-header';
    const name = document.createElement('span');
    name.textContent = labelText;
    const output = document.createElement('output');
    output.textContent = format(value);
    header.append(name, output);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.setAttribute('aria-label', labelText);
    syncRangeBar(input);
    input.addEventListener('input', () => {
      const next = Number(input.value);
      output.textContent = format(next);
      syncRangeBar(input);
      apply(next);
    });
    label.append(header, input);
    return label;
  };

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'shadows-settings-remove';
  removeButton.textContent = 'Remove shadow settings';
  removeButton.addEventListener('click', removeShadowsSettings);

  form.append(
    toggle('Enabled', shadowAppearance.enabled, (enabled) => {
      shadowAppearance.enabled = enabled;
      applyShadowAppearance(true);
    }),
    colorField,
    resolutionField,
    toggle('Blocky shadows', shadowAppearance.blocky, (blocky) => {
      shadowAppearance.blocky = blocky;
      applyShadowAppearance(true);
    }),
    rangeField('Strength', shadowAppearance.strength, 0, 1, 0.01, (value) => `${Math.round(value * 100)}%`, (value) => {
      shadowAppearance.strength = value;
      // Through the per-light helper so a light whose Cast Shadow is off keeps
      // an intensity of zero instead of lighting its shadow back up.
      forEachSceneLight((light) => applyShadowAppearanceToLight(light));
    }),
    rangeField('Softness', shadowAppearance.softness, 0, 8, 0.1, (value) => value.toFixed(1), (value) => {
      shadowAppearance.softness = value;
      forEachSceneLight((light) => applyShadowAppearanceToLight(light));
    }),
    note,
    removeButton,
  );
  properties.appendChild(form);
}

/* -------------------------------------------------------------------------- */
/* Insert → Atmosphere                                                         */
/* -------------------------------------------------------------------------- */

interface AtmosphereSettings {
  enabled: boolean;
  skyColor: string;
  groundColor: string;
  intensity: number;
  exposure: number;
  environmentIntensity: number;
  fogColor: string;
  fogDensity: number;
}

const atmosphereDefaults: AtmosphereSettings = {
  enabled: true,
  skyColor: '#e2e2e2',
  groundColor: '#666666',
  intensity: 0.16,
  exposure: DEFAULT_TONE_MAPPING_EXPOSURE,
  environmentIntensity: 1,
  fogColor: '#111820',
  fogDensity: 0,
};
const atmosphereSettings: AtmosphereSettings = { ...atmosphereDefaults };
let atmosphereSettingsRow: HTMLDivElement | null = null;
let atmosphereSettingsSelected = false;

/** One fog instance, mutated in place: replacing it would invalidate the compiled fog node. */
const atmosphereFog = new THREE.FogExp2('#111820', 0);

/** Applies the world light, exposure and fog in one place. */
function applyAtmosphere(): void {
  const active = atmosphereSettings.enabled;
  ambientLight.color.set(atmosphereSettings.skyColor);
  ambientLight.groundColor.set(atmosphereSettings.groundColor);
  ambientLight.intensity = active ? atmosphereSettings.intensity : atmosphereDefaults.intensity;
  renderer.toneMappingExposure = active ? atmosphereSettings.exposure : DEFAULT_TONE_MAPPING_EXPOSURE;
  scene.environmentIntensity = active ? atmosphereSettings.environmentIntensity : 1;
  // A textured material owns its environment so Reflectance applies, which
  // also takes it out of `scene.environmentIntensity`; re-read its settings so
  // the Atmosphere Environment slider still reaches it.
  for (const mesh of texturedMeshes) {
    const textureSettings = objectTextureSettings.get(mesh);
    if (!textureSettings) continue;
    for (const material of getStandardMaterials(mesh)) {
      // Probe mirrors keep their own intensity; only materials sampling the
      // world environment follow the world setting.
      if (material.envMap !== scene.environment) continue;
      material.envMapIntensity = textureSettings.reflectivity * scene.environmentIntensity;
    }
  }
  if (active && atmosphereSettings.fogDensity > 0) {
    atmosphereFog.color.set(atmosphereSettings.fogColor);
    atmosphereFog.density = atmosphereSettings.fogDensity;
    scene.fog = atmosphereFog;
  } else {
    scene.fog = null;
  }
}

function createSettingsToggle(labelText: string, checked: boolean, apply: (enabled: boolean) => void) {
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
}

function createSettingsColor(labelText: string, value: string, apply: (value: string) => void) {
  const field = document.createElement('label');
  field.className = 'property-field';
  field.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'color';
  input.value = value;
  input.setAttribute('aria-label', labelText);
  input.addEventListener('input', () => apply(input.value));
  field.appendChild(input);
  return field;
}

function createSettingsRange(
  labelText: string,
  value: number,
  min: number,
  max: number,
  step: number,
  format: (value: number) => string,
  apply: (value: number) => void,
) {
  const label = document.createElement('label');
  label.className = 'property-field shadows-range-field';
  const header = document.createElement('span');
  header.className = 'shadows-field-header';
  const name = document.createElement('span');
  name.textContent = labelText;
  const output = document.createElement('output');
  output.textContent = format(value);
  header.append(name, output);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.setAttribute('aria-label', labelText);
  syncRangeBar(input);
  input.addEventListener('input', () => {
    const next = Number(input.value);
    output.textContent = format(next);
    syncRangeBar(input);
    apply(next);
  });
  label.append(header, input);
  return label;
}

function createSettingsRemoveButton(label: string, apply: () => void) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'shadows-settings-remove';
  button.textContent = label;
  button.addEventListener('click', apply);
  return button;
}

function selectAtmosphereSettings(): void {
  if (!atmosphereSettingsRow) return;
  selectObject(null);
  atmosphereSettingsSelected = true;
  atmosphereSettingsRow.classList.add('is-selected');
  updateAtmosphereSettingsProperties();
}

function addAtmosphereSettings(): void {
  if (atmosphereSettingsRow) {
    selectAtmosphereSettings();
    return;
  }
  const row = document.createElement('div');
  row.className = 'scene-object-row atmosphere-settings-row';
  row.dataset.atmosphereSettings = 'true';
  const line = document.createElement('div');
  line.className = 'scene-object-line';
  const icon = document.createElement('span');
  icon.className = 'atmosphere-hierarchy-icon';
  icon.setAttribute('aria-hidden', 'true');
  const selectButton = document.createElement('button');
  selectButton.type = 'button';
  selectButton.className = 'scene-object';
  selectButton.textContent = 'Atmosphere';
  selectButton.addEventListener('click', selectAtmosphereSettings);
  line.append(icon, selectButton);
  row.append(line);
  sceneContents.appendChild(row);
  atmosphereSettingsRow = row;
  applyAtmosphere();
  selectAtmosphereSettings();
}

function removeAtmosphereSettings(): void {
  atmosphereSettingsRow?.remove();
  atmosphereSettingsRow = null;
  atmosphereSettingsSelected = false;
  Object.assign(atmosphereSettings, atmosphereDefaults);
  applyAtmosphere();
  selectObject(null);
}

function updateAtmosphereSettingsProperties(): void {
  properties.classList.remove('properties-empty');
  properties.classList.add('properties-content');
  properties.replaceChildren();
  const form = document.createElement('div');
  form.className = 'properties-form settings-form';

  const note = document.createElement('div');
  note.className = 'point-geometry-status';
  note.textContent = 'Scene-wide world lighting. Exposure changes the whole viewport, ambient light fills the shadows, and fog thickens the distance.';

  form.append(
    createSettingsToggle('Enabled', atmosphereSettings.enabled, (enabled) => {
      atmosphereSettings.enabled = enabled;
      applyAtmosphere();
    }),
    createSettingsColor('Ambient color', atmosphereSettings.skyColor, (value) => {
      atmosphereSettings.skyColor = value;
      applyAtmosphere();
    }),
    createSettingsColor('Ground color', atmosphereSettings.groundColor, (value) => {
      atmosphereSettings.groundColor = value;
      applyAtmosphere();
    }),
    createSettingsRange('Ambient intensity', atmosphereSettings.intensity, 0, 3, 0.01, (value) => value.toFixed(2), (value) => {
      atmosphereSettings.intensity = value;
      applyAtmosphere();
    }),
    createSettingsRange('Exposure', atmosphereSettings.exposure, 0.1, 4, 0.01, (value) => value.toFixed(2), (value) => {
      atmosphereSettings.exposure = value;
      applyAtmosphere();
    }),
    createSettingsRange('Environment', atmosphereSettings.environmentIntensity, 0, 3, 0.01, (value) => value.toFixed(2), (value) => {
      atmosphereSettings.environmentIntensity = value;
      applyAtmosphere();
    }),
    createSettingsColor('Fog color', atmosphereSettings.fogColor, (value) => {
      atmosphereSettings.fogColor = value;
      applyAtmosphere();
    }),
    createSettingsRange('Fog density', atmosphereSettings.fogDensity, 0, 0.08, 0.001, (value) => value.toFixed(3), (value) => {
      atmosphereSettings.fogDensity = value;
      applyAtmosphere();
    }),
    note,
    createSettingsRemoveButton('Remove atmosphere', removeAtmosphereSettings),
  );
  properties.appendChild(form);
}

/* -------------------------------------------------------------------------- */
/* Insert → Monitor                                                            */
/* -------------------------------------------------------------------------- */

interface MonitorSettings {
  enabled: boolean;
  /** Vertical resolution of the preview buffer, or 0 for the display's native size. */
  height: number;
  /** Keep the 3D viewport sharp; the setting then only affects previews. */
  excludeViewport: boolean;
}

const monitorSettings: MonitorSettings = { enabled: false, height: 0, excludeViewport: false };
let monitorSettingsRow: HTMLDivElement | null = null;
let monitorSettingsSelected = false;
let monitorBufferReadout: HTMLOutputElement | null = null;

function updateMonitorReadout(): void {
  if (!monitorBufferReadout) return;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  monitorBufferReadout.textContent = `${Math.round(size.x)} × ${Math.round(size.y)} px`;
}

function applyMonitorSettings(): void {
  resizeViewport();
  updateMonitorReadout();
}

function selectMonitorSettings(): void {
  if (!monitorSettingsRow) return;
  selectObject(null);
  monitorSettingsSelected = true;
  monitorSettingsRow.classList.add('is-selected');
  updateMonitorSettingsProperties();
}

function addMonitorSettings(): void {
  if (monitorSettingsRow) {
    selectMonitorSettings();
    return;
  }
  const row = document.createElement('div');
  row.className = 'scene-object-row monitor-settings-row';
  row.dataset.monitorSettings = 'true';
  const line = document.createElement('div');
  line.className = 'scene-object-line';
  const icon = document.createElement('img');
  icon.className = 'monitor-hierarchy-icon';
  icon.src = './monitor-icon.png';
  icon.alt = '';
  icon.setAttribute('aria-hidden', 'true');
  const selectButton = document.createElement('button');
  selectButton.type = 'button';
  selectButton.className = 'scene-object';
  selectButton.textContent = 'Monitor';
  selectButton.addEventListener('click', selectMonitorSettings);
  line.append(icon, selectButton);
  row.append(line);
  sceneContents.appendChild(row);
  monitorSettingsRow = row;
  monitorSettings.enabled = true;
  if (monitorSettings.height === 0) monitorSettings.height = 720;
  applyMonitorSettings();
  selectMonitorSettings();
}

function removeMonitorSettings(): void {
  monitorSettingsRow?.remove();
  monitorSettingsRow = null;
  monitorSettingsSelected = false;
  monitorSettings.enabled = false;
  monitorSettings.height = 0;
  applyMonitorSettings();
  selectObject(null);
}

function updateMonitorSettingsProperties(): void {
  properties.classList.remove('properties-empty');
  properties.classList.add('properties-content');
  properties.replaceChildren();
  const form = document.createElement('div');
  form.className = 'properties-form settings-form';

  const note = document.createElement('div');
  note.className = 'point-geometry-status';
  note.textContent = 'Renders the viewport into a smaller buffer and scales it up to the panel. Lower resolutions are cheaper and show the scene the way a small monitor would. Exclude viewport keeps the 3D view at full resolution.';

  const resolutionField = document.createElement('label');
  resolutionField.className = 'property-field';
  resolutionField.textContent = 'Preview resolution';
  const resolutionSelect = document.createElement('select');
  resolutionSelect.setAttribute('aria-label', 'Preview resolution');
  for (const [value, label] of [
    ['0', 'Native'],
    ['420', '420p'],
    ['480', '480p'],
    ['540', '540p'],
    ['720', '720p'],
    ['900', '900p'],
    ['1080', '1080p'],
    ['1440', '1440p'],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = monitorSettings.height === Number(value);
    resolutionSelect.appendChild(option);
  }
  resolutionSelect.addEventListener('change', () => {
    monitorSettings.height = Number(resolutionSelect.value);
    applyMonitorSettings();
  });
  resolutionField.appendChild(resolutionSelect);

  const readoutField = document.createElement('label');
  readoutField.className = 'property-field';
  readoutField.textContent = 'Buffer';
  const readout = document.createElement('output');
  readout.className = 'monitor-buffer-readout';
  monitorBufferReadout = readout;
  readoutField.appendChild(readout);

  form.append(
    createSettingsToggle('Enabled', monitorSettings.enabled, (enabled) => {
      monitorSettings.enabled = enabled;
      applyMonitorSettings();
    }),
    createSettingsToggle('Exclude viewport', monitorSettings.excludeViewport, (excluded) => {
      monitorSettings.excludeViewport = excluded;
      applyMonitorSettings();
    }),
    resolutionField,
    readoutField,
    note,
    createSettingsRemoveButton('Remove monitor', removeMonitorSettings),
  );
  properties.appendChild(form);
  updateMonitorReadout();
}

function createSunGlow(): { glow: THREE.Group; material: MeshBasicNodeMaterial } {
  // A single additive sphere, shaded by three radial falloff terms.
  //
  // One shallow exponent reads as a blank disc: across the inner half of the
  // sphere the dot product only drops from 1 to 0.87, so the whole face sits a
  // few percent off peak and only fades at the very rim. Splitting it into a
  // tight core, a soft bloom and a very wide wash gives the sun a bright heart
  // that falls away smoothly toward nothing instead of a flat pale circle.
  const material = new MeshBasicNodeMaterial({
    color: '#fff0c0',
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const facing = TSL.abs(TSL.dot(TSL.normalView, TSL.positionViewDirection));
  material.colorNode = TSL.materialColor.mul(
    TSL.pow(facing, 48).mul(1.1)
      .add(TSL.pow(facing, 9).mul(0.16))
      .add(TSL.pow(facing, 2.2).mul(0.03)),
  );
  const geometry = new THREE.SphereGeometry(1, 32, 24);
  const glow = new THREE.Group();
  glow.name = 'Sun Glow';
  glow.scale.setScalar(2200);
  glow.frustumCulled = false;
  const shell = new THREE.Mesh(geometry, material);
  shell.frustumCulled = false;
  glow.add(shell);
  return { glow, material };
}

function updateSunSize(proxy: THREE.Mesh, settings: SunSettings) {
  proxy.geometry.dispose();
  proxy.geometry = new THREE.SphereGeometry(275 * settings.size, 20, 14);
  settings.flare.geometry.dispose();
  settings.flare.geometry = new THREE.TorusGeometry(400 * settings.size, 17.5 * settings.size, 8, 48);
  settings.glow.scale.setScalar(2200 * settings.size);
}

function attachGodRaysChild(sun: THREE.Mesh): THREE.Object3D {
  let effect = godRaysAttachments.get(sun);
  if (!effect) {
    effect = new THREE.Object3D();
    effect.name = 'God Rays';
    effect.userData.godRays = true;
    sun.add(effect);
    godRaysAttachments.set(sun, effect);
  }
  return effect;
}

function updateGodRaysButton() {
  sunRaysButton.setAttribute('aria-pressed', String(godRays.enabled));
  sunRaysButton.textContent = `God Rays: ${godRays.enabled ? 'On' : 'Off'}`;
}

function updateGodRaysHierarchyChild(sun: THREE.Mesh) {
  const row = hierarchyRows.get(sun);
  if (!row) return;
  const container = row.querySelector<HTMLDivElement>('.scene-object-children');
  const effect = godRaysAttachments.get(sun);
  let child = container?.querySelector<HTMLButtonElement>('.god-rays-child') ?? null;
  if (!effect) {
    child?.remove();
    updateGroupHierarchyRow(sun);
    return;
  }
  if (!container) return;
  if (!child) {
    child = document.createElement('button');
    child.type = 'button';
    child.className = 'god-rays-child';
    child.innerHTML = '<span class="god-rays-child-mark"></span><span>God Rays</span><span class="god-rays-child-state"></span>';
    child.addEventListener('click', () => {
      selectObject(sun);
      document.querySelector('.god-rays-controls')?.scrollIntoView({ block: 'nearest' });
    });
    container.appendChild(child);
  }
  const isActive = godRays.enabled && activeSun === sun;
  child.classList.toggle('inactive', !isActive);
  const state = child.querySelector<HTMLElement>('.god-rays-child-state');
  if (state) state.textContent = isActive ? 'ON' : 'OFF';
  expandedGroups.add(sun);
  updateGroupHierarchyRow(sun);
}

function setGodRaysEnabled(enabled: boolean, requestedSun: THREE.Mesh | null = null) {
  if (enabled && sunMeshes.size === 0) addLight('directional');
  const selectedSun = selectedObject && sunSettings.has(selectedObject) ? selectedObject : null;
  const sun = requestedSun ?? (enabled ? selectedSun ?? activeSun ?? [...sunMeshes][0] ?? null : activeSun);

  godRays.enabled = enabled;
  updateGodRaysButton();

  if (!enabled) {
    activeSun = null;
    godRays.setSun(null);
    if (sun) {
      const effect = godRaysAttachments.get(sun);
      if (effect) effect.visible = false;
      updateGodRaysHierarchyChild(sun);
    }
    if (selectedObject) updateProperties(selectedObject);
    return;
  }

  if (!sun) return;
  if (activeSun && activeSun !== sun) {
    const previousEffect = godRaysAttachments.get(activeSun);
    if (previousEffect) previousEffect.visible = false;
    updateGodRaysHierarchyChild(activeSun);
  }
  const effect = attachGodRaysChild(sun);
  effect.visible = true;
  activeSun = sun;
  godRays.setSun(sun);
  updateGodRaysHierarchyChild(sun);
  selectObject(sun);
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
    fog: false,
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
  lightShadowEnabled.set(light, light.castShadow);
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.bias = -0.0001;
  light.shadow.normalBias = 0.02;
  if (shadowsSettingsRow) applyShadowAppearanceToLight(light);
  lightTypeByMesh.set(proxy, type);
  if (light instanceof THREE.DirectionalLight) {
    proxy.frustumCulled = false;
    proxy.renderOrder = 0;
    proxy.geometry.dispose();
    proxy.geometry = new THREE.SphereGeometry(275, 20, 14);
    material.dispose();
    proxy.material = new THREE.MeshBasicMaterial({ color: '#ffe188', depthTest: true, fog: false });
    const flare = new THREE.Mesh(
      new THREE.TorusGeometry(400, 17.5, 8, 48),
      new THREE.MeshBasicMaterial({
        color: '#ffd37a',
        transparent: true,
        opacity: 0.75,
        depthTest: true,
        depthWrite: false,
        fog: false,
      }),
    );
    flare.visible = false;
    proxy.add(flare);
    const { glow, material: glowMaterial } = createSunGlow();
    proxy.add(glow);
    const settings: SunSettings = { latitude: 35, longitude: 0, timeOfDay: 12, size: 1, flare, glow, glowMaterial };
    sunSettings.set(proxy, settings);
    sunMeshes.add(proxy);
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

/**
 * A movable 3D camera.
 *
 * The body is a small dark block with a lens; a live frustum in front of it
 * shows the field of view. Nothing is rendered from it until Play is pressed.
 */
function addCameraObject(position?: THREE.Vector3): THREE.Mesh {
  // Spawn where the editor is looking, at a comfortable eye height, rather than
  // at the world origin — which can be far outside the current view.
  const spawnPosition = position
    ? position.clone()
    : new THREE.Vector3(controls.target.x, Math.max(controls.target.y, 1.15), controls.target.z);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: '#20262b',
    roughness: 0.45,
    metalness: 0.35,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.46), bodyMaterial);
  body.name = uniqueObjectName('Camera');
  body.position.copy(spawnPosition);
  body.castShadow = false;
  body.receiveShadow = false;
  body.renderOrder = 997;

  const lensMaterial = new THREE.MeshStandardMaterial({ color: '#0e1113', roughness: 0.2, metalness: 0.7 });
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.18, 18), lensMaterial);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0, -0.3);
  lens.castShadow = false;
  lens.receiveShadow = false;
  body.add(lens);

  const viewCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 9);
  const helper = new THREE.CameraHelper(viewCamera);
  helper.setColors(
    new THREE.Color('#aebdcc'),
    new THREE.Color('#8e9aa6'),
    new THREE.Color('#d8b45e'),
    new THREE.Color('#55606a'),
    new THREE.Color('#6f7a84'),
  );
  helper.traverse((child) => {
    child.castShadow = false;
    child.receiveShadow = false;
    child.renderOrder = 996;
    const material = (child as THREE.Mesh | THREE.Line).material;
    const materials = Array.isArray(material) ? material : [material];
    materials.forEach((entry) => {
      if (!entry) return;
      entry.depthWrite = false;
      entry.toneMapped = false;
    });
  });
  helper.frustumCulled = false;
  scene.add(helper);
  cameraHelpers.add(helper);

  sceneCameras.set(body, {
    fov: 50,
    viewMode: 'first',
    lookMode: 'right',
    followDistance: 5,
    height: 2.4,
    allowMovement: false,
    moveSpeed: 4,
    viewCamera,
    helper,
  });
  objectShapes.set(body, 'Camera');
  smoothShadingByMesh.set(body, true);
  objectMaterialPresets.set(body, 'Rubber');
  scene.add(body);
  objects.push(body);
  addHierarchyRow(body);
  selectObject(body);
  return body;
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
  const sourceCamera = sceneCameras.get(source);
  if (sourceCamera) {
    const clone = addCameraObject(source.position.clone());
    clone.name = uniqueObjectName(`${source.name} Copy`);
    clone.position.x += 0.5;
    clone.rotation.copy(source.rotation);
    clone.scale.copy(source.scale);
    const cloneSettings = sceneCameras.get(clone)!;
    cloneSettings.fov = sourceCamera.fov;
    cloneSettings.viewMode = sourceCamera.viewMode;
    cloneSettings.lookMode = sourceCamera.lookMode;
    cloneSettings.followDistance = sourceCamera.followDistance;
    cloneSettings.height = sourceCamera.height;
    const cloneRow = sceneContents.querySelector<HTMLElement>(`.scene-object-row[data-uuid="${clone.uuid}"] .scene-object`);
    if (cloneRow) cloneRow.textContent = clone.name;
    selectObject(clone);
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
        cloneSun.glowMaterial.color.copy(sourceLight.color);
      }
    }
    cloneLight.color.copy(sourceLight.color);
    cloneLight.intensity = sourceLight.intensity;
    const sourceEnabled = sceneLightEnabled.get(sourceLight) ?? sourceLight.visible;
    sceneLightEnabled.set(cloneLight, sourceEnabled);
    cloneLight.visible = sourceEnabled;
    updateLightHierarchyIcon(clone, sourceEnabled);
    cloneLight.castShadow = sourceLight.castShadow;
    lightShadowEnabled.set(cloneLight, lightShadowEnabled.get(sourceLight) ?? sourceLight.castShadow);
    if (cloneLight instanceof THREE.DirectionalLight) {
      clone.updateWorldMatrix(true, false);
      cloneLight.userData.sunDirection = clone.getWorldPosition(new THREE.Vector3()).normalize();
      fitDirectionalShadow(cloneLight);
    }
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
  const sourceMaterials = Array.isArray(source.material) ? source.material : [source.material];
  if (sourceMaterials.length === 0 ||
    !sourceMaterials.every((material) => material instanceof THREE.MeshStandardMaterial)) {
    throw new Error(`Cannot clone the material for "${source.name}".`);
  }
  source.updateWorldMatrix(true, false);
  const bounds = new THREE.Box3().setFromObject(source);
  const offsetX = Math.max(bounds.getSize(new THREE.Vector3()).x, 1) + 0.1;
  const cloneTree = (sourceMesh: THREE.Mesh, destinationParent: THREE.Mesh | null, isRoot: boolean): THREE.Mesh => {
    const sourceChildren = objects.filter((candidate) => objectParentByMesh.get(candidate) === sourceMesh);
    const sourceMeshMaterials = Array.isArray(sourceMesh.material) ? sourceMesh.material : [sourceMesh.material];
    if (sourceMeshMaterials.length === 0 ||
      !sourceMeshMaterials.every((material) => material instanceof THREE.MeshStandardMaterial)) {
      throw new Error(`Cannot clone the material for "${sourceMesh.name}".`);
    }
    const cloneMaterials = sourceMeshMaterials.map((sourceMaterial) => {
      const clone = sourceMaterial.clone();
      if (shadowsSettingsRow) applyShadowTintToMaterial(clone);
      return clone;
    });
    const cloneMaterial = cloneMaterials[0];
    const sourceEmissive = originalEmissive.get(sourceMesh);
    if (sourceEmissive) {
      cloneMaterials.forEach((material) => {
        material.emissive.copy(sourceEmissive.color);
        material.emissiveIntensity = sourceEmissive.intensity;
      });
    }
    const cloneMesh = new THREE.Mesh(
      sourceMesh.geometry.clone(),
      Array.isArray(sourceMesh.material) ? cloneMaterials : cloneMaterial,
    );
    const sourceMaterialVisibility = getOriginalMaterialVisibility(sourceMesh);
    if (sourceMaterialVisibility) {
      cloneMaterials.forEach((material, index) => {
        if (sourceMaterialVisibility[index] !== undefined) material.visible = sourceMaterialVisibility[index];
      });
    }
    // The material clone carries the map, but the texture bookkeeping has to be
    // copied too: without it the clone never retiles when stretched, and the
    // texture controls act as if the surface were untextured.
    const sourceTexture = objectTextures.get(sourceMesh);
    if (sourceTexture) {
      const sourceColor = objectTextureColors.get(sourceMesh);
      if (sourceColor) objectTextureColors.set(cloneMesh, sourceColor.map((color) => color.clone()));
      const sourceMetalness = objectTextureMetalness.get(sourceMesh);
      if (sourceMetalness) objectTextureMetalness.set(cloneMesh, sourceMetalness.slice());
      const sourceRoughness = objectTextureRoughness.get(sourceMesh);
      if (sourceRoughness) objectTextureRoughness.set(cloneMesh, sourceRoughness.slice());
      const sourceReflectivity = objectTextureReflectivity.get(sourceMesh);
      if (sourceReflectivity) objectTextureReflectivity.set(cloneMesh, sourceReflectivity.slice());
      // A library texture's bookkeeping has to travel too, not just its picture:
      // the copy has to keep its maps, survive "Disable all textures" and keep
      // responding to the texture's sliders where the original does.
      const sourceEntry = objectTextureEntries.get(sourceMesh);
      if (sourceEntry) objectTextureEntries.set(cloneMesh, sourceEntry);
      const sourceSettings = objectTextureSettings.get(sourceMesh);
      if (sourceSettings) objectTextureSettings.set(cloneMesh, { ...sourceSettings });
      const sourceAppliedMaps = objectTextureMaps.get(sourceMesh);
      if (sourceAppliedMaps) objectTextureMaps.set(cloneMesh, sourceAppliedMaps.map((item) => ({ ...item })));
      objectTextures.set(cloneMesh, sourceTexture);
      // Every material group shows the same applied texture, including the ones
      // created by a multi-material imported file.
      cloneMaterials.forEach((material) => {
        material.map = texturesEnabled ? sourceTexture : null;
        if (texturesEnabled && sourceSettings) {
          // Keep the surface the texture was tuned to; resetting the copy to
          // white and near-matte metal is what made clones lose their texture.
          material.color.set(sourceSettings.color);
          material.roughness = sourceSettings.roughness;
          material.metalness = sourceSettings.metalness;
          material.envMapIntensity = sourceSettings.reflectivity;
        } else if (texturesEnabled) {
          material.color.set(0xffffff);
          material.metalness = Math.min(material.metalness, 0.15);
        }
        material.needsUpdate = true;
      });
      texturedMeshes.add(cloneMesh);
    }
    // Three's Mesh defaults to casting and receiving nothing; the copy has to
    // opt in exactly like the original or it renders lit with no shadow.
    cloneMesh.castShadow = sourceMesh.castShadow;
    cloneMesh.receiveShadow = sourceMesh.receiveShadow;
    cloneMesh.name = uniqueObjectName(`${sourceMesh.name} Copy`);
    cloneMesh.position.copy(sourceMesh.position);
    cloneMesh.rotation.copy(sourceMesh.rotation);
    cloneMesh.scale.copy(sourceMesh.scale);
    objectShapes.set(cloneMesh, objectShapes.get(sourceMesh)!);
    if (joinedModels.has(sourceMesh)) joinedModels.add(cloneMesh);
    if (importedModels.has(sourceMesh)) {
      importedModels.add(cloneMesh);
      const contents = importedModelContents.get(sourceMesh);
      if (contents) importedModelContents.set(cloneMesh, contents);
      const maps = importedModelMaps.get(sourceMesh);
      if (maps) importedModelMaps.set(cloneMesh, maps.slice());
      const pieceRanges = importedModelPieceRanges.get(sourceMesh);
      if (pieceRanges) importedModelPieceRanges.set(cloneMesh, new Map(pieceRanges));
      const missing = importedModelMissingTextures.get(sourceMesh);
      if (missing) importedModelMissingTextures.set(cloneMesh, [...missing]);
      if (importedModelAuthoredUVs.has(sourceMesh)) importedModelAuthoredUVs.add(cloneMesh);
    }
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
    if (sourceTexture) retileMeshTextureUV(cloneMesh);
    if (isRoot) {
      const pivot = groupPivotByMesh.get(cloneMesh);
      if (pivot) pivot.position.x += offsetX;
      else cloneMesh.position.x += offsetX;
    }
    sourceChildren.forEach((child) => cloneTree(child, cloneMesh, false));
    return cloneMesh;
  };

  const clone = cloneTree(source, objectParentByMesh.get(source) ?? null, true);
  // The copy lands beside the original, which can be outside the sun's fitted
  // shadow box; refit it so the new object is inside the map and casts too.
  refreshSunShadowBounds();
  selectObject(clone);
}

/**
 * Brings a 3D file into the scene as one editable block.
 *
 * The merged geometry is used as-is, so it keeps every triangle of the file,
 * participates in cloning, shadows and the god-ray occlusion pass like any other
 * object, and keeps its own materials and file tree. Its Configurations panel
 * adds a texture slot but no face-count controls.
 */
async function importModelFile(file: File, resources: readonly File[] = []): Promise<void> {
  try {
    const model = await loadModel(file, resources);
    if (shadowsSettingsRow) model.materials.forEach((material) => applyShadowTintToMaterial(material));
    const mesh = new THREE.Mesh(
      model.geometry,
      model.materials.length === 1 ? model.materials[0] : model.materials,
    );
    mesh.name = uniqueObjectName(model.name);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    objectShapes.set(mesh, 'Imported Model');
    importedModels.add(mesh);
    importedModelContents.set(mesh, model.contents);
    importedModelPieceRanges.set(mesh, new Map(model.pieces.map((range, index) => [index, range])));
    importedModelMissingTextures.set(mesh, [...model.missingTextures]);
    importedModelMaps.set(mesh, model.materials.map((material) => material.map ?? null));
    if (model.hasUVs) importedModelAuthoredUVs.add(mesh);
    if (!texturesEnabled) model.materials.forEach((material) => { material.map = null; });
    smoothShadingByMesh.set(mesh, true);
    objectMaterialPresets.set(mesh, 'Rubber');
    scene.add(mesh);
    objects.push(mesh);
    // A file with texture maps but no UVs would sample a single texel and look
    // untextured. Project the maps onto the mesh instead of leaving it flat.
    if (!model.hasUVs && model.materials.some((material) => material.map)) retileMeshTextureUV(mesh);
    refreshSunShadowBounds();
    addHierarchyRow(mesh);
    selectObject(mesh);
    addDebugEntry(
      `Imported ${file.name} — ${model.triangles.toLocaleString()} triangles`
      + `${model.textureCount > 0 ? `, ${model.textureCount} texture${model.textureCount === 1 ? '' : 's'}` : ''}.`,
      'Model',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addDebugEntry(`Could not import ${file.name}: ${message}`, 'Model');
  }
}

modelFileInput.addEventListener('change', () => {
  const files = Array.from(modelFileInput.files ?? []);
  modelFileInput.value = '';
  const file = files.find((candidate) => isSupportedModelFile(candidate));
  if (!file) {
    const name = files[0]?.name ?? 'that file';
    addDebugEntry(`Unsupported model format for ${name}. Use glTF/GLB, OBJ, FBX, STL, PLY, 3DS, or DAE.`, 'Model');
    return;
  }
  // Anything else picked at the same time is a sidecar: .mtl for OBJ, images
  // referenced by FBX/DAE/glTF. The loader resolves them by file name.
  const resources = files.filter((candidate) => candidate !== file);
  void importModelFile(file, resources);
});
// Models are imported from the PBR workspace + menu, not from Insert: an
// imported file is a scene object, but the picker lives with the other assets.
workspaceAddMenu.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest('[data-texture-source="model"]');
  if (!button) return;
  modelFileInput.click();
});

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
    texturedMeshes.delete(child);
    importedModels.delete(child);
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
  const cameraData = sceneCameras.get(mesh);
  if (cameraData) {
    if (playState?.mesh === mesh) stopPlayMode();
    cameraData.helper.removeFromParent();
    cameraData.helper.geometry.dispose();
    (cameraData.helper.material as THREE.Material).dispose();
    cameraHelpers.delete(cameraData.helper);
    mesh.children.forEach((child) => {
      const childMesh = child as THREE.Mesh;
      if (childMesh.isMesh !== true) return;
      childMesh.geometry.dispose();
      const childMaterials = Array.isArray(childMesh.material) ? childMesh.material : [childMesh.material];
      childMaterials.forEach((material) => material.dispose());
    });
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
  sunMeshes.delete(mesh);
  if (activeSun === mesh) {
    activeSun = null;
    godRays.setSun(null);
    godRays.enabled = false;
    updateGodRaysButton();
  }
  sceneContents.querySelector(`.scene-object-row[data-uuid="${mesh.uuid}"]`)?.remove();
  const sunData = sunSettings.get(mesh);
  sunData?.flare.geometry.dispose();
  if (sunData?.flare.material instanceof THREE.Material) sunData.flare.material.dispose();
  if (sunData) {
    sunData.glowMaterial.dispose();
    const glowGeometry = sunData.glow.children.find((child) => child instanceof THREE.Mesh)?.geometry;
    glowGeometry?.dispose();
  }
  setObjectDisplayMode(mesh, null);
  texturedMeshes.delete(mesh);
  importedModels.delete(mesh);
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
  leftSidebar.classList.toggle('is-placement-locked', shape !== null);

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
      createTriangleGeometry(shape, definition.defaultTriangles ?? definition.minimumTriangles),
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
});

featureButton.addEventListener('click', () => {
  const isOpen = featureButton.getAttribute('aria-expanded') === 'true';
  featureButton.setAttribute('aria-expanded', String(!isOpen));
  featureMenu.hidden = isOpen;
});

/**
 * The Insert list is anchored inside the Scene Explorer panel, which clips its
 * contents. Anchor the popup to the viewport instead, so it can use the whole
 * window height, and let only the item list scroll.
 */
function fitInsertMenuHeight(): void {
  if (worldInsertMenu.hidden) return;
  const buttonBounds = worldInsertButton.getBoundingClientRect();
  const available = window.innerHeight - buttonBounds.bottom - 16;
  worldInsertMenu.style.top = `${Math.round(buttonBounds.bottom + 2)}px`;
  worldInsertMenu.style.right = `${Math.round(Math.max(8, window.innerWidth - buttonBounds.right))}px`;
  worldInsertMenu.style.maxHeight = `${Math.max(180, Math.round(available))}px`;
}

worldInsertButton.addEventListener('click', () => {
  const isOpen = worldInsertButton.getAttribute('aria-expanded') === 'true';
  worldInsertButton.setAttribute('aria-expanded', String(!isOpen));
  worldInsertMenu.hidden = isOpen;
  if (!isOpen) {
    resetInsertSearch();
    fitInsertMenuHeight();
    insertSearch.focus();
  }
});
window.addEventListener('resize', fitInsertMenuHeight);

worldSkyboxInsertButton.addEventListener('click', () => {
  if (pointEditObject && !finishPointEditing(true)) return;
  closeInsertMenu();
  addWorldSkybox();
});

function closeInsertMenu(): void {
  worldInsertMenu.hidden = true;
  worldInsertButton.setAttribute('aria-expanded', 'false');
}

function filterInsertItems(): void {
  const query = insertSearch.value.trim().toLowerCase();
  let visible = 0;
  worldInsertMenu.querySelectorAll<HTMLButtonElement>('.insert-items > button').forEach((button) => {
    const matches = query.length === 0 || (button.textContent ?? '').toLowerCase().includes(query);
    button.hidden = !matches;
    if (matches) visible += 1;
  });
  insertEmpty.hidden = visible > 0;
}

function resetInsertSearch(): void {
  insertSearch.value = '';
  filterInsertItems();
}

insertSearch.addEventListener('input', filterInsertItems);
insertSearch.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  const firstMatch = worldInsertMenu.querySelector<HTMLButtonElement>('.insert-items > button:not([hidden])');
  if (firstMatch) {
    event.preventDefault();
    firstMatch.click();
  }
});

viewButton.addEventListener('click', () => {
  const isOpen = viewButton.getAttribute('aria-expanded') === 'true';
  viewButton.setAttribute('aria-expanded', String(!isOpen));
  viewMenu.hidden = isOpen;
  renderMenu.hidden = true;
  renderMenuButton.setAttribute('aria-expanded', 'false');
  pbrMenu.hidden = true;
  pbrMenuButton.setAttribute('aria-expanded', 'false');
  insertMenu.hidden = true;
  insertButton.setAttribute('aria-expanded', 'false');
  featureMenu.hidden = true;
  featureButton.setAttribute('aria-expanded', 'false');
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
  pbrMenu.hidden = true;
  pbrMenuButton.setAttribute('aria-expanded', 'false');
});

pbrMenuButton.addEventListener('click', () => {
  const isOpen = pbrMenuButton.getAttribute('aria-expanded') === 'true';
  pbrMenuButton.setAttribute('aria-expanded', String(!isOpen));
  pbrMenu.hidden = isOpen;
  renderMenu.hidden = true;
  renderMenuButton.setAttribute('aria-expanded', 'false');
});

document.addEventListener('pointerdown', (event) => {
  const target = event.target as Node;
  if (!viewMenu.contains(target) && !viewButton.contains(target)) {
    viewMenu.hidden = true;
    viewButton.setAttribute('aria-expanded', 'false');
    renderMenu.hidden = true;
    renderMenuButton.setAttribute('aria-expanded', 'false');
    pbrMenu.hidden = true;
    pbrMenuButton.setAttribute('aria-expanded', 'false');
  }
});

worldInsertMenu.querySelectorAll<HTMLButtonElement>('[data-light]').forEach((button) => {
  button.addEventListener('click', () => {
    const type = button.dataset.light;
    if (type !== 'spot' && type !== 'directional' && type !== 'point') return;
    if (pointEditObject && !finishPointEditing(true)) return;
    closeInsertMenu();
    insertMenu.hidden = true;
    insertButton.setAttribute('aria-expanded', 'false');
    addLight(type);
  });
});

cameraInsertButton.addEventListener('click', () => {
  if (pointEditObject && !finishPointEditing(true)) return;
  closeInsertMenu();
  insertMenu.hidden = true;
  insertButton.setAttribute('aria-expanded', 'false');
  addCameraObject();
});

shadowsSettingsInsertButton.addEventListener('click', () => {
  if (pointEditObject && !finishPointEditing(true)) return;
  closeInsertMenu();
  addShadowsSettings();
});

atmosphereSettingsInsertButton.addEventListener('click', () => {
  if (pointEditObject && !finishPointEditing(true)) return;
  closeInsertMenu();
  addAtmosphereSettings();
});

monitorSettingsInsertButton.addEventListener('click', () => {
  if (pointEditObject && !finishPointEditing(true)) return;
  closeInsertMenu();
  addMonitorSettings();
});

sunRaysButton.addEventListener('click', () => {
  setGodRaysEnabled(!godRays.enabled);
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
  sceneDisclosure.classList.add('drop-target');
});
sceneDisclosure.addEventListener('dragleave', () => sceneDisclosure.classList.remove('drop-target'));
sceneDisclosure.addEventListener('drop', (event) => {
  event.preventDefault();
  sceneDisclosure.classList.remove('drop-target');
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
    applyTransformSpace(mode);
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
  if (playState) return;
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
  if (playState || event.button !== 1 || freeCameraEnabled || placementShape || pointEditObject ||
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
  if (playState || !placementShape || event.button !== 0) return;
  updatePlacementPoint(event);
  const shape = placementShape;
  addObject(shape, placementPosition.clone().setY(placementPosition.y - shapeDefinitions[shape].groundOffset));
  setPlacementMode(null);
  placementJustCommitted = true;
});

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (playState || !addingGeometryPoint || !pointEditObject || event.button !== 0) return;
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
  if (playState || !pointEditObject || isObjectLocked(pointEditObject) || event.button !== 0) return;
  if (transformControls.dragging) return;
  const point = getGeometryPointAtPointer(event);
  if (!point) {
    // Empty space stays with OrbitControls so left-drag still orbits the view
    // while editing points. A click without a drag still clears the selection.
    pointEditPointerStart = { x: event.clientX, y: event.clientY };
    return;
  }
  pointInteractionLocked = true;
  syncNavigationControls();
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

window.addEventListener('pointerup', (event) => {
  if (!pointEditPointerStart || event.button !== 0) return;
  const start = pointEditPointerStart;
  pointEditPointerStart = null;
  if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return;
  if (!pointEditObject || !manualPointSelectionEnabled) return;
  setGeometryPointSelection([]);
  if (pointStatusElement) {
    pointStatusElement.textContent = 'No points selected. Click points to select them.';
  }
});

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (playState || placementShape || placementJustCommitted || pointEditObject || addingGeometryPoint || event.button !== 0) {
    selectionPointerStart = null;
    placementJustCommitted = false;
    return;
  }
  selectionPointerStart = { x: event.clientX, y: event.clientY };
});
renderer.domElement.addEventListener('pointerup', (event) => {
  if (!selectionPointerStart) return;
  if (playState || placementShape || isTransformDragging) {
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

  // While the camera view is playing, editor shortcuts are off. Esc is the
  // keyboard equivalent of the red STOP button.
  if (playState) {
    if (!event.repeat && event.key === 'Escape') stopPlayMode();
    // Walking is opt-in per camera; without it Play is a static shot and the
    // editor shortcuts stay off.
    if (playState.settings.allowMovement && !event.ctrlKey && !event.metaKey && !event.altKey &&
      ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyC', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
      event.preventDefault();
      playMoveKeys.add(event.code);
    }
    return;
  }

  if (!event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey &&
    (event.code === 'Backquote' || event.key === '`')) {
    event.preventDefault();
    setFreeCameraEnabled(!freeCameraEnabled);
    return;
  }
  if (event.repeat) return;

  // Fly keys are only pressed bare: Ctrl+C must fall through to Clone rather
  // than being read as "C = descend", which moved the camera down and swallowed
  // the shortcut while free camera was on.
  if (freeCameraEnabled && !event.ctrlKey && !event.metaKey && !event.altKey &&
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
  if (!placementShape && (event.ctrlKey || event.metaKey) && !event.altKey) {
    const shortcut = event.key.toLowerCase();
    // Ctrl+Z steps one edit back, Ctrl+X steps forward again. Swallowing the
    // browser defaults keeps the page from scrolling or cutting instead.
    if (shortcut === 'z' && !event.shiftKey) {
      event.preventDefault();
      undoTransform();
      return;
    }
    if (shortcut === 'x' && !event.shiftKey) {
      event.preventDefault();
      redoTransform();
      return;
    }
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
  playMoveKeys.delete(event.code);
});

function resizeViewport() {
  const { clientWidth, clientHeight } = viewport;
  if (clientWidth === 0 || clientHeight === 0) return;
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
  // Monitor resolution: keep the canvas at full panel size and render into a
  // smaller backing buffer instead, so the browser stretches the result. That
  // is what a lower monitor resolution looks like, and it also drops the cost
  // of the scene, the god rays and the reflection probe at the same time.
  const nativeRatio = Math.min(window.devicePixelRatio, 2);
  // "Exclude viewport" keeps the main 3D view sharp, so the monitor resolution
  // only narrows the preview buffers instead of pixelating the editor.
  const targetHeight = monitorSettings.enabled && !monitorSettings.excludeViewport
    ? monitorSettings.height
    : 0;
  const bufferRatio = targetHeight > 0
    ? Math.min(nativeRatio, targetHeight / clientHeight)
    : nativeRatio;
  renderer.setPixelRatio(Math.max(bufferRatio, 0.05));
  renderer.setSize(clientWidth, clientHeight, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  updateMonitorReadout();
}

const resizeObserver = new ResizeObserver(resizeViewport);
resizeObserver.observe(viewport);

/** Width drag shared by the two vertical splitters, one per side. */
function wireSidebarResize(
  handle: HTMLDivElement,
  panel: HTMLElement,
  side: 'left' | 'right',
): void {
  let resizing = false;
  const applyWidth = (width: number) => {
    const clamped = THREE.MathUtils.clamp(width, 180, window.innerWidth * 0.55);
    panel.style.width = `${clamped}px`;
    panel.style.flexBasis = `${clamped}px`;
    handle.setAttribute('aria-valuenow', String(Math.round(clamped)));
  };
  const widthFrom = (clientX: number) => side === 'left'
    ? clientX - panel.getBoundingClientRect().left
    : panel.getBoundingClientRect().right - clientX;

  handle.addEventListener('pointerdown', (event) => {
    resizing = true;
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  handle.addEventListener('pointermove', (event) => {
    if (resizing) applyWidth(widthFrom(event.clientX));
  });
  handle.addEventListener('pointerup', () => {
    resizing = false;
  });
  handle.addEventListener('pointercancel', () => {
    resizing = false;
  });
  handle.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    // The arrow that points at the panel grows it, on either side.
    const outward = side === 'left'
      ? (event.key === 'ArrowLeft' ? -1 : 1)
      : (event.key === 'ArrowLeft' ? 1 : -1);
    applyWidth(panel.clientWidth + outward * 20);
  });
}

wireSidebarResize(sidebarResize, sidebar, 'right');
wireSidebarResize(leftSidebarResize, leftSidebar, 'left');

function setPbrDockHeight(height: number) {
  const editorBounds = editor.getBoundingClientRect();
  const maximumHeight = Math.min(420, editorBounds.height * 0.6);
  // The smallest dock still has to fit one preview card under the header and
  // tabs; below roughly 120 px the sphere would have nowhere to go.
  const dockHeight = THREE.MathUtils.clamp(height, 120, Math.max(120, maximumHeight));
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

/**
 * PBR workspace.
 *
 * Textures are spheres in the dock; from there they are dragged onto an object's
 * texture slot to be applied. A failed preview must never take the editor down,
 * so it degrades to an empty workspace.
 */
let textureWorkspace: Awaited<ReturnType<typeof createTextureWorkspace>> | null = null;
try {
  textureWorkspace = await createTextureWorkspace({
    canvas: workspaceCanvas,
    wrap: workspaceWrap,
    grid: workspaceGrid,
    tabs: workspaceTabs,
    addButton: workspaceAddButton,
    addMenu: workspaceAddMenu,
    fileInput: workspaceFileInput,
    status: workspaceStatus,
    emptyHint: workspaceEmpty,
    onChange: (entries, selected) => {
      syncTextureHierarchy(entries, selected);
      if (!selected) return;
      // Slider edits re-notify with the same id; rebuilding the panel then would
      // throw the slider out from under the pointer.
      if (selected.id !== selectedTextureId) showTextureProperties(selected);
    },
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  addDebugEntry(`PBR workspace could not start: ${message}`, 'Texture');
  workspaceStatus.textContent = 'Workspace unavailable';
}

/**
 * Hides the dock without touching its contents.
 *
 * The texture entries live in the workspace closure, so hiding the DOM and
 * showing it again keeps every generated, imported and applied texture intact;
 * the compact button in View brings the same instance back.
 */
function setPbrDockVisible(visible: boolean): void {
  pbrDock.hidden = !visible;
  pbrDockResize.hidden = !visible;
  pbrDockToggle.setAttribute('aria-checked', String(visible));
  pbrDockToggle.textContent = visible ? 'PBR workspace' : 'Show PBR workspace';
  if (!visible) return;
  // The dock may be shown again at a different size; redraw once it has a box.
  requestAnimationFrame(() => textureWorkspace?.refresh());
}

workspaceClose.addEventListener('click', () => setPbrDockVisible(false));
pbrDockToggle.addEventListener('click', () => {
  setPbrDockVisible(pbrDock.hidden);
  viewMenu.hidden = true;
  viewButton.setAttribute('aria-expanded', 'false');
});

/** Textures applied to objects, plus the colour each surface had before. */
const objectTextures = new WeakMap<THREE.Mesh, THREE.Texture>();
/** The library entry a mesh was painted from, so sliders can re-tune it later. */
const objectTextureEntries = new WeakMap<THREE.Mesh, TextureEntry>();
const objectTextureColors = new WeakMap<THREE.Mesh, THREE.Color[]>();
const objectTextureMetalness = new WeakMap<THREE.Mesh, number[]>();
const objectTextureRoughness = new WeakMap<THREE.Mesh, number[]>();
const objectTextureReflectivity = new WeakMap<THREE.Mesh, number[]>();
const objectTextureSettings = new WeakMap<THREE.Mesh, TextureSettings>();
// Imported files keep the maps their own materials carried, one per material
// group, so "Disable all textures" can hide and restore them too.
const importedModelMaps = new WeakMap<THREE.Mesh, Array<THREE.Texture | null>>();
const texturedMeshes = new Set<THREE.Mesh>();
const texturedMeshMatrices = new WeakMap<THREE.Mesh, THREE.Matrix4>();
let texturesEnabled = true;

/** One texture repeat per world unit, so an image keeps its scale when an object is stretched. */
const TEXTURE_TILE_SIZE = 1;

/**
 * Re-projects a textured mesh's UVs in object space, divided by the object's
 * world scale.
 *
 * The generated UVs used to be normalised to one copy of the image per face.
 * Stretching the object therefore stretched the picture with it. Dividing the
 * local coordinates by the world scale instead keeps one image tile per metre
 * of surface: make a cube twice as wide and it shows twice as many tiles, which
 * is the behaviour asked for (and the one a checker texture makes obvious).
 * Boxes use a per-face box projection; curved shapes keep a spherical mapping
 * so a sphere has no triplanar seams.
 */
function retileMeshTextureUV(mesh: THREE.Mesh): void {
  // A file's own UVs are its texture mapping; re-projecting them would break
  // both the embedded textures and a picture dropped onto the model.
  if (importedModelAuthoredUVs.has(mesh)) {
    texturedMeshMatrices.set(mesh, mesh.matrixWorld.clone());
    return;
  }
  const positions = mesh.geometry.getAttribute('position');
  if (!(positions instanceof THREE.BufferAttribute)) return;
  const existing = mesh.geometry.getAttribute('uv');
  const uvs = existing instanceof THREE.BufferAttribute && existing.count === positions.count
    ? existing as THREE.BufferAttribute
    : new THREE.BufferAttribute(new Float32Array(positions.count * 2), 2);
  mesh.updateWorldMatrix(true, false);
  if (objectShapes.get(mesh) === 'ImageBlock') {
    // An image block shows one fitted copy of its picture, so stretching it
    // must not tile the image.
    texturedMeshMatrices.set(mesh, mesh.matrixWorld.clone());
    return;
  }
  const worldScale = mesh.getWorldScale(new THREE.Vector3());
  const scaleX = Math.abs(worldScale.x) || 1e-4;
  const scaleY = Math.abs(worldScale.y) || 1e-4;
  const scaleZ = Math.abs(worldScale.z) || 1e-4;
  mesh.geometry.computeBoundingBox();
  const bounds = mesh.geometry.boundingBox;
  if (!bounds) return;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const minX = bounds.min.x;
  const minY = bounds.min.y;
  const minZ = bounds.min.z;
  const radius = Math.max(size.x * scaleX, size.y * scaleY, size.z * scaleZ) * 0.5;
  const shape = objectShapes.get(mesh);
  // Imported files without UVs get a box projection like other triangle soups.
  const boxMapped = shape === 'Cube' || shape === 'Imported Model' || shape === undefined;
  const first = new THREE.Vector3();
  const second = new THREE.Vector3();
  const third = new THREE.Vector3();
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const triangleNormal = new THREE.Vector3();
  const point = new THREE.Vector3();
  const direction = new THREE.Vector3();

  if (boxMapped) {
    // Pick the projection axis once per vertex, from the sum of the face
    // normals that touch it.
    //
    // This used to be decided per triangle and written straight into the UV
    // attribute. On an indexed mesh that writes the same vertex several times,
    // each time with an axis chosen by an unrelated triangle: a box then gets
    // a coherent top but sides where the axis flips across the face, which
    // reads as the texture being smeared into horizontal bands. Summing first
    // gives every vertex a single, stable axis.
    const normalSums = new Float32Array(positions.count * 3);
    const geometryIndex = mesh.geometry.getIndex();
    const triangleCount = geometryIndex
      ? Math.floor(geometryIndex.count / 3)
      : Math.floor(positions.count / 3);
    const vertexAt = (triangle: number, corner: number): number => geometryIndex
      ? geometryIndex.getX(triangle * 3 + corner)
      : triangle * 3 + corner;
    for (let triangle = 0; triangle < triangleCount; triangle++) {
      const a = vertexAt(triangle, 0);
      const b = vertexAt(triangle, 1);
      const c = vertexAt(triangle, 2);
      first.fromBufferAttribute(positions, a);
      second.fromBufferAttribute(positions, b);
      third.fromBufferAttribute(positions, c);
      edgeA.subVectors(second, first);
      edgeB.subVectors(third, first);
      triangleNormal.crossVectors(edgeA, edgeB);
      for (const vertexIndex of [a, b, c]) {
        normalSums[vertexIndex * 3] += triangleNormal.x;
        normalSums[vertexIndex * 3 + 1] += triangleNormal.y;
        normalSums[vertexIndex * 3 + 2] += triangleNormal.z;
      }
    }
    for (let vertexIndex = 0; vertexIndex < positions.count; vertexIndex++) {
      point.fromBufferAttribute(positions, vertexIndex);
      let axisX = Math.abs(normalSums[vertexIndex * 3]);
      let axisY = Math.abs(normalSums[vertexIndex * 3 + 1]);
      let axisZ = Math.abs(normalSums[vertexIndex * 3 + 2]);
      if (axisX + axisY + axisZ < 1e-9) {
        // A mesh without usable face normals falls back to where the vertex
        // sits relative to the box, which is stable for axis-aligned shapes.
        axisX = Math.abs(point.x - center.x) / Math.max(size.x * 0.5, 1e-4);
        axisY = Math.abs(point.y - center.y) / Math.max(size.y * 0.5, 1e-4);
        axisZ = Math.abs(point.z - center.z) / Math.max(size.z * 0.5, 1e-4);
      }
      // Measure from the local minimum corner, not the centre: a photo then
      // starts at the corner of a face (0…size) instead of being split in half
      // by the wrap at u = 0, which looked like the picture was cut in two.
      if (axisX >= axisY && axisX >= axisZ) {
        uvs.setXY(vertexIndex, (point.z - minZ) * scaleZ / TEXTURE_TILE_SIZE, (point.y - minY) * scaleY / TEXTURE_TILE_SIZE);
      } else if (axisY >= axisZ) {
        uvs.setXY(vertexIndex, (point.x - minX) * scaleX / TEXTURE_TILE_SIZE, (point.z - minZ) * scaleZ / TEXTURE_TILE_SIZE);
      } else {
        uvs.setXY(vertexIndex, (point.x - minX) * scaleX / TEXTURE_TILE_SIZE, (point.y - minY) * scaleY / TEXTURE_TILE_SIZE);
      }
    }
  } else {
    for (let vertexIndex = 0; vertexIndex < positions.count; vertexIndex++) {
      point.fromBufferAttribute(positions, vertexIndex).sub(center);
      direction.copy(point).normalize();
      uvs.setXY(
        vertexIndex,
        (Math.atan2(direction.z, direction.x) / (Math.PI * 2) + 0.5) * (Math.PI * 2 * radius) / TEXTURE_TILE_SIZE,
        (0.5 + Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1)) / Math.PI) * (Math.PI * radius) / TEXTURE_TILE_SIZE,
      );
    }
  }
  if (uvs !== existing) mesh.geometry.setAttribute('uv', uvs);
  uvs.needsUpdate = true;
  texturedMeshMatrices.set(mesh, mesh.matrixWorld.clone());
}

/** Keeps tiled UVs in step with scaling done by the gizmo or multi-select. */
function updateTexturedMeshUVs(): void {
  if (texturedMeshes.size === 0) return;
  for (const mesh of texturedMeshes) {
    // Comparing the world matrix avoids a `getWorldScale` (which walks and
    // updates the whole parent chain) for every textured mesh on every frame.
    const cached = texturedMeshMatrices.get(mesh);
    if (cached && cached.equals(mesh.matrixWorld)) continue;
    retileMeshTextureUV(mesh);
  }
}

/** Every standard material on a mesh, whether it has one or a per-group array. */
function getStandardMaterials(mesh: THREE.Mesh): THREE.MeshStandardMaterial[] {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.filter((material): material is THREE.MeshStandardMaterial =>
    material instanceof THREE.MeshStandardMaterial);
}

function setTexturesEnabled(enabled: boolean): void {
  texturesEnabled = enabled;
  for (const mesh of texturedMeshes) {
    const materials = getStandardMaterials(mesh);
    const appliedTexture = objectTextures.get(mesh) ?? null;
    const storedColors = objectTextureColors.get(mesh);
    const storedMetalness = objectTextureMetalness.get(mesh);
    const storedRoughness = objectTextureRoughness.get(mesh);
    const storedReflectivity = objectTextureReflectivity.get(mesh);
    const settings = objectTextureSettings.get(mesh);
    setEntryMapsEnabled(mesh, enabled);
    materials.forEach((material, index) => {
      if (enabled) {
        material.map = appliedTexture;
        // The picture is the surface colour again unless its texture tints it.
        material.color.set(settings?.color ?? 0xffffff);
        const metalness = settings?.metalness ?? storedMetalness?.[index];
        if (metalness !== undefined) material.metalness = settings ? metalness : Math.min(metalness, 0.15);
        if (settings) {
          material.roughness = settings.roughness;
          const environmentScale = material.envMap === scene.environment ? scene.environmentIntensity : 1;
          material.envMapIntensity = settings.reflectivity * environmentScale;
        }
      } else {
        material.map = null;
        const previousColor = storedColors?.[index];
        if (previousColor) material.color.copy(previousColor);
        const metalness = storedMetalness?.[index];
        if (metalness !== undefined) material.metalness = metalness;
        const roughness = storedRoughness?.[index];
        if (roughness !== undefined) material.roughness = roughness;
        const reflectivity = storedReflectivity?.[index];
        if (reflectivity !== undefined) material.envMapIntensity = reflectivity;
      }
      material.needsUpdate = true;
    });
  }
  // Files carry a map per material group, so they are switched separately. A
  // texture dropped on the model owns the slots instead, until it is cleared.
  for (const mesh of importedModels) {
    if (objectTextures.has(mesh)) continue;
    const maps = importedModelMaps.get(mesh);
    if (!maps) continue;
    getStandardMaterials(mesh).forEach((material, index) => {
      material.map = enabled ? maps[index] ?? null : null;
      material.needsUpdate = true;
    });
  }
  if (selectedObject) updateProperties(selectedObject);
}

/** Width / height of the Image Block's base plane, used when fitting a picture. */
const IMAGE_BLOCK_ASPECT = 16 / 9;

/**
 * Reshapes an image block so the picture is shown without distortion.
 *
 * The block keeps the width it was placed with and the height follows the
 * image's aspect ratio, which is what a picture frame should do: a portrait
 * picture becomes a tall block instead of a squashed one.
 */
function fitImageBlockToTexture(mesh: THREE.Mesh, texture: THREE.Texture): void {
  const image = texture.image as { width?: number; height?: number } | null | undefined;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  if (width <= 0 || height <= 0) return;
  const aspect = width / height;
  const scaleX = Math.abs(mesh.scale.x) || 1;
  mesh.scale.y = Math.max(1e-3, (IMAGE_BLOCK_ASPECT * scaleX) / aspect);
}

function applyTextureToMesh(mesh: THREE.Mesh, texture: THREE.Texture, entry?: TextureEntry): void {
  const materials = getStandardMaterials(mesh);
  if (materials.length === 0) return;
  if (!objectTextureColors.has(mesh)) {
    objectTextureColors.set(mesh, materials.map((material) => material.color.clone()));
  }
  if (!objectTextureMetalness.has(mesh)) {
    objectTextureMetalness.set(mesh, materials.map((material) => material.metalness));
  }
  if (!objectTextureRoughness.has(mesh)) {
    objectTextureRoughness.set(mesh, materials.map((material) => material.roughness));
  }
  if (!objectTextureReflectivity.has(mesh)) {
    objectTextureReflectivity.set(mesh, materials.map((material) => material.envMapIntensity));
  }
  const settings = entry?.settings ?? null;
  const isImageBlock = objectShapes.get(mesh) === 'ImageBlock';
  // A picture needs clamp-to-edge wrapping: a tiled sampler would bleed the
  // opposite edge into the seam at u = 1.
  const appliedTexture = isImageBlock ? texture.clone() : texture;
  if (isImageBlock) {
    appliedTexture.wrapS = THREE.ClampToEdgeWrapping;
    appliedTexture.wrapT = THREE.ClampToEdgeWrapping;
    appliedTexture.needsUpdate = true;
  } else {
    // Tiled UVs deliberately run outside [0, 1], so a picture has to repeat.
    // A picked image arrives clamped by default; leaving it clamped smears
    // every face into long streaks of its edge texels — which is why a dropped
    // photo looked banded while the generated checker and UV grid looked right.
    appliedTexture.wrapS = THREE.RepeatWrapping;
    appliedTexture.wrapT = THREE.RepeatWrapping;
    appliedTexture.anisotropy = Math.max(appliedTexture.anisotropy, 16);
    appliedTexture.needsUpdate = true;
  }
  // Imported files can have several material groups; the chosen picture applies
  // to every one so the whole object is textured, not just its first part.
  materials.forEach((material, index) => {
    material.map = texturesEnabled ? appliedTexture : null;
    // A library texture brings its own surface response; a plain dropped image
    // hands the surface back to the values it had before any texture.
    material.color.set(settings?.color ?? 0xffffff);
    material.metalness = settings?.metalness
      ?? Math.min(objectTextureMetalness.get(mesh)?.[index] ?? material.metalness, 0.15);
    material.roughness = settings?.roughness
      ?? objectTextureRoughness.get(mesh)?.[index]
      ?? material.roughness;
    material.envMapIntensity = settings?.reflectivity
      ?? objectTextureReflectivity.get(mesh)?.[index]
      ?? material.envMapIntensity;
    material.needsUpdate = true;
  });
  if (isImageBlock) {
    const material = materials[0];
    fitImageBlockToTexture(mesh, appliedTexture);
    material.roughness = 1;
    material.metalness = 0;
    // Cut out transparent texels instead of laying the picture on an opaque
    // rectangle. The occlusion mask reads the same alpha test, so a PNG avatar
    // blocks the sun with its silhouette rather than its bounding plane.
    material.transparent = false;
    material.alphaTest = 0.5;
    material.depthWrite = true;
    material.side = THREE.DoubleSide;
    material.needsUpdate = true;
  }
  objectTextures.set(mesh, appliedTexture);
  if (entry) {
    objectTextureEntries.set(mesh, entry);
    objectTextureSettings.set(mesh, { ...entry.settings });
    // The library texture also owns the data channels it carries; whatever was
    // in those slots before is remembered so Clear can put it back.
    if (texturesEnabled) applyEntryMapsToMesh(mesh, entry);
  } else {
    objectTextureEntries.delete(mesh);
    objectTextureSettings.delete(mesh);
    restoreEntryMaps(mesh);
  }
  texturedMeshes.add(mesh);
  retileMeshTextureUV(mesh);
  // The maps were written after the initial material pass, so their response
  // (normal strength, bump depth, alpha cutoff, UV offset) is applied once the
  // whole set is in place.
  if (entry) applyTextureSettingsToMesh(mesh, entry.settings);
  if (selectedObject === mesh) updateProperties(mesh);
}

function clearMeshTexture(mesh: THREE.Mesh): void {
  const materials = getStandardMaterials(mesh);
  if (materials.length === 0) return;
  const fileMaps = importedModelMaps.get(mesh);
  const previousColors = objectTextureColors.get(mesh);
  const previousMetalness = objectTextureMetalness.get(mesh);
  const previousRoughness = objectTextureRoughness.get(mesh);
  const previousReflectivity = objectTextureReflectivity.get(mesh);
  materials.forEach((material, index) => {
    // Clearing a dropped picture puts an imported file back on its own maps
    // instead of leaving every part untextured.
    material.map = fileMaps ? (texturesEnabled ? fileMaps[index] ?? null : null) : null;
    const previousColor = previousColors?.[index];
    if (previousColor) material.color.copy(previousColor);
    const metalness = previousMetalness?.[index];
    if (metalness !== undefined) material.metalness = metalness;
    const roughness = previousRoughness?.[index];
    if (roughness !== undefined) material.roughness = roughness;
    const reflectivity = previousReflectivity?.[index];
    if (reflectivity !== undefined) material.envMapIntensity = reflectivity;
    if (objectShapes.get(mesh) === 'ImageBlock') {
      material.alphaTest = 0;
      material.transparent = false;
    }
    material.needsUpdate = true;
  });
  restoreEntryMaps(mesh);
  objectTextures.delete(mesh);
  objectTextureEntries.delete(mesh);
  objectTextureSettings.delete(mesh);
  objectTextureColors.delete(mesh);
  objectTextureMetalness.delete(mesh);
  objectTextureRoughness.delete(mesh);
  objectTextureReflectivity.delete(mesh);
  texturedMeshes.delete(mesh);
  if (selectedObject === mesh) updateProperties(mesh);
}

/** Reads a chosen image file into a texture, capped so huge photos stay cheap. */
/** Applies the sampling settings every picture texture in the editor shares. */
function configurePictureTexture(texture: THREE.Texture): void {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // Mipmaps keep a minified tile from shimmering; linear magnification keeps
  // an 8K map from turning blocky when the camera is very close.
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  // Grazing angles are where a tiled picture turns into stripes; ask for the
  // highest anisotropy the device will give before mip selection blurs a face.
  texture.anisotropy = 16;
  texture.needsUpdate = true;
}

async function createTextureFromFile(file: File): Promise<THREE.Texture> {
  // Browsers cannot decode TGA, which is a common FBX/OBJ map format.
  if (/\.(tga|targa)$/i.test(file.name)) {
    const { TGALoader } = await import('three/addons/loaders/TGALoader.js');
    const url = URL.createObjectURL(file);
    try {
      const texture = await new TGALoader().loadAsync(url);
      texture.colorSpace = THREE.SRGBColorSpace;
      configurePictureTexture(texture);
      return texture;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_TEXTURE_SIZE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not draw the image onto a canvas.');
    // `high` is the only quality the canvas resampler offers; it matters when
    // a picture has to be brought down to the 8192 limit.
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    // Every picture loaded here is used on tiled UVs somewhere (object, library
    // ball or PBR map), so repeat by default; an Image Block clamps its clone.
    configurePictureTexture(texture);
    return texture;
  } finally {
    bitmap.close();
  }
}

function normalizeTextureKey(value: string): { key: string; tokens: string[] } {
  const key = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return { key, tokens: key.split(' ').filter((token) => token.length > 2) };
}

/** Matches `base_color_texture` in a file to `tree_basecolor.png` on disk. */
function textureNameMatches(slotName: string, fileName: string): boolean {
  if (!slotName) return false;
  const slot = normalizeTextureKey(slotName);
  const file = normalizeTextureKey(fileName.replace(/\.[^.]+$/, ''));
  if (!slot.key || !file.key) return false;
  if (slot.key.includes(file.key) || file.key.includes(slot.key)) return true;
  const compactSlot = slot.key.replace(/ /g, '');
  const compactFile = file.key.replace(/ /g, '');
  if (compactSlot.includes(compactFile) || compactFile.includes(compactSlot)) return true;
  return file.tokens.length > 0 && file.tokens.every((token) => slot.tokens.includes(token));
}

async function repairImportedTextures(mesh: THREE.Mesh, files: readonly File[]): Promise<void> {
  let missing = [...(importedModelMissingTextures.get(mesh) ?? [])];
  const materials = getStandardMaterials(mesh);
  if (materials.length === 0 || files.length === 0) return;
  const loaded: Array<{ file: File; texture: THREE.Texture }> = [];
  for (const file of files) {
    try {
      loaded.push({ file, texture: await createTextureFromFile(file) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addDebugEntry(`Could not read ${file.name}: ${message}`, 'Texture');
    }
  }

  let assigned = 0;
  const assign = (slot: ImportedMissingTexture, texture: THREE.Texture) => {
    const material = materials[slot.materialIndex];
    if (!material) return;
    let applied = texture;
    if (slot.slot === 'alphaMap') {
      // Use the same alpha-channel fallback as import: a black-RGB mask would
      // hide the object if it were bound directly.
      const mask = buildAlphaMask(texture);
      if (!mask) return;
      applied = mask;
    }
    applied.colorSpace = slot.slot === 'map' || slot.slot === 'emissiveMap'
      ? THREE.SRGBColorSpace
      : THREE.NoColorSpace;
    applied.wrapS = THREE.RepeatWrapping;
    applied.wrapT = THREE.RepeatWrapping;
    applied.needsUpdate = true;
    (material as unknown as Record<string, THREE.Texture>)[slot.slot] = applied;
    if (slot.slot === 'alphaMap') {
      material.transparent = false;
      material.alphaTest = 0.5;
      material.depthWrite = true;
    }
    if (slot.slot === 'map') material.color.set(0xffffff);
    material.needsUpdate = true;
    missing = missing.filter((entry) => entry !== slot);
    assigned += 1;
  };

  const usedFiles = new Set<File>();
  // A picture whose name matches a slot's reference is that slot's map.
  for (const entry of loaded) {
    const matching = missing.filter((slot) => textureNameMatches(slot.name, entry.file.name));
    if (matching.length === 0) continue;
    usedFiles.add(entry.file);
    matching.forEach((slot) => assign(slot, entry.texture));
  }
  // Whatever is left fills the slots that are still empty, in order.
  for (const entry of loaded) {
    if (usedFiles.has(entry.file)) continue;
    const slot = missing[0];
    if (!slot) break;
    assign(slot, entry.texture);
    usedFiles.add(entry.file);
  }
  // A file that references no picture at all imports grey. Give the leftover
  // images to the materials that have no colour map yet.
  const mapless = materials.filter((material) => !material.map && !material.alphaMap);
  for (const entry of loaded) {
    if (usedFiles.has(entry.file) || mapless.length === 0) continue;
    const named = mapless.findIndex((material) => material.name && textureNameMatches(material.name, entry.file.name));
    const material = mapless[named >= 0 ? named : 0];
    if (!material) continue;
    entry.texture.colorSpace = THREE.SRGBColorSpace;
    entry.texture.wrapS = THREE.RepeatWrapping;
    entry.texture.wrapT = THREE.RepeatWrapping;
    entry.texture.needsUpdate = true;
    material.map = entry.texture;
    material.color.set(0xffffff);
    material.needsUpdate = true;
    mapless.splice(mapless.indexOf(material), 1);
    usedFiles.add(entry.file);
    assigned += 1;
  }

  importedModelMissingTextures.set(mesh, missing);
  const storedMaps = materials.map((material, index) => material.map ?? importedModelMaps.get(mesh)?.[index] ?? null);
  importedModelMaps.set(mesh, storedMaps);
  if (!texturesEnabled) materials.forEach((material) => { material.map = null; });
  if (selectedObject === mesh) updateImportedModelProperties(mesh);
  addDebugEntry(
    `Assigned ${assigned} texture image${assigned === 1 ? '' : 's'}${missing.length > 0 ? `; ${missing.length} map${missing.length === 1 ? '' : 's'} still missing` : ''}.`,
    'Texture',
  );
}

/** Warns about file maps whose pictures were not selected, and repairs them. */
function createImportedMissingTexturesSection(mesh: THREE.Mesh): HTMLElement | null {
  const missing = importedModelMissingTextures.get(mesh) ?? [];
  if (missing.length === 0) return null;
  const section = document.createElement('section');
  section.className = 'property-section imported-texture-warning';
  const warning = document.createElement('p');
  warning.className = 'point-geometry-status';
  const names = [...new Set(missing.map((slot) => slot.name || slot.label))];
  const listed = names.slice(0, 4).join(', ') + (names.length > 4 ? `, +${names.length - 4} more` : '');
  warning.textContent = `${missing.length} map${missing.length === 1 ? '' : 's'} ${missing.length === 1 ? 'has' : 'have'} no image (${listed}). Choose the images, or hand over the folder they live in — files picked several times are added together.`;

  const picker = document.createElement('button');
  picker.type = 'button';
  picker.className = 'texture-clear-button';
  picker.textContent = 'Choose missing images…';
  const folderPicker = document.createElement('button');
  folderPicker.type = 'button';
  folderPicker.className = 'texture-clear-button';
  folderPicker.textContent = 'Choose texture folder…';
  const imageTypes = '.png,.jpg,.jpeg,.webp,.avif,.tga,.targa,.bmp,image/png,image/jpeg,image/webp,image/avif';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = imageTypes;
  input.multiple = true;
  input.hidden = true;
  // A whole texture directory at once: models exported beside a `textures/`
  // folder reference dozens of images, and picking them one by one is not
  // practical. The attribute (not the property) keeps this free of DOM typings
  // that browsers disagree about.
  const folderInput = document.createElement('input');
  folderInput.type = 'file';
  folderInput.multiple = true;
  folderInput.hidden = true;
  folderInput.setAttribute('webkitdirectory', '');
  folderInput.setAttribute('directory', '');

  const applyPicked = async (picked: readonly File[]) => {
    const images = picked.filter((file) => /\.(png|jpe?g|webp|avif|tga|targa|bmp)$/i.test(file.name));
    if (images.length === 0) {
      addDebugEntry('That selection has no image files (.png, .jpg, .webp, .tga…).', 'Texture');
      return;
    }
    picker.disabled = true;
    folderPicker.disabled = true;
    try {
      await repairImportedTextures(mesh, images);
    } finally {
      picker.disabled = false;
      folderPicker.disabled = false;
    }
  };

  picker.addEventListener('click', () => input.click());
  folderPicker.addEventListener('click', () => folderInput.click());
  input.addEventListener('change', () => {
    const files = Array.from(input.files ?? []);
    input.value = '';
    void applyPicked(files);
  });
  folderInput.addEventListener('change', () => {
    const files = Array.from(folderInput.files ?? []);
    folderInput.value = '';
    void applyPicked(files);
  });

  section.append(warning, picker, folderPicker, input, folderInput);
  return section;
}

/** Longest side of a UI preview; full-size pictures belong on the GPU, not in the DOM. */
const THUMBNAIL_MAX_SIZE = 512;

/** A browser-loadable, downscaled picture URL for a texture, or '' when it has none. */
function texturePreviewSource(texture: THREE.Texture): string {
  const image = texture.image as unknown;
  const dataImage = image as { data?: unknown; width?: number; height?: number } | null;
  const width = image instanceof HTMLImageElement
    ? image.naturalWidth
    : image instanceof ImageBitmap ? image.width
      : image instanceof HTMLCanvasElement ? image.width : dataImage?.width ?? 0;
  const height = image instanceof HTMLImageElement
    ? image.naturalHeight
    : image instanceof ImageBitmap ? image.height
      : image instanceof HTMLCanvasElement ? image.height : dataImage?.height ?? 0;
  if (width <= 0 || height <= 0) return '';
  // An 8K texture used to be serialised at full size for a 30 px swatch: the
  // data URL alone could be tens of megabytes. Every UI preview is capped now.
  const scale = Math.min(1, THUMBNAIL_MAX_SIZE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) return '';
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  try {
    if (dataImage?.data instanceof Uint8Array && dataImage.data.length >= width * height * 4) {
      // Data textures (TGA and other decoder formats) carry raw RGBA pixels.
      const source = document.createElement('canvas');
      source.width = width;
      source.height = height;
      const sourceContext = source.getContext('2d');
      if (!sourceContext) return '';
      const pixels = new Uint8ClampedArray(width * height * 4);
      pixels.set(dataImage.data.subarray(0, pixels.length));
      sourceContext.putImageData(new ImageData(pixels, width, height), 0, 0);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
    } else if (image instanceof HTMLCanvasElement) {
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    } else {
      context.drawImage(image as HTMLImageElement | ImageBitmap, 0, 0, canvas.width, canvas.height);
    }
    return canvas.toDataURL();
  } catch {
    return '';
  }
}

/** One material slot that can be given its own picture. */
interface PbrMapSlot {
  key: 'map' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'aoMap' | 'emissiveMap' | 'alphaMap' | 'bumpMap';
  label: string;
  /** Words a file name may contain to be picked for this slot from a folder. */
  words: string[];
  /** Colour maps are authored in sRGB; data maps must stay linear. */
  srgb?: boolean;
}

const PBR_MAP_SLOTS: PbrMapSlot[] = [
  { key: 'map', label: 'Color / Diffuse', words: ['basecolor', 'base_color', 'basemap', 'albedo', 'diffuse', 'color', 'diff'], srgb: true },
  { key: 'normalMap', label: 'Normal', words: ['normal', 'nrm'] },
  { key: 'roughnessMap', label: 'Roughness', words: ['roughness', 'rough', 'rgh'] },
  { key: 'metalnessMap', label: 'Metalness', words: ['metalness', 'metal', 'metallic', 'mtl'] },
  { key: 'aoMap', label: 'AO / Occlusion', words: ['occlusion', 'ambient', 'ao'] },
  { key: 'emissiveMap', label: 'Emissive', words: ['emissive', 'emission', 'emit', 'glow'], srgb: true },
  { key: 'alphaMap', label: 'Alpha / Cutout', words: ['alpha', 'opacity', 'mask'] },
  { key: 'bumpMap', label: 'Height / Bump', words: ['height', 'bump', 'disp'] },
];

const IMAGE_FILE_PATTERN = /\.(png|jpe?g|webp|avif|tga|targa|bmp)$/i;

function slotTexture(material: THREE.MeshStandardMaterial, key: PbrMapSlot['key']): THREE.Texture | null {
  const texture = (material as unknown as Record<string, unknown>)[key];
  return texture instanceof THREE.Texture ? texture : null;
}

/** Writes one map into every material group of the mesh. */
function setMeshMapSlot(mesh: THREE.Mesh, slot: PbrMapSlot, texture: THREE.Texture): void {
  const materials = getStandardMaterials(mesh);
  texture.colorSpace = slot.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = Math.max(texture.anisotropy, 16);
  texture.needsUpdate = true;
  // `aoMap` samples the second UV set; a model that never had one would read the
  // wrong coordinates, so mirror the first set instead of rendering garbage.
  if (slot.key === 'aoMap' && !mesh.geometry.getAttribute('uv1')) {
    const uv = mesh.geometry.getAttribute('uv');
    if (uv) mesh.geometry.setAttribute('uv1', uv.clone());
  }
  for (const material of materials) {
    (material as unknown as Record<string, THREE.Texture | null>)[slot.key] = texture;
    if (slot.key === 'alphaMap') {
      material.transparent = false;
      material.alphaTest = 0.5;
      material.depthWrite = true;
    }
    if (slot.key === 'emissiveMap' && texture !== null && material.emissive.getHex() === 0x000000) {
      // The map is multiplied by the emissive colour, so black — the default —
      // would cancel the picture out completely.
      material.emissive.set(0xffffff);
      material.userData.emissiveFromMap = true;
    }
    material.needsUpdate = true;
  }
}

function clearMeshMapSlot(mesh: THREE.Mesh, slot: PbrMapSlot): void {
  for (const material of getStandardMaterials(mesh)) {
    (material as unknown as Record<string, THREE.Texture | null>)[slot.key] = null;
    if (slot.key === 'emissiveMap' && material.userData.emissiveFromMap === true) {
      material.emissive.set(0x000000);
      delete material.userData.emissiveFromMap;
    }
    material.needsUpdate = true;
  }
  if (slot.key === 'map') {
    objectTextures.delete(mesh);
    texturedMeshes.delete(mesh);
  }
}

/** The picture in a folder that belongs to one slot, judged by its file name. */
function pickSlotImage(files: readonly File[], slot: PbrMapSlot): File | null {
  const images = files.filter((file) => IMAGE_FILE_PATTERN.test(file.name));
  if (images.length === 0) return null;
  let best: File | null = null;
  let bestScore = 0;
  for (const file of images) {
    const name = file.name.toLowerCase().replace(/\.[^.]+$/, '');
    const score = slot.words.reduce((total, word) => total + (name.includes(word) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = file;
    }
  }
  // Nothing carries the slot's name: use the first picture. The folder was picked
  // for this slot on purpose, so refusing it would just be in the way.
  return best ?? images[0];
}

function createMapSlotButton(text: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'texture-clear-button pbr-map-button';
  button.textContent = text;
  return button;
}

/**
 * One row per PBR channel, each with its own image picker and folder picker.
 *
 * This is what makes a model whose file referenced no pictures usable: every
 * map can be filled in by hand instead of only a single base colour.
 */
function createMapSlotList(mesh: THREE.Mesh): HTMLElement {
  const list = document.createElement('div');
  list.className = 'pbr-map-list';
  const heading = document.createElement('p');
  heading.className = 'pbr-map-heading';
  heading.textContent = 'PBR maps — pick an image or a folder for each';
  list.appendChild(heading);

  for (const slot of PBR_MAP_SLOTS) {
    const materials = getStandardMaterials(mesh);
    const current = materials.map((material) => slotTexture(material, slot.key)).find((texture) => texture !== null) ?? null;

    const row = document.createElement('div');
    row.className = 'pbr-map-row';
    const label = document.createElement('span');
    label.className = 'pbr-map-label';
    label.textContent = slot.label;

    const preview = document.createElement('img');
    preview.className = 'pbr-map-preview';
    preview.alt = '';
    const previewUrl = current ? texturePreviewSource(current) : '';
    if (previewUrl) preview.src = previewUrl;
    else preview.classList.add('is-empty');

    const imageButton = createMapSlotButton('Image…');
    const folderButton = createMapSlotButton('Folder…');
    const clearButton = createMapSlotButton('×');
    clearButton.setAttribute('aria-label', `Clear ${slot.label} map`);
    clearButton.hidden = current === null;
    clearButton.addEventListener('click', () => {
      clearMeshMapSlot(mesh, slot);
      if (selectedObject === mesh) updateProperties(mesh);
    });

    const apply = async (file: File, button: HTMLButtonElement) => {
      button.disabled = true;
      try {
        const texture = await createTextureFromFile(file);
        if (slot.key === 'map') {
          applyTextureToMesh(mesh, texture);
        } else {
          setMeshMapSlot(mesh, slot, texture);
          if (selectedObject === mesh) updateProperties(mesh);
        }
        addDebugEntry(`Applied ${file.name} as ${slot.label} on "${mesh.name}".`, 'Texture');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addDebugEntry(`Could not load ${file.name}: ${message}`, 'Texture');
      } finally {
        button.disabled = false;
      }
    };

    const imageInput = document.createElement('input');
    imageInput.type = 'file';
    imageInput.accept = 'image/png,image/jpeg,image/webp,image/avif,.tga,.targa,.bmp';
    imageInput.hidden = true;
    imageButton.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', () => {
      const file = imageInput.files?.[0];
      imageInput.value = '';
      if (file) void apply(file, imageButton);
    });

    // A whole folder, so a `textures/` dump can fill this one channel without
    // hunting for the right file first.
    const folderInput = document.createElement('input');
    folderInput.type = 'file';
    folderInput.multiple = true;
    folderInput.hidden = true;
    folderInput.setAttribute('webkitdirectory', '');
    folderInput.setAttribute('directory', '');
    folderButton.addEventListener('click', () => folderInput.click());
    folderInput.addEventListener('change', () => {
      const files = Array.from(folderInput.files ?? []);
      folderInput.value = '';
      const file = pickSlotImage(files, slot);
      if (!file) {
        addDebugEntry(`That folder has no image for the ${slot.label} map.`, 'Texture');
        return;
      }
      void apply(file, folderButton);
    });

    row.append(label, preview, imageButton, folderButton, clearButton, imageInput, folderInput);
    list.appendChild(row);
  }
  return list;
}

/**
 * ---- Texture library ----------------------------------------------------
 *
 * Textures live in the PBR workspace, but they are listed in the hierarchy next
 * to the scene, so the library and the model tree read as one explorer. Selecting
 * one opens its material controls on the right, and the sphere that shows it can
 * be turned by dragging it.
 */

let selectedTextureId: string | null = null;
let textureHierarchyKey = '';

/**
 * The library folder inside the scene tree.
 *
 * Textures are listed where the objects are, under one collapsible node, so the
 * explorer is the single place to look. A flex `order` keeps the node last even
 * though objects are appended after it while the scene grows.
 */
const textureTreeGroup = document.createElement('div');
textureTreeGroup.className = 'scene-object-row texture-group';
textureTreeGroup.hidden = true;
const textureTreeLine = document.createElement('div');
textureTreeLine.className = 'scene-object-line';
const textureTreeDisclosure = document.createElement('button');
textureTreeDisclosure.type = 'button';
textureTreeDisclosure.className = 'scene-group-disclosure';
textureTreeDisclosure.textContent = '⌄';
textureTreeDisclosure.setAttribute('aria-expanded', 'true');
const textureTreeLabel = document.createElement('button');
textureTreeLabel.type = 'button';
textureTreeLabel.className = 'scene-object texture-group-label';
textureTreeLabel.textContent = 'Textures';
const textureTreeChildren = document.createElement('div');
textureTreeChildren.className = 'scene-object-children';
textureTreeLine.append(textureTreeDisclosure, textureTreeLabel);
textureTreeGroup.append(textureTreeLine, textureTreeChildren);
sceneContents.appendChild(textureTreeGroup);

const toggleTextureTree = () => {
  const expanded = textureTreeChildren.hidden === false;
  textureTreeChildren.hidden = expanded;
  textureTreeDisclosure.textContent = expanded ? '›' : '⌄';
  textureTreeDisclosure.setAttribute('aria-expanded', String(!expanded));
};
textureTreeDisclosure.addEventListener('click', toggleTextureTree);
textureTreeLabel.addEventListener('click', toggleTextureTree);

function updateTextureRowSelection(): void {
  textureTreeChildren.querySelectorAll<HTMLButtonElement>('.texture-row-button').forEach((button) => {
    button.classList.toggle('selected', button.dataset.textureId === selectedTextureId);
  });
}

function syncTextureHierarchy(entries: readonly TextureEntry[], selected: TextureEntry | null): void {
  const key = `${entries.map((entry) => `${entry.id}:${entry.name}:${entry.revision}`).join('|')}#${selected?.id ?? ''}`;
  if (key === textureHierarchyKey) return;
  textureHierarchyKey = key;
  textureTreeGroup.hidden = entries.length === 0;
  textureTreeChildren.replaceChildren();
  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'scene-object-row texture-row';
    const line = document.createElement('div');
    line.className = 'scene-object-line';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'scene-object texture-row-button';
    button.dataset.textureId = entry.id;
    button.classList.toggle('selected', entry.id === selected?.id);
    button.title = `${entry.name} — ${entry.resolution}. Click to configure it.`;
    const swatch = document.createElement('img');
    swatch.className = 'texture-row-swatch';
    swatch.src = entry.thumbnail;
    swatch.alt = '';
    const name = document.createElement('span');
    name.className = 'texture-row-name';
    name.textContent = entry.name;
    button.append(swatch, name);
    button.addEventListener('click', () => {
      // The dock draws the balls, so show it before scrolling one into view.
      setPbrDockVisible(true);
      textureWorkspace?.focus(entry.id);
    });
    line.appendChild(button);
    row.appendChild(line);
    textureTreeChildren.appendChild(row);
  }
}

/** One preview renderer, reused for every texture that is selected. */
let texturePreviewPromise: Promise<TexturePreview> | null = null;
let texturePreview: TexturePreview | null = null;

function ensureTexturePreview(): Promise<TexturePreview> {
  if (!texturePreviewPromise) {
    texturePreviewPromise = createTexturePreview()
      .then((preview) => {
        texturePreview = preview;
        return preview;
      })
      .catch((error: unknown) => {
        texturePreviewPromise = null;
        throw error;
      });
  }
  return texturePreviewPromise;
}

/**
 * Pushes a texture set's UV transform onto one texture.
 *
 * The colour picture and every data map share it, so a roughness or normal
 * map can never slide against the picture it was painted for.
 */
function applyTextureTransform(texture: THREE.Texture, settings: TextureSettings): void {
  texture.repeat.set(settings.tilingX, settings.tilingY);
  texture.offset.set(settings.offsetX, settings.offsetY);
  texture.center.set(0.5, 0.5);
  texture.rotation = THREE.MathUtils.degToRad(settings.rotation);
  // The transform is a uniform, not pixel data. Asking for an upload here made
  // every slider tick re-upload (and re-mipmap) an 8K picture, which is why
  // dragging mapping or roughness felt heavy and the picture softened.
}

/** Applies the strengths of the maps a material actually carries. */
function applyMapResponse(material: THREE.MeshStandardMaterial, settings: TextureSettings): void {
  if (material.normalMap) material.normalScale.set(settings.normalStrength, settings.normalStrength);
  if (material.bumpMap) material.bumpScale = settings.bumpDepth;
  if (material.aoMap) material.aoMapIntensity = settings.aoStrength;
  if (material.alphaMap) material.alphaTest = settings.alphaCutoff;
  if (material.emissiveMap) material.emissiveIntensity = settings.emissiveGlow;
}

/** Writes a texture's material response onto every material of a mesh. */
function applyTextureSettingsToMesh(mesh: THREE.Mesh, settings: TextureSettings): void {
  // An image block is a picture cut-out, not a shaded surface: keeping it matte
  // preserves the transparent silhouette the occlusion mask relies on.
  if (objectShapes.get(mesh) === 'ImageBlock') return;
  for (const material of getStandardMaterials(mesh)) {
    material.color.set(settings.color);
    material.roughness = settings.roughness;
    material.metalness = settings.metalness;
    // Reflectance is `envMapIntensity`. WebGPU only reads that value when the
    // material owns an envMap; a material that relies on `scene.environment`
    // uses `scene.environmentIntensity` instead. Without a material envMap the
    // slider did nothing above the probe threshold, and below it the material
    // fell back to the full-brightness world environment — the washed-out look
    // at low Reflectance. Bind the world environment once so the value applies.
    if (material.envMap === null && scene.environment !== null) {
      material.envMap = scene.environment;
      material.needsUpdate = true;
    }
    const environmentScale = material.envMap === scene.environment ? scene.environmentIntensity : 1;
    material.envMapIntensity = settings.reflectivity * environmentScale;
    applyMapResponse(material, settings);
    const maps = [material.map, material.normalMap, material.roughnessMap, material.metalnessMap,
      material.aoMap, material.emissiveMap, material.alphaMap, material.bumpMap];
    for (const map of maps) {
      if (map) applyTextureTransform(map, settings);
    }
    material.needsUpdate = true;
  }
}

/**
 * Re-reads a texture's picture and maps onto every object painted with it.
 *
 * Replacing the colour picture or swapping a map in the configuration has to
 * reach the objects that already wear the texture; otherwise the ball changes
 * while the scene keeps the old image.
 */
function refreshObjectsUsingTextureMaps(entry: TextureEntry): void {
  for (const mesh of texturedMeshes) {
    if (objectTextureEntries.get(mesh) !== entry) continue;
    // An image block keeps its own clamped copy: repeating there would bleed
    // the opposite edge into a picture that only ever shows one frame.
    const applied = objectShapes.get(mesh) === 'ImageBlock' ? entry.texture.clone() : entry.texture;
    if (applied !== entry.texture) {
      applied.wrapS = THREE.ClampToEdgeWrapping;
      applied.wrapT = THREE.ClampToEdgeWrapping;
      applied.needsUpdate = true;
    }
    objectTextures.set(mesh, applied);
    for (const material of getStandardMaterials(mesh)) {
      if (texturesEnabled) material.map = applied;
      material.needsUpdate = true;
    }
    if (!texturesEnabled) continue;
    // Rebuild the recorded map set from scratch so a removed channel really
    // goes back to what the object had before the texture landed.
    restoreEntryMaps(mesh);
    applyEntryMapsToMesh(mesh, entry);
    applyTextureSettingsToMesh(mesh, entry.settings);
  }
  if (selectedObject) updateProperties(selectedObject);
}

/** Re-tunes every object painted with a texture after its sliders moved. */
function updateObjectsUsingTexture(entry: TextureEntry): void {
  for (const mesh of texturedMeshes) {
    if (objectTextureEntries.get(mesh) !== entry) continue;
    applyTextureSettingsToMesh(mesh, entry.settings);
    // Keep the saved copy in step, or turning all textures off and on again
    // would restore the values the texture had when it was first applied.
    objectTextureSettings.set(mesh, { ...entry.settings });
  }
}

/** Twelve ready-made tints for a texture, from neutral to saturated. */
const TEXTURE_COLOR_PRESETS = [
  '#ffffff', '#cfd4da', '#7a818a', '#23262b',
  '#d94b3f', '#e5873a', '#e8c447', '#6ec06b',
  '#3fb7a6', '#4a9fdc', '#6a63d6', '#c264c9',
];

/**
 * Colour control for a texture: wheel, hex field and twelve preset squares.
 *
 * Picking a tint on a texture has to feel like painting a material, so the
 * wheel stays visible next to the swatches instead of hiding behind a native
 * colour dialog.
 */
function createTextureColorField(entry: TextureEntry, apply: () => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'texture-color-field';

  const color = new THREE.Color(entry.settings.color);
  const channels = new THREE.Color();
  color.getRGB(channels, THREE.SRGBColorSpace);
  // One HSV state drives the wheel, the brightness rail and the hex field, so
  // a dark tint can be reached by dragging instead of typing it by hand.
  const hsv = rgbToHsv(channels.r, channels.g, channels.b);

  const wheelRow = document.createElement('div');
  wheelRow.className = 'color-wheel-row texture-wheel-row';
  const wheel = document.createElement('canvas');
  wheel.className = 'color-wheel';
  wheel.width = 168;
  wheel.height = 168;
  wheel.tabIndex = 0;
  wheel.setAttribute('role', 'slider');
  wheel.setAttribute('aria-label', 'Texture color wheel');
  drawColorWheel(wheel);
  const selector = document.createElement('span');
  selector.className = 'wheel-selector';
  wheelRow.append(wheel, selector);

  const colorRow = document.createElement('div');
  colorRow.className = 'texture-color-row';
  const preview = document.createElement('span');
  preview.className = 'texture-color-preview';
  preview.setAttribute('aria-hidden', 'true');
  const hexLabel = document.createElement('label');
  hexLabel.className = 'texture-hex-field';
  const hexLabelText = document.createElement('span');
  hexLabelText.textContent = 'HEX';
  const hexInput = document.createElement('input');
  hexInput.type = 'text';
  hexInput.maxLength = 7;
  hexInput.spellcheck = false;
  hexInput.setAttribute('aria-label', 'Texture color hex value');
  hexLabel.append(hexLabelText, hexInput);
  colorRow.append(preview, hexLabel);

  const brightness = document.createElement('label');
  brightness.className = 'property-field texture-config-range texture-brightness';
  const brightnessHeader = document.createElement('span');
  brightnessHeader.className = 'shadows-field-header';
  const brightnessName = document.createElement('span');
  brightnessName.textContent = 'Brightness';
  const brightnessOutput = document.createElement('output');
  brightnessHeader.append(brightnessName, brightnessOutput);
  const brightnessInput = document.createElement('input');
  brightnessInput.type = 'range';
  brightnessInput.min = '0';
  brightnessInput.max = '100';
  brightnessInput.step = '1';
  brightnessInput.setAttribute('aria-label', 'Texture color brightness');
  brightness.append(brightnessHeader, brightnessInput);

  const swatches = document.createElement('div');
  swatches.className = 'texture-swatches';
  swatches.setAttribute('aria-label', 'Preset colors');
  const swatchButtons = TEXTURE_COLOR_PRESETS.map((preset) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'texture-swatch';
    button.style.backgroundColor = preset;
    button.title = preset;
    button.setAttribute('aria-label', `Tint the texture ${preset}`);
    button.addEventListener('click', () => commitColor(preset));
    swatches.appendChild(button);
    return button;
  });

  /** Rebuilds the colour from the HSV state and refreshes every control. */
  const sync = () => {
    const converted = hsvToRgb(hsv.h, hsv.s, hsv.v);
    color.setRGB(converted.r, converted.g, converted.b, THREE.SRGBColorSpace);
    entry.settings.color = `#${color.getHexString()}`;
    const hex = entry.settings.color;
    const angle = hsv.h * Math.PI * 2;
    const distance = hsv.s * 50;
    selector.style.left = `${50 + Math.cos(angle) * distance}%`;
    selector.style.top = `${50 - Math.sin(angle) * distance}%`;
    selector.style.backgroundColor = hex;
    preview.style.backgroundColor = hex;
    if (document.activeElement !== hexInput) hexInput.value = hex;
    const percent = Math.round(hsv.v * 100);
    brightnessInput.value = String(percent);
    brightnessOutput.textContent = `${percent}%`;
    syncRangeBar(brightnessInput);
    swatchButtons.forEach((button, index) => {
      button.classList.toggle('selected', TEXTURE_COLOR_PRESETS[index].toLowerCase() === hex.toLowerCase());
    });
  };

  function commitColor(hex: string) {
    color.set(hex);
    color.getRGB(channels, THREE.SRGBColorSpace);
    const next = rgbToHsv(channels.r, channels.g, channels.b);
    hsv.h = next.h;
    hsv.s = next.s;
    hsv.v = next.v;
    sync();
    apply();
  }

  const commitHsv = () => {
    sync();
    apply();
  };

  const pickFromWheel = (event: PointerEvent) => {
    const bounds = wheel.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    const y = 1 - ((event.clientY - bounds.top) / bounds.height) * 2;
    hsv.s = Math.min(1, Math.hypot(x, y));
    hsv.h = (Math.atan2(y, x) / (Math.PI * 2) + 1) % 1;
    commitHsv();
  };
  wheel.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    try {
      wheel.setPointerCapture(event.pointerId);
    } catch {
      // Best effort only; the drag still works through the move handler.
    }
    pickFromWheel(event);
  });
  wheel.addEventListener('pointermove', (event) => {
    if (event.buttons & 1) pickFromWheel(event);
  });
  brightnessInput.addEventListener('input', () => {
    hsv.v = THREE.MathUtils.clamp(Number(brightnessInput.value) / 100, 0, 1);
    commitHsv();
  });
  hexInput.addEventListener('change', () => {
    if (!/^#[0-9a-f]{6}$/i.test(hexInput.value)) {
      hexInput.value = `#${color.getHexString()}`;
      return;
    }
    commitColor(hexInput.value);
  });

  sync();
  wrap.append(wheelRow, colorRow, brightness, swatches);
  return wrap;
}

/** Maps a library texture painted on an object, kept so clearing can undo it. */
interface ObjectAppliedMap {
  key: PbrMapSlot['key'];
  applied: THREE.Texture;
  previous: THREE.Texture | null;
}
const objectTextureMaps = new WeakMap<THREE.Mesh, ObjectAppliedMap[]>();

/** Copies a texture's extra maps onto a mesh, remembering what was there. */
function applyEntryMapsToMesh(mesh: THREE.Mesh, entry: TextureEntry): void {
  const recorded = objectTextureMaps.get(mesh) ?? [];
  for (const slot of PBR_MAP_SLOTS) {
    if (slot.key === 'map') continue;
    const map = entry.maps[slot.key as TextureMapKey];
    if (!map) continue;
    const existing = recorded.find((item) => item.key === slot.key);
    if (existing) {
      existing.applied = map.texture;
    } else {
      const previous = getStandardMaterials(mesh)
        .map((material) => slotTexture(material, slot.key))
        .find((texture) => texture !== null) ?? null;
      recorded.push({ key: slot.key, applied: map.texture, previous });
    }
    setMeshMapSlot(mesh, slot, map.texture);
  }
  objectTextureMaps.set(mesh, recorded);
}

/** Puts back whatever maps were on the mesh before a library texture landed. */
function restoreEntryMaps(mesh: THREE.Mesh): void {
  const recorded = objectTextureMaps.get(mesh);
  if (!recorded) return;
  for (const item of recorded) {
    for (const material of getStandardMaterials(mesh)) {
      (material as unknown as Record<string, THREE.Texture | null>)[item.key] = item.previous;
      if (item.key === 'alphaMap') material.alphaTest = 0;
      material.needsUpdate = true;
    }
  }
  objectTextureMaps.delete(mesh);
}

/** "Disable all textures" also silences the maps a library texture brought. */
function setEntryMapsEnabled(mesh: THREE.Mesh, enabled: boolean): void {
  const recorded = objectTextureMaps.get(mesh);
  if (!recorded) return;
  for (const item of recorded) {
    for (const material of getStandardMaterials(mesh)) {
      (material as unknown as Record<string, THREE.Texture | null>)[item.key] = enabled ? item.applied : null;
      material.needsUpdate = true;
    }
  }
}

/**
 * The Maps block inside a texture's configuration.
 *
 * The base picture is the texture itself; the data channels travel with it
 * onto any object it is dropped on. The object's own Texture section keeps its
 * per-object rows.
 */
function createTextureMapSection(entry: TextureEntry, onChange: () => void): HTMLElement {
  const section = document.createElement('section');
  section.className = 'property-section texture-maps-section';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'property-section-toggle';
  toggle.setAttribute('aria-expanded', 'true');
  const details = document.createElement('div');
  details.className = 'texture-maps-details';
  const count = () => Object.keys(entry.maps).length;
  toggle.innerHTML = `<span class="section-chevron">⌄</span><span>Maps</span><span class="texture-maps-count">${count() || 'none'}</span>`;
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    toggle.querySelector('.section-chevron')!.textContent = expanded ? '›' : '⌄';
    details.hidden = expanded;
  });

  const applyFile = async (
    key: TextureMapKey | 'map',
    file: File,
    button: HTMLButtonElement,
    srgb = false,
  ) => {
    button.disabled = true;
    try {
      const texture = await createTextureFromFile(file);
      // Only colour data is authored in sRGB. A normal, roughness, metalness,
      // AO, alpha or bump map sampled through an sRGB decode comes out too dark
      // (0.5 becomes 0.21), which makes a roughness map far shinier than the
      // picture it was painted from and washes the surface out in reflections.
      texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      if (key === 'map') {
        entry.texture = texture;
        entry.thumbnail = texturePreviewSource(texture) || entry.thumbnail;
        const image = texture.image as { width?: number; height?: number } | null;
        if (image?.width && image.height) entry.resolution = `${image.width} × ${image.height}`;
        // Once a generated grid or checker is replaced by a picture, the set is
        // an image file: the source chip should stop claiming it was generated.
        entry.source = 'file';
        entry.revision += 1;
      } else {
        const map: TextureMap = {
          texture,
          thumbnail: texturePreviewSource(texture),
          name: file.name,
        };
        entry.maps[key] = map;
      }
      textureWorkspace?.updateEntry(entry.id);
      onChange();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addDebugEntry(`Could not load ${file.name}: ${message}`, 'Texture');
    } finally {
      button.disabled = false;
    }
  };

  for (const slot of PBR_MAP_SLOTS) {
    const isBase = slot.key === 'map';
    const map = isBase ? null : entry.maps[slot.key as TextureMapKey] ?? null;
    const thumbnail = isBase ? entry.thumbnail : map?.thumbnail ?? '';
    const row = document.createElement('div');
    row.className = 'pbr-map-row texture-map-row';
    const label = document.createElement('span');
    label.className = 'pbr-map-label';
    label.textContent = slot.label;
    const preview = document.createElement('img');
    preview.className = 'pbr-map-preview';
    preview.alt = '';
    if (thumbnail) preview.src = thumbnail;
    else preview.classList.add('is-empty');

    const imageButton = createMapSlotButton(isBase ? 'Replace…' : 'Image…');
    const imageInput = document.createElement('input');
    imageInput.type = 'file';
    imageInput.accept = 'image/png,image/jpeg,image/webp,image/avif,.tga,.targa,.bmp';
    imageInput.hidden = true;
    imageButton.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', () => {
      const file = imageInput.files?.[0];
      imageInput.value = '';
      if (file) void applyFile(slot.key as TextureMapKey | 'map', file, imageButton, slot.srgb === true);
    });

    // Dropping a picture straight on the row fills that channel. This is the
    // fastest way to load a whole authored set: drag base colour, normal and
    // roughness one after another instead of hunting through the file dialog.
    row.addEventListener('dragover', (event) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
    row.addEventListener('drop', (event) => {
      const file = event.dataTransfer?.files[0];
      if (!file) return;
      event.preventDefault();
      row.classList.remove('drag-over');
      void applyFile(slot.key as TextureMapKey | 'map', file, imageButton, slot.srgb === true);
    });

    row.append(label, preview, imageButton, imageInput);
    if (!isBase) {
      const clear = createMapSlotButton('×');
      clear.setAttribute('aria-label', `Clear ${slot.label} map`);
      clear.hidden = map === null;
      clear.addEventListener('click', () => {
        delete entry.maps[slot.key as TextureMapKey];
        textureWorkspace?.updateEntry(entry.id);
        onChange();
      });
      row.appendChild(clear);
    }
    details.appendChild(row);
  }

  const note = document.createElement('p');
  note.className = 'texture-config-hint';
  note.textContent = 'These maps travel with the texture; dropping it on an object also applies them.';
  details.appendChild(note);
  section.append(toggle, details);
  return section;
}

/** One titled block inside the texture configuration. */
function createTextureConfigSection(title: string, ...children: HTMLElement[]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'texture-config-section';
  const heading = document.createElement('div');
  heading.className = 'texture-config-section-heading';
  heading.textContent = title;
  const body = document.createElement('div');
  body.className = 'texture-config-section-body';
  body.append(...children);
  section.append(heading, body);
  return section;
}

function showTextureProperties(entry: TextureEntry): void {
  selectObject(null);
  selectedTextureId = entry.id;
  updateTextureRowSelection();
  properties.classList.remove('properties-empty');
  properties.classList.add('properties-content');
  properties.replaceChildren();

  const form = document.createElement('div');
  form.className = 'properties-form texture-config';

  const heading = document.createElement('div');
  heading.className = 'texture-config-heading';
  heading.textContent = entry.name;
  // The library thumbnail, at the top of the panel: a texture's picture is its
  // identity, and seeing it next to the ball and the resolution makes it clear
  // which map is being tuned when a set carries several data channels.
  const headRow = document.createElement('div');
  headRow.className = 'texture-config-head';
  const picture = document.createElement('img');
  picture.className = 'texture-config-picture';
  picture.src = entry.thumbnail;
  picture.alt = `${entry.name} picture`;
  const headInfo = document.createElement('div');
  headInfo.className = 'texture-config-head-info';
  const meta = document.createElement('div');
  meta.className = 'texture-config-meta';
  const resolutionChip = document.createElement('span');
  resolutionChip.className = 'texture-resolution-chip';
  resolutionChip.textContent = entry.resolution;
  const sourceChip = document.createElement('span');
  sourceChip.className = 'texture-source-chip';
  sourceChip.textContent = entry.source === 'file'
    ? 'Image file'
    : entry.source === 'checker'
      ? 'Generated checker'
      : 'Generated UV grid';
  meta.append(resolutionChip, sourceChip);
  headInfo.append(heading, meta);
  headRow.append(picture, headInfo);

  const previewHost = document.createElement('div');
  previewHost.className = 'texture-config-preview';
  const previewHint = document.createElement('p');
  previewHint.className = 'texture-config-hint';
  previewHint.textContent = 'Drag the ball to turn it — right or left hold.';

  const refreshBalls = () => {
    textureWorkspace?.applySettings(entry.id);
    texturePreview?.setEntry(entry);
    updateObjectsUsingTexture(entry);
  };

  const rangeField = (
    labelText: string,
    value: number,
    min: number,
    max: number,
    step: number,
    format: (value: number) => string,
    apply: (value: number) => void,
  ) => {
    const label = document.createElement('label');
    label.className = 'property-field texture-config-range';
    const header = document.createElement('span');
    header.className = 'shadows-field-header';
    const name = document.createElement('span');
    name.textContent = labelText;
    const output = document.createElement('output');
    output.textContent = format(value);
    header.append(name, output);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.setAttribute('aria-label', `${entry.name} ${labelText}`);
    syncRangeBar(input);
    input.addEventListener('input', () => {
      const next = Number(input.value);
      output.textContent = format(next);
      apply(next);
      refreshBalls();
    });
    label.append(header, input);
    return label;
  };

  const colorField = createTextureColorField(entry, refreshBalls);
  const mapsSection = createTextureMapSection(entry, () => {
    refreshObjectsUsingTextureMaps(entry);
    showTextureProperties(entry);
  });

  const roughnessField = rangeField('Roughness', entry.settings.roughness, 0, 1, 0.01, (value) => value.toFixed(2), (value) => {
    entry.settings.roughness = value;
  });
  const metalnessField = rangeField('Metalness', entry.settings.metalness, 0, 1, 0.01, (value) => value.toFixed(2), (value) => {
    entry.settings.metalness = value;
  });
  const reflectanceField = rangeField('Reflectance', entry.settings.reflectivity, 0, 3, 0.01, (value) => value.toFixed(2), (value) => {
    entry.settings.reflectivity = value;
  });
  const tilingXField = rangeField('Tiling X', entry.settings.tilingX, 0.1, 8, 0.1, (value) => `${value.toFixed(1)}×`, (value) => {
    entry.settings.tilingX = value;
  });
  const tilingYField = rangeField('Tiling Y', entry.settings.tilingY, 0.1, 8, 0.1, (value) => `${value.toFixed(1)}×`, (value) => {
    entry.settings.tilingY = value;
  });
  const offsetXField = rangeField('Offset X', entry.settings.offsetX, -1, 1, 0.01, (value) => value.toFixed(2), (value) => {
    entry.settings.offsetX = value;
  });
  const offsetYField = rangeField('Offset Y', entry.settings.offsetY, -1, 1, 0.01, (value) => value.toFixed(2), (value) => {
    entry.settings.offsetY = value;
  });
  const rotationField = rangeField('Rotation', entry.settings.rotation, 0, 360, 1, (value) => `${Math.round(value)}°`, (value) => {
    entry.settings.rotation = value;
  });

  // Relief controls appear only for the channels that are actually loaded, so
  // the panel never shows a slider that does nothing.
  const responseFields: HTMLElement[] = [];
  if (entry.maps.normalMap) {
    responseFields.push(rangeField('Normal strength', entry.settings.normalStrength, 0, 2, 0.01, (value) => value.toFixed(2), (value) => {
      entry.settings.normalStrength = value;
    }));
  }
  if (entry.maps.bumpMap) {
    responseFields.push(rangeField('Bump depth', entry.settings.bumpDepth, 0, 4, 0.05, (value) => value.toFixed(2), (value) => {
      entry.settings.bumpDepth = value;
    }));
  }
  if (entry.maps.aoMap) {
    responseFields.push(rangeField('AO strength', entry.settings.aoStrength, 0, 2, 0.01, (value) => value.toFixed(2), (value) => {
      entry.settings.aoStrength = value;
    }));
  }
  if (entry.maps.alphaMap) {
    responseFields.push(rangeField('Alpha cutoff', entry.settings.alphaCutoff, 0, 1, 0.01, (value) => value.toFixed(2), (value) => {
      entry.settings.alphaCutoff = value;
    }));
  }
  if (entry.maps.emissiveMap) {
    responseFields.push(rangeField('Emissive glow', entry.settings.emissiveGlow, 0, 5, 0.05, (value) => value.toFixed(2), (value) => {
      entry.settings.emissiveGlow = value;
    }));
  }

  // The surface response is usually a library-wide choice: stone, metal and
  // plastic differ in their pictures, not in how shiny they are. One button
  // copies the three sliders onto every texture — and onto every object already
  // wearing them — instead of making the user repeat the tuning per ball.
  const syncSurface = document.createElement('button');
  syncSurface.type = 'button';
  syncSurface.className = 'texture-sync-button';
  syncSurface.textContent = 'Apply to all textures';
  syncSurface.title = 'Copies roughness, metalness and reflectance to every texture in the library.';
  syncSurface.addEventListener('click', () => {
    const surface = {
      roughness: entry.settings.roughness,
      metalness: entry.settings.metalness,
      reflectivity: entry.settings.reflectivity,
    };
    // Future textures start with the same response too, so a texture added
    // after this click does not fall back to the old defaults.
    DEFAULT_TEXTURE_SETTINGS.roughness = surface.roughness;
    DEFAULT_TEXTURE_SETTINGS.metalness = surface.metalness;
    DEFAULT_TEXTURE_SETTINGS.reflectivity = surface.reflectivity;
    saveSurfaceDefaults(surface);
    const library = textureWorkspace?.entries ?? [];
    for (const other of library) {
      other.settings.roughness = surface.roughness;
      other.settings.metalness = surface.metalness;
      other.settings.reflectivity = surface.reflectivity;
      textureWorkspace?.applySettings(other.id);
      updateObjectsUsingTexture(other);
    }
    texturePreview?.setEntry(entry);
    addDebugEntry(`Surface settings applied to ${library.length} texture${library.length === 1 ? '' : 's'}.`, 'Texture');
  });

  const note = document.createElement('p');
  note.className = 'texture-config-note';
  note.textContent = 'Drag this ball onto an object’s Texture square to apply it; the object keeps these values, its colour and its maps.';

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'texture-reset-button';
  reset.textContent = 'Reset settings';
  reset.addEventListener('click', () => {
    entry.settings = { ...DEFAULT_TEXTURE_SETTINGS };
    textureWorkspace?.applySettings(entry.id);
    texturePreview?.setEntry(entry);
    updateObjectsUsingTexture(entry);
    showTextureProperties(entry);
  });

  form.append(
    // The ball sits below the header: it is the thing being tuned, and the panel
    // can grow well past one screen once a texture carries maps.
    headRow,
    previewHost,
    meta,
    previewHint,
    createTextureConfigSection('Color', colorField),
    createTextureConfigSection('Surface', roughnessField, metalnessField, reflectanceField, syncSurface),
    createTextureConfigSection('Mapping', tilingXField, tilingYField, offsetXField, offsetYField, rotationField),
    mapsSection,
    ...(responseFields.length > 0 ? [createTextureConfigSection('Map response', ...responseFields)] : []),
    note,
    reset,
  );
  properties.appendChild(form);
  form.scrollTop = 0;

  void ensureTexturePreview()
    .then((preview) => {
      // The selection may have moved on while the renderer was starting.
      if (selectedTextureId !== entry.id) return;
      previewHost.replaceChildren(preview.canvas);
      preview.setEntry(entry);
      requestAnimationFrame(() => preview.setEntry(entry));
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      previewHost.remove();
      previewHint.textContent = `The ball preview is unavailable: ${message}`;
      addDebugEntry(`Texture preview could not start: ${message}`, 'Texture');
    });
}

function createObjectTextureSection(mesh: THREE.Mesh): HTMLElement {
  const section = document.createElement('section');
  section.className = 'property-section object-texture-section';
  const toggle = document.createElement('button');
  toggle.className = 'property-section-toggle';
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'true');
  toggle.innerHTML = '<span class="section-chevron">⌄</span><span>Texture</span>';

  const details = document.createElement('div');
  details.className = 'object-texture-details';
  const slot = document.createElement('div');
  slot.className = 'texture-drop-slot';
  slot.dataset.textureSlot = '';
  slot.tabIndex = 0;
  slot.setAttribute('role', 'button');
  slot.setAttribute('aria-label', 'Texture slot. Drag a texture ball here.');
  const applied = objectTextures.get(mesh);
  const fileMaps = importedModelMaps.get(mesh);
  const hasFileMaps = fileMaps?.some((map) => map !== null) === true;
  // Show the file's own picture too, so an imported map is visible in the slot.
  const previewTexture = applied ?? fileMaps?.find((map) => map !== null) ?? null;
  const previewSource = previewTexture ? texturePreviewSource(previewTexture) : '';
  if (previewSource) {
    slot.classList.add('has-texture');
    const preview = document.createElement('img');
    preview.src = previewSource;
    preview.alt = '';
    slot.appendChild(preview);
  } else {
    const placeholder = document.createElement('span');
    placeholder.className = 'texture-drop-placeholder';
    placeholder.textContent = hasFileMaps ? 'File texture' : 'Drop texture';
    slot.appendChild(placeholder);
  }

  const isImageBlock = objectShapes.get(mesh) === 'ImageBlock';
  const imported = importedModels.has(mesh);
  const fileMapCount = fileMaps?.filter((map) => map !== null).length ?? 0;
  const caption = document.createElement('p');
  caption.className = 'texture-drop-caption';
  caption.textContent = isImageBlock
    ? 'The image fills the block; transparent pixels are cut out. Drag a texture ball here or choose a file.'
    : applied
      ? 'Texture applied — it keeps the ball’s color, roughness and metalness.'
      : hasFileMaps
        ? 'The file’s own textures are applied. Drag a texture ball here to replace them on every part, or clear to restore them.'
        : imported
          ? 'This file brought no texture pictures. Load an image or drag a texture ball here to paint the whole model.'
          : 'Drag a texture ball from the PBR workspace onto the square, or load an image file.';

  const fileStatus = document.createElement('p');
  fileStatus.className = 'texture-file-status';
  if (imported) {
    fileStatus.textContent = fileMapCount > 0
      ? `${fileMapCount} file map${fileMapCount === 1 ? '' : 's'} loaded from the model.`
      : 'File maps: none. The model’s materials did not reference any pictures.';
    fileStatus.classList.toggle('is-missing', fileMapCount === 0);
  } else {
    fileStatus.hidden = true;
  }

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'texture-clear-button';
  clear.textContent = 'Clear texture';
  clear.hidden = !applied;
  clear.addEventListener('click', () => clearMeshTexture(mesh));

  const imagePicker = document.createElement('button');
  imagePicker.type = 'button';
  imagePicker.className = 'texture-clear-button';
  imagePicker.textContent = isImageBlock
    ? (applied ? 'Replace image…' : 'Choose image…')
    : 'Load texture image…';
  const imageInput = document.createElement('input');
  imageInput.type = 'file';
  imageInput.accept = 'image/png,image/jpeg,image/webp,image/avif,.tga,.targa,.bmp';
  imageInput.hidden = true;
  imagePicker.addEventListener('click', () => imageInput.click());
  imageInput.addEventListener('change', async () => {
    const file = imageInput.files?.[0];
    if (!file) return;
    imagePicker.disabled = true;
    try {
      const texture = await createTextureFromFile(file);
      applyTextureToMesh(mesh, texture);
      addDebugEntry(`Applied ${file.name} to "${mesh.name}".`, 'Texture');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addDebugEntry(`Could not load ${file.name}: ${message}`, 'Texture');
    } finally {
      imagePicker.disabled = false;
      imageInput.value = '';
    }
  });

  // Scene-wide switch. Hiding every map is different from clearing one: the
  // picture stays assigned, so turning textures back on restores all of them.
  const disableLabel = document.createElement('label');
  disableLabel.className = 'property-field light-toggle-field texture-disable-field';
  disableLabel.textContent = 'Disable all textures';
  const disableInput = document.createElement('input');
  disableInput.type = 'checkbox';
  disableInput.checked = !texturesEnabled;
  disableInput.setAttribute('aria-label', 'Disable all textures');
  disableInput.addEventListener('change', () => setTexturesEnabled(!disableInput.checked));
  disableLabel.appendChild(disableInput);

  slot.addEventListener('textureapply', (event) => {
    const detail = (event as CustomEvent<TextureApplyDetail>).detail;
    applyTextureToMesh(mesh, detail.entry.texture, detail.entry);
  });

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    const chevron = toggle.querySelector('.section-chevron');
    if (chevron) chevron.textContent = expanded ? '›' : '⌄';
    details.hidden = expanded;
  });

  details.append(slot, caption);
  if (imported) details.append(fileStatus);
  // An image block shows exactly one picture, so it has no other channels.
  if (!isImageBlock) {
    details.append(createMapSlotList(mesh));
  }
  details.append(imagePicker, imageInput, clear, disableLabel);
  section.append(toggle, details);
  return section;
}

function render() {
  const now = performance.now();
  const deltaSeconds = Math.min((now - previousFrameTime) / 1000, 0.05);
  previousFrameTime = now;
  if (playState) {
    updatePlayMovement(deltaSeconds);
    updatePlayCamera();
  }
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
  viewGizmo?.update();
  if (cameraMove) {
    const progress = Math.min((now - cameraMove.startedAt) / cameraMove.duration, 1);
    const eased = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    camera.position.lerpVectors(cameraMove.from, cameraMove.to, eased);
    controls.target.lerpVectors(cameraMove.fromTarget, cameraMove.toTarget, eased);
    camera.lookAt(controls.target);
    if (progress >= 1) {
      cameraMove = null;
      controls.update();
    }
  } else if (!freeCameraEnabled && !playState) {
    controls.update();
  }
  if (selectedObject && selectionHighlight.visible) selectionHighlight.update();
  additionalSelectionHighlights.forEach((helper) => helper.update());
  updateGeometryPointMarkerScale();
  grid.position.x = camera.position.x;
  grid.position.z = camera.position.z;
  // The sun's shadow box follows whatever currently casts or receives a shadow,
  // so scaling a floor or dragging a wall keeps its shadow sharp and complete.
  updateDirectionalShadowBounds();
  updateTexturedMeshUVs();
  updateSceneCameraHelpers();
  updateReflectionProbe(now);
  cameraPositionUniform.value.copy(camera.position);
  if (scenePipeline.enabled) {
    scenePipeline.update(camera, activeSun, deltaSeconds, collectRayTracedLights());
    scenePipeline.render();
  } else {
    renderer.render(scene, camera);
  }
  requestAnimationFrame(render);
}

let previousFrameTime = performance.now();
render();




