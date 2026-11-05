import { ACESFilmicToneMapping, WebGPURenderer } from 'three/webgpu';

export type Backend = 'webgpu' | 'webgl2';

export interface RendererHandle {
  readonly renderer: WebGPURenderer;
  readonly backend: Backend;
}

/**
 * WebGPU first, WebGL2 fallback (handled inside WebGPURenderer).
 * Add `?gl=webgl2` to the URL to force the fallback path for testing; it is a first-class target.
 */
export async function createRenderer(parent: HTMLElement): Promise<RendererHandle> {
  const forceWebGL = new URLSearchParams(location.search).get('gl') === 'webgl2';
  const renderer = new WebGPURenderer({ antialias: true, forceWebGL, powerPreference: 'high-performance' });
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  await renderer.init();

  const backendInfo = renderer.backend as { isWebGPUBackend?: boolean };
  const backend: Backend = backendInfo.isWebGPUBackend === true ? 'webgpu' : 'webgl2';

  renderer.domElement.setAttribute('aria-label', 'VOID game view');
  parent.append(renderer.domElement);
  return { renderer, backend };
}
