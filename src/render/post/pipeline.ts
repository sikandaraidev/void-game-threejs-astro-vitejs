import type { Camera, Scene } from 'three/webgpu';
import { RenderPipeline, type WebGPURenderer } from 'three/webgpu';
import { emissive, mrt, output, pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

export interface Pipeline {
  render(): void;
  dispose(): void;
}

/**
 * Scene pass with an MRT emissive target; bloom runs on emissive only,
 * so the void stays truly black and only meaningful light glows (Blueprint v3 §6).
 * Returns null when bloom is disabled (feature-flag pattern): caller renders directly.
 */
export function createPipeline(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
  enabled: boolean,
): Pipeline | null {
  if (!enabled) return null;

  const scenePass = pass(scene, camera);
  scenePass.setMRT(mrt({ output, emissive }));
  const color = scenePass.getTextureNode('output');
  const glow = bloom(scenePass.getTextureNode('emissive'), 0.55, 0.3, 0);

  const pipeline = new RenderPipeline(renderer);
  pipeline.outputNode = color.add(glow);

  return {
    render() {
      pipeline.render();
    },
    dispose() {
      pipeline.dispose();
    },
  };
}
