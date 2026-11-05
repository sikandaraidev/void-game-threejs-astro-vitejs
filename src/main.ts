import { Clock, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, Vector3 } from 'three/webgpu';
import { createAudio, type Sfx } from './audio/audio';
import { createRenderer } from './bootstrap/renderer';
import { FEATURES } from './features';
import { createCameraRig } from './game/cameraRig';
import { createInput } from './game/input';
import { createLocalTransport } from './net/transport';
import { decidePolicy, probeDevice } from './platform/devicePolicy';
import { createDust } from './render/fx/dust';
import { createSparks } from './render/fx/sparks';
import { createPipeline } from './render/post/pipeline';
import { createAdaptiveQuality } from './platform/adaptiveQuality';
import { assistAim } from './game/aim';
import { createEntities } from './render/world/entities';
import { createSky } from './render/world/sky';
import { ENEMY_STRIDE, EnemyKind, PHASES, emptyInput, type Seat, type Snapshot } from './sim/types';
import { createHud, ZONE_NAMES } from './ui/hud/hud';
import { createStatusLabel } from './ui/hud/statusLabel';
import { createScreens } from './ui/screens/screens';
import { createShip } from './world/ship';
import { createStarfield } from './world/starfield';

type Mode = 'attract' | 'playing' | 'paused' | 'ended';

/** Aim-assist radius in screen units (0 = off). Becomes a difficulty setting. */
const AIM_ASSIST = 0.12;

