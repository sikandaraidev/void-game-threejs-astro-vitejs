import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  OctahedronGeometry,
  Shape,
} from 'three/webgpu';
import { mulberry32 } from '../../sim/rng';
import { PartList, makeMaterials } from './kit';

/**
 * VESPER, deep-survey cutter (asset brief §4). Two blade hulls joined by three bridges, with the
 * amber Lodestone hanging in the open spine between them. Nose toward -Z, ~20 m long.
 */
export interface Vesper {
  readonly root: Group;
  setThrust(level: number): void;
  /** 0..1 pulse for the Lodestone (it breathes; brighter when the Pulse power-up is active). */
  setSignal(level: number): void;
  dispose(): void;
}

const HULL_X = 2.7;

function bladeGeometry(): ExtrudeGeometry {
  // Side profile in (z, y): long, low, with a raked blade nose and a stepped tail.
  const s = new Shape();
  s.moveTo(10, -1.0);
  s.lineTo(10, 0.9);
  s.lineTo(7.5, 1.15);
  s.lineTo(-3.5, 1.15);
  s.lineTo(-10.5, 0.15);
  s.lineTo(-10.2, -0.35);
  s.lineTo(-3, -1.0);
  s.closePath();
  const g = new ExtrudeGeometry(s, {
    depth: 1.7,
    bevelEnabled: true,
    bevelSize: 0.08,
    bevelThickness: 0.08,
    bevelSegments: 1,
  });
  // Shape X → world Z; extrusion → world X (centred).
  g.rotateY(-Math.PI / 2);
  g.translate(0.85, 0, 0);
  return g;
}

export function createVesper(): Vesper {
  const rand = mulberry32(707);
  const mats = makeMaterials({ hull: '#d8d2c4', trim: '#23262d', paint: '#c8642c', engine: '#6fe3ff' });
  const parts = new PartList();

  parts.mirrorX((side) => {
    const x = side * HULL_X;
    parts.add('hull', bladeGeometry(), [x, 0, 0]);
    // Dark keel and spine-facing inner wall (charcoal frame read).
    parts.add('trim', new BoxGeometry(0.5, 0.4, 16), [x - side * 0.65, -0.85, 1]);
    parts.add('trim', new BoxGeometry(0.2, 1.6, 12), [x - side * 0.92, 0.05, 2]);
    // Faded survey stripe along the outer flank.
    parts.add('paint', new BoxGeometry(0.06, 0.22, 11), [x + side * 0.9, 0.35, -1]);
    // Engines: two rectangular nozzles per hull, cyan.
    for (const y of [0.42, -0.42]) {
      parts.add('trim', new BoxGeometry(1.2, 0.62, 1.2), [x, y, 10.3]);
      parts.add('emissive_engine', new BoxGeometry(0.95, 0.4, 0.1), [x, y, 10.95]);
    }
    // Greebles: vents and panel blocks on the top deck.
    for (let k = 0; k < 9; k++) {
      const z = -6 + k * 1.7 + rand() * 0.6;
      parts.add('trim', new BoxGeometry(0.35 + rand() * 0.6, 0.12, 0.4 + rand() * 0.8), [
        x + (rand() - 0.5) * 0.9,
        1.2,
        z,
      ]);
    }
    // Forward chin cannons (the pilot's guns).
    parts.add(
      'trim',
      new CylinderGeometry(0.12, 0.14, 3.2, 8),
      [side * 1.6, -0.6, -6.5],
      [Math.PI / 2, 0, 0],
    );
  });

  // Cockpit: a narrow wraparound canopy band at the front of the PORT hull.
  parts.add('glass', new BoxGeometry(1.75, 0.42, 3.2), [-HULL_X, 1.0, -5.6], [0.12, 0, 0]);
  parts.add('trim', new BoxGeometry(1.8, 0.08, 3.3), [-HULL_X, 1.24, -5.6], [0.12, 0, 0]);

  // H-frame (per the VSP-07 turnaround): a forward crossbar carrying the central hub, a rear bridge,
  // and a spine beam joining them. The middle stays open so stars show through.
  parts.add('trim', new BoxGeometry(HULL_X * 2 - 1.4, 0.75, 1.6), [0, 0.35, 1.2]);
  parts.add('trim', new BoxGeometry(HULL_X * 2 - 1.4, 0.75, 1.4), [0, 0.35, 7.2]);
  parts.add('trim', new BoxGeometry(0.9, 0.5, 6), [0, 0.45, 4.2]);
  // Central hub (octagonal drum) with the dorsal turret on top and ventral turret below.
  parts.add('trim', new CylinderGeometry(1.25, 1.35, 1.1, 8), [0, 0.55, 1.2]);
  for (const y of [1, -1]) {
    const ty = y > 0 ? 1.55 : -0.55;
    parts.add('trim', new CylinderGeometry(0.75, 0.9, 0.55, 8), [0, ty, 1.2]);
    parts.add('trim', new BoxGeometry(1.1, 0.55, 1.2), [0, ty + y * 0.42, 1.0]);
    for (const bx of [-0.26, 0.26]) {
      parts.add(
        'trim',
        new CylinderGeometry(0.07, 0.09, 2.8, 8),
        [bx, ty + y * 0.45, -0.6],
        [Math.PI / 2, 0, 0],
      );
    }
  }

  // The Lodestone hangs beneath the hub in a clawed cradle, on cables, glowing amber.
  parts.add('emissive_signal', new OctahedronGeometry(0.7, 0), [0, -0.9, 0.6], [0, 0.4, 0], [0.9, 1.7, 0.9]);
  for (const a of [0, 1, 2, 3]) {
    const ang = (a / 4) * Math.PI * 2 + Math.PI / 4;
    parts.add(
      'trim',
      new BoxGeometry(0.1, 1.5, 0.1),
      [Math.cos(ang) * 0.6, -0.55, 0.6 + Math.sin(ang) * 0.6],
      [Math.sin(ang) * 0.35, 0, -Math.cos(ang) * 0.35],
    );
  }
  parts.mirrorX((side) => {
    // Cables from the hull walls to the cradle.
    parts.add('trim', new CylinderGeometry(0.05, 0.05, 2.3, 6), [side * 1.2, -0.35, 0.6], [0, 0, side * 1.1]);
    parts.add('trim', new CylinderGeometry(0.05, 0.05, 2.1, 6), [side * 1.1, -0.15, 1.3], [0, 0, side * 0.9]);
  });

  const root = new Group();
  root.name = 'vesper';
  for (const [name, geo] of parts.build()) {
    const mesh = new Mesh(geo, mats[name]);
    mesh.name = name;
    root.add(mesh);
  }

  return {
    root,
    setThrust(level) {
      mats.emissive_engine.emissiveIntensity = 1.6 + level * 2.6;
    },
    setSignal(level) {
      mats.emissive_signal.emissiveIntensity = 2.5 + level * 3;
    },
    dispose() {
      root.traverse((o) => {
        if (o instanceof Mesh) o.geometry.dispose();
      });
      for (const m of Object.values(mats)) m.dispose();
    },
  };
}
