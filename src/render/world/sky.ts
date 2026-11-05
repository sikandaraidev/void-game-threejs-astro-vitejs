import {
  BackSide,
  Color,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  SphereGeometry,
  Vector3,
  type Camera,
} from 'three/webgpu';
import {
  abs,
  clamp,
  color,
  dot,
  float,
  mix,
  mx_fractal_noise_float,
  normalView,
  normalize,
  positionLocal,
  positionViewDirection,
  pow,
  sin,
  smoothstep,
  vec3,
} from 'three/tsl';

/**
 * The awe layer: a procedural nebula sky, a gas giant and a sun, all parented to the camera
 * so they read as infinitely far away (no parallax) while dust and enemies provide speed.
 * Known-space palette: saturated. Later regions will drain colour (Blueprint v3 §1).
 */
export interface Sky {
  readonly root: Group;
  /** Direction toward the sun, for the key light. */
  readonly sunDirection: Vector3;
  follow(camera: Camera): void;
  dispose(): void;
}

export function createSky(): Sky {
  const root = new Group();
  root.name = 'sky';

  // Nebula dome. Bloom ignores it (no emissive), so the void stays deep.
  const dir = normalize(positionLocal);
  const warp = mx_fractal_noise_float(dir.mul(1.6), 3, 2.0, 0.5);
  const n1 = mx_fractal_noise_float(dir.mul(2.4).add(vec3(warp, warp, warp)), 4, 2.0, 0.5);
  const n2 = mx_fractal_noise_float(dir.mul(5.5).add(vec3(3.1, 1.7, 0.2)), 3, 2.0, 0.55);
  // A tilted galactic band gives the sky a direction, like a real Milky Way.
  const bandAxis = dir.y.add(dir.x.mul(0.35)).add(n1.mul(0.3));
  const band = smoothstep(float(0.6), float(0.0), abs(bandAxis));
  const density = clamp(n1.mul(0.9).add(0.45).mul(band.mul(0.85).add(0.15)), 0, 1);
  const deep = color(new Color('#0a0820'));
  const indigo = color(new Color('#2a1a6e'));
  const teal = color(new Color('#0f6f86'));
  const rose = color(new Color('#8a2a6c'));
  const ember = color(new Color('#c2652f'));
  const hue = mix(mix(indigo, teal, clamp(n2.add(0.5), 0, 1)), rose, clamp(warp.mul(1.4), 0, 1));
  const hot = mix(hue, ember, smoothstep(float(0.35), float(0.8), n2.mul(density)));
  const skyColor = mix(deep, hot, pow(density, float(1.6)).mul(0.55));

  const skyMat = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false });
  skyMat.colorNode = skyColor;
  const skyGeo = new SphereGeometry(820, 48, 24);
  const sky = new Mesh(skyGeo, skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  root.add(sky);

  // Gas giant with banded clouds and a glowing atmospheric rim (rim is emissive, so it blooms softly).
  const p = positionLocal.mul(1 / 190);
  const bandsN = mx_fractal_noise_float(p.mul(vec3(1.5, 6, 1.5)), 4, 2.0, 0.5);
  const stripes = sin(p.y.mul(18).add(bandsN.mul(4)))
    .mul(0.5)
    .add(0.5);
  const planetCol = mix(color(new Color('#3b2a5e')), color(new Color('#c98a5a')), stripes.mul(0.75));
  const rim = pow(float(1).sub(clamp(dot(normalView, positionViewDirection), 0, 1)), float(3.5));
  const planetMat = new MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  planetMat.colorNode = planetCol;
  planetMat.emissiveNode = color(new Color('#4fb7ff')).mul(rim).mul(1.6);
  const planetGeo = new SphereGeometry(190, 96, 64);
  const planet = new Mesh(planetGeo, planetMat);
  planet.position.set(-300, -150, -480);
  planet.rotation.z = 0.35;
  root.add(planet);

  // Sun: a small, very bright emissive disc. Bloom turns it into a halo.
  const sunDirection = new Vector3(0.55, 0.35, -0.75).normalize();
  const sunMat = new MeshStandardNodeMaterial({ color: new Color('#000000') });
  sunMat.emissiveNode = color(new Color('#fff1d6')).mul(9);
  const sunGeo = new SphereGeometry(12, 24, 16);
  const sun = new Mesh(sunGeo, sunMat);
  sun.position.copy(sunDirection).multiplyScalar(760);
  root.add(sun);

  return {
    root,
    sunDirection,
    follow(camera) {
      root.position.copy(camera.position);
    },
    dispose() {
      for (const g of [skyGeo, planetGeo, sunGeo]) g.dispose();
      for (const m of [skyMat, planetMat, sunMat]) m.dispose();
    },
  };
}
