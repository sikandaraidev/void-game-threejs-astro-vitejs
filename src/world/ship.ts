import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three/webgpu';

/**
 * Greybox ship built from primitives (Phase 0 placeholder).
 * Only the engines and the nav light are emissive, so only they bloom (art rule: light is information).
 * The ship's nose points down -Z (the direction of travel).
 */
export interface Ship {
  readonly root: Group;
  dispose(): void;
}

export function createShip(): Ship {
  const root = new Group();
  root.name = 'ship';

  const hull = new MeshStandardMaterial({ color: new Color('#4a5160'), roughness: 0.55, metalness: 0.6 });
  const panel = new MeshStandardMaterial({ color: new Color('#2a2f3a'), roughness: 0.8, metalness: 0.3 });
  const canopy = new MeshStandardMaterial({ color: new Color('#0c1a24'), roughness: 0.1, metalness: 0.9 });
  const engineGlow = new MeshStandardMaterial({
    color: new Color('#000000'),
    emissive: new Color('#6fe3ff'),
    emissiveIntensity: 2.2,
  });
  const navLight = new MeshStandardMaterial({
    color: new Color('#000000'),
    emissive: new Color('#ffb347'),
    emissiveIntensity: 1.6,
  });

  const geometries = [
    new CylinderGeometry(0.35, 0.55, 3.2, 12),
    new ConeGeometry(0.35, 1.1, 12),
    new SphereGeometry(0.32, 16, 12),
    new BoxGeometry(3.6, 0.08, 1.1),
    new BoxGeometry(0.08, 0.7, 0.9),
    new CylinderGeometry(0.2, 0.24, 0.9, 12),
    new CylinderGeometry(0.17, 0.17, 0.05, 12),
    new SphereGeometry(0.06, 8, 6),
  ] as const;
  const [fuselageG, noseG, canopyG, wingG, finG, nacelleG, exhaustG, lightG] = geometries;

  const fuselage = new Mesh(fuselageG, hull);
  fuselage.rotation.x = Math.PI / 2;
  root.add(fuselage);

  const nose = new Mesh(noseG, hull);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -2.15;
  root.add(nose);

  const cockpit = new Mesh(canopyG, canopy);
  cockpit.scale.set(1, 0.7, 1.8);
  cockpit.position.set(0, 0.32, -0.7);
  root.add(cockpit);

  const wings = new Mesh(wingG, panel);
  wings.position.set(0, -0.05, 0.6);
  root.add(wings);

  const fin = new Mesh(finG, panel);
  fin.position.set(0, 0.45, 1.1);
  root.add(fin);

  for (const side of [-1, 1]) {
    const nacelle = new Mesh(nacelleG, hull);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(side * 1.1, -0.05, 1.1);
    root.add(nacelle);

    const exhaust = new Mesh(exhaustG, engineGlow);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(side * 1.1, -0.05, 1.56);
    root.add(exhaust);

    const light = new Mesh(lightG, navLight);
    light.position.set(side * 1.8, -0.05, 0.6);
    root.add(light);
  }

  const mainExhaust = new Mesh(exhaustG, engineGlow);
  mainExhaust.rotation.x = Math.PI / 2;
  mainExhaust.scale.setScalar(2);
  mainExhaust.position.z = 1.62;
  root.add(mainExhaust);

  return {
    root,
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of [hull, panel, canopy, engineGlow, navLight]) m.dispose();
    },
  };
}
