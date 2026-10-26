import * as THREE from 'three/webgpu';
import {
  Break,
  If,
  vec2,
  vec4,
  uv,
  uniform,
  Fn,
  Loop,
  float,
  hash,
  clamp,
  exp,
  length,
  pow,
  rtt,
} from 'three/tsl';

/**
 * Depth-aware crepuscular rays built entirely with TSL.
 *
 * A dedicated occlusion pass renders the scene against a white sky: every
 * foreground occluder is solid black and everything the sun can see through
 * is white. A 60-tap march from each pixel toward the projected sun then
 * averages that mask, so a pixel is lit only while its line of sight to the
 * sun is clear. That is what carves the long shafts out of the geometry
 * silhouettes instead of painting a radial gradient over the screen.
 *
 * The accumulated result is weighted toward the sun end of the march, tinted,
 * scaled by a procedural sun glow, clamped and blended additively over the
 * scene pass. No sprites, billboards, planes or flare textures are involved.
 */

/**
 * The march is compiled once at this tap count and breaks out early for the
 * lighter quality tiers, so switching quality never recompiles the shader.
 */
const MAX_TAPS = 64;
/** How hard the march weights samples near the sun versus near the pixel. */
const SUN_BIAS_STEPS = 10;
const SUN_EDGE_FADE_START = 1.05;
const SUN_EDGE_FADE_END = 1.85;

export type GodRaysQuality = 'low' | 'medium' | 'high';

interface GodRaysQualitySpec {
  /** March taps per pixel. */
  taps: number;
  /** March buffer size as a fraction of the viewport. */
  scale: number;
}

/**
 * The march is by far the most expensive part of the pass: it scales with
 * pixels x taps. Rendering it into its own reduced-resolution buffer turns
 * that into a fraction of the screen and lets the composite upscale it, which
 * is invisible on soft shafts but costs a fraction of the fill rate.
 */
const QUALITY_SPECS: Record<GodRaysQuality, GodRaysQualitySpec> = {
  low: { taps: 16, scale: 0.4 },
  medium: { taps: 32, scale: 0.55 },
  high: { taps: 64, scale: 1 },
};

export interface GodRaysSettings {
  enabled: boolean;
  /** March tap count and buffer resolution tier. */
  quality: GodRaysQuality;
  /** Composite strength of the final additive blend. */
  intensity: number;
  /** How much of the way to the sun the shafts reach (0 - 1). */
  spread: number;
  /** Pushes the light contribution toward the sun end of the march. */
  decay: number;
  /** Overall HDR exposure of the accumulated rays. */
  brightness: number;
  /** Tint applied to the ray shafts. */
  tint: string;
}

export const DEFAULT_GOD_RAYS_SETTINGS: GodRaysSettings = {
  enabled: false,
  quality: 'medium',
  intensity: 0.34,
  spread: 0.9,
  decay: 0.94,
  brightness: 0.3,
  tint: '#ffe6b8',
};

function smoothstep(min: number, max: number, value: number): number {
  const x = THREE.MathUtils.clamp((value - min) / (max - min), 0, 1);
  return x * x * (3 - 2 * x);
}

/**
 * Renders every scene occluder as solid black against a white background.
 * The resulting color texture is the god ray visibility mask and the depth
 * texture is a light-proxy-free depth buffer that the ray-traced pass uses
 * for its shadow rays.
 */
export class OccluderMask {
  readonly scene = new THREE.Scene();

  private readonly getOccluders: () => THREE.Mesh[];
  private readonly group = new THREE.Group();
  private readonly clones = new Map<THREE.Mesh, THREE.Mesh>();
  private readonly material = new THREE.MeshBasicMaterial({
    color: 0x000000,
    toneMapped: false,
    fog: false,
  });
  /** Per-mesh masks for alpha-cutout surfaces such as image blocks. */
  private readonly cutoutMaterials = new Map<THREE.Mesh, THREE.MeshBasicMaterial>();

  constructor(getOccluders: () => THREE.Mesh[]) {
    this.getOccluders = getOccluders;
    this.scene.background = new THREE.Color(0xffffff);
    this.group.matrixAutoUpdate = false;
    this.scene.add(this.group);
  }

