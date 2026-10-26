import * as THREE from 'three/webgpu';

export type TextureSource = 'file' | 'checker' | 'uvGrid';

/**
 * The surface a texture paints with.
 *
 * A texture is not just a picture: it carries the material response it was
 * authored with. The PBR ball previews exactly these numbers, and applying the
 * ball to an object copies them onto that object's materials, so a brushed
 * metal texture still looks brushed on the model it lands on.
 */
export interface TextureSettings {
  /** Tint multiplied over the picture; white leaves it untouched. */
  color: string;
  roughness: number;
  metalness: number;
  /** How strongly the environment (and therefore the sun) reflects. */
  reflectivity: number;
  /** Copies of the picture per UV unit, per axis, so a stretched face can be
   * corrected without also shrinking the other direction. */
  tilingX: number;
  tilingY: number;
  /** Sliding the picture inside its tile, in UV units. */
  offsetX: number;
  offsetY: number;
  /** Turns the picture inside its tile, in degrees. */
  rotation: number;
  /** Multiplier for the normal map, so its relief can be dialled down. */
  normalStrength: number;
  /** Multiplier for a height/bump map. */
  bumpDepth: number;
  /** Multiplier for an ambient-occlusion map. */
  aoStrength: number;
  /** Alpha value below which an alpha map cuts the surface away. */
  alphaCutoff: number;
  /** Multiplier for an emissive map. */
  emissiveGlow: number;
}

/** Last surface response picked with “Apply to all textures”. */
// v2: the first defaults (0.11 / 0.05 / 0.54) were replaced by the wet-stone
// look below, so an older saved preference must not win over them.
const SURFACE_PREFERENCE_KEY = 'propeller.surface-defaults.v2';

type SurfaceDefaults = Pick<TextureSettings, 'roughness' | 'metalness' | 'reflectivity'>;

function loadSurfaceDefaults(): Partial<SurfaceDefaults> {
  try {
    const raw = window.localStorage.getItem(SURFACE_PREFERENCE_KEY);
    if (!raw) return {};
    const stored = JSON.parse(raw) as Partial<TextureSettings>;
    const bounded = (value: unknown, max: number): number | null =>
      typeof value === 'number' && Number.isFinite(value)
        ? Math.min(Math.max(value, 0), max)
        : null;
    const surface: Partial<SurfaceDefaults> = {};
    const roughness = bounded(stored.roughness, 1);
    const metalness = bounded(stored.metalness, 1);
    const reflectivity = bounded(stored.reflectivity, 3);
    if (roughness !== null) surface.roughness = roughness;
    if (metalness !== null) surface.metalness = metalness;
    if (reflectivity !== null) surface.reflectivity = reflectivity;
    return surface;
  } catch {
    return {};
  }
}

/** Remembers a surface response so later sessions start from it. */
export function saveSurfaceDefaults(surface: SurfaceDefaults): void {
  try {
    window.localStorage.setItem(SURFACE_PREFERENCE_KEY, JSON.stringify({
      roughness: surface.roughness,
      metalness: surface.metalness,
      reflectivity: surface.reflectivity,
    }));
  } catch {
    // Private browsing can refuse storage; the in-memory defaults still apply.
  }
}

export const DEFAULT_TEXTURE_SETTINGS: TextureSettings = {
  color: '#ffffff',
  // The library default: a damp, polished stone look. Every texture starts
  // here, including the PBR spheres, until its own Surface sliders move.
  roughness: 0.07,
  metalness: 0.02,
  reflectivity: 0,
  ...loadSurfaceDefaults(),
  tilingX: 1,
  tilingY: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  normalStrength: 1,
  bumpDepth: 1,
  aoStrength: 1,
  alphaCutoff: 0.5,
  emissiveGlow: 1,
};

/**
 * The extra maps a texture can carry.
 *
 * These are the same channels an object exposes, but stored on the library
 * entry: a rusted-metal texture can bring its normal, roughness and AO maps
 * with it instead of leaving the object flat-coloured.
 */
export type TextureMapKey =
  | 'normalMap'
  | 'roughnessMap'
  | 'metalnessMap'
  | 'aoMap'
  | 'emissiveMap'
  | 'alphaMap'
  | 'bumpMap';

export interface TextureMap {
  texture: THREE.Texture;
  thumbnail: string;
  name: string;
}

export interface TextureEntry {
  id: string;
  name: string;
  source: TextureSource;
  texture: THREE.Texture;
  thumbnail: string;
  resolution: string;
  settings: TextureSettings;
  maps: Partial<Record<TextureMapKey, TextureMap>>;
  /** Bumped when the picture itself is replaced, so lists redraw their swatch. */
  revision: number;
}

/** Custom event detail used when a ball is dropped on an object's texture slot. */
export interface TextureApplyDetail {
  entry: TextureEntry;
}

export interface TextureWorkspaceElements {
  canvas: HTMLCanvasElement;
  /** Scrolling viewport the canvas overlays. */
  wrap: HTMLElement;
  grid: HTMLElement;
  tabs: HTMLElement;
  addButton: HTMLButtonElement;
  addMenu: HTMLElement;
  fileInput: HTMLInputElement;
  status: HTMLElement;
  emptyHint: HTMLElement;
  /** Called whenever a texture is added, selected or re-tuned. */
  onChange?: (entries: readonly TextureEntry[], selected: TextureEntry | null) => void;
}

export interface TextureWorkspace {
  readonly entries: readonly TextureEntry[];
  readonly selected: TextureEntry | null;
  /** Redraws the previews, e.g. after the dock was hidden and shown again. */
  refresh: () => void;
  /** Selects a texture, opens its tab and scrolls its ball into view. */
  focus: (id: string) => void;
  /** Re-reads `entry.settings` into the ball after the sliders changed. */
  applySettings: (id: string) => void;
  /** Re-reads the entry's maps into the ball after one was added or removed. */
  updateEntry: (id: string) => void;
}

const acceptedImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);

/**
 * Largest picture the texture library keeps.
 *
 * This used to be 2048, so an 8K picture dragged into the PBR workspace reached
 * the scene as one sixteenth of its pixels even though the resolution chip told
 * the truth about the source file. 8192 is the WebGPU minimum limit; bigger
 * pictures are resampled down to it.
 */
export const MAX_TEXTURE_SIZE = 8192;

function makeCanvas(width: number, height = width): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Small copy of a canvas for the workspace cards, tabs and drag ghost.
 *
 * The card is around a hundred pixels wide; serialising the full 8K picture
 * into the DOM for it was both slow and a large amount of memory.
 */
function makeThumbnail(canvas: HTMLCanvasElement, max = 256): string {
  const scale = Math.min(1, max / Math.max(canvas.width, canvas.height));
  const thumb = makeCanvas(
    Math.max(1, Math.round(canvas.width * scale)),
    Math.max(1, Math.round(canvas.height * scale)),
  );
  const context = thumb.getContext('2d');
  if (!context) return canvas.toDataURL();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(canvas, 0, 0, thumb.width, thumb.height);
  return thumb.toDataURL();
}

function wrapTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 16;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The UV transform every picture in a texture set shares.
 *
 * Tiling, offset and rotation have to be written to the colour picture and to
 * every data map together; if only the colour map moved, the roughness or
 * normal relief would slide against the picture it belongs to.
 */
function applyTextureTransform(texture: THREE.Texture, settings: TextureSettings): void {
  texture.repeat.set(settings.tilingX, settings.tilingY);
  texture.offset.set(settings.offsetX, settings.offsetY);
  texture.center.set(0.5, 0.5);
  texture.rotation = THREE.MathUtils.degToRad(settings.rotation);
  // UVs live in a uniform; marking the picture dirty here re-uploaded the 8K
  // canvas and rebuilt its mip chain on every slider tick for no visual gain.
}

/** Neutral checkerboard, so a material can be judged for stretching and scale. */
function createCheckerCanvas(): HTMLCanvasElement {
  const canvas = makeCanvas(512);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not draw the checkerboard texture.');
  const cells = 8;
  const cell = canvas.width / cells;
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      context.fillStyle = (x + y) % 2 === 0 ? '#d8d8d8' : '#4a4a4a';
      context.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  context.strokeStyle = '#00000033';
  context.lineWidth = 2;
  context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  return canvas;
}

/**
 * Blueprint-style UV grid: slate checker tiles, each split by a fine sub-grid
 * and framed by a brighter major line, so stretching and tiling read clearly.
 */
function createUvGridCanvas(): HTMLCanvasElement {
  const canvas = makeCanvas(1024);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not draw the UV grid texture.');
  const tiles = 8;
  const subdivisions = 4;
  const tile = canvas.width / tiles;
  const cell = tile / subdivisions;

  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      context.fillStyle = (x + y) % 2 === 0 ? '#8e9baf' : '#7d8aa0';
      context.fillRect(x * tile, y * tile, tile, tile);
    }
  }

  // Fine sub-grid inside every tile.
  context.strokeStyle = '#a6b2c5';
  context.lineWidth = 1.5;
  context.beginPath();
  for (let i = 0; i <= tiles * subdivisions; i++) {
    if (i % subdivisions === 0) continue;
    const offset = i * cell;
    context.moveTo(offset, 0);
    context.lineTo(offset, canvas.height);
    context.moveTo(0, offset);
    context.lineTo(canvas.width, offset);
  }
  context.stroke();

  // Brighter boundaries between tiles; clipping at the edges joins into a full line when tiled.
  context.strokeStyle = '#c3ccdb';
  context.lineWidth = 3;
  context.beginPath();
  for (let i = 0; i <= tiles; i++) {
    const offset = i * tile;
    context.moveTo(offset, 0);
    context.lineTo(offset, canvas.height);
    context.moveTo(0, offset);
    context.lineTo(canvas.width, offset);
  }
  context.stroke();
  return canvas;
}

