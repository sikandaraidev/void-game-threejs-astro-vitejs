import { BufferGeometry, Color, Float32BufferAttribute, Points, PointsMaterial } from 'three/webgpu';

export interface Starfield {
  readonly points: Points;
  /** Advance stars toward the camera to sell forward motion. */
  update(dt: number, speed: number): void;
  dispose(): void;
}

/** Deterministic PRNG so the sky is identical across reloads (and, later, across peers). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEPTH = 400;

export function createStarfield(count: number, seed = 7): Starfield {
  const rand = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const cold = new Color('#bfe9ff');
  const warm = new Color('#ffe2c0');
  const tmp = new Color();

  for (let i = 0; i < count; i++) {
    // A tube of stars around the flight path, so nothing passes through the ship.
    const angle = rand() * Math.PI * 2;
    const radius = 12 + rand() * 180;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = Math.sin(angle) * radius;
    positions[i * 3 + 2] = -rand() * DEPTH;
    tmp
      .copy(cold)
      .lerp(warm, rand() * rand())
      .multiplyScalar(0.4 + rand() * 0.8);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  const geometry = new BufferGeometry();
  const positionAttr = new Float32BufferAttribute(positions, 3);
  geometry.setAttribute('position', positionAttr);
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const material = new PointsMaterial({ size: 1, sizeAttenuation: false, vertexColors: true });
  const points = new Points(geometry, material);
  points.frustumCulled = false;

  return {
    points,
    update(dt, speed) {
      const arr = positionAttr.array as Float32Array;
      const step = dt * speed;
      for (let i = 2; i < arr.length; i += 3) {
        let z = (arr[i] ?? 0) + step;
        if (z > 10) z -= DEPTH;
        arr[i] = z;
      }
      positionAttr.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
