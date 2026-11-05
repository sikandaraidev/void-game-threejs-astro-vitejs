import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Scene,
} from 'three/webgpu';
import { POD_STRIDE } from '../../sim/types';
import { PartList } from './kit';

/**
 * Salvage pods (asset brief §7, "Salvage Power-Up Pods" board): industrial crates with a glowing
 * core. Each kind has a unique SHAPE and colour (never colour alone). Shown at 3× real size so they
 * read in a dogfight.
 */
export interface Pods {
  update(pods: Float32Array, since: number, shipVz: number, time: number): void;
  dispose(): void;
}

/** Shield, Patch, Overcharge, Coolant, Missiles, Pulse. */
const GLOW = ['#6fe3ff', '#ff4d4d', '#ffb347', '#9ff4ff', '#ff6b3d', '#ffb347'];
const MAX_PER_KIND = 8;

function podShape(kind: number): { frame: BufferGeometry; glow: BufferGeometry } {
  const p = new PartList();
  switch (kind) {
    case 0: // Shield Cell: cube crate, cyan glass core
      p.add('trim', new BoxGeometry(0.62, 0.62, 0.62));
      p.add('emissive_engine', new BoxGeometry(0.4, 0.45, 0.66));
      break;
    case 1: // Patch Kit: wide crate with a red cross
      p.add('trim', new BoxGeometry(0.66, 0.5, 0.62));
      p.add('emissive_engine', new BoxGeometry(0.12, 0.34, 0.66));
      p.add('emissive_engine', new BoxGeometry(0.34, 0.12, 0.66));
      break;
    case 2: // Overcharge: tall canister, amber core
      p.add('trim', new CylinderGeometry(0.3, 0.3, 0.12, 8), [0, 0.38, 0]);
      p.add('trim', new CylinderGeometry(0.3, 0.3, 0.12, 8), [0, -0.38, 0]);
      for (let k = 0; k < 4; k++)
        p.add('trim', new BoxGeometry(0.06, 0.8, 0.06), [
          Math.cos(k * 1.571) * 0.27,
          0,
          Math.sin(k * 1.571) * 0.27,
        ]);
      p.add('emissive_engine', new CylinderGeometry(0.2, 0.2, 0.62, 10));
      break;
    case 3: // Coolant: ribbed cylinder with a handle
      p.add('trim', new CylinderGeometry(0.3, 0.3, 0.85, 12));
      for (const y of [-0.25, 0, 0.25])
        p.add('trim', new TorusGeometry(0.31, 0.03, 6, 16), [0, y, 0], [Math.PI / 2, 0, 0]);
      p.add('trim', new TorusGeometry(0.16, 0.04, 6, 10, Math.PI), [0.32, 0.1, 0], [0, 0, -Math.PI / 2]);
      p.add('emissive_engine', new BoxGeometry(0.22, 0.6, 0.62));
      break;
    case 4: // Swarm Missiles: crate of red tubes
      p.add('trim', new BoxGeometry(0.8, 0.6, 0.55));
      for (const x of [-0.24, 0, 0.24])
        p.add('emissive_engine', new CylinderGeometry(0.08, 0.08, 0.62, 8), [x, 0, 0], [Math.PI / 2, 0, 0]);
      break;
    default: // Lodestone Pulse: an amber shard in a spherical cage
      p.add('trim', new TorusGeometry(0.38, 0.035, 6, 20));
      p.add('trim', new TorusGeometry(0.38, 0.035, 6, 20), [0, 0, 0], [0, Math.PI / 2, 0]);
      p.add('trim', new TorusGeometry(0.38, 0.035, 6, 20), [0, 0, 0], [Math.PI / 2, 0, 0]);
      p.add('emissive_engine', new OctahedronGeometry(0.2, 0), [0, 0, 0], [0, 0, 0], [1, 1.6, 1]);
  }
  const built = p.build();
  return {
    frame: built.get('trim') ?? new SphereGeometry(0.4).toNonIndexed(),
    glow: built.get('emissive_engine') ?? new SphereGeometry(0.2).toNonIndexed(),
  };
}

export function createPods(scene: Scene): Pods {
  const frameMat = new MeshStandardMaterial({ color: new Color('#cfc8b8'), roughness: 0.5, metalness: 0.5 });
  const kinds = GLOW.map((hex, kind) => {
    const shape = podShape(kind);
    const glowMat = new MeshStandardMaterial({
      color: new Color('#000000'),
      emissive: new Color(hex),
      emissiveIntensity: 3,
    });
    const frame = new InstancedMesh(shape.frame, frameMat, MAX_PER_KIND);
    const glow = new InstancedMesh(shape.glow, glowMat, MAX_PER_KIND);
    for (const m of [frame, glow]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      scene.add(m);
    }
    return { frame, glow, glowMat, geos: [shape.frame, shape.glow] };
  });
  const counts = new Array<number>(GLOW.length).fill(0);
  const dummy = new Object3D();

  return {
    update(pods, since, shipVz, time) {
      counts.fill(0);
      for (let o = 0; o < pods.length; o += POD_STRIDE) {
        const kind = Math.min(GLOW.length - 1, pods[o + 3] ?? 0);
        const k = kinds[kind];
        const n = counts[kind] ?? 0;
        if (!k || n >= MAX_PER_KIND) continue;
        // Pods drift at 85% of ship speed (see sim updatePods).
        dummy.position.set(
          pods[o] ?? 0,
          (pods[o + 1] ?? 0) + Math.sin(time * 2 + o) * 0.3,
          (pods[o + 2] ?? 0) + shipVz * 0.85 * since,
        );
        dummy.rotation.set(time * 0.7 + o, time * 1.1 + o, 0);
        dummy.scale.setScalar(3);
        dummy.updateMatrix();
        k.frame.setMatrixAt(n, dummy.matrix);
        k.glow.setMatrixAt(n, dummy.matrix);
        counts[kind] = n + 1;
      }
      for (let kind = 0; kind < kinds.length; kind++) {
        const k = kinds[kind];
        if (!k) continue;
        k.frame.count = k.glow.count = counts[kind] ?? 0;
        k.frame.instanceMatrix.needsUpdate = true;
        k.glow.instanceMatrix.needsUpdate = true;
        k.glowMat.emissiveIntensity = 2.5 + Math.sin(time * 5) * 1;
      }
    },
    dispose() {
      frameMat.dispose();
      for (const k of kinds) {
        k.glowMat.dispose();
        for (const g of k.geos) g.dispose();
      }
    },
  };
}