interface PreviewEnvironment {
  fromEquirectangular(texture: THREE.Texture): { texture: THREE.Texture };
}

function createPreviewEnvironment(renderer: THREE.WebGPURenderer): THREE.Texture {
  const width = 128;
  const height = 64;
  const data = new Float32Array(width * height * 4);
  const sky = [0.42, 0.46, 0.52];
  const ground = [0.05, 0.06, 0.07];
  for (let y = 0; y < height; y++) {
    const v = y / (height - 1);
    const blend = THREE.MathUtils.smoothstep(v, 0.3, 0.65);
    const r = THREE.MathUtils.lerp(ground[0], sky[0], blend);
    const g = THREE.MathUtils.lerp(ground[1], sky[1], blend);
    const b = THREE.MathUtils.lerp(ground[2], sky[2], blend);
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1);
      const key = Math.max(0, Math.cos((u - 0.28) * Math.PI * 2)) ** 6;
      const index = (y * width + x) * 4;
      data[index] = r + key * 1.6;
      data[index + 1] = g + key * 1.6;
      data[index + 2] = b + key * 1.7;
      data[index + 3] = 1;
    }
  }
  // Half float: WebGPU only guarantees filtering for half-float textures.
  const half = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i++) half[i] = THREE.DataUtils.toHalfFloat(data[i]);
  const source = new THREE.DataTexture(half, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
  source.mapping = THREE.EquirectangularReflectionMapping;
  source.colorSpace = THREE.LinearSRGBColorSpace;
  source.needsUpdate = true;
  const generator = new THREE.PMREMGenerator(renderer) as unknown as PreviewEnvironment;
  const target = generator.fromEquirectangular(source);
  source.dispose();
  return target.texture;
}

interface Ball {
  entry: TextureEntry;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
}

/** Pushes an entry's picture, maps and material response onto a preview sphere. */
function applyEntryToMaterial(material: THREE.MeshStandardMaterial, entry: TextureEntry): void {
  const settings = entry.settings;
  const mapOf = (key: TextureMapKey) => entry.maps[key]?.texture ?? null;
  material.map = entry.texture;
  material.color.set(settings.color);
  material.roughness = settings.roughness;
  material.metalness = settings.metalness;
  material.envMapIntensity = settings.reflectivity;
  material.normalMap = mapOf('normalMap');
  material.roughnessMap = mapOf('roughnessMap');
  material.metalnessMap = mapOf('metalnessMap');
  material.aoMap = mapOf('aoMap');
  material.emissiveMap = mapOf('emissiveMap');
  material.emissive.set(entry.maps.emissiveMap ? 0xffffff : 0x000000);
  material.alphaMap = mapOf('alphaMap');
  material.alphaTest = entry.maps.alphaMap ? settings.alphaCutoff : 0;
  material.bumpMap = mapOf('bumpMap');
  // Map response: a normal map's own strength and a bump map's depth are
  // separate from the material's roughness, so they get their own settings
  // instead of being stuck at three's defaults.
  material.normalScale.set(settings.normalStrength, settings.normalStrength);
  material.bumpScale = settings.bumpDepth;
  material.aoMapIntensity = settings.aoStrength;
  material.emissiveIntensity = settings.emissiveGlow;
  material.needsUpdate = true;
  // Tiling/offset/rotation are properties of the texture set; every map in it
  // follows the same UV transform as the colour picture.
  for (const map of [entry.texture, ...Object.values(entry.maps).map((item) => item.texture)]) {
    applyTextureTransform(map, settings);
  }
}

/**
 * The PBR workspace.
 *
 * A flat grid of material thumbnails, like a material browser: one card per
 * texture, each showing the texture on a lit sphere with its name underneath.
 * One renderer draws every card by scissoring its viewport to the card's rect,
 * so a dozen thumbnails still cost a single GPU view.
 *
 * Right-holding a ball turns it to inspect the texture, left-dragging carries it
 * out to an object's texture slot, and clicking opens its tab.
 */
