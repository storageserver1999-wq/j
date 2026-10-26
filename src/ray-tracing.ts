import * as THREE from 'three/webgpu';
import {
  Break,
  If,
  Loop,
  Fn,
  float,
  hash,
  mix,
  perspectiveDepthToViewZ,
  uniform,
  uv,
  vec2,
  vec4,
} from 'three/tsl';

/**
 * Screen-space ray-traced lighting.
 *
 * WebGPU (and therefore Three.js' WebGPURenderer) has no hardware ray tracing,
 * so this pass traces through the depth buffer instead of a BVH. From every
 * visible fragment it sweeps a ray across the screen toward each scene light
 * and compares the occluder depth it meets against the fragment's own depth. A
 * ray that runs behind geometry is a blocked ray, which is the shadow that
 * light casts for that pixel.
 *
 * The beauty pass owns the fragment depth; the occlusion pass, which contains
 * scene geometry only, owns the hit depth, so light markers, the sun sphere and
 * the helper grid can never block a ray.
 */

export type RayTracingQuality = 'off' | 'low' | 'medium' | 'high';

export interface RayTracedLight {
  light: THREE.Light;
  kind: 'spot' | 'point' | 'directional';
}

/** Hard upper bound of the TSL loop; lower quality tiers break out early. */
const MAX_STEPS = 32;
const MAX_LIGHTS = 3;

const QUALITY_STEPS: Record<RayTracingQuality, number> = {
  off: 1,
  low: 10,
  medium: 20,
  high: MAX_STEPS,
};

const QUALITY_LIGHTS: Record<RayTracingQuality, number> = {
  off: 0,
  low: 1,
  medium: 2,
  high: MAX_LIGHTS,
};

/** Anything below this depth is real scene geometry, not the empty mask. */
const EMPTY_DEPTH = 0.9995;

// TSL nodes are dynamically typed; the base Node class does not declare the
// operator methods (`.mul`, `.sample`, ...) that the node graph provides.
/* eslint-disable @typescript-eslint/no-explicit-any */
type TslNode = any;

interface LightSlot {
  lightUV: TslNode;
  direction: TslNode;
  directional: TslNode;
  enabled: TslNode;
}

export class RayTracedLighting {
  private qualityValue: RayTracingQuality = 'off';
  private readonly stepsUniform = uniform(QUALITY_STEPS.medium);
  private readonly biasUniform = uniform(0.05);
  private readonly nearUniform = uniform(0.1);
  private readonly farUniform = uniform(1000);
  private readonly strengthUniform = uniform(0.9);
  private readonly attenuation: TslNode;
  private readonly slots: LightSlot[] = [];

  private readonly projectedPosition = new THREE.Vector3();
  private readonly lightWorldPosition = new THREE.Vector3();
  private readonly lightTargetPosition = new THREE.Vector3();
  private readonly lightDirection = new THREE.Vector3();
  private readonly screenA = new THREE.Vector2();

  constructor(sceneDepth: TslNode, occluderDepth: TslNode) {
    for (let index = 0; index < MAX_LIGHTS; index++) {
      this.slots.push({
        lightUV: uniform(new THREE.Vector2(0.5, 0.5)),
        direction: uniform(new THREE.Vector2(0, 1)),
        directional: uniform(0),
        enabled: uniform(0),
      });
    }

    // The march lives inside one Fn() so its compound assignments get a shader
    // stack; building them at the node root is not allowed by TSL.
    const result = Fn(() => {
      const fragmentUV = uv().toVar();
      const pixelDepth = sceneDepth.sample(fragmentUV).r.toVar();
      const pixelViewZ = (
        perspectiveDepthToViewZ(pixelDepth, this.nearUniform, this.farUniform) as TslNode
      ).toVar();
      const visibility = float(1).toVar();

      for (const slot of this.slots) {
        // Screen-space vector from this pixel to the light. Directional
        // lights use their projected direction because their position is at
        // infinity and usually outside the viewport.
        const delta = mix(
          slot.lightUV.sub(fragmentUV),
          slot.direction.mul(0.5),
          slot.directional,
        ).toVar();
        const stepVector = delta.div(this.stepsUniform.max(1)).toVar();

        // Per-pixel jitter desynchronizes the sweep and hides the stepping.
        const jitter = hash(fragmentUV.mul(vec2(2048, 2048)));
        const sampleUV = fragmentUV.add(stepVector.mul(jitter)).toVar();
        const blocked = float(0).toVar();

        Loop(MAX_STEPS, ({ i }) => {
          If(float(i).greaterThanEqual(this.stepsUniform), () => {
            Break();
          });

          sampleUV.addAssign(stepVector);

          const onScreen = sampleUV.x
            .greaterThanEqual(0)
            .and(sampleUV.x.lessThanEqual(1))
            .and(sampleUV.y.greaterThanEqual(0))
            .and(sampleUV.y.lessThanEqual(1));

          If(onScreen, () => {
            const hitDepth = occluderDepth.sample(sampleUV).r;
            const hitViewZ = (
              perspectiveDepthToViewZ(hitDepth, this.nearUniform, this.farUniform) as TslNode
            ) as TslNode;
            // View Z is negative in front of the camera: a larger value means
            // closer to the eye, so geometry nearer than this fragment blocks
            // the light. Comparing linear view depth keeps the test stable at
            // the far end of the depth range where raw depth is compressed.
            const blockedHere = hitDepth
              .lessThan(EMPTY_DEPTH)
              .and(hitViewZ.greaterThan(pixelViewZ.add(this.biasUniform)));
            blocked.addAssign(blockedHere.select(float(1), float(0)));
          });
        });

        const blockedRatio = blocked.div(this.stepsUniform.max(1));
        const slotVisibility = mix(float(1), float(1).sub(blockedRatio), slot.enabled);
        visibility.mulAssign(slotVisibility);
      }

      return mix(float(1), visibility, this.strengthUniform);
    })();
    this.attenuation = result;
  }

