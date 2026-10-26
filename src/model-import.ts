import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** One row in the imported file's contents tree. */
export interface ImportedContentNode {
  name: string;
  kind: 'file' | 'node' | 'mesh' | 'material' | 'texture';
  detail?: string;
  children: ImportedContentNode[];
  /** Piece indices (into the model's piece list) contained in this node. */
  pieces?: number[];
}

/** One geometry chunk of a merged file, in merged-geometry vertex coordinates. */
export interface ImportedPieceRange {
  start: number;
  count: number;
  /** Material slot in the object's material array when the model was built. */
  material: number;
}

/** A texture slot the file references but whose picture never arrived. */
export interface ImportedMissingTexture {
  materialIndex: number;
  slot: string;
  label: string;
  name: string;
}

/**
 * A model file flattened into one renderable mesh.
 *
 * Every mesh in the file is baked into world space and merged, but the file's
 * materials are kept: the merged geometry carries one group per source part, and
 * `materials` holds a converted standard material for each group. That is what
 * lets an embedded texture (GLB, FBX…) show up on the imported block and gives
 * the contents view something meaningful to list.
 */
export interface ImportedModel {
  geometry: THREE.BufferGeometry;
  materials: THREE.MeshStandardMaterial[];
  name: string;
  triangles: number;
  contents: ImportedContentNode;
  textureCount: number;
  /** True when the file brought its own UVs, instead of the importer filling zeros. */
  hasUVs: boolean;
  /** Ranges of each merged piece, so the file tree can be split into objects. */
  pieces: ImportedPieceRange[];
  /** Referenced maps with no decoded picture (external files not selected). */
  missingTextures: ImportedMissingTexture[];
}

/** Longest side of a freshly imported model, in scene units (a cube is 1). */
const IMPORT_SIZE = 1.6;

const supportedExtension = /\.(glb|gltf|obj|fbx|stl|ply|3ds|dae)$/i;

/** Attributes every merged piece carries, so unrelated meshes can be joined. */
const MERGE_ATTRIBUTES = ['position', 'normal', 'uv'] as const;

const TEXTURE_SLOTS: Array<[label: string, key: string]> = [
  ['Map', 'map'],
  ['Normal', 'normalMap'],
  ['Roughness', 'roughnessMap'],
  ['Metalness', 'metalnessMap'],
  ['AO', 'aoMap'],
  ['Emissive', 'emissiveMap'],
  ['Alpha', 'alphaMap'],
  ['Bump', 'bumpMap'],
];

export function isSupportedModelFile(file: File): boolean {
  return supportedExtension.test(file.name);
}

/**
 * Maps the file names a loader asks for onto the extra files picked alongside the
 * model, so OBJ/FBX/DAE files that reference external images can find them.
 *
 * The URLs are revoked after a delay: FBX starts its texture loads in parallel
 * and may still be decoding them after the model promise resolves.
 */
function createResourceManager(resources: readonly File[]): {
  manager: THREE.LoadingManager;
  release: () => void;
  /** Settles once the texture requests started by the loaders have finished. */
  whenTexturesSettled: () => Promise<void>;
} {
  const urls = new Map<string, string>();
  const created: string[] = [];
  for (const resource of resources) {
    const url = URL.createObjectURL(resource);
    created.push(url);
    const name = resource.name.toLowerCase();
    urls.set(name, url);
    urls.set(name.replace(/\.[^.]+$/, ''), url);
  }
  const manager = new THREE.LoadingManager();

  // FBX, DAE and 3DS start their image loads while parsing and resolve the model
  // before those images decode, so their maps are attached to the materials
  // later. Track their requests: without waiting for them the conversion below
  // would copy materials that have no map yet and the file would import grey.
  let pendingItems = 0;
  const idleWaiters = new Set<() => void>();
  const startItem = manager.itemStart;
  const endItem = manager.itemEnd;
  manager.itemStart = (url: string) => {
    pendingItems += 1;
    startItem(url);
  };
  manager.itemEnd = (url: string) => {
    endItem(url);
    pendingItems = Math.max(0, pendingItems - 1);
    if (pendingItems === 0) for (const waiter of [...idleWaiters]) waiter();
  };
  const whenTexturesSettled = (): Promise<void> => {
    // The model file itself has finished by now, so anything still pending is a
    // texture; a missing image resolves too (as an error), so this cannot hang.
    if (pendingItems === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        idleWaiters.delete(finish);
        resolve();
      };
      // A loader that never calls itemEnd (a JSON parse failure, say) must not
      // keep the import waiting forever.
      const timeout = window.setTimeout(finish, 8000);
      idleWaiters.add(finish);
    });
  };

  manager.setURLModifier((url) => {
    let path = url;
    const query = path.indexOf('?');
    if (query >= 0) path = path.slice(0, query);
    const hash = path.indexOf('#');
    if (hash >= 0) path = path.slice(0, hash);
    // Models exported on Windows can reference `textures\\base_color.png`.
    const name = decodeURIComponent(path.split(/[\\/]/).pop() ?? '').toLowerCase();
    if (!name) return url;
    return urls.get(name) ?? urls.get(name.replace(/\.[^.]+$/, '')) ?? url;
  });
  return {
    manager,
    whenTexturesSettled,
    release: () => {
      window.setTimeout(() => created.forEach((url) => URL.revokeObjectURL(url)), 30_000);
    },
  };
}