export async function createTextureWorkspace(
  elements: TextureWorkspaceElements,
): Promise<TextureWorkspace> {
  const { canvas, wrap, grid, tabs, addButton, addMenu, fileInput, status, emptyHint } = elements;
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: true });
  await renderer.init();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const previewScene = new THREE.Scene();
  previewScene.environment = createPreviewEnvironment(renderer);
  previewScene.environmentIntensity = 1;

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 40);
  camera.position.set(0, 0, 3.6);

  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(2.4, 3, 4);
  previewScene.add(key);
  const rim = new THREE.DirectionalLight(0xbfd0e2, 0.28);
  rim.position.set(-3, -1, 4);
  previewScene.add(rim);

  const sphereGeometry = new THREE.SphereGeometry(1, 64, 48);
  // AO and light maps sample the second UV set; mirroring the first keeps them
  // on the sphere instead of sampling an attribute it does not have.
  sphereGeometry.setAttribute('uv1', sphereGeometry.getAttribute('uv'));
  const entries: TextureEntry[] = [];
  const balls = new Map<string, Ball>();
  const tiles = new Map<string, HTMLDivElement>();
  const openTabs = new Set<string>();
  let selectedId: string | null = null;
  let counter = 0;
  let queued = false;

  /**
   * Keeps the cards small enough for the dock.
   *
   * The cards used to be a fixed 104–112 px tall. In a short dock a card was
   * taller than the visible area, so its sphere was cut off by the panel edge —
   * the “sphere clips through the UI” report. Sizing the grid from the visible
   * height means the whole ball shrinks with the dock instead of being cropped.
   */
  const syncCardSize = () => {
    const available = wrap.clientHeight - 4;
    // A very short dock hides the name under each ball instead of squeezing the
    // preview, so the sphere can keep a usable size without being cropped.
    const compact = available < 74;
    grid.classList.toggle('is-compact', compact);
    const usable = compact ? available - 6 : available - 22;
    const size = Math.round(THREE.MathUtils.clamp(Math.min(112, usable), 32, 112));
    grid.style.setProperty('--texture-tile-size', `${size}px`);
  };

  let lastLayoutKey = '';
  const layoutKey = () =>
    `${canvas.clientWidth}x${canvas.clientHeight}|${wrap.clientWidth}x${wrap.clientHeight}|${wrap.scrollLeft},${wrap.scrollTop}|${grid.clientHeight}`;
  const draw = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      renderTiles();
      lastLayoutKey = layoutKey();
    });
  };

  /**
   * Places the camera so the whole sphere is visible in a card of this aspect.
   *
   * The distance is derived from the vertical field of view instead of being
   * fixed: at a fixed distance the ball overflowed the top and bottom of a wide
   * card, which read as the preview being cut off by a box.
   */
  const fitCamera = (aspect: number): void => {
    const halfFov = THREE.MathUtils.degToRad(camera.fov) * 0.5;
    const fitRadius = 1.16;
    camera.aspect = Math.max(0.05, aspect);
    camera.position.set(0, 0, fitRadius / Math.tan(halfFov) / Math.min(1, camera.aspect));
    camera.lookAt(0, 0, 0);
  };

  /**
   * Draws one sphere per visible card.
   *
   * The canvas only covers the visible workspace, so cards are clipped to that
   * rectangle. `setViewOffset` then renders the card's full projection into the
   * clipped sub-rect, letting a half-scrolled card still line up with its tile
   * instead of being squashed. `setViewport`/`setScissor` take logical (CSS)
   * pixels with the origin at the bottom-left and scale by the pixel ratio
   * themselves.
   */
  const renderTiles = () => {
    syncCardSize();
    const width = Math.max(1, Math.round(canvas.clientWidth));
    const height = Math.max(1, Math.round(canvas.clientHeight));
    if (canvas.width !== Math.round(width * renderer.getPixelRatio())
      || canvas.height !== Math.round(height * renderer.getPixelRatio())) {
      renderer.setSize(width, height, false);
    }
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
    renderer.clear();
    renderer.setScissorTest(true);

    const canvasBounds = canvas.getBoundingClientRect();
    const viewportBounds = wrap.getBoundingClientRect();
    for (const [id, ball] of balls) {
      const card = tiles.get(id)?.querySelector<HTMLElement>('.texture-tile-view');
      if (!card) continue;
      const bounds = card.getBoundingClientRect();
      if (bounds.width < 2 || bounds.height < 2) continue;
      const clipLeft = Math.max(bounds.left, viewportBounds.left);
      const clipRight = Math.min(bounds.right, viewportBounds.right);
      const clipTop = Math.max(bounds.top, viewportBounds.top);
      const clipBottom = Math.min(bounds.bottom, viewportBounds.bottom);
      const clipWidth = clipRight - clipLeft;
      const clipHeight = clipBottom - clipTop;
      if (clipWidth < 2 || clipHeight < 2) continue;
      // Only draw a ball when its whole card is visible. A scissored ball used
      // to show as a sphere sliced flat at the panel edge; an empty circle that
      // scrolls into view is cleaner than a half sphere hanging in the UI.
      const fullyVisible = clipLeft <= bounds.left + 0.5 && clipRight >= bounds.right - 0.5
        && clipTop <= bounds.top + 0.5 && clipBottom >= bounds.bottom - 0.5;
      if (!fullyVisible) continue;
      const x = clipLeft - canvasBounds.left;
      // The WebGPU canvas rect is measured from its top-left corner, matching
      // `setViewOffset`'s offset. (Flip this and a card near the bottom of the
      // dock renders its sphere at the top of the canvas.)
      const y = clipTop - canvasBounds.top;
      fitCamera(bounds.width / bounds.height);
      camera.setViewOffset(
        bounds.width,
        bounds.height,
        clipLeft - bounds.left,
        clipTop - bounds.top,
        clipWidth,
        clipHeight,
      );
      renderer.setViewport(x, y, clipWidth, clipHeight);
      renderer.setScissor(x, y, clipWidth, clipHeight);
      balls.forEach((other) => { other.mesh.visible = other === ball; });
      renderer.render(previewScene, camera);
    }
    camera.clearViewOffset();
    renderer.setScissorTest(false);
  };

  const renderTabs = () => {
    tabs.replaceChildren();
    const open = entries.filter((entry) => openTabs.has(entry.id));
    tabs.hidden = open.length === 0;
    open.forEach((entry) => {
      const tab = document.createElement('div');
      tab.className = 'workspace-tab';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(entry.id === selectedId));
      tab.tabIndex = 0;

      const thumbnail = document.createElement('img');
      thumbnail.src = entry.thumbnail;
      thumbnail.alt = '';
      const name = document.createElement('span');
      name.className = 'workspace-tab-name';
      name.textContent = entry.name;
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'workspace-tab-close';
      close.textContent = '×';
      close.setAttribute('aria-label', `Close ${entry.name} tab`);
      close.addEventListener('pointerdown', (event) => event.stopPropagation());
      close.addEventListener('click', (event) => {
        event.stopPropagation();
        openTabs.delete(entry.id);
        if (selectedId === entry.id) selectedId = null;
        selectTexture(null);
      });

      tab.append(thumbnail, name, close);
      tab.addEventListener('click', () => openTab(entry.id));
      tab.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openTab(entry.id);
      });
      tabs.appendChild(tab);
    });
  };

  const applySelectionStyles = () => {
    tiles.forEach((tile, id) => {
      tile.classList.toggle('selected', id === selectedId);
      tile.setAttribute('aria-selected', String(id === selectedId));
    });
    status.textContent = entries.find((entry) => entry.id === selectedId)?.name ?? 'No texture selected';
    emptyHint.hidden = entries.length > 0;
  };

  const notify = () => {
    elements.onChange?.(entries, entries.find((entry) => entry.id === selectedId) ?? null);
  };

  const selectTexture = (id: string | null) => {
    selectedId = id;
    renderTabs();
    applySelectionStyles();
    notify();
  };

  const openTab = (id: string) => {
    openTabs.add(id);
    selectTexture(id);
  };

  const addTile = (entry: TextureEntry) => {
    const tile = document.createElement('div');
    tile.className = 'texture-tile';
    tile.dataset.textureId = entry.id;
    tile.tabIndex = 0;
    tile.setAttribute('role', 'option');
    tile.setAttribute('aria-selected', 'false');
    tile.title = `${entry.name} — right-drag to turn, drag onto a texture slot to apply`;

    const view = document.createElement('span');
    view.className = 'texture-tile-view';
    const label = document.createElement('span');
    label.className = 'texture-tile-label';
    const dot = document.createElement('span');
    dot.className = 'texture-tile-dot';
    const name = document.createElement('span');
    name.className = 'texture-tile-name';
    name.textContent = entry.name;
    label.append(dot, name);
    tile.append(view, label);

    tile.addEventListener('contextmenu', (event) => event.preventDefault());
    tile.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openTab(entry.id);
    });

    tiles.set(entry.id, tile);
    grid.appendChild(tile);
  };

  const applySettingsToBall = (ball: Ball) => {
    applyEntryToMaterial(ball.material, ball.entry);
  };

  const addEntry = (
    entry: Omit<TextureEntry, 'id' | 'settings' | 'maps' | 'revision'> & { settings?: TextureSettings; maps?: TextureEntry['maps'] },
  ): TextureEntry => {
    counter += 1;
    const sameName = entries.filter((item) => item.name === entry.name).length;
    const created: TextureEntry = {
      ...entry,
      name: sameName === 0 ? entry.name : `${entry.name} ${sameName + 1}`,
      id: `texture-${counter}`,
      settings: { ...DEFAULT_TEXTURE_SETTINGS, ...entry.settings },
      maps: entry.maps ?? {},
      revision: 0,
    };
    entries.push(created);
    const material = new THREE.MeshStandardMaterial({
      map: created.texture,
      roughness: created.settings.roughness,
      metalness: created.settings.metalness,
    });
    // Own the environment so `envMapIntensity` (the Reflectance slider) is read.
    // With only `scene.environment`, three uses `scene.environmentIntensity`
    // instead and the ball never changed when Reflectance moved.
    material.envMap = previewScene.environment;
    const mesh = new THREE.Mesh(sphereGeometry, material);
    mesh.visible = false;
    previewScene.add(mesh);
    const ball: Ball = { entry: created, mesh, material };
    balls.set(created.id, ball);
    applySettingsToBall(ball);
    addTile(created);
    openTabs.add(created.id);
    selectedId = created.id;
    renderTabs();
    applySelectionStyles();
    draw();
    notify();
    return created;
  };

  const describe = (name: string): string => {
    const trimmed = name.replace(/\.[^.]+$/, '').trim();
    return trimmed.length > 0 ? trimmed : 'Texture';
  };

  const addFromFile = async (file: File): Promise<void> => {
    if (!acceptedImageTypes.has(file.type)) {
      throw new Error('Choose a PNG, JPEG, WebP, or AVIF image.');
    }
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, MAX_TEXTURE_SIZE / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const bitmapCanvas = makeCanvas(width, height);
      const context = bitmapCanvas.getContext('2d');
      if (!context) throw new Error('Could not prepare the texture.');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(bitmap, 0, 0, width, height);
      addEntry({
        name: describe(file.name),
        source: 'file',
        texture: wrapTexture(bitmapCanvas),
        thumbnail: makeThumbnail(bitmapCanvas),
        // Report what was actually kept, not the source size: the old chip said
        // 8192 × 8192 while the GPU held 2048 × 2048.
        resolution: `${width} × ${height}`,
      });
    } finally {
      bitmap.close();
    }
  };

  const addGenerated = (source: 'checker' | 'uvGrid') => {
    const generated = source === 'checker' ? createCheckerCanvas() : createUvGridCanvas();
    addEntry({
      name: source === 'checker' ? 'Checkerboard' : 'UV Grid',
      source,
      texture: wrapTexture(generated),
      thumbnail: makeThumbnail(generated),
      resolution: `${generated.width} × ${generated.height}`,
    });
  };

  // --- Add menu -----------------------------------------------------------
  const setAddMenuOpen = (open: boolean) => {
    addMenu.hidden = !open;
    addButton.setAttribute('aria-expanded', String(open));
  };
  addButton.addEventListener('click', () => setAddMenuOpen(addMenu.hidden));
  addMenu.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button) return;
    setAddMenuOpen(false);
    const source = button.dataset.textureSource;
    if (source === 'file') {
      fileInput.click();
    } else if (source === 'checker' || source === 'uvGrid') {
      addGenerated(source);
    }
  });
  const importFiles = async (files: readonly File[]): Promise<void> => {
    for (const file of files) {
      try {
        await addFromFile(file);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addButton.title = `Could not load ${file.name}: ${message}`;
      }
    }
  };
  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files ?? []);
    fileInput.value = '';
    await importFiles(files);
  });

  // A whole folder of pictures can be dragged straight into the workspace;
  // each image becomes its own ball and tab, so a material set can be brought
  // in without opening the add menu for every file.
  wrap.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    wrap.classList.add('is-file-dragover');
  });
  wrap.addEventListener('dragleave', (event) => {
    if (event.target !== wrap) return;
    wrap.classList.remove('is-file-dragover');
  });
  wrap.addEventListener('drop', async (event) => {
    const files = Array.from(event.dataTransfer?.files ?? []);
    wrap.classList.remove('is-file-dragover');
    if (files.length === 0) return;
    event.preventDefault();
    await importFiles(files);
  });
  document.addEventListener('pointerdown', (event) => {
    if (addMenu.hidden) return;
    const target = event.target as Node;
    if (addMenu.contains(target) || addButton.contains(target)) return;
    setAddMenuOpen(false);
  });

  // --- Card interaction ---------------------------------------------------
  let dragGhost: HTMLDivElement | null = null;
  let hoveredSlot: HTMLElement | null = null;
  let active: { ball: Ball; mode: 'spin' | 'carry'; moved: boolean; startX: number; startY: number } | null = null;

  const slotAt = (clientX: number, clientY: number): HTMLElement | null => {
    const element = document.elementFromPoint(clientX, clientY);
    return element?.closest<HTMLElement>('[data-texture-slot]') ?? null;
  };

  const beginCarry = (ball: Ball) => {
    dragGhost = document.createElement('div');
    dragGhost.className = 'texture-drag-ghost';
    dragGhost.style.backgroundImage = `url(${ball.entry.thumbnail})`;
    document.body.appendChild(dragGhost);
    document.body.classList.add('carrying-texture');
  };

  const moveGhost = (x: number, y: number) => {
    if (!dragGhost) return;
    dragGhost.style.left = `${x}px`;
    dragGhost.style.top = `${y}px`;
    const slot = slotAt(x, y);
    if (slot !== hoveredSlot) {
      hoveredSlot?.classList.remove('drag-over');
      hoveredSlot = slot;
      hoveredSlot?.classList.add('drag-over');
    }
  };

  const finishCarry = (event: PointerEvent, ball: Ball) => {
    if (dragGhost) {
      dragGhost.remove();
      dragGhost = null;
    }
    document.body.classList.remove('carrying-texture');
    if (hoveredSlot) {
      hoveredSlot.classList.remove('drag-over');
      hoveredSlot = null;
    }
    const slot = slotAt(event.clientX, event.clientY);
    if (slot) {
      slot.dispatchEvent(new CustomEvent<TextureApplyDetail>('textureapply', {
        detail: { entry: ball.entry },
        bubbles: true,
      }));
    }
  };

  const endDrag = (event: PointerEvent) => {
    if (!active) return;
    const { ball, mode, moved } = active;
    if (mode === 'carry') {
      finishCarry(event, ball);
      if (!moved) openTab(ball.entry.id);
    } else if (!moved) {
      openTab(ball.entry.id);
    }
    active = null;
    document.body.classList.remove('turning-texture');
    try {
      if (grid.hasPointerCapture(event.pointerId)) grid.releasePointerCapture(event.pointerId);
    } catch {
      // Best effort only.
    }
  };

  /** Ends a turn or carry without applying anything, e.g. after losing focus. */
  const abortDrag = () => {
    if (!active) return;
    active = null;
    document.body.classList.remove('turning-texture');
    document.body.classList.remove('carrying-texture');
    dragGhost?.remove();
    dragGhost = null;
    if (hoveredSlot) {
      hoveredSlot.classList.remove('drag-over');
      hoveredSlot = null;
    }
  };

  grid.addEventListener('pointerdown', (event) => {
    const tile = (event.target as HTMLElement).closest<HTMLElement>('.texture-tile');
    const id = tile?.dataset.textureId;
    if (!id) return;
    const ball = balls.get(id);
    if (!ball) return;
    event.preventDefault();
    try {
      grid.setPointerCapture(event.pointerId);
    } catch {
      // Best effort only.
    }
    const mode = event.button === 2 ? 'spin' : 'carry';
    active = { ball, mode, moved: false, startX: event.clientX, startY: event.clientY };
    if (mode === 'carry') {
      beginCarry(ball);
      moveGhost(event.clientX, event.clientY);
    } else {
      document.body.classList.add('turning-texture');
    }
  });

  grid.addEventListener('pointermove', (event) => {
    if (!active) return;
    if (Math.hypot(event.clientX - active.startX, event.clientY - active.startY) > 3) {
      active.moved = true;
    }
    if (active.mode === 'carry') {
      moveGhost(event.clientX, event.clientY);
      return;
    }
    active.ball.mesh.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), (event.movementX || 0) * 0.012);
    active.ball.mesh.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), (event.movementY || 0) * 0.012);
    draw();
  });

  grid.addEventListener('pointerup', endDrag);
  grid.addEventListener('pointercancel', endDrag);
  document.addEventListener('pointermove', (event) => {
    if (dragGhost) moveGhost(event.clientX, event.clientY);
  });
  document.addEventListener('pointerup', (event) => {
    if (active?.mode === 'carry') endDrag(event);
  });
  // Right-holding a ball hides the cursor and turns the ball wherever the
  // pointer goes. A release outside the dock, an alt-tab or a lost capture must
  // still end it, otherwise the workspace stays grabbed with no cursor.
  window.addEventListener('pointerup', (event) => {
    if (active) endDrag(event);
  }, true);
  window.addEventListener('pointercancel', () => abortDrag(), true);
  window.addEventListener('blur', () => abortDrag());
  grid.addEventListener('lostpointercapture', () => abortDrag());

  // The canvas is a fixed overlay rather than part of the scrolling grid, so
  // scrolling, resizing the dock and opening tabs all have to redraw it. A
  // resize observer alone could miss a layout that moved cards without resizing
  // the wrap, so a cheap per-frame layout check also redraws when the size,
  // scroll offset or content height changed.
  wrap.addEventListener('scroll', () => draw(), { passive: true });
  new ResizeObserver(() => {
    syncCardSize();
    draw();
  }).observe(wrap);
  new ResizeObserver(() => draw()).observe(grid);
  syncCardSize();
  const watchLayout = () => {
    const key = layoutKey();
    if (key !== lastLayoutKey) {
      lastLayoutKey = key;
      syncCardSize();
      renderTiles();
    }
    requestAnimationFrame(watchLayout);
  };
  draw();
  requestAnimationFrame(watchLayout);
  applySelectionStyles();
  renderTabs();

  const focus = (id: string) => {
    if (!balls.has(id)) return;
    openTab(id);
    const tile = tiles.get(id);
    if (tile) {
      // Scroll the grid, not the document: the dock is the only scrolling
      // ancestor a card should move inside of.
      const tileTop = tile.offsetTop - 2;
      const tileBottom = tileTop + tile.offsetHeight;
      if (tileTop < wrap.scrollTop) wrap.scrollTop = tileTop;
      else if (tileBottom > wrap.scrollTop + wrap.clientHeight) {
        wrap.scrollTop = tileBottom - wrap.clientHeight;
      }
    }
    draw();
  };

  return {
    entries,
    get selected() {
      return entries.find((entry) => entry.id === selectedId) ?? null;
    },
    refresh: () => {
      syncCardSize();
      lastLayoutKey = layoutKey();
      renderTiles();
    },
    focus,
    applySettings: (id: string) => {
      const ball = balls.get(id);
      if (!ball) return;
      applySettingsToBall(ball);
      draw();
      notify();
    },
    updateEntry: (id: string) => {
      const ball = balls.get(id);
      if (!ball) return;
      applySettingsToBall(ball);
      draw();
      notify();
    },
  };
}

/** The large ball shown at the top of a texture's configuration. */
export interface TexturePreview {
  readonly canvas: HTMLCanvasElement;
  setEntry: (entry: TextureEntry) => void;
  dispose: () => void;
}

/**
 * A single rotatable ball for the Configurations panel.
 *
 * It draws on demand instead of in an animation loop: a still preview costs one
 * frame, and only a drag asks for more. Right- or left-dragging turns the ball,
 * so the texture can be inspected from any side without moving the object it is
 * applied to.
 */
export async function createTexturePreview(): Promise<TexturePreview> {
  const canvas = document.createElement('canvas');
  canvas.className = 'texture-preview-canvas';

  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: true });
  await renderer.init();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.environment = createPreviewEnvironment(renderer);
  scene.environmentIntensity = 1;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
  camera.position.set(0, 0, 3.6);
  camera.lookAt(0, 0, 0);

  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(2.4, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfd0e2, 0.35);
  rim.position.set(-3, -1, 4);
  scene.add(rim);

  const material = new THREE.MeshStandardMaterial({
    color: DEFAULT_TEXTURE_SETTINGS.color,
    roughness: DEFAULT_TEXTURE_SETTINGS.roughness,
    metalness: DEFAULT_TEXTURE_SETTINGS.metalness,
  });
  // Per-material environment, so Reflectance actually drives the ball.
  material.envMap = scene.environment;
  const previewGeometry = new THREE.SphereGeometry(1, 64, 48);
  previewGeometry.setAttribute('uv1', previewGeometry.getAttribute('uv'));
  const sphere = new THREE.Mesh(previewGeometry, material);
  scene.add(sphere);

  const fit = (): void => {
    const width = Math.max(1, Math.round(canvas.clientWidth));
    const height = Math.max(1, Math.round(canvas.clientHeight));
    if (width < 2 || height < 2) return;
    if (canvas.width !== Math.round(width * renderer.getPixelRatio())
      || canvas.height !== Math.round(height * renderer.getPixelRatio())) {
      renderer.setSize(width, height, false);
    }
    const aspect = width / height;
    camera.aspect = aspect;
    const halfFov = THREE.MathUtils.degToRad(camera.fov) * 0.5;
    camera.position.set(0, 0, 1.14 / Math.tan(halfFov) / Math.min(1, aspect));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  };

  const render = (): void => {
    fit();
    renderer.render(scene, camera);
  };

  let turning = false;
  let lastX = 0;
  let lastY = 0;
  const stopTurning = (): void => {
    turning = false;
    canvas.parentElement?.classList.remove('turning');
    document.body.classList.remove('turning-texture');
  };
  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    turning = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.parentElement?.classList.add('turning');
    document.body.classList.add('turning-texture');
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Best effort only.
    }
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!turning) return;
    const deltaX = event.clientX - lastX;
    const deltaY = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    sphere.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), deltaX * 0.01);
    sphere.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), deltaY * 0.01);
    render();
  });
  canvas.addEventListener('pointerup', stopTurning);
  canvas.addEventListener('pointercancel', stopTurning);
  canvas.addEventListener('lostpointercapture', stopTurning);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  const observer = new ResizeObserver(() => render());
  observer.observe(canvas);

  return {
    canvas,
    setEntry: (entry: TextureEntry) => {
      applyEntryToMaterial(material, entry);
      render();
    },
    dispose: () => {
      observer.disconnect();
      material.dispose();
      sphere.geometry.dispose();
      scene.environment?.dispose();
      renderer.dispose();
    },
  };
}