/** Factory wiring and the frame loop. Game rules live in src/sim (worker). */
async function boot(): Promise<void> {
  const stage = document.getElementById('stage');
  if (!stage) throw new Error('Missing #stage');

  const { renderer, backend } = await createRenderer(stage);
  const policy = decidePolicy(probeDevice(backend));
  renderer.setPixelRatio(policy.maxDpr);
  const debugLabel = FEATURES.debugLabel ? createStatusLabel(stage) : null;
  debugLabel?.set(`${backend} · ${policy.preset}`);

  // Scene
  const scene = new Scene();
  const camera = new PerspectiveCamera(62, 1, 0.1, 1200);

  // Sky is baked once into a cube texture: cheap background + reflections on every hull.
  const sky = createSky(renderer, policy.skySize);
  scene.background = sky.texture;
  scene.environment = sky.texture;
  scene.environmentIntensity = 0.7;
  scene.add(sky.root);
  const stars = FEATURES.starfield ? createStarfield(policy.starCount) : null;
  if (stars) scene.add(stars.points);

  scene.add(new HemisphereLight('#7f9cff', '#120a18', 0.3));
  const sunLight = new DirectionalLight('#fff1d6', 3.2);
  sunLight.position.copy(sky.sunDirection).multiplyScalar(100);
  scene.add(sunLight);
  const rimLight = new DirectionalLight('#8a5cff', 1.4);
  rimLight.position.set(-60, -20, 80);
  scene.add(rimLight);

  const ship = createShip();
  scene.add(ship.root);
  const entities = createEntities(scene);
  const sparks = createSparks(scene);
  const dust = createDust(scene);
  let pipeline = createPipeline(renderer, scene, camera, FEATURES.bloom && policy.bloom);
  const adaptive = createAdaptiveQuality(
    { dpr: policy.maxDpr, floor: 0.65, targetMs: 22, warmupSeconds: 3, step: 0.15 },
    pipeline !== null,
  );

  // Systems
  const audio = createAudio();
  const input = createInput(renderer.domElement);
  const rig = createCameraRig(camera, !policy.cameraMotion);
  const transport = createLocalTransport();
  const hud = createHud(stage);

  let mode: Mode = 'attract';
  let seat: Seat = 'pilot';
  let latest: Snapshot | null = null;
  let receivedAt = 0;
  let lastZone = 0;
  const shown = new Set<string>();

  const setSeats = (human: Seat | null): void => {
    transport.setHuman('pilot', human === 'pilot');
    transport.setHuman('gunner', human === 'gunner');
  };

  const startAttract = (): void => {
    mode = 'attract';
    stage.dataset.playing = 'false';
    hud.setVisible(false);
    setSeats(null);
    transport.reset(Math.floor(Math.random() * 2 ** 31));
    transport.pause(false);
    rig.snap();
  };

  const startRun = (): void => {
    mode = 'playing';
    stage.dataset.playing = 'true';
    seat = 'pilot';
    hud.setSeat(seat);
    hud.setVisible(true);
    shown.clear();
    lastZone = 0;
    setSeats(seat);
    transport.reset(Math.floor(Math.random() * 2 ** 31));
    transport.pause(false);
    audio.setPaused(false);
    rig.snap();
    screens.show('none');
  };

  const setPaused = (paused: boolean): void => {
    if (mode !== 'playing' && mode !== 'paused') return;
    mode = paused ? 'paused' : 'playing';
    stage.dataset.playing = String(!paused);
    transport.pause(paused);
    audio.setPaused(paused);
    screens.show(paused ? 'pause' : 'none');
  };

  const screens = createScreens(stage, {
    onLaunch: () => {
      audio.start();
      startRun();
    },
    onResume: () => setPaused(false),
    onRestart: startRun,
    onRest: () => {
      startAttract();
      audio.setPaused(true);
      screens.show('rest');
    },
    onHome: () => screens.show('start'),
  });

  const swapSeat = (): void => {
    seat = seat === 'pilot' ? 'gunner' : 'pilot';
    setSeats(seat);
    hud.setSeat(seat);
    rig.snap();
  };

  // Events → feedback (sound, sparks, shake, HUD). Audio only while a human is playing.
  const shipNow = new Vector3();
  const sfx = (name: Sfx, x: number, intensity = 1): void => {
    if (mode === 'playing') audio.play(name, (x - shipNow.x) / 25, intensity);
  };

  const onSnapshot = (s: Snapshot): void => {
    latest = s;
    receivedAt = performance.now();
    shipNow.set(s.ship.x, s.ship.y, s.ship.z);

    for (const e of s.events) {
      const near = Math.max(0, 1 - Math.hypot(e.x - s.ship.x, e.y - s.ship.y, e.z - s.ship.z) / 120);
      switch (e.type) {
        case 'pilotFire':
          sfx('pilotFire', e.x, seat === 'pilot' ? 1 : 0.5);
          break;
        case 'turretFire':
          sfx('turretFire', e.x, seat === 'gunner' ? 1 : 0.5);
          break;
        case 'enemyFire':
          sfx('enemyFire', e.x, 0.3 + near);
          break;
        case 'hit':
          sparks.burst(e.x, e.y, e.z, e.value === 0 ? 4 : 7, 16, e.value === 0 ? 'hot' : 'cold');
          sfx('hit', e.x);
          break;
        case 'kill':
          if (e.value === 2) {
            sparks.burst(e.x, e.y, e.z, 420, 70, 'hot');
            sparks.burst(e.x, e.y, e.z, 200, 45, 'cold');
            sparks.blast(e.x, e.y, e.z, 45);
            sfx('bigKill', e.x);
            rig.addTrauma(1);
            hud.flash(0.55);
          } else {
            sparks.burst(e.x, e.y, e.z, 42, 32, 'hot');
            sparks.blast(e.x, e.y, e.z, e.value === EnemyKind.Shard ? 4.5 : 3.8);
            sfx('kill', e.x, 0.5 + near);
            rig.addTrauma(0.12 * near);
          }
          break;
        case 'nodeDown':
          sparks.burst(e.x, e.y, e.z, 140, 45, 'hot');
          sparks.blast(e.x, e.y, e.z, 11);
          sfx('kill', e.x, 1.4);
          rig.addTrauma(0.35);
          break;
        case 'shieldHit':
          sparks.burst(e.x, e.y, e.z, 12, 14, 'cold');
          sfx('shieldHit', e.x);
          rig.addTrauma(0.22);
          if (mode === 'playing') hud.damage(0.3);
          break;
        case 'hullHit':
          sparks.burst(e.x, e.y, e.z, 26, 22, 'hot');
          sfx('hullHit', e.x);
          rig.addTrauma(0.5);
          if (mode === 'playing') hud.damage(0.85);
          break;
        case 'overheat':
          sfx('overheat', e.x);
          if (mode === 'playing' && seat === 'gunner' && !shown.has('heat')) {
            shown.add('heat');
            hud.hint('Turret overheated · fire in bursts to keep it cool');
          }
          break;
        case 'phase': {
          const phase = PHASES[e.value];
          if (phase === 'boss' && mode === 'playing') {
            hud.hint('The Warden · destroy its four amber nodes', 6);
          } else if (phase === 'jump') {
            sfx('jump', 0);
          } else if (phase === 'won' || phase === 'lost') {
            if (phase === 'lost') {
              sparks.burst(e.x, e.y, e.z, 300, 40, 'hot');
              sparks.blast(e.x, e.y, e.z, 12);
              sfx('bigKill', e.x);
              rig.addTrauma(1);
            } else {
              hud.flash(1);
            }
            if (mode === 'attract') {
              window.setTimeout(() => mode === 'attract' && startAttract(), 2500);
            } else if (mode === 'playing') {
              mode = 'ended';
              stage.dataset.playing = 'false';
              window.setTimeout(
                () => {
                  hud.setVisible(false);
                  screens.show('end', {
                    won: phase === 'won',
                    score: s.score,
                    kills: s.kills,
                    seconds: s.time,
                  });
                },
                phase === 'won' ? 900 : 1800,
              );
            }
          }
          break;
        }
      }
    }

    // Contextual onboarding: teach while playing (Paradox of the Active User, Hick's progressive disclosure).
    if (mode !== 'playing') return;
    const once = (key: string, text: string, secs?: number): void => {
      if (shown.has(key)) return;
      shown.add(key);
      hud.hint(text, secs);
    };
    if (s.time > 1) once('basics', 'W A S D steer · Mouse aims · Hold click to fire', 6);
    if (s.time > 14) once('boost', 'Shift to boost · X to brake', 4);
    if (s.zone !== lastZone && s.phase === 'run') {
      lastZone = s.zone;
      hud.hint(`Zone ${s.zone + 1} · ${ZONE_NAMES[s.zone] ?? ''}`, 4);
    }
    if (seat === 'pilot' && !shown.has('behind')) {
      for (let o = 0; o < s.enemies.length; o += ENEMY_STRIDE) {
        if (s.enemies[o + 6] === EnemyKind.Chaser && (s.enemies[o + 2] ?? 0) > s.ship.z) {
          once('behind', 'Contact behind · your bot gunner has it, or press Tab to take the turret', 6);
          break;
        }
      }
    }
  };
  transport.onSnapshot(onSnapshot);

  const resize = (): void => {
    const { clientWidth: w, clientHeight: h } = stage;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(stage);

  // Frame loop: render only; the sim ticks in the worker.
  const clock = new Clock();
  const inputBuf = emptyInput();
  const shipPos = new Vector3();
  const shipVel = new Vector3();
  let t = 0;

  const frame = (): void => {
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 1 / 20);
    t += dt;

    if (mode !== 'paused') {
      const change = adaptive.sample(rawDt);
      if (change === 'dpr') {
        renderer.setPixelRatio(adaptive.dpr);
        resize();
      } else if (change === 'bloom') {
        pipeline?.dispose();
        pipeline = null;
      }
      if (change) debugLabel?.set(`${backend} · dpr ${adaptive.dpr.toFixed(2)} · bloom ${adaptive.bloom}`);
    }

    if (input.pressed('Escape')) {
      if (screens.current === 'controls') screens.show(mode === 'paused' ? 'pause' : 'none');
      else if (mode === 'playing') setPaused(true);
      else if (mode === 'paused') setPaused(false);
    }
    if (input.pressed('KeyH')) {
      if (screens.current === 'controls')
        screens.show(mode === 'paused' ? 'pause' : mode === 'attract' ? 'start' : 'none');
      else if (mode === 'playing') {
        setPaused(true);
        screens.show('controls');
      } else if (mode === 'paused' || mode === 'attract') screens.show('controls');
    }
    if (mode === 'playing' && input.pressed('Tab')) swapSeat();

    const s = latest;
    if (s) {
      const live = mode === 'playing' || mode === 'attract' || mode === 'ended';
      const since = live ? Math.min(0.05, (performance.now() - receivedAt) / 1000) : 0;
      shipVel.set(s.ship.vx, s.ship.vy, s.ship.vz);
      shipPos.set(s.ship.x + s.ship.vx * since, s.ship.y + s.ship.vy * since, s.ship.z + s.ship.vz * since);
      const speed = -s.ship.vz;

      ship.root.position.copy(shipPos);
      ship.root.rotation.set(s.ship.vy * 0.018, 0, -s.ship.vx * 0.035);
      ship.root.visible = s.phase !== 'lost';
      ship.setThrust(Math.min(2, speed / 60));

      const viewSeat: Seat = mode === 'attract' ? 'pilot' : seat;
      const mx = mode === 'playing' ? input.mouse.x : Math.sin(t * 0.2) * 0.3;
      const my = mode === 'playing' ? input.mouse.y : Math.sin(t * 0.13) * 0.15;
      rig.update(viewSeat, shipPos, shipVel, mx, my, speed, dt, s.phase === 'jump');

      let locked = false;
      if (mode === 'playing') {
        input.build(seat, camera, inputBuf);
        locked = assistAim(s, since, camera, input.mouse, seat, AIM_ASSIST, inputBuf).locked;
        transport.sendInput(seat, inputBuf);
      }

      entities.update(s, since, t);
      dust.update(camera, speed);
      if (mode === 'playing') hud.update(s, input.mouse.x, input.mouse.y, locked);
      audio.engine(Math.min(1, speed / 90));
    }

    sky.follow(camera);
    stars?.follow(camera);
    sparks.update(dt);
    hud.tick(dt);

    if (pipeline) pipeline.render();
    else renderer.render(scene, camera);
    input.endFrame();
  };

  const setRunning = (running: boolean): void => {
    void renderer.setAnimationLoop(running ? frame : null);
    if (running) clock.getDelta();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && mode === 'playing') setPaused(true);
    setRunning(!document.hidden);
  });

  startAttract();
  screens.show('start');
  setRunning(true);
}

boot().catch((error: unknown) => {
  console.error(error);
  const stage = document.getElementById('stage');
  if (stage) createStatusLabel(stage).set('Systems failure: this browser needs WebGL2 or WebGPU', 'signal');
});
