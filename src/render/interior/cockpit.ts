import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  MeshStandardNodeMaterial,
  PlaneGeometry,
  PointLight,
  RingGeometry,
  SphereGeometry,
} from 'three/webgpu';
import { abs, color, float, fract, max, smoothstep, time, uv, vec2 } from 'three/tsl';
import { mulberry32 } from '../../sim/rng';

/**
 * First-person interiors (asset brief §5). Built in CAMERA space and parented to the camera,
 * so they never swim or jitter. Rules: ≥ 60% of the view stays open to space; frames are dark;
 * only screens, lamps and the Lodestone leak glow.
 */
export interface Interior {
  readonly root: Group;
  update(dt: number): void;
  dispose(): void;
}

function frameMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: new Color('#1d2027'), roughness: 0.62, metalness: 0.7 });
}

/** Cyan instrument screen with scanlines and a slow sweep (procedural; zero textures). */
function screenMaterial(variant: number): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ color: new Color('#000000'), roughness: 0.4 });
  const p = uv();
  const scan = smoothstep(float(0.35), float(0.5), abs(fract(p.y.mul(60)).sub(0.5)));
  const sweep = smoothstep(float(0.06), float(0), abs(fract(time.mul(0.25).add(variant * 0.33)).sub(p.x)));
  const grid = max(
    smoothstep(float(0.47), float(0.5), abs(fract(p.x.mul(8)).sub(0.5))),
    smoothstep(float(0.47), float(0.5), abs(fract(p.y.mul(5)).sub(0.5))),
  );
  const ring = smoothstep(float(0.02), float(0), abs(p.sub(vec2(0.5, 0.5)).length().sub(0.3)));
  const intensity = grid
    .mul(0.35)
    .add(sweep.mul(0.8))
    .add(variant === 1 ? ring : float(0))
    .mul(scan.mul(0.4).add(0.6));
  m.emissiveNode = color(new Color('#6fe3ff')).mul(intensity).mul(1.4);
  return m;
}

export function createCockpit(): Interior {
  const r = mulberry32(42);
  const root = new Group();
  root.name = 'cockpit';
  const frame = frameMaterial();
  const tape = new MeshStandardMaterial({ color: new Color('#111216'), roughness: 0.95, metalness: 0.1 });
  const lamp = new MeshStandardMaterial({
    color: new Color('#000000'),
    emissive: new Color('#ffb347'),
    emissiveIntensity: 2,
  });
  const geos: { dispose(): void }[] = [];
  const add = (
    geo: BoxGeometry | CylinderGeometry | PlaneGeometry | SphereGeometry,
    mat: MeshStandardMaterial,
    pos: [number, number, number],
    rot: [number, number, number] = [0, 0, 0],
  ): Mesh => {
    geos.push(geo);
    const m = new Mesh(geo, mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    m.renderOrder = 10;
    root.add(m);
    return m;
  };

  // Canopy band: top header and lower sill, thick A-pillars angled outward.
  add(new BoxGeometry(2.6, 0.12, 0.25), frame, [0, 0.47, -0.78], [0.25, 0, 0]);
  add(new BoxGeometry(2.6, 0.06, 0.1), frame, [0, -0.2, -0.82]);
  for (const s of [-1, 1]) {
    add(new BoxGeometry(0.09, 0.95, 0.12), frame, [s * 0.74, 0.12, -0.8], [0, 0, s * -0.35]);
    add(new BoxGeometry(0.05, 0.9, 0.06), frame, [s * 0.36, 0.2, -0.86], [0, 0, s * -0.12]);
  }
  // Dashboard: an angled slab across the bottom.
  add(new BoxGeometry(1.9, 0.08, 0.5), frame, [0, -0.3, -0.62], [0.55, 0, 0]);
  add(new BoxGeometry(1.9, 0.25, 0.06), frame, [0, -0.43, -0.48]);
  // Three screens: status / targeting / crew.
  const screens = [0, 1, 2].map((i) => screenMaterial(i));
  for (let i = 0; i < 3; i++) {
    const g = new PlaneGeometry(0.34, 0.2);
    geos.push(g);
    const scr = new Mesh(g, screens[i]);
    scr.position.set((i - 1) * 0.44, -0.27, -0.635);
    scr.rotation.set(-1.02, 0, 0);
    scr.renderOrder = 11;
    root.add(scr);
  }
  // Rows of chunky toggles with tiny amber status lamps.
  for (let k = 0; k < 12; k++) {
    const x = -0.82 + k * 0.15;
    if (Math.abs(x) < 0.68) continue;
    add(new BoxGeometry(0.035, 0.05, 0.035), tape, [x, -0.31, -0.55], [0.55 + (r() - 0.5) * 0.6, 0, 0]);
    if (r() < 0.5) add(new SphereGeometry(0.008, 6, 4), lamp, [x + 0.03, -0.3, -0.58]);
  }
  // Side consoles and grips (lower corners).
  for (const s of [-1, 1]) {
    add(new BoxGeometry(0.4, 0.3, 0.6), frame, [s * 0.95, -0.5, -0.45], [0, s * 0.3, 0]);
    add(new CylinderGeometry(0.035, 0.04, 0.22, 8), tape, [s * 0.58, -0.47, -0.42], [0.4, 0, 0]);
  }

  // Warm Lodestone light leaking in from the right (the spine is next to the cockpit).
  const glow = new PointLight('#ffb347', 1.2, 3, 2);
  glow.position.set(0.9, -0.15, -0.3);
  root.add(glow);

  let t = 0;
  return {
    root,
    update(dt) {
      t += dt;
      glow.intensity = 1.0 + Math.sin(t * 1.3) * 0.25;
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of [frame, tape, lamp, ...screens]) m.dispose();
    },
  };
}

