import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type Scene,
} from 'three/webgpu';
import { MAX_ENEMIES, MAX_ENEMY_BOLTS, MAX_PLAYER_BULLETS } from '../../sim/constants';
import { BULLET_STRIDE, ENEMY_STRIDE, EnemyKind, type Snapshot } from '../../sim/types';
import { mothGeometry, needleGeometry } from '../models/hollow';
import { createOssuary } from '../models/ossuary';

/**
 * Draws a snapshot. Everything is instanced (a couple of draw calls per ship class).
 * Positions are dead-reckoned (position + velocity × time since snapshot) so motion stays smooth
 * at any refresh rate. Fighters face along their velocity RELATIVE to the VESPER: that is the
 * motion the player actually sees, so passes and loops read correctly.
 */
export interface Entities {
  update(s: Snapshot, since: number, time: number): void;
  dispose(): void;
}

function instanced(geo: BufferGeometry, mat: MeshStandardMaterial, max: number, scene: Scene): InstancedMesh {
  const mesh = new InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

export function createEntities(scene: Scene): Entities {
  const black = new Color('#000000');
  const hullMat = new MeshStandardMaterial({ color: new Color('#2a2530'), roughness: 0.55, metalness: 0.7 });
  const rustMat = new MeshStandardMaterial({ color: new Color('#7a3e2a'), roughness: 0.8, metalness: 0.3 });
  const glowMat = new MeshStandardMaterial({
    color: black,
    emissive: new Color('#c9b8ff'),
    emissiveIntensity: 2.6,
  });
  const membraneMat = new MeshStandardMaterial({
    color: black,
    emissive: new Color('#b48cff'),
    emissiveIntensity: 2.2,
    side: 2,
  });
  const playerBoltMat = new MeshStandardMaterial({
    color: black,
    emissive: new Color('#7ff0ff'),
    emissiveIntensity: 5,
  });
  const missileMat = new MeshStandardMaterial({
    color: black,
    emissive: new Color('#ff6b3d'),
    emissiveIntensity: 5,
  });
  const enemyBoltMat = new MeshStandardMaterial({
    color: black,
    emissive: new Color('#ffb347'),
    emissiveIntensity: 5,
  });

  const needle = needleGeometry();
  const moth = mothGeometry();
  const pBoltGeo = new BoxGeometry(0.18, 0.18, 4);
  const missileGeo = new BoxGeometry(0.4, 0.4, 2.2);
  const eBoltGeo = new SphereGeometry(0.7, 10, 8);

  const needleHull = instanced(needle.hull, hullMat, MAX_ENEMIES, scene);
  const needleRust = instanced(needle.rust, rustMat, MAX_ENEMIES, scene);
  const needleGlow = instanced(needle.glow, glowMat, MAX_ENEMIES, scene);
  const mothHull = instanced(moth.hull, hullMat, MAX_ENEMIES, scene);
  const mothRust = instanced(moth.rust, rustMat, MAX_ENEMIES, scene);
  const mothGlow = instanced(moth.glow, glowMat, MAX_ENEMIES, scene);
  const mothWings = instanced(moth.wing, hullMat, MAX_ENEMIES * 4, scene);
  const mothMembranes = instanced(moth.wingGlow, membraneMat, MAX_ENEMIES * 4, scene);
  const pBolts = instanced(pBoltGeo, playerBoltMat, MAX_PLAYER_BULLETS, scene);
  const missiles = instanced(missileGeo, missileMat, 64, scene);
  const eBolts = instanced(eBoltGeo, enemyBoltMat, MAX_ENEMY_BOLTS, scene);

  const ossuary = createOssuary();
  ossuary.root.visible = false;
  scene.add(ossuary.root);

  const dummy = new Object3D();
  const look = new Vector3();
  const wingLocal = new Matrix4();
  const wingWorld = new Matrix4();
  const membraneScale = new Matrix4();
  const hinge = new Vector3();
  const wingQuat = new Quaternion();
  const wingEuler = new Euler(0, 0, 0, 'ZYX');
  const one = new Vector3(1, 1, 1);
  const deg = Math.PI / 180;

  const setFighter = (
    x: number,
    y: number,
    z: number,
    rvx: number,
    rvy: number,
    rvz: number,
    scale: number,
  ): void => {
    dummy.position.set(x, y, z);
    dummy.scale.setScalar(scale);
    const rl = Math.hypot(rvx, rvy, rvz);
    // Models face -Z; Object3D.lookAt aims +Z, so look at the point BEHIND the direction of travel.
    if (rl > 1) look.set(x - rvx, y - rvy, z - rvz);
    else look.set(x, y, z + 1);
    dummy.lookAt(look);
    dummy.rotateZ(Math.max(-0.9, Math.min(0.9, -rvx * 0.02)));
    dummy.updateMatrix();
  };

  return {
    update(s, since, time) {
      const sh = s.ship;
      let nn = 0;
      let nm = 0;
      let nw = 0;
      let nmem = 0;
      const e = s.enemies;
      for (let o = 0; o < e.length; o += ENEMY_STRIDE) {
        const vx = e[o + 3] ?? 0;
        const vy = e[o + 4] ?? 0;
        const vz = e[o + 5] ?? 0;
        const x = (e[o] ?? 0) + vx * since;
        const y = (e[o + 1] ?? 0) + vy * since;
        const z = (e[o + 2] ?? 0) + vz * since;
        const rvx = vx - sh.vx;
        const rvy = vy - sh.vy;
        const rvz = vz - sh.vz;
        if (e[o + 6] === EnemyKind.Needle) {
          setFighter(x, y, z, rvx, rvy, rvz, 1);
          needleHull.setMatrixAt(nn, dummy.matrix);
          needleRust.setMatrixAt(nn, dummy.matrix);
          needleGlow.setMatrixAt(nn, dummy.matrix);
          nn++;
        } else {
          setFighter(x, y, z, rvx, rvy, rvz, 1);
          mothHull.setMatrixAt(nm, dummy.matrix);
          mothRust.setMatrixAt(nm, dummy.matrix);
          mothGlow.setMatrixAt(nm, dummy.matrix);
          nm++;
          // Wings: folded back in cruise, spread wide before firing (the tell).
          const open = e[o + 8] ?? 0;
          const sweep = (78 - 70 * open) * deg;
          const dihedral = (6 + 18 * open) * deg;
          for (const side of [1, -1]) {
            for (const v of [1, -1]) {
              hinge.set(side * 1.2, v * 0.55, 0.6);
              wingEuler.set(0, side > 0 ? -sweep : Math.PI + sweep, side * v * dihedral);
              wingQuat.setFromEuler(wingEuler);
              wingLocal.compose(hinge, wingQuat, one);
              wingWorld.multiplyMatrices(dummy.matrix, wingLocal);
              mothWings.setMatrixAt(nw++, wingWorld);
              if (open > 0.05) {
                membraneScale.makeScale(1, 1, open);
                wingWorld.multiply(membraneScale);
                mothMembranes.setMatrixAt(nmem++, wingWorld);
              }
            }
          }
        }
      }
      for (const [mesh, n] of [
        [needleHull, nn],
        [needleRust, nn],
        [needleGlow, nn],
        [mothHull, nm],
        [mothRust, nm],
        [mothGlow, nm],
        [mothWings, nw],
        [mothMembranes, nmem],
      ] as const) {
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
      }

      // Bolts and missiles.
      let np = 0;
      let nmi = 0;
      const pb = s.playerBullets;
      for (let o = 0; o < pb.length; o += BULLET_STRIDE) {
        const vx = pb[o + 3] ?? 0;
        const vy = pb[o + 4] ?? 0;
        const vz = pb[o + 5] ?? 0;
        dummy.position.set(
          (pb[o] ?? 0) + vx * since,
          (pb[o + 1] ?? 0) + vy * since,
          (pb[o + 2] ?? 0) + vz * since,
        );
        look.set(dummy.position.x + vx, dummy.position.y + vy, dummy.position.z + vz);
        dummy.scale.setScalar(1);
        dummy.lookAt(look);
        dummy.updateMatrix();
        if (pb[o + 6]) missiles.setMatrixAt(nmi++, dummy.matrix);
        else pBolts.setMatrixAt(np++, dummy.matrix);
      }
      pBolts.count = np;
      missiles.count = Math.min(nmi, 64);
      pBolts.instanceMatrix.needsUpdate = true;
      missiles.instanceMatrix.needsUpdate = true;

      let ne = 0;
      const eb = s.enemyBolts;
      const pulse = 1 + Math.sin(time * 18) * 0.18;
      for (let o = 0; o < eb.length; o += BULLET_STRIDE) {
        dummy.position.set(
          (eb[o] ?? 0) + (eb[o + 3] ?? 0) * since,
          (eb[o + 1] ?? 0) + (eb[o + 4] ?? 0) * since,
          (eb[o + 2] ?? 0) + (eb[o + 5] ?? 0) * since,
        );
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(pulse);
        dummy.updateMatrix();
        eBolts.setMatrixAt(ne++, dummy.matrix);
      }
      eBolts.count = ne;
      eBolts.instanceMatrix.needsUpdate = true;

      // The Ossuary holds station ahead of the ship, so it moves at ship velocity between snapshots.
      if (s.boss && s.phase !== 'jump' && s.phase !== 'won') {
        ossuary.root.visible = true;
        const holding = s.phase === 'boss' ? 1 : 0;
        ossuary.root.position.set(s.boss.x, s.boss.y, s.boss.z + sh.vz * since * holding);
        ossuary.root.rotation.y = Math.sin(time * 0.05) * 0.15;
        ossuary.update(time, s.boss.nodes);
      } else {
        ossuary.root.visible = false;
      }
    },
    dispose() {
      for (const g of [
        needle.hull,
        needle.rust,
        needle.glow,
        moth.hull,
        moth.rust,
        moth.glow,
        moth.wing,
        moth.wingGlow,
        pBoltGeo,
        missileGeo,
        eBoltGeo,
      ])
        g.dispose();
      for (const m of [hullMat, rustMat, glowMat, membraneMat, playerBoltMat, missileMat, enemyBoltMat])
        m.dispose();
      ossuary.dispose();
    },
  };
}
