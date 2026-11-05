import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
  type Camera,
} from 'three/webgpu';
import { mulberry32 } from '../sim/rng';

export interface Starfield {
  readonly points: Points;
  /** Stars are infinitely far: they follow the camera (no parallax). Speed comes from the dust. */
  follow(camera: Camera): void;
  dispose(): void;
}

export function createStarfield(count: number, seed = 7): Starfield {
  const rand = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const cold = new Color('#bfe9ff');
  const warm = new Color('#ffe2c0');
  const tmp = new Color();

  for (let i = 0; i < count; i++) {
    // Uniform direction on a sphere shell inside the sky dome.
    const u = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const r = 520 + rand() * 260;
    const s = Math.sqrt(1 - u * u);
    positions[i * 3] = Math.cos(theta) * s * r;
    positions[i * 3 + 1] = u * r;
    positions[i * 3 + 2] = Math.sin(theta) * s * r;
    tmp
      .copy(cold)
      .lerp(warm, rand() * rand())
      .multiplyScalar(0.35 + rand() ** 3 * 1.2);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const material = new PointsMaterial({
    size: 1,
    sizeAttenuation: false,
    vertexColors: true,
    depthWrite: false,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -9;

  return {
    points,
    follow(camera) {
      points.position.copy(camera.position);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
