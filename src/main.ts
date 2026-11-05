import { Clock, Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene } from 'three/webgpu';
import { createRenderer } from './bootstrap/renderer';
import { FEATURES } from './features';
import { decidePolicy, probeDevice } from './platform/devicePolicy';
import { createPipeline } from './render/post/pipeline';
import { createStatusLabel } from './ui/hud/statusLabel';
import { createShip } from './world/ship';
import { createStarfield } from './world/starfield';

/**
 * Factory wiring only (no game logic here). Phase 0 "hello ship" scene.
 */
async function boot(): Promise<void> {
  const stage = document.getElementById('stage');
  if (!stage) throw new Error('Missing #stage');

  const label = FEATURES.debugLabel ? createStatusLabel(stage) : null;
  label?.set('Booting systems…');

  const { renderer, backend } = await createRenderer(stage);
  const policy = decidePolicy(probeDevice(backend));
  renderer.setPixelRatio(policy.maxDpr);
  label?.set(`${backend} · ${policy.preset}`);

  const scene = new Scene();
  scene.background = new Color('#05060a');

  const camera = new PerspectiveCamera(55, 1, 0.1, 1000);
  // Three-quarter front hero shot: the ship flies toward us, stars stream past behind it.
  camera.position.set(5.2, 2.1, -6.8);
  camera.lookAt(0, 0, 0);

  scene.add(new HemisphereLight('#9fc8ff', '#05060a', 0.7));
  const key = new DirectionalLight('#dfeaff', 3.2);
  key.position.set(6, 7, -4);
  scene.add(key);
  const rim = new DirectionalLight('#ffb347', 2);
  rim.position.set(-6, 1, 5);
  scene.add(rim);

  const ship = createShip();
  scene.add(ship.root);

  const stars = FEATURES.starfield ? createStarfield(policy.starCount) : null;
  if (stars) scene.add(stars.points);

  const pipeline = createPipeline(renderer, scene, camera, FEATURES.bloom && policy.bloom);

  const resize = (): void => {
    const { clientWidth: w, clientHeight: h } = stage;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(stage);

  const clock = new Clock();
  let t = 0;
  const frame = (): void => {
    const dt = Math.min(clock.getDelta(), 1 / 20);
    t += dt;
    if (policy.cameraMotion) {
      ship.root.rotation.z = Math.sin(t * 0.6) * 0.18;
      ship.root.rotation.y = Math.sin(t * 0.25) * 0.35;
      ship.root.position.y = Math.sin(t * 0.9) * 0.12;
    }
    stars?.update(dt, policy.cameraMotion ? 60 : 15);
    if (pipeline) pipeline.render();
    else renderer.render(scene, camera);
  };

  // Pause when the tab is hidden (battery, fairness to other tabs).
  const setRunning = (running: boolean): void => {
    void renderer.setAnimationLoop(running ? frame : null);
    if (running) clock.getDelta();
  };
  document.addEventListener('visibilitychange', () => setRunning(!document.hidden));
  setRunning(true);
}

boot().catch((error: unknown) => {
  console.error(error);
  const stage = document.getElementById('stage');
  if (stage) createStatusLabel(stage).set('Systems failure: this browser needs WebGL2 or WebGPU', 'signal');
});