/**
 * Teaches the manager's image loaders about TGA files.
 *
 * FBX packs frequently embed TGA images, and FBXLoader hands `.tga` textures to
 * whatever handler the manager has registered. Without this the browser tried
 * to decode the raw TGA bytes as a PNG/JPEG and the material imported without a
 * map. OBJ materials load their `.tga` maps through the same handler lookup.
 */
async function registerImageHandlers(
  manager: THREE.LoadingManager,
  file: File,
  resources: readonly File[],
): Promise<void> {
  const tgaPossible = /\.(fbx|obj|3ds)$/i.test(file.name)
    || resources.some((resource) => /\.(tga|targa)$/i.test(resource.name));
  if (!tgaPossible) return;
  const { TGALoader } = await import('three/addons/loaders/TGALoader.js');
  manager.addHandler(/\.(tga|targa)$/i, new TGALoader(manager));
}

/** Loads the file and returns the scene/geometry the format's loader produced. */
async function readModel(
  file: File,
  resources: readonly File[],
  manager: THREE.LoadingManager,
): Promise<THREE.Object3D> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const url = URL.createObjectURL(file);
  try {
    switch (extension) {
      case 'glb':
      case 'gltf': {
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        const gltf = await new GLTFLoader(manager).loadAsync(url);
        return gltf.scene;
      }
      case 'obj': {
        const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js');
        const loader = new OBJLoader(manager);
        const materialFile = resources.find((resource) => /\.mtl$/i.test(resource.name));
        if (materialFile) {
          const { MTLLoader } = await import('three/addons/loaders/MTLLoader.js');
          const materialUrl = URL.createObjectURL(materialFile);
          try {
            const materials = await new MTLLoader(manager).loadAsync(materialUrl);
            materials.preload();
            loader.setMaterials(materials);
          } catch {
            // A broken .mtl should not prevent the geometry from importing.
          } finally {
            URL.revokeObjectURL(materialUrl);
          }
        }
        return await loader.loadAsync(url);
      }
      case 'fbx': {
        const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
        return await new FBXLoader(manager).loadAsync(url);
      }
      case 'stl': {
        const { STLLoader } = await import('three/addons/loaders/STLLoader.js');
        const geometry = await new STLLoader().loadAsync(url);
        return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
      }
      case 'ply': {
        const { PLYLoader } = await import('three/addons/loaders/PLYLoader.js');
        const geometry = await new PLYLoader().loadAsync(url);
        return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
      }
      case '3ds': {
        const { TDSLoader } = await import('three/addons/loaders/TDSLoader.js');
        return await new TDSLoader(manager).loadAsync(url);
      }
      case 'dae': {
        const { ColladaLoader } = await import('three/addons/loaders/ColladaLoader.js');
        const collada = await new ColladaLoader(manager).loadAsync(url);
        return collada.scene;
      }
      default:
        throw new Error('Choose a glTF/GLB, OBJ, FBX, STL, PLY, 3DS, or DAE file.');
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

/** True when a texture has decoded pixels, not just a name from the file. */
function textureHasImage(texture: THREE.Texture): boolean {
  const image = texture.image as { width?: number; height?: number } | null | undefined;
  return !!image && (image.width ?? 0) > 0 && (image.height ?? 0) > 0;
}

/**
 * True when a texture carries an actual colour picture.
 *
 * Some FBX/DAE exporters connect a foliage atlas to `TransparentColor` only
 * and leave `DiffuseColor` empty. The atlas is still the tree's visible texture,
 * so a colour-bearing alpha map is used as the base colour too. A pure black /
 * white cutout mask has no colour variation and is left as a mask only.
 */
function textureHasColorDetail(texture: THREE.Texture): boolean {
  const image = texture.image as {
    data?: unknown;
    width?: number;
    height?: number;
  } | HTMLImageElement | ImageBitmap | HTMLCanvasElement | null | undefined;
  if (!image) return false;
  const width = image instanceof HTMLImageElement ? image.naturalWidth : (image as { width?: number }).width ?? 0;
  const height = image instanceof HTMLImageElement ? image.naturalHeight : (image as { height?: number }).height ?? 0;
  if (width <= 0 || height <= 0) return false;

  let pixels: Uint8Array | Uint8ClampedArray | null = null;
  const raw = (image as { data?: unknown }).data;
  if (raw instanceof Uint8Array && raw.length >= width * height * 4) {
    pixels = raw;
  } else if (image instanceof HTMLImageElement || image instanceof ImageBitmap || image instanceof HTMLCanvasElement) {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return false;
    try {
      context.drawImage(image, 0, 0, 32, 32);
      pixels = context.getImageData(0, 0, 32, 32).data;
    } catch {
      return false;
    }
  }
  if (!pixels) return false;
  const count = Math.min(width * height, 32 * 32);
  for (let index = 0; index < count; index++) {
    const offset = index * 4;
    if (pixels[offset + 3] < 16) continue;
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    if (Math.max(red, green, blue) - Math.min(red, green, blue) > 24) return true;
  }
  return false;
}

/**
 * Prepares a separate alpha image as a cutout mask.
 *
 * three samples the green channel of an alpha map. A grayscale mask works as
 * it is; a mask stored only in the image's alpha channel (RGB often black) is
 * baked into a grayscale canvas, because sampling the untouched image would give
 * zero and hide the whole object. A mask with no usable contrast is dropped and
 * the caller falls back to the base-colour map's alpha.
 */
export function buildAlphaMask(source: THREE.Texture): THREE.Texture | null {
  const image = source.image as
    | { data?: unknown; width?: number; height?: number }
    | HTMLImageElement
    | ImageBitmap
    | HTMLCanvasElement
    | null
    | undefined;
  if (!image) return null;
  const width = image instanceof HTMLImageElement
    ? image.naturalWidth
    : (image as { width?: number }).width ?? 0;
  const height = image instanceof HTMLImageElement
    ? image.naturalHeight
    : (image as { height?: number }).height ?? 0;
  if (width <= 0 || height <= 0) return null;

  let pixels: Uint8Array | Uint8ClampedArray | null = null;
  let maskWidth = width;
  let maskHeight = height;
  const raw = (image as { data?: unknown }).data;
  if (raw instanceof Uint8Array && raw.length >= width * height * 4) {
    pixels = raw;
  } else if (image instanceof HTMLImageElement || image instanceof ImageBitmap || image instanceof HTMLCanvasElement) {
    // Sample a small copy rather than reading a full 4K mask pixel by pixel.
    const scale = Math.min(1, 256 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    try {
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      maskWidth = canvas.width;
      maskHeight = canvas.height;
    } catch {
      return null;
    }
  }
  if (!pixels) return null;

  const count = maskWidth * maskHeight;
  let greenMin = 255;
  let greenMax = 0;
  let alphaMin = 255;
  let alphaMax = 0;
  const step = Math.max(1, Math.floor(count / 4096));
  for (let index = 0; index < count; index += step) {
    const green = pixels[index * 4 + 1];
    const alpha = pixels[index * 4 + 3];
    if (green < greenMin) greenMin = green;
    if (green > greenMax) greenMax = green;
    if (alpha < alphaMin) alphaMin = alpha;
    if (alpha > alphaMax) alphaMax = alpha;
  }
  const greenRange = greenMax - greenMin;
  const alphaRange = alphaMax - alphaMin;
  // A normal grayscale mask already has the mask in its RGB channels.
  if (greenRange > 8) return source;
  if (alphaRange <= 8) return null;

  const canvas = document.createElement('canvas');
  canvas.width = maskWidth;
  canvas.height = maskHeight;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const mask = context.createImageData(maskWidth, maskHeight);
  for (let index = 0; index < count; index++) {
    const alpha = pixels[index * 4 + 3];
    mask.data[index * 4] = alpha;
    mask.data[index * 4 + 1] = alpha;
    mask.data[index * 4 + 2] = alpha;
    mask.data[index * 4 + 3] = 255;
  }
  context.putImageData(mask, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = source.flipY;
  texture.wrapS = source.wrapS;
  texture.wrapT = source.wrapT;
  texture.repeat.copy(source.repeat);
  texture.offset.copy(source.offset);
  texture.rotation = source.rotation;
  texture.center.copy(source.center);
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Converts whatever material the loader produced into a standard material.
 *
 * The engine only shades and clones `MeshStandardMaterial`s. The file's maps and
 * colours are carried over, which is what keeps an embedded texture visible
 * instead of the grey placeholder the importer used to assign.
 */
function toStandardMaterial(source: THREE.Material): THREE.MeshStandardMaterial {
  const target = new THREE.MeshStandardMaterial();
  const read = source as unknown as Record<string, unknown>;
  const write = target as unknown as Record<string, unknown>;
  target.name = source.name;
  let loadedTextures = 0;
  for (const [, key] of TEXTURE_SLOTS) {
    // A separate alpha map is handled below instead of being bound: three's
    // alphaMap samples one channel, and FBX/DAE masks disagree on which one
    // carries the mask. A dark mask there could make the whole object invisible.
    if (key === 'alphaMap') continue;
    const texture = read[key];
    if (!(texture instanceof THREE.Texture)) continue;
    // A texture whose picture never arrived (missing sidecar, unsupported
    // embedded format) is a placeholder. Binding it would make the shader
    // sample an empty texture; for an alpha map that can hide the whole mesh.
    if (!textureHasImage(texture)) continue;
    write[key] = texture;
    loadedTextures += 1;
  }
  const sourceAlphaMap = read.alphaMap;
  const hadAlphaTexture = sourceAlphaMap instanceof THREE.Texture;
  const alphaMask = hadAlphaTexture ? buildAlphaMask(sourceAlphaMap as THREE.Texture) : null;
  // A foliage atlas connected only as the transparency map is still the
  // picture the tree is supposed to show. Without this the leaves imported
  // flat white with a cutout and looked as if the file had no textures.
  if (!target.map && hadAlphaTexture && textureHasImage(sourceAlphaMap as THREE.Texture) &&
    textureHasColorDetail(sourceAlphaMap as THREE.Texture)) {
    const colorMap = sourceAlphaMap as THREE.Texture;
    colorMap.colorSpace = THREE.SRGBColorSpace;
    target.map = colorMap;
    loadedTextures += 1;
  }
  const color = read.color;
  if (color instanceof THREE.Color) target.color.copy(color);
  const emissive = read.emissive;
  if (emissive instanceof THREE.Color) target.emissive.copy(emissive);
  const numberKeys = [
    'opacity', 'alphaTest', 'emissiveIntensity', 'roughness', 'metalness',
    'aoMapIntensity', 'bumpScale',
  ] as const;
  for (const key of numberKeys) {
    const value = read[key];
    if (typeof value === 'number') (target as unknown as Record<string, unknown>)[key] = value;
  }
  const vectorKeys = ['normalScale'] as const;
  for (const key of vectorKeys) {
    const value = read[key];
    if (value instanceof THREE.Vector2) (target as unknown as Record<string, unknown>)[key] = value.clone();
  }
  // Colour maps were authored in sRGB; normal/roughness maps must stay linear.
  if (target.map) target.map.colorSpace = THREE.SRGBColorSpace;
  if (target.emissiveMap) target.emissiveMap.colorSpace = THREE.SRGBColorSpace;
  target.depthWrite = source.depthWrite;
  target.depthTest = source.depthTest;
  target.transparent = source.transparent;
  // FBX marks a material transparent as soon as an alpha texture is connected.
  // A separate mask would blend every fragment away when its sampled channel is
  // empty, which used to import the tree as an invisible, still-selectable box.
  // Cut foliage out of the base-colour map instead (its own alpha channel), and
  // leave a mask-only asset opaque so the geometry is always visible.
  if (alphaMask) {
    target.opacity = 1;
    target.transparent = false;
    target.alphaMap = alphaMask;
    target.alphaTest = 0.5;
    target.depthWrite = true;
  } else if (hadAlphaTexture) {
    target.opacity = 1;
    target.transparent = false;
    target.alphaTest = target.map ? 0.5 : 0;
    target.depthWrite = true;
  } else if (source.transparent && loadedTextures === 0) {
    target.opacity = 1;
    target.transparent = false;
    target.alphaTest = 0;
  }
  target.side = source.side;
  target.flatShading = (source as THREE.MeshStandardMaterial).flatShading === true;
  // Vertex colours are dropped during the merge, so do not ask the shader for them.
  target.vertexColors = false;
  if (typeof read.metalness !== 'number') target.metalness = 0;
  if (typeof read.roughness !== 'number') target.roughness = 0.7;
  target.needsUpdate = true;
  return target;
}

/**
 * Corrects the winding of a geometry baked through a mirroring matrix.
 * A negative scale flips the triangle order, so every face becomes a back face
 * and is culled; the normals themselves stay on the outside.
 */
function flipReflectedGeometry(geometry: THREE.BufferGeometry): void {
  for (const name of ['position', 'normal', 'uv'] as const) {
    const attribute = geometry.getAttribute(name);
    if (!(attribute instanceof THREE.BufferAttribute)) continue;
    const size = attribute.itemSize;
    const array = attribute.array;
    for (let triangle = 0; triangle < attribute.count; triangle += 3) {
      for (let component = 0; component < size; component++) {
        const first = triangle * size + component;
        const third = (triangle + 2) * size + component;
        const swap = array[first];
        array[first] = array[third];
        array[third] = swap;
      }
    }
    attribute.needsUpdate = true;
  }
  // The normal attribute is already the inverse-transpose of the source normal,
  // which points out of the mirrored surface; only the winding was reversed.
}

/** Prepares one geometry for merging: world space, positions/normals/UVs only. */
function prepareGeometry(source: THREE.BufferGeometry, matrix: THREE.Matrix4): THREE.BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  geometry.applyMatrix4(matrix);
  if (matrix.determinant() < 0) flipReflectedGeometry(geometry);
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  if (!uv || uv.itemSize !== 2 || uv.count !== position.count) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(position.count * 2), 2));
  }
  for (const name of Object.keys(geometry.attributes)) {
    if (!(MERGE_ATTRIBUTES as readonly string[]).includes(name)) geometry.deleteAttribute(name);
  }
  return geometry;
}

/** Extracts a group's triangles (all arrays are already non-indexed). */
function sliceGeometry(geometry: THREE.BufferGeometry, start: number, count: number): THREE.BufferGeometry {
  const piece = new THREE.BufferGeometry();
  for (const name of MERGE_ATTRIBUTES) {
    const attribute = geometry.getAttribute(name);
    if (!attribute) continue;
    const itemSize = attribute.itemSize;
    const array = attribute.array.slice(start * itemSize, (start + count) * itemSize);
    piece.setAttribute(name, new THREE.BufferAttribute(array, itemSize, attribute.normalized));
  }
  return piece;
}

interface MaterialPiece {
  geometry: THREE.BufferGeometry;
  source: THREE.Material;
}

/**
 * Splits a mesh into one piece per material group.
 *
 * A glTF/FBX mesh can carry several materials (bark, leaves, glass…). Keeping
 * those pieces separate in the merged geometry is what preserves each material's
 * texture; flattening them onto one material would make the tree leaves grey.
 */
function meshPieces(mesh: THREE.Mesh): MaterialPiece[] {
  const sources = materialsOf(mesh);
  const geometry = prepareGeometry(mesh.geometry, mesh.matrixWorld);
  const groups = geometry.groups.length > 0
    ? geometry.groups
    : [{ start: 0, count: geometry.getAttribute('position').count, materialIndex: 0 }];
  if (!Array.isArray(mesh.material) || groups.length <= 1) {
    geometry.clearGroups();
    return [{ geometry, source: sources[0] ?? new THREE.MeshStandardMaterial() }];
  }
  const pieces: MaterialPiece[] = [];
  for (const group of groups) {
    const material = sources[group.materialIndex ?? 0] ?? sources[0];
    if (!material) continue;
    const slice = sliceGeometry(geometry, group.start, group.count);
    if (!slice.getAttribute('position')) {
      slice.dispose();
      continue;
    }
    pieces.push({ geometry: slice, source: material });
  }
  geometry.dispose();
  return pieces.length > 0
    ? pieces
    : [{ geometry: prepareGeometry(mesh.geometry, mesh.matrixWorld), source: sources[0] ?? new THREE.MeshStandardMaterial() }];
}

function textureSize(texture: THREE.Texture): string {
  const image = texture.image as { width?: number; height?: number } | null | undefined;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  if (width > 0 && height > 0) return `${width} × ${height}`;
  // A map with no image means the file points at an external picture that was
  // not picked alongside the model; say so instead of leaving it blank.
  return texture.image ? (texture.name || '') : 'missing image';
}

function materialContents(material: THREE.Material): ImportedContentNode {
  const node: ImportedContentNode = {
    name: material.name || material.type.replace('Mesh', ''),
    kind: 'material',
    detail: material.type.replace('Material', '').replace('Mesh', ''),
    children: [],
  };
  const read = material as unknown as Record<string, unknown>;
  for (const [label, key] of TEXTURE_SLOTS) {
    const texture = read[key];
    if (!(texture instanceof THREE.Texture)) continue;
    const size = textureSize(texture);
    node.children.push({
      name: `${label}${texture.name ? ` · ${texture.name}` : ''}`,
      kind: 'texture',
      detail: size,
      children: [],
    });
  }
  return node;
}

/** The file's own node/material tree, for the Configurations contents list. */
function buildContents(
  object: THREE.Object3D,
  root: THREE.Object3D,
  pieceIndexesByMesh: ReadonlyMap<THREE.Mesh, number[]>,
): ImportedContentNode {
  const mesh = object as THREE.Mesh;
  const isMesh = mesh.isMesh === true;
  const node: ImportedContentNode = {
    name: object.name || (object === root ? 'Scene' : object.type),
    kind: isMesh ? 'mesh' : 'node',
    children: [],
  };
  if (isMesh) {
    // Indexed files only store the four corners of a face; the index count is
    // the real triangle count.
    const vertexCount = mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position')?.count ?? 0;
    const count = Math.floor(vertexCount / 3);
    node.detail = `${count.toLocaleString()} tris`;
    node.pieces = [...(pieceIndexesByMesh.get(mesh) ?? [])];
    for (const material of materialsOf(mesh)) node.children.push(materialContents(material));
  }
  for (const child of object.children) node.children.push(buildContents(child, root, pieceIndexesByMesh));
  if (node.kind === 'node') {
    node.detail = node.children.length === 1 ? '1 item' : `${node.children.length} items`;
  }
  // A container holds every piece of the geometry below it, which is what lets
  // the file tree split a whole branch into scene objects.
  const pieces = new Set<number>();
  for (const child of node.children) for (const piece of child.pieces ?? []) pieces.add(piece);
  if (pieces.size > 0) node.pieces = [...pieces];
  return node;
}

export async function loadModel(file: File, resources: readonly File[] = []): Promise<ImportedModel> {
  if (!isSupportedModelFile(file)) {
    throw new Error('Choose a glTF/GLB, OBJ, FBX, STL, PLY, 3DS, or DAE file.');
  }
  const resourceManager = createResourceManager(resources);
  let root: THREE.Object3D;
  try {
    await registerImageHandlers(resourceManager.manager, file, resources);
    root = await readModel(file, resources, resourceManager.manager);
    await resourceManager.whenTexturesSettled();
  } finally {
    resourceManager.release();
  }
  root.updateWorldMatrix(true, true);

  const pieces: MaterialPiece[] = [];
  const pieceIndexesByMesh = new Map<THREE.Mesh, number[]>();
  let hasUVs = false;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true || !mesh.geometry?.getAttribute('position')) return;
    const uv = mesh.geometry.getAttribute('uv');
    if (uv && uv.count > 0) hasUVs = true;
    const indexes: number[] = [];
    for (const piece of meshPieces(mesh)) {
      indexes.push(pieces.length);
      pieces.push(piece);
    }
    pieceIndexesByMesh.set(mesh, indexes);
  });
  if (pieces.length === 0) throw new Error('That file contains no triangle geometry.');

  const merged = pieces.length === 1
    ? pieces[0].geometry
    : mergeGeometries(pieces.map((piece) => piece.geometry), true);
  if (!merged) {
    pieces.forEach((piece) => piece.geometry.dispose());
    throw new Error('The meshes in that file use incompatible vertex layouts.');
  }
  // The ranges stay in merged vertex coordinates: the fit-to-size translate and
  // scale below only moves the positions, not the layout of the pieces.
  let vertexOffset = 0;
  const pieceRanges: ImportedPieceRange[] = pieces.map((piece, index) => {
    const count = piece.geometry.getAttribute('position').count;
    const group = pieces.length > 1 ? merged.groups[index] : undefined;
    const range: ImportedPieceRange = {
      start: group?.start ?? vertexOffset,
      count: group?.count ?? count,
      material: index,
    };
    vertexOffset += count;
    return range;
  });
  if (pieces.length > 1) pieces.forEach((piece) => piece.geometry.dispose());

  merged.computeBoundingBox();
  const bounds = merged.boundingBox;
  if (!bounds) throw new Error('The imported model has no usable bounds.');
  const size = bounds.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(longest) || longest <= 0) {
    merged.dispose();
    throw new Error('The imported model has no usable size.');
  }
  const center = bounds.getCenter(new THREE.Vector3());
  merged.translate(-center.x, -bounds.min.y, -center.z);
  merged.scale(IMPORT_SIZE / longest, IMPORT_SIZE / longest, IMPORT_SIZE / longest);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();

  const materials = pieces.map((piece) => toStandardMaterial(piece.source));
  const textures = new Set<THREE.Texture>();
  for (const material of materials) {
    const read = material as unknown as Record<string, unknown>;
    for (const [, key] of TEXTURE_SLOTS) {
      const texture = read[key];
      if (texture instanceof THREE.Texture) textures.add(texture);
    }
  }

  const missingTextures: ImportedMissingTexture[] = [];
  pieces.forEach((piece, materialIndex) => {
    const read = piece.source as unknown as Record<string, unknown>;
    for (const [label, key] of TEXTURE_SLOTS) {
      const texture = read[key];
      if (!(texture instanceof THREE.Texture) || textureHasImage(texture)) continue;
      missingTextures.push({ materialIndex, slot: key, label, name: texture.name || '' });
    }
  });

  const triangles = Math.floor(merged.getAttribute('position').count / 3);
  const sceneContents = buildContents(root, root, pieceIndexesByMesh);
  const baseName = file.name.replace(/\.[^.]+$/, '').trim() || 'Imported Model';
  const contents: ImportedContentNode = {
    name: file.name,
    kind: 'file',
    detail: `${triangles.toLocaleString()} tris · ${pieces.length} ${pieces.length === 1 ? 'part' : 'parts'}`,
    children: [sceneContents],
    pieces: sceneContents.pieces,
  };

  // The loader's original geometries/materials are no longer needed; textures
  // stay alive because the converted materials reference them.
  const sourceGeometries = new Set<THREE.BufferGeometry>();
  const sourceMaterials = new Set<THREE.Material>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh !== true) return;
    sourceGeometries.add(mesh.geometry);
    materialsOf(mesh).forEach((material) => sourceMaterials.add(material));
  });
  sourceGeometries.forEach((geometry) => geometry.dispose());
  sourceMaterials.forEach((material) => material.dispose());

  return {
    geometry: merged,
    materials,
    name: baseName,
    triangles,
    contents,
    textureCount: textures.size,
    hasUVs,
    pieces: pieceRanges,
    missingTextures,
  };
}
