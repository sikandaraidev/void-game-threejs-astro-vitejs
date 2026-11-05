import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  type Camera,
  type Scene,
} from 'three/webgpu';
import { mulberry32 } from '../../sim/rng';

/**
 * Speed dust: near-field streaks that wrap around the camera. They are the main cue for velocity
 * (stars and sky are infinitely far). Streak length scales with speed; the jump stretches them.
 */
export interface Dust {
  update(camera: Camera, speed: number): void;
  dispose(): void;
}

const COUNT = 320;
const SPAN_X = 70;
const SPAN_Y = 45;
const AHEAD = 190;
const BEHIND = 25;

export function createDust(scene: Scene): Dust {
  const rand = mulberry32(5);
  const geo = new BoxGeometry(0.035, 0.035, 1);
  const mat = new MeshBasicMaterial({
    color: new Color('#8fb8ff'),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const mesh = new InstancedMesh(geo, mat, COUNT);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const x = new Float32Array(COUNT);
  const y = new Float32Array(COUNT);
  const z = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    x[i] = (rand() * 2 - 1) * SPAN_X;
    y[i] = (rand() * 2 - 1) * SPAN_Y;
    z[i] = -rand() * AHEAD;
  }
  const dummy = new Object3D();

  return {
    update(camera, speed) {
      const c = camera.position;
      const len = Math.min(60, 0.4 + speed * 0.025 + Math.max(0, speed - 100) * 0.1);
      for (let i = 0; i < COUNT; i++) {
        // Wrap in camera space so dust is always around us.
        let dz = (z[i] ?? 0) - c.z;
        if (dz > BEHIND) {
          dz -= AHEAD + BEHIND;
          x[i] = c.x + (rand() * 2 - 1) * SPAN_X;
          y[i] = c.y + (rand() * 2 - 1) * SPAN_Y;
        }
        z[i] = c.z + dz;
        let dx = (x[i] ?? 0) - c.x;
        if (Math.abs(dx) > SPAN_X) x[i] = c.x - Math.sign(dx) * SPAN_X;
        dx = (y[i] ?? 0) - c.y;
        if (Math.abs(dx) > SPAN_Y) y[i] = c.y - Math.sign(dx) * SPAN_Y;
        dummy.position.set(x[i] ?? 0, y[i] ?? 0, z[i] ?? 0);
        dummy.scale.set(1, 1, len);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
