import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  OctahedronGeometry,
  PlaneGeometry,
  SphereGeometry,
  type BufferGeometry,
} from 'three/webgpu';
import { mulberry32 } from '../../sim/rng';
import { PartList } from './kit';

/**
 * Hollow Fleet geometry for instancing (asset brief §6, concept "NEEDLE" image).
 * Each class returns merged geometry per material so N ships = 2 draw calls.
 * Nose toward -Z.
 */
export interface FleetGeometry {
  hull: BufferGeometry;
  rust: BufferGeometry;
  glow: BufferGeometry;
}

export interface MothGeometry extends FleetGeometry {
  /** One wing, hinge at the origin, extending along +X. Instanced 4× per Moth. */
  wing: BufferGeometry;
  /** Glowing inner membrane of a wing (scaled by openness). */
  wingGlow: BufferGeometry;
}

function take(parts: PartList): FleetGeometry {
  const built = parts.build();
  const empty = (): BufferGeometry => new BoxGeometry(0.001, 0.001, 0.001).toNonIndexed();
  return {
    hull: built.get('trim') ?? empty(),
    rust: built.get('paint') ?? empty(),
    glow: built.get('emissive_hollow') ?? empty(),
  };
}

/** NEEDLE: 9 m interceptor. Armoured fore-body, sensor eye and spike, ribbed cage spine, three raked fins. */
export function needleGeometry(): FleetGeometry {
  const r = mulberry32(31);
  const p = new PartList();
  // Spine.
  p.add('trim', new CylinderGeometry(0.16, 0.2, 7.5, 6), [0, 0, 0.6], [Math.PI / 2, 0, 0]);
  p.add('trim', new CylinderGeometry(0.08, 0.08, 7, 5), [0.28, -0.12, 0.8], [Math.PI / 2, 0, 0]);
  p.add('trim', new CylinderGeometry(0.08, 0.08, 7, 5), [-0.28, -0.12, 0.8], [Math.PI / 2, 0, 0]);
  // Armoured fore-body: mismatched salvaged plates.
  for (let k = 0; k < 6; k++) {
    const z = -3 + k * 0.55;
    const w = 0.7 + r() * 0.35;
    p.add(
      k % 3 === 1 ? 'paint' : 'trim',
      new BoxGeometry(w, 0.55 + r() * 0.2, 0.6),
      [(r() - 0.5) * 0.12, (r() - 0.5) * 0.1, z],
      [0, 0, (r() - 0.5) * 0.25],
    );
  }
  // Nose cone, spike and sensor housing.
  p.add('trim', new ConeGeometry(0.42, 1.4, 8), [0, 0, -4.2], [-Math.PI / 2, 0, 0]);
  p.add('trim', new CylinderGeometry(0.02, 0.07, 1.6, 5), [0, 0, -5.4], [Math.PI / 2, 0, 0]);
  p.add('trim', new CylinderGeometry(0.02, 0.05, 1.1, 5), [0.18, -0.2, -4.9], [Math.PI / 2, 0, 0]);
  p.add('emissive_hollow', new SphereGeometry(0.2, 10, 8), [0, 0.05, -3.65]);
  // Ribbed cage: rectangular hoops around the bare spine (the skeletal read).
  for (let k = 0; k < 4; k++) {
    const z = 0.2 + k * 0.9;
    const s = 0.75 - k * 0.04;
    p.add('trim', new BoxGeometry(s * 2, 0.07, 0.1), [0, s * 0.8, z]);
    p.add('trim', new BoxGeometry(s * 2, 0.07, 0.1), [0, -s * 0.8, z]);
    p.add('trim', new BoxGeometry(0.07, s * 1.6, 0.1), [s, 0, z]);
    p.add('trim', new BoxGeometry(0.07, s * 1.6, 0.1), [-s, 0, z]);
  }
  // Hollow-light fusion seams along the spine.
  p.add('emissive_hollow', new BoxGeometry(0.05, 0.05, 2.6), [0, 0.2, 1.2]);
  p.add('emissive_hollow', new BoxGeometry(0.05, 0.05, 1.2), [0.3, 0.05, -1.4]);
  // Three raked fins at the tail: top and two angled down-out.
  for (const a of [0, (2 * Math.PI) / 3, (-2 * Math.PI) / 3]) {
    p.add(
      a === 0 ? 'paint' : 'trim',
      new BoxGeometry(0.06, 1.8, 1.4),
      [Math.sin(a) * 0.9, Math.cos(a) * 0.9, 4.1],
      [0.45 * Math.cos(a), 0, -a],
    );
  }
  // Engine glow.
  p.add('emissive_hollow', new CylinderGeometry(0.22, 0.12, 0.3, 8), [0, 0, 4.6], [Math.PI / 2, 0, 0]);
  return take(p);
}

/** MOTH: 12 m heavy fighter. Armoured body; four hinged wings that open before it fires. */
export function mothGeometry(): MothGeometry {
  const r = mulberry32(57);
  const p = new PartList();
  p.add('trim', new SphereGeometry(1, 14, 10), [0, 0, 0], [0, 0, 0], [1.35, 1.0, 4.2]);
  for (let k = 0; k < 7; k++) {
    const z = -3 + k * 0.95;
    p.add(
      k % 2 ? 'trim' : 'paint',
      new BoxGeometry(1.9 + r() * 0.5, 0.35, 0.8),
      [0, 0.75 + r() * 0.15, z],
      [0, 0, (r() - 0.5) * 0.2],
    );
  }
  p.add('trim', new OctahedronGeometry(0.9, 0), [0, 0.1, -4.2], [0, 0, 0], [0.9, 0.7, 1.4]);
  p.add('emissive_hollow', new SphereGeometry(0.16, 8, 6), [0.35, 0.25, -4.9]);
  p.add('emissive_hollow', new SphereGeometry(0.16, 8, 6), [-0.35, 0.25, -4.9]);
  p.add('emissive_hollow', new SphereGeometry(0.12, 8, 6), [0, 0.45, -4.7]);
  p.add('emissive_hollow', new BoxGeometry(0.06, 0.06, 6), [0.9, 0.3, 0]);
  p.add('emissive_hollow', new BoxGeometry(0.06, 0.06, 6), [-0.9, 0.3, 0]);
  p.add('emissive_hollow', new CylinderGeometry(0.5, 0.3, 0.4, 10), [0, 0, 4.3], [Math.PI / 2, 0, 0]);
  const body = take(p);

  const w = new PartList();
  w.add('trim', new BoxGeometry(5.8, 0.12, 2.4), [2.9, 0, 0]);
  w.add('trim', new BoxGeometry(5.2, 0.2, 0.25), [2.6, 0.05, -1.15]);
  w.add('paint', new BoxGeometry(1.6, 0.13, 0.7), [4.6, 0, 0.6]);
  for (let k = 0; k < 4; k++) w.add('trim', new BoxGeometry(0.12, 0.16, 2.2), [1 + k * 1.3, 0.03, 0]);
  const wing = w.build().get('trim') ?? new BoxGeometry(1, 1, 1).toNonIndexed();
  const wingGlow = new PlaneGeometry(5.0, 1.9).toNonIndexed();
  wingGlow.rotateX(-Math.PI / 2);
  wingGlow.translate(2.8, -0.08, 0.1);
  return { ...body, wing, wingGlow };
}
