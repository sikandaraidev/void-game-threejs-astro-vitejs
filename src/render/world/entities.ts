import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  SphereGeometry,
  TetrahedronGeometry,
  TorusGeometry,
  Vector3,
  type Scene,
} from 'three/webgpu';
import { BOSS_NODES, MAX_ENEMIES, MAX_ENEMY_BOLTS, MAX_PLAYER_BULLETS } from '../../sim/constants';
import { BULLET_STRIDE, ENEMY_STRIDE, EnemyKind, type Snapshot } from '../../sim/types';

/**
 * Draws a snapshot. Everything is instanced (one draw call per kind).
 * Positions are dead-reckoned: snapshot position + velocity × time since the snapshot,
 * so motion stays smooth at any display refresh rate.
 */
export interface Entities {
  update(s: Snapshot, since: number, time: number): void;
  dispose(): void;
}

function instanced(
  geo: BoxGeometry | SphereGeometry | OctahedronGeometry | TetrahedronGeometry,
  mat: MeshStandardMaterial,
  max: number,
): InstancedMesh {
  const mesh = new InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  return mesh;
}

export function createEntities(scene: Scene): Entities {
  // Unmade (known-space tier): bioluminescent crystal, violet. Player = cyan; danger = amber.
  const shardMat = new MeshStandardMaterial({
    color: new Color('#1b1430'),
    emissive: new Color('#b98cff'),
    emissiveIntensity: 1.3,
    roughness: 0.25,
    metalness: 0.4,
    flatShading: true,
  });
  const chaserMat = new MeshStandardMaterial({
    color: new Color('#1d0f24'),
    emissive: new Color('#ff5fd2'),
    emissiveIntensity: 1.5,
    roughness: 0.3,
    metalness: 0.5,
    flatShading: true,
  });
  const playerBoltMat = new MeshStandardMaterial({
    color: new Color('#000000'),
    emissive: new Color('#7ff0ff'),
    emissiveIntensity: 5,
  });
  const enemyBoltMat = new MeshStandardMaterial({
    color: new Color('#000000'),
    emissive: new Color('#ffb347'),
    emissiveIntensity: 5,
  });

  const shardGeo = new OctahedronGeometry(1, 0);
  const chaserGeo = new TetrahedronGeometry(1.7, 0);
  const pBoltGeo = new BoxGeometry(0.16, 0.16, 3.4);
  const eBoltGeo = new SphereGeometry(0.6, 10, 8);

  const shards = instanced(shardGeo, shardMat, MAX_ENEMIES);
  const chasers = instanced(chaserGeo, chaserMat, MAX_ENEMIES);
  const pBolts = instanced(pBoltGeo, playerBoltMat, MAX_PLAYER_BULLETS);
  const eBolts = instanced(eBoltGeo, enemyBoltMat, MAX_ENEMY_BOLTS);
  scene.add(shards, chasers, pBolts, eBolts);

  // The Warden: the first destination guardian. Body absorbs fire; the four amber nodes are the weak points.
  const boss = new Group();
  boss.visible = false;
  const bossBodyGeo = new IcosahedronGeometry(13, 1);
  const bossBodyMat = new MeshStandardMaterial({
    color: new Color('#120d1e'),
    emissive: new Color('#5b3cff'),
    emissiveIntensity: 0.25,
    roughness: 0.35,
    metalness: 0.7,
    flatShading: true,
  });
  boss.add(new Mesh(bossBodyGeo, bossBodyMat));
  const ringGeo = new TorusGeometry(21, 0.7, 8, 96);
  const ringMat = new MeshStandardMaterial({
    color: new Color('#05040a'),
    emissive: new Color('#b98cff'),
    emissiveIntensity: 1.6,
  });
  const ring = new Mesh(ringGeo, ringMat);
  boss.add(ring);
  const nodeGeo = new SphereGeometry(2.6, 20, 14);
  const nodeMats = BOSS_NODES.map(
    () =>
      new MeshStandardMaterial({
        color: new Color('#000000'),
        emissive: new Color('#ffb347'),
        emissiveIntensity: 4,
      }),
  );
  const nodes = BOSS_NODES.map((n, i) => {
    const m = new Mesh(nodeGeo, nodeMats[i]);
    m.position.set(n.x, n.y, n.z);
    boss.add(m);
    return m;
  });
  scene.add(boss);

  const dummy = new Object3D();
  const look = new Vector3();

  return {
    update(s, since, time) {
      // Enemies
      let ns = 0;
      let nc = 0;
      const e = s.enemies;
      for (let o = 0; o < e.length; o += ENEMY_STRIDE) {
        const x = (e[o] ?? 0) + (e[o + 3] ?? 0) * since;
        const y = (e[o + 1] ?? 0) + (e[o + 4] ?? 0) * since;
        const z = (e[o + 2] ?? 0) + (e[o + 5] ?? 0) * since;
        dummy.position.set(x, y, z);
        if (e[o + 6] === EnemyKind.Shard) {
          dummy.rotation.set(0, time * 1.4 + o, 0);
          dummy.scale.set(2.3, 3.8, 2.3);
          dummy.updateMatrix();
          shards.setMatrixAt(ns++, dummy.matrix);
        } else {
          look.set(x + (e[o + 3] ?? 0), y + (e[o + 4] ?? 0), z + (e[o + 5] ?? 0) - 1);
          dummy.scale.set(1.5, 1.5, 2.6);
          dummy.lookAt(look);
          dummy.rotateZ(time * 3);
          dummy.updateMatrix();
          chasers.setMatrixAt(nc++, dummy.matrix);
        }
      }
      shards.count = ns;
      chasers.count = nc;
      shards.instanceMatrix.needsUpdate = true;
      chasers.instanceMatrix.needsUpdate = true;

      // Bolts
      const drawBolts = (arr: Float32Array, mesh: InstancedMesh, oriented: boolean, pulse: number): void => {
        let n = 0;
        for (let o = 0; o < arr.length; o += BULLET_STRIDE) {
          const vx = arr[o + 3] ?? 0;
          const vy = arr[o + 4] ?? 0;
          const vz = arr[o + 5] ?? 0;
          dummy.position.set(
            (arr[o] ?? 0) + vx * since,
            (arr[o + 1] ?? 0) + vy * since,
            (arr[o + 2] ?? 0) + vz * since,
          );
          dummy.rotation.set(0, 0, 0);
          if (oriented) {
            look.set(dummy.position.x + vx, dummy.position.y + vy, dummy.position.z + vz);
            dummy.lookAt(look);
          }
          dummy.scale.setScalar(pulse);
          dummy.updateMatrix();
          mesh.setMatrixAt(n++, dummy.matrix);
        }
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
      };
      drawBolts(s.playerBullets, pBolts, true, 1);
      drawBolts(s.enemyBolts, eBolts, false, 1 + Math.sin(time * 18) * 0.18);

      // Boss
      if (s.boss) {
        boss.visible = true;
        // The Warden holds station ahead of the ship, so it moves at ship speed between snapshots.
        const holding = s.phase === 'boss' ? 1 : 0;
        boss.position.set(s.boss.x, s.boss.y, s.boss.z + s.ship.vz * since * holding);
        boss.rotation.y = time * 0.15;
        ring.rotation.x = Math.PI / 2 + Math.sin(time * 0.3) * 0.25;
        ring.rotation.y = time * 0.4;
        for (let i = 0; i < nodes.length; i++) {
          const alive = (s.boss.nodes[i] ?? 0) > 0;
          const mat = nodeMats[i];
          if (mat) mat.emissiveIntensity = alive ? 3 + Math.sin(time * 6 + i) * 1.5 : 0;
          const node = nodes[i];
          if (node) node.scale.setScalar(alive ? 1 : 0.6);
        }
        if (s.phase === 'jump' || s.phase === 'won') boss.visible = false;
      } else {
        boss.visible = false;
      }
    },
    dispose() {
      for (const g of [shardGeo, chaserGeo, pBoltGeo, eBoltGeo, bossBodyGeo, ringGeo, nodeGeo]) g.dispose();
      for (const m of [shardMat, chaserMat, playerBoltMat, enemyBoltMat, bossBodyMat, ringMat, ...nodeMats])
        m.dispose();
    },
  };
}
