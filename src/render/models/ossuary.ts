import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
} from 'three/webgpu';
import { BOSS_NODES } from '../../sim/constants';
import { mulberry32 } from '../../sim/rng';
import { PartList, makeMaterials } from './kit';

/**
 * THE OSSUARY (asset brief §6.4, concept image-gen-4): a vertical cathedral of fused wrecks.
 * Tiers of arched rib-plates, spires, violet "windows", orbiting debris rings, and four amber
 * hearts in arched alcoves: the only amber on any enemy (Von Restorff: weak points stand out).
 */
export interface Ossuary {
  readonly root: Group;
  update(time: number, nodes: readonly number[]): void;
  dispose(): void;
}

export function createOssuary(): Ossuary {
  const r = mulberry32(900);
  const mats = makeMaterials({ hull: '#bdb6a8', trim: '#1b1820', paint: '#7a3e2a', hollow: '#c9b8ff' });
  mats.hull.roughness = 0.7;
  mats.emissive_hollow.emissiveIntensity = 1.8;
  const p = new PartList();

  // Trunk: stacked, slightly twisted wreck sections tapering upward.
  for (let k = 0; k < 12; k++) {
    const y = -60 + k * 10;
    const w = 26 - k * 1.3;
    p.add(
      k % 3 === 0 ? 'hull' : 'trim',
      new BoxGeometry(w, 10.5, w * 0.7),
      [(r() - 0.5) * 2, y, 0],
      [0, (r() - 0.5) * 0.25, 0],
    );
  }
  // Gothic spires on the crown.
  for (let k = 0; k < 9; k++) {
    const x = (k - 4) * 4.2 + (r() - 0.5) * 2;
    const h = 18 + r() * 26;
    p.add('trim', new ConeGeometry(1.2 + r(), h, 5), [x, 58 + h / 2 - Math.abs(x) * 0.8, (r() - 0.5) * 8]);
  }
  // Tiers of arched rib-plates sweeping out and down like shells (the silhouette read).
  for (let tier = 0; tier < 5; tier++) {
    const y = 40 - tier * 22;
    for (const side of [-1, 1]) {
      const arc = new TorusGeometry(24 - tier, 1.6, 6, 24, Math.PI * 0.75);
      p.add(
        tier % 2 ? 'hull' : 'trim',
        arc,
        [side * 6, y, 10],
        [Math.PI / 2 - 0.25, 0, side > 0 ? -0.2 : Math.PI + 0.2],
      );
      p.add('hull', new BoxGeometry(16, 1.2, 9), [side * 22, y - 3, 14], [0.3, side * 0.5, side * 0.25]);
    }
  }
  // Fused wreckage chunks: whole dead ships welded on at odd angles.
  for (let k = 0; k < 46; k++) {
    const y = -60 + r() * 120;
    const ang = r() * Math.PI * 2;
    const rad = 12 + r() * 10;
    p.add(
      r() < 0.3 ? 'hull' : 'trim',
      new BoxGeometry(2 + r() * 5, 2 + r() * 4, 6 + r() * 14),
      [Math.cos(ang) * rad, y, Math.sin(ang) * rad * 0.7],
      [r() * 3, r() * 3, r() * 3],
    );
  }
  // Violet "cathedral windows": tall glowing slits in the trunk face.
  for (let k = 0; k < 26; k++) {
    const y = -55 + r() * 100;
    const x = (r() - 0.5) * 22;
    p.add('emissive_hollow', new BoxGeometry(0.9, 5 + r() * 9, 0.4), [x, y, 10 + r() * 2]);
  }
  // Arched alcoves framing each heart.
  for (const n of BOSS_NODES) {
    const arch = new TorusGeometry(7.5, 1.1, 6, 18, Math.PI);
    p.add('trim', arch, [n.x, n.y, n.z - 1.5], [0, 0, 0]);
    p.add('trim', new CylinderGeometry(1, 1, 8, 6), [n.x - 7.5, n.y - 4, n.z - 1.5]);
    p.add('trim', new CylinderGeometry(1, 1, 8, 6), [n.x + 7.5, n.y - 4, n.z - 1.5]);
  }

  const root = new Group();
  root.name = 'ossuary';
  for (const [name, geo] of p.build()) root.add(new Mesh(geo, mats[name]));

  // Hearts: one material each so they can pulse and die independently.
  const heartGeo = new SphereGeometry(4.6, 20, 14);
  const heartMats = BOSS_NODES.map(
    () =>
      new MeshStandardMaterial({
        color: new Color('#000000'),
        emissive: new Color('#ffb347'),
        emissiveIntensity: 4,
      }),
  );
  const hearts = BOSS_NODES.map((n, i) => {
    const m = new Mesh(heartGeo, heartMats[i]);
    m.position.set(n.x, n.y, n.z);
    m.scale.set(1, 1.35, 1);
    root.add(m);
    return m;
  });

  // Debris rings orbiting the cathedral.
  const debrisGeo = new BoxGeometry(1, 1, 1);
  const debris = new InstancedMesh(debrisGeo, mats.hull, 220);
  debris.instanceMatrix.setUsage(DynamicDrawUsage);
  root.add(debris);
  const ring = Array.from({ length: 220 }, (_, i) => ({
    ring: i % 2,
    a: r() * Math.PI * 2,
    rad: (i % 2 ? 70 : 92) + (r() - 0.5) * 8,
    y: (i % 2 ? 25 : -20) + (r() - 0.5) * 4,
    s: 1 + r() * 4,
    spin: r() * 3,
  }));
  const dummy = new Object3D();

  return {
    root,
    update(time, nodes) {
      for (let i = 0; i < hearts.length; i++) {
        const alive = (nodes[i] ?? 0) > 0;
        const m = heartMats[i];
        if (m) m.emissiveIntensity = alive ? 3 + Math.sin(time * 4 + i * 1.7) * 1.4 : 0.15;
        hearts[i]?.scale.setScalar(alive ? 1 + Math.sin(time * 4 + i) * 0.05 : 0.7);
      }
      for (let i = 0; i < ring.length; i++) {
        const d = ring[i];
        if (!d) continue;
        const a = d.a + time * (d.ring ? 0.05 : -0.035);
        dummy.position.set(Math.cos(a) * d.rad, d.y + Math.sin(a * 2) * 3, Math.sin(a) * d.rad * 0.55);
        dummy.rotation.set(time * 0.2 + d.spin, d.spin, 0);
        dummy.scale.set(d.s * 2.2, d.s * 0.6, d.s);
        dummy.updateMatrix();
        debris.setMatrixAt(i, dummy.matrix);
      }
      debris.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      root.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
      debrisGeo.dispose();
      heartGeo.dispose();
      for (const m of [...Object.values(mats), ...heartMats]) m.dispose();
    },
  };
}
