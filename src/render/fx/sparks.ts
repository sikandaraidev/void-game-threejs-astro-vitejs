import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  type Scene,
} from 'three/webgpu';
import { mulberry32 } from '../../sim/rng';

/**
 * Pooled hit sparks and explosion flashes (the "juice"). CPU-simulated for now;
 * moves to TSL compute in the Phase 3 performance pass.
 */
export interface Sparks {
  burst(x: number, y: number, z: number, count: number, speed: number, tone: 'hot' | 'cold'): void;
  blast(x: number, y: number, z: number, radius: number): void;
  update(dt: number): void;
  dispose(): void;
}

const MAX_SPARKS = 700;
const MAX_BLASTS = 24;

export function createSparks(scene: Scene): Sparks {
  const rand = mulberry32(99);
  const hotMat = new MeshStandardMaterial({
    color: new Color('#000000'),
    emissive: new Color('#ffd49a'),
    emissiveIntensity: 6,
  });
  const coldMat = new MeshStandardMaterial({
    color: new Color('#000000'),
    emissive: new Color('#9ff4ff'),
    emissiveIntensity: 6,
  });
  const blastMat = new MeshStandardMaterial({
    color: new Color('#000000'),
    emissive: new Color('#ffb36b'),
    emissiveIntensity: 3,
  });
  const sparkGeo = new BoxGeometry(0.12, 0.12, 0.9);
  const blastGeo = new SphereGeometry(1, 16, 12);

  const pools = {
    hot: makePool(new InstancedMesh(sparkGeo, hotMat, MAX_SPARKS)),
    cold: makePool(new InstancedMesh(sparkGeo, coldMat, MAX_SPARKS)),
  };
  const blasts = new InstancedMesh(blastGeo, blastMat, MAX_BLASTS);
  for (const m of [pools.hot.mesh, pools.cold.mesh, blasts]) {
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    m.frustumCulled = false;
    m.count = 0;
    scene.add(m);
  }
  const blastData = {
    x: new Float32Array(MAX_BLASTS),
    y: new Float32Array(MAX_BLASTS),
    z: new Float32Array(MAX_BLASTS),
    r: new Float32Array(MAX_BLASTS),
    t: new Float32Array(MAX_BLASTS).fill(1),
  };
  let blastNext = 0;
  const dummy = new Object3D();

  function makePool(mesh: InstancedMesh) {
    return {
      mesh,
      next: 0,
      x: new Float32Array(MAX_SPARKS),
      y: new Float32Array(MAX_SPARKS),
      z: new Float32Array(MAX_SPARKS),
      vx: new Float32Array(MAX_SPARKS),
      vy: new Float32Array(MAX_SPARKS),
      vz: new Float32Array(MAX_SPARKS),
      life: new Float32Array(MAX_SPARKS),
    };
  }

  return {
    burst(x, y, z, count, speed, tone) {
      const p = pools[tone];
      for (let k = 0; k < count; k++) {
        const i = p.next;
        p.next = (p.next + 1) % MAX_SPARKS;
        const u = rand() * 2 - 1;
        const th = rand() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        const v = speed * (0.35 + rand() * 0.65);
        p.x[i] = x;
        p.y[i] = y;
        p.z[i] = z;
        p.vx[i] = Math.cos(th) * s * v;
        p.vy[i] = u * v;
        p.vz[i] = Math.sin(th) * s * v;
        p.life[i] = 0.35 + rand() * 0.45;
      }
    },
    blast(x, y, z, radius) {
      const i = blastNext;
      blastNext = (blastNext + 1) % MAX_BLASTS;
      blastData.x[i] = x;
      blastData.y[i] = y;
      blastData.z[i] = z;
      blastData.r[i] = radius;
      blastData.t[i] = 0;
    },
    update(dt) {
      for (const p of [pools.hot, pools.cold]) {
        let n = 0;
        for (let i = 0; i < MAX_SPARKS; i++) {
          const life = (p.life[i] ?? 0) - dt;
          p.life[i] = life;
          if (life <= 0) continue;
          const drag = 1 - dt * 2.5;
          p.vx[i] = (p.vx[i] ?? 0) * drag;
          p.vy[i] = (p.vy[i] ?? 0) * drag;
          p.vz[i] = (p.vz[i] ?? 0) * drag;
          const x = (p.x[i] = (p.x[i] ?? 0) + (p.vx[i] ?? 0) * dt);
          const y = (p.y[i] = (p.y[i] ?? 0) + (p.vy[i] ?? 0) * dt);
          const z = (p.z[i] = (p.z[i] ?? 0) + (p.vz[i] ?? 0) * dt);
          dummy.position.set(x, y, z);
          dummy.lookAt(x + (p.vx[i] ?? 0), y + (p.vy[i] ?? 0), z + (p.vz[i] ?? 0));
          dummy.scale.setScalar(Math.min(1, life * 2.5));
          dummy.updateMatrix();
          p.mesh.setMatrixAt(n++, dummy.matrix);
        }
        p.mesh.count = n;
        p.mesh.instanceMatrix.needsUpdate = true;
      }
      let nb = 0;
      for (let i = 0; i < MAX_BLASTS; i++) {
        const t = (blastData.t[i] = (blastData.t[i] ?? 1) + dt / 0.45);
        if (t >= 1) continue;
        // Fast expand, slow collapse: reads as a flash.
        const k = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75;
        dummy.position.set(blastData.x[i] ?? 0, blastData.y[i] ?? 0, blastData.z[i] ?? 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(Math.max(0.001, (blastData.r[i] ?? 1) * k));
        dummy.updateMatrix();
        blasts.setMatrixAt(nb++, dummy.matrix);
      }
      blasts.count = nb;
      blasts.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      sparkGeo.dispose();
      blastGeo.dispose();
      for (const m of [hotMat, coldMat, blastMat]) m.dispose();
    },
  };
}