  sync(): void {
    const seen = new Set<THREE.Mesh>();

    for (const mesh of this.getOccluders()) {
      if (!mesh.visible) continue;
      seen.add(mesh);

      let clone = this.clones.get(mesh);
      if (!clone) {
        clone = new THREE.Mesh(mesh.geometry, this.material);
        clone.matrixAutoUpdate = false;
        clone.matrixWorldAutoUpdate = false;
        clone.frustumCulled = false;
        this.clones.set(mesh, clone);
        this.group.add(clone);
      }

      clone.geometry = mesh.geometry;
      clone.material = this.maskMaterialFor(mesh);
      mesh.updateWorldMatrix(true, false);
      clone.matrix.copy(mesh.matrixWorld);
      clone.matrixWorld.copy(mesh.matrixWorld);
    }

    for (const [mesh, clone] of this.clones) {
      if (seen.has(mesh)) continue;
      clone.removeFromParent();
      this.clones.delete(mesh);
      this.cutoutMaterials.get(mesh)?.dispose();
      this.cutoutMaterials.delete(mesh);
    }
  }

  /**
   * A silhouette material for one occluder.
   *
   * A plain black material turns every surface into a solid rectangle. When the
   * surface is an alpha-cutout image (an image block showing a PNG avatar), the
   * same map and alpha test are used here so the transparent pixels stay light:
   * the shafts then trace the picture's silhouette instead of its plane.
   */
  private maskMaterialFor(mesh: THREE.Mesh): THREE.MeshBasicMaterial {
    const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const isCutout = source instanceof THREE.MeshStandardMaterial &&
      source.map !== null &&
      source.alphaTest > 0;
    if (!isCutout || !(source instanceof THREE.MeshStandardMaterial)) {
      const previous = this.cutoutMaterials.get(mesh);
      if (previous) {
        previous.dispose();
        this.cutoutMaterials.delete(mesh);
      }
      return this.material;
    }

    let material = this.cutoutMaterials.get(mesh);
    if (!material) {
      material = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false, fog: false });
      this.cutoutMaterials.set(mesh, material);
    }
    if (material.map !== source.map) {
      material.map = source.map;
      material.needsUpdate = true;
    }
    material.alphaTest = source.alphaTest;
    material.side = source.side;
    return material;
  }
}

export class GodRaysPass {
  readonly settings: GodRaysSettings;

  /** Final scene color with the clamped shafts added on top. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly node: any;

  private readonly decayUniform = uniform(DEFAULT_GOD_RAYS_SETTINGS.decay);
  private readonly marchUniform = uniform(DEFAULT_GOD_RAYS_SETTINGS.spread);
  private readonly weightUniform = uniform(DEFAULT_GOD_RAYS_SETTINGS.intensity);
  private readonly exposureUniform = uniform(DEFAULT_GOD_RAYS_SETTINGS.brightness);
  private readonly tapsUniform = uniform(QUALITY_SPECS.medium.taps);
  private readonly aspectUniform = uniform(1);
  private readonly sunScreenPositionUniform = uniform(new THREE.Vector2(0.5, 0.5));
  private readonly sunVisibilityUniform = uniform(0);
  private readonly rayTintUniform = uniform(new THREE.Color(DEFAULT_GOD_RAYS_SETTINGS.tint));
  /** Reduced-resolution buffer the march is rendered into. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly raysNode: any;
  private raysWidth = 0;
  private raysHeight = 0;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private sun: THREE.Object3D | null = null;
  private hasProjection = false;
  private readonly smoothedSunPosition = new THREE.Vector2(0.5, 0.5);
  private sunVisibility = 0;

  private readonly worldPosition = new THREE.Vector3();
  private readonly worldQuaternion = new THREE.Quaternion();
  private readonly worldScale = new THREE.Vector3();
  private readonly targetSunPosition = new THREE.Vector2(0.5, 0.5);
  private readonly cameraSpacePosition = new THREE.Vector3();
  private readonly projectedPosition = new THREE.Vector3();

  /**
   * @param sceneColor Supplied by the scene pipeline; may already be shaded by
   *   the ray-traced lighting pass.
   * @param occlusionTexture White-sky/black-occluder mask rendered by the
   *   pipeline's occlusion pass.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(sceneColor: any, occlusionTexture: any) {
    this.settings = { ...DEFAULT_GOD_RAYS_SETTINGS };

    const godRaysNode = Fn(() => {
      const fragmentUV = uv().toVar();
      const sunUV = this.sunScreenPositionUniform;

      // Aspect-corrected offset to the sun so the shafts stay radial on any
      // viewport shape instead of stretching with the window.
      const toSun = vec2(
        sunUV.x.sub(fragmentUV.x).mul(this.aspectUniform),
        sunUV.y.sub(fragmentUV.y),
      ).toVar();
      const distanceToSun = length(toSun).max(0.0001);
      const direction = toSun.div(distanceToSun).toVar();
      const uvDirection = vec2(direction.x.div(this.aspectUniform), direction.y);

      // The shafts reach this far toward the sun. Spreading them over most of
      // the screen distance is what makes the shadows long and beam-like.
      const marchLength = distanceToSun.mul(this.marchUniform).min(1.6).max(0.0001);
      const stepVector = uvDirection.mul(marchLength).div(this.tapsUniform.max(1));

      // Per-pixel hash dither offsets the sample grid, which removes the
      // diagonal stripes and step banding of the regular tap spacing.
      const dither = hash(fragmentUV.dot(vec2(443.897, 441.423))).sub(0.5);
      const sampleUV = fragmentUV.add(stepVector.mul(dither)).toVar();

      const visibility = float(0).toVar();
      const weightSum = float(0).toVar();

      Loop(MAX_TAPS, ({ i }) => {
        // Quality tiers stop the march early instead of compiling a second
        // shader; every pixel in the frame takes the same branch.
        If(float(i).greaterThanEqual(this.tapsUniform), () => {
          Break();
        });

        sampleUV.addAssign(stepVector);
        const t = float(i).div(this.tapsUniform.max(1));
        // `decay` below 1 concentrates the light near the sun end, which is
        // where the shafts converge. 1 keeps every tap equal.
        const sampleWeight = pow(this.decayUniform, float(1).sub(t).mul(SUN_BIAS_STEPS));
        const mask = occlusionTexture.sample(clamp(sampleUV, vec2(0), vec2(1))).r;
        visibility.addAssign(mask.mul(sampleWeight));
        weightSum.addAssign(sampleWeight);
      });

      // Raising the average to a power tightens the penumbra, so the shafts
      // read as distinct beams instead of a screen-wide warm veil.
      const lightVisibility = pow(clamp(visibility.div(weightSum.max(0.0001)), 0.0, 1.0), 1.55);

      // The visible light source is a soft, physically-shaped glow around the
      // projected 3D sun. The shafts are this glow cut by the visibility mask.
      const core = exp(distanceToSun.mul(distanceToSun).mul(-18.0));
      const halo = exp(distanceToSun.mul(-3.6));
      const glow = core.mul(1.05).add(halo.mul(0.55));

      return lightVisibility.mul(glow).mul(this.rayTintUniform).mul(this.exposureUniform);
    })();

    // Hard safety clamp: the march can accumulate up to MAX_TAPS taps, and
    // without the upper bound a bright frame can blow out to a full white
    // screen.
    //
    // The march renders into its own truncated-resolution buffer and the
    // composite samples it with a bilinear tap, so the shafts are computed
    // once per low-res pixel instead of once per screen pixel. `rtt` owns that
    // render target; `setViewportSize` keeps it in step with the canvas.
    this.raysNode = rtt(clamp(godRaysNode, 0.0, 1.0), 1, 1, { type: THREE.HalfFloatType });
    this.node = sceneColor.add(vec4(
      this.raysNode.rgb.mul(this.weightUniform).mul(this.sunVisibilityUniform),
      0.0,
    ));

    this.applySettings();
  }

  /**
   * Sizes the march buffer from the renderer's drawing buffer and the current
   * quality tier.
   */
  setViewportSize(width: number, height: number): void {
    if (!(width > 0) || !(height > 0)) return;
    this.viewportWidth = width;
    this.viewportHeight = height;
    const scale = QUALITY_SPECS[this.settings.quality].scale;
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    if (targetWidth === this.raysWidth && targetHeight === this.raysHeight) return;
    this.raysWidth = targetWidth;
    this.raysHeight = targetHeight;
    this.raysNode.setSize(targetWidth, targetHeight);
  }

  get quality(): GodRaysQuality {
    return this.settings.quality;
  }

  setQuality(quality: GodRaysQuality): void {
    if (this.settings.quality === quality) return;
    this.settings.quality = quality;
    this.applySettings();
    const { viewportWidth, viewportHeight } = this;
    // Force a resize: the tier changes the buffer's resolution.
    this.raysWidth = 0;
    this.raysHeight = 0;
    if (viewportWidth > 0 && viewportHeight > 0) this.setViewportSize(viewportWidth, viewportHeight);
  }

  get enabled(): boolean {
    return this.settings.enabled;
  }

  set enabled(value: boolean) {
    this.settings.enabled = value;
  }

  get activeSun(): THREE.Object3D | null {
    return this.sun;
  }

  setSun(sun: THREE.Object3D | null): void {
    if (this.sun === sun) return;
    this.sun = sun;
    this.hasProjection = false;
    this.sunVisibility = 0;
    this.sunVisibilityUniform.value = 0;
  }

  applySettings(): void {
    this.decayUniform.value = THREE.MathUtils.clamp(this.settings.decay, 0.4, 1);
    this.marchUniform.value = THREE.MathUtils.clamp(this.settings.spread, 0.05, 1);
    this.weightUniform.value = Math.max(0, this.settings.intensity);
    this.exposureUniform.value = Math.max(0, this.settings.brightness);
    this.tapsUniform.value = QUALITY_SPECS[this.settings.quality].taps;
    this.rayTintUniform.value.set(this.settings.tint);
  }

  setSettings(settings: Partial<GodRaysSettings>): void {
    Object.assign(this.settings, settings);
    this.applySettings();
  }

  update(
    camera: THREE.PerspectiveCamera,
    sunMesh: THREE.Object3D | null,
    deltaSeconds = 1 / 60,
  ): void {
    if (this.sun !== sunMesh) this.setSun(sunMesh);
    this.aspectUniform.value = camera.aspect > 0 ? camera.aspect : 1;
    // Frame-rate independent smoothing: the shafts stay pinned to the sun at
    // any refresh rate instead of trailing the camera on slow frames.
    const smoothing = 1 - Math.exp(-Math.max(deltaSeconds, 0) * 22);

    if (!sunMesh || !sunMesh.visible) {
      this.sunVisibilityUniform.value = 0;
      this.sunVisibility = 0;
      this.syncBufferUpdate();
      return;
    }

    camera.updateMatrixWorld();
    sunMesh.updateWorldMatrix(true, false);
    sunMesh.matrixWorld.decompose(this.worldPosition, this.worldQuaternion, this.worldScale);

    this.cameraSpacePosition.copy(this.worldPosition).applyMatrix4(camera.matrixWorldInverse);
    const isInFront = this.cameraSpacePosition.z < -camera.near;
    this.projectedPosition.copy(this.worldPosition).project(camera);

    let targetVisibility = 0;
    if (isInFront && this.projectedPosition.z < 1) {
      // The post pass samples in render-target space, whose V axis is flipped
      // relative to the projected NDC. Converting here keeps the shafts locked
      // to the sun instead of drifting with the camera.
      const targetX = this.projectedPosition.x * 0.5 + 0.5;
      const targetY = 1 - (this.projectedPosition.y * 0.5 + 0.5);
      this.targetSunPosition.set(targetX, targetY);
      if (!this.hasProjection) {
        this.smoothedSunPosition.copy(this.targetSunPosition);
        this.hasProjection = true;
      } else {
        this.smoothedSunPosition.lerp(this.targetSunPosition, smoothing);
      }

      const edgeDistance = Math.max(
        Math.abs(this.projectedPosition.x),
        Math.abs(this.projectedPosition.y),
      );
      targetVisibility = 1 - smoothstep(
        SUN_EDGE_FADE_START,
        SUN_EDGE_FADE_END,
        edgeDistance,
      );
    }

    this.sunScreenPositionUniform.value.copy(this.smoothedSunPosition);
    this.sunVisibility = THREE.MathUtils.lerp(this.sunVisibility, Math.min(targetVisibility, 1), smoothing);
    this.sunVisibilityUniform.value = this.sunVisibility <= 0.001 ? 0 : this.sunVisibility;
    this.syncBufferUpdate();
  }

  /**
   * Stops the march render entirely while the effect cannot contribute: the
   * sun is behind the camera, out of frame, or the effect is switched off.
   * Without this the full tap loop would still run every frame for an
   * invisible result.
   */
  private syncBufferUpdate(): void {
    this.raysNode.autoUpdate = this.settings.enabled
      && this.weightUniform.value > 0
      && this.sunVisibility > 0.002;
  }
}