  /** Multiplies the beauty pass by the traced light visibility. */
  apply(colorNode: TslNode): TslNode {
    return vec4(colorNode.rgb.mul(this.attenuation), colorNode.a);
  }

  get quality(): RayTracingQuality {
    return this.qualityValue;
  }

  setQuality(quality: RayTracingQuality): void {
    this.qualityValue = quality;
  }

  get enabled(): boolean {
    return this.qualityValue !== 'off';
  }

  update(camera: THREE.PerspectiveCamera, lights: readonly RayTracedLight[]): void {
    for (const slot of this.slots) slot.enabled.value = 0;
    this.stepsUniform.value = QUALITY_STEPS[this.qualityValue];
    this.nearUniform.value = camera.near;
    this.farUniform.value = camera.far;

    const tracedLights = QUALITY_LIGHTS[this.qualityValue];
    if (tracedLights === 0) return;

    camera.updateMatrixWorld();

    let slotIndex = 0;
    for (const entry of lights) {
      if (slotIndex >= tracedLights) break;
      const { light, kind } = entry;
      if (!light.visible) continue;

      const slot = this.slots[slotIndex];
      if (kind === 'directional') {
        light.getWorldPosition(this.lightWorldPosition);
        (light as THREE.DirectionalLight).target.getWorldPosition(this.lightTargetPosition);
        this.lightDirection.copy(this.lightWorldPosition).sub(this.lightTargetPosition);
        if (this.lightDirection.lengthSq() < 1e-8) {
          slot.enabled.value = 0;
          continue;
        }
        this.lightDirection.normalize();

        // Screen-space shadow direction: perspective projection multiplies
        // view X by 1/aspect and flips Y into render-target UV space.
        this.projectedPosition
          .copy(this.lightDirection)
          .transformDirection(camera.matrixWorldInverse);
        if (this.projectedPosition.z >= 0) {
          // The light is behind the camera; screen-space shadows are undefined.
          slot.enabled.value = 0;
          continue;
        }
        const aspect = camera.aspect > 0 ? camera.aspect : 1;
        const dirX = this.projectedPosition.x / aspect;
        const dirY = -this.projectedPosition.y;
        const dirLength = Math.hypot(dirX, dirY);
        if (dirLength < 1e-4) {
          slot.enabled.value = 0;
          continue;
        }
        slot.direction.value.set(dirX / dirLength, dirY / dirLength);
        slot.directional.value = 1;
        slot.lightUV.value.set(0.5, 0.5);
        slot.enabled.value = 1;
      } else {
        light.getWorldPosition(this.lightWorldPosition);
        this.projectPoint(camera, this.lightWorldPosition, this.screenA);
        slot.lightUV.value.copy(this.screenA);
        slot.directional.value = 0;
        slot.enabled.value = 1;
      }
      slotIndex++;
    }
  }

  private projectPoint(
    camera: THREE.PerspectiveCamera,
    worldPosition: THREE.Vector3,
    target: THREE.Vector2,
  ): boolean {
    this.projectedPosition.copy(worldPosition).applyMatrix4(camera.matrixWorldInverse);
    const inFront = this.projectedPosition.z < -camera.near;
    this.projectedPosition.applyMatrix4(camera.projectionMatrix);
    target.set(
      this.projectedPosition.x * 0.5 + 0.5,
      // Render-target UVs are vertically flipped relative to NDC.
      1 - (this.projectedPosition.y * 0.5 + 0.5),
    );
    return inFront;
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */
