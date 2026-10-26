import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { GodRaysPass, OccluderMask } from './god-rays';
import {
  RayTracedLighting,
  type RayTracingQuality,
  type RayTracedLight,
} from './ray-tracing';

/**
 * Single post-processing graph for the editor viewport.
 *
 * The beauty pass shades the scene, the occlusion pass renders the same
 * geometry as flat white-on-black silhouettes, and the post graph shades the
 * ray-traced lighting and adds the screen-space god rays.
 *
 * Reflections come from the live environment probe in the main scene plus the
 * per-material response, not from a second screen-space reflection pass: the
 * SSR node shipped with this three build produced an invalid render pipeline on
 * WebGPU, so every frame submitted an invalid command buffer and the viewport
 * stuttered while only the probe's contribution was ever visible.
 */
export class ScenePipeline {
  readonly godRays: GodRaysPass;
  readonly rayTracing: RayTracedLighting;

  private readonly occlusionMask: OccluderMask;
  private readonly postProcessing: THREE.PostProcessing;
  private readonly renderer: THREE.WebGPURenderer;
  private readonly drawingBufferSize = new THREE.Vector2();

  constructor(
    renderer: THREE.WebGPURenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    getOccluders: () => THREE.Mesh[],
  ) {
    this.renderer = renderer;
    this.occlusionMask = new OccluderMask(getOccluders);

    // Both passes render colour + depth only. The two passes share the same
    // attachment layout so the backend's cached pipelines stay compatible.
    const scenePass = pass(scene, camera);
    const occlusionPass = pass(this.occlusionMask.scene, camera);

    const sceneColor = scenePass.getTextureNode('output');
    const sceneDepth = scenePass.getTextureNode('depth');

    this.rayTracing = new RayTracedLighting(
      occlusionPass.getTextureNode('depth'),
      sceneDepth,
    );
    this.godRays = new GodRaysPass(
      this.rayTracing.apply(sceneColor),
      occlusionPass.getTextureNode('output'),
    );

    this.postProcessing = new THREE.PostProcessing(renderer);
    this.postProcessing.outputNode = this.godRays.node;
  }

  /** True while at least one post effect needs the full-screen graph. */
  get enabled(): boolean {
    return this.godRays.enabled || this.rayTracing.enabled;
  }

  setRayTracingQuality(quality: RayTracingQuality): void {
    this.rayTracing.setQuality(quality);
  }

  update(
    camera: THREE.PerspectiveCamera,
    sun: THREE.Object3D | null,
    deltaSeconds: number,
    lights: readonly RayTracedLight[],
  ): void {
    this.occlusionMask.sync();
    this.renderer.getDrawingBufferSize(this.drawingBufferSize);
    this.godRays.setViewportSize(this.drawingBufferSize.x, this.drawingBufferSize.y);
    this.godRays.update(camera, sun, deltaSeconds);
    this.rayTracing.update(camera, lights);
  }

  render(): void {
    this.postProcessing.render();
  }
}