export interface TurretInterior extends Interior {
  fire(side: number): void;
  setOverheated(on: boolean): void;
}

export function createTurretInterior(): TurretInterior {
  const root = new Group();
  root.name = 'turret';
  const frame = frameMaterial();
  const glass = new MeshStandardMaterial({
    color: new Color('#0d1a22'),
    roughness: 0.3,
    metalness: 0.6,
    transparent: true,
    opacity: 0.0,
  });
  const flashMat = new MeshStandardMaterial({
    color: new Color('#000000'),
    emissive: new Color('#9ff4ff'),
    emissiveIntensity: 0,
  });
  const heatMat = new MeshStandardMaterial({
    color: new Color('#000000'),
    emissive: new Color('#ffb347'),
    emissiveIntensity: 0.15,
  });
  const geos: { dispose(): void }[] = [];

  // Circular armoured port: dark everywhere outside a large circle (the turret feel).
  const port = new RingGeometry(0.52, 3, 64);
  geos.push(port);
  const portMesh = new Mesh(port, frame);
  portMesh.position.z = -0.6;
  portMesh.renderOrder = 10;
  root.add(portMesh);
  const rim = new RingGeometry(0.5, 0.53, 64);
  geos.push(rim);
  const rimMesh = new Mesh(rim, heatMat);
  rimMesh.position.z = -0.598;
  root.add(rimMesh);
  // Thin crosshair frame on the glass, broken at the centre so it never hides the target.
  for (const [w, h, x, y] of [
    [0.3, 0.004, -0.28, 0],
    [0.3, 0.004, 0.28, 0],
    [0.004, 0.2, 0, 0.3],
    [0.004, 0.2, 0, -0.3],
  ] as const) {
    const g = new BoxGeometry(w, h, 0.001);
    geos.push(g);
    const m = new Mesh(g, frame);
    m.position.set(x, y, -0.59);
    root.add(m);
  }
  void glass;

  // Twin barrels along the lower edges; they recoil on each shot.
  const barrels: Mesh[] = [];
  const flashes: Mesh[] = [];
  const barrelGeo = new CylinderGeometry(0.035, 0.05, 2.6, 10);
  const flashGeo = new SphereGeometry(0.09, 10, 8);
  geos.push(barrelGeo, flashGeo);
  for (const s of [-1, 1]) {
    const b = new Mesh(barrelGeo, frame);
    b.rotation.x = Math.PI / 2;
    b.position.set(s * 0.42, -0.33, -1.5);
    b.renderOrder = 10;
    root.add(b);
    barrels.push(b);
    const f = new Mesh(flashGeo, flashMat);
    f.position.set(s * 0.42, -0.33, -2.85);
    f.visible = false;
    root.add(f);
    flashes.push(f);
  }
  const recoil = [0, 0];
  let flashT = 0;
  let overheated = false;

  return {
    root,
    fire(side) {
      const i = side > 0 ? 1 : 0;
      recoil[i] = 0.12;
      flashT = 0.05;
      const f = flashes[i];
      if (f) f.visible = true;
    },
    setOverheated(on) {
      overheated = on;
    },
    update(dt) {
      for (let i = 0; i < 2; i++) {
        recoil[i] = Math.max(0, (recoil[i] ?? 0) - dt * 0.9);
        const b = barrels[i];
        if (b) b.position.z = -1.5 + (recoil[i] ?? 0);
      }
      flashT -= dt;
      if (flashT <= 0) for (const f of flashes) f.visible = false;
      flashMat.emissiveIntensity = flashT > 0 ? 8 : 0;
      heatMat.emissiveIntensity = overheated ? 3 + Math.sin(performance.now() / 80) * 1.5 : 0.15;
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of [frame, glass, flashMat, heatMat]) m.dispose();
    },
  };
}
