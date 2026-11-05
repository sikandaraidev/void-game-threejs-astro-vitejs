import {
  BackSide,
  Color,
  CubeCamera,
  CubeRenderTarget,
  DirectionalLight,
  Group,
  HalfFloatType,
  HemisphereLight,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  Scene,
  SphereGeometry,
  Vector3,
  type Camera,
  type CubeTexture,
  type WebGPURenderer,
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
 * The awe layer. The nebula and gas giant are expensive procedural shaders, so they are
 * rendered ONCE at load into a cube texture (baked), then used as:
 *   - scene.background (one cheap texture lookup per pixel instead of ~10 noise octaves), and
 *   - scene.environment (image-based lighting: metal hulls reflect the nebula for free).
 * Only the sun stays a live mesh, because it must bloom.
 * Known-space palette: saturated. Later regions will drain colour (Blueprint v3 §1).
 */
export interface Sky {
  /** Live part of the sky (the sun). Follows the camera. */
  readonly root: Group;
  readonly texture: CubeTexture;
  /** Direction toward the sun, for the key light. */
  readonly sunDirection: Vector3;
  follow(camera: Camera): void;
  dispose(): void;
}

const SUN_DIRECTION = new Vector3(0.55, 0.35, -0.75).normalize();

function buildBakeScene(): { scene: Scene; dispose: () => void } {
  const scene = new Scene();

  // Nebula dome.
  const dir = normalize(positionLocal);
  const warp = mx_fractal_noise_float(dir.mul(1.6), 3, 2.0, 0.5);
  const n1 = mx_fractal_noise_float(dir.mul(2.4).add(vec3(warp, warp, warp)), 5, 2.0, 0.5);
  const n2 = mx_fractal_noise_float(dir.mul(5.5).add(vec3(3.1, 1.7, 0.2)), 4, 2.0, 0.55);
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
  const skyGeo = new SphereGeometry(900, 64, 32);
  scene.add(new Mesh(skyGeo, skyMat));

  // Gas giant with banded clouds and an atmospheric rim.
  const p = positionLocal.mul(1 / 190);
  const bandsN = mx_fractal_noise_float(p.mul(vec3(1.5, 6, 1.5)), 5, 2.0, 0.5);
  const stripes = sin(p.y.mul(18).add(bandsN.mul(4)))
    .mul(0.5)
    .add(0.5);
  const planetCol = mix(color(new Color('#3b2a5e')), color(new Color('#c98a5a')), stripes.mul(0.75));
  const rim = pow(float(1).sub(clamp(dot(normalView, positionViewDirection), 0, 1)), float(3.5));
  const planetMat = new MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  planetMat.colorNode = planetCol;
  planetMat.emissiveNode = color(new Color('#4fb7ff')).mul(rim).mul(0.9);
  const planetGeo = new SphereGeometry(190, 128, 96);
  const planet = new Mesh(planetGeo, planetMat);
  planet.position.set(-300, -150, -480);
  planet.rotation.z = 0.35;
  scene.add(planet);

  const sunLight = new DirectionalLight('#fff1d6', 3);
  sunLight.position.copy(SUN_DIRECTION).multiplyScalar(100);
  scene.add(sunLight, new HemisphereLight('#3a2f6e', '#05060a', 0.15));

  return {
    scene,
    dispose() {
      skyGeo.dispose();
      planetGeo.dispose();
      skyMat.dispose();
      planetMat.dispose();
    },
  };
}

export function createSky(renderer: WebGPURenderer, size: number): Sky {
  // Bake.
  const target = new CubeRenderTarget(size, {
    type: HalfFloatType,
    generateMipmaps: true,
    minFilter: LinearMipmapLinearFilter,
  });
  const cubeCamera = new CubeCamera(1, 2000, target);
  const bake = buildBakeScene();
  cubeCamera.update(renderer, bake.scene);
  bake.dispose();

  // Live sun: a small, very bright emissive disc; bloom turns it into a halo.
  const root = new Group();
  root.name = 'sky';
  const sunMat = new MeshStandardNodeMaterial({ color: new Color('#000000') });
  sunMat.emissiveNode = color(new Color('#fff1d6')).mul(9);
  const sunGeo = new SphereGeometry(12, 24, 16);
  const sun = new Mesh(sunGeo, sunMat);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(760);
  root.add(sun);

  return {
    root,
    texture: target.texture,
    sunDirection: SUN_DIRECTION,
    follow(camera) {
      root.position.copy(camera.position);
    },
    dispose() {
      target.dispose();
      sunGeo.dispose();
      sunMat.dispose();
    },
  };
}
