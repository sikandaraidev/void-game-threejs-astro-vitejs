import {
  Clock,
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Vector2,
  Vector3,
} from 'three/webgpu';
import { createAudio, type Sfx } from './audio/audio';
import { createRenderer } from './bootstrap/renderer';
import { FEATURES } from './features';
import { assistAim } from './game/aim';
import { createCameraRig, type ViewMode } from './game/cameraRig';
import { createInput } from './game/input';
import { createLocalTransport } from './net/transport';
import { createAdaptiveQuality } from './platform/adaptiveQuality';
import { decidePolicy, probeDevice } from './platform/devicePolicy';
import { createDust } from './render/fx/dust';
import { createSparks } from './render/fx/sparks';
import { createCockpit, createTurretInterior } from './render/interior/cockpit';
import { createPods } from './render/models/pods';
import { createVesper } from './render/models/vesper';
import { createPipeline } from './render/post/pipeline';
import { createEntities } from './render/world/entities';
import { createSky } from './render/world/sky';
import { DIFFICULTY_PRESETS, type DifficultySettings } from './sim/difficulty';
import {
  ENEMY_STRIDE,
  EnemyKind,
  PHASES,
  POD_NAMES,
  SEATS,
  emptyInput,
  type Seat,
  type Snapshot,
} from './sim/types';
import { createHud, ZONE_NAMES } from './ui/hud/hud';
import { createStatusLabel } from './ui/hud/statusLabel';
import { createScreens } from './ui/screens/screens';
import { createStarfield } from './world/starfield';

type Mode = 'attract' | 'playing' | 'paused' | 'ended';

const LOOK_SENSITIVITY = 0.0026;
const CENTER = new Vector2(0, 0);

/** Factory wiring and the frame loop. Game rules live in src/sim (worker). */
async function boot(): Promise<void> {
  const stage = document.getElementById('stage');
  if (!stage) throw new Error('Missing #stage');

  const { renderer, backend } = await createRenderer(stage);
  const policy = decidePolicy(probeDevice(backend));
  renderer.setPixelRatio(policy.maxDpr);
  const debugLabel = FEATURES.debugLabel ? createStatusLabel(stage) : null;

  // ── Scene ──
  const scene = new Scene();
  const camera = new PerspectiveCamera(68, 1, 0.05, 1600);
  scene.add(camera); // interiors are parented to the camera

  // Sky is baked once into a cube texture: cheap background + reflections on every hull.
  const sky = createSky(renderer, policy.skySize);
  scene.background = sky.texture;
  scene.environment = sky.texture;
  scene.environmentIntensity = 0.75;
  scene.add(sky.root);
  const stars = FEATURES.starfield ? createStarfield(policy.starCount) : null;
  if (stars) scene.add(stars.points);

  scene.add(new HemisphereLight('#7f9cff', '#120a18', 0.3));
  const sunLight = new DirectionalLight('#fff1d6', 3.2);
  sunLight.position.copy(sky.sunDirection).multiplyScalar(100);
  scene.add(sunLight);
  const rimLight = new DirectionalLight('#8a5cff', 1.2);
  rimLight.position.set(-60, -20, 80);
  scene.add(rimLight);

  const vesper = createVesper();
  scene.add(vesper.root);
  const entities = createEntities(scene);
  const pods = createPods(scene);
  const sparks = createSparks(scene);
  const dust = createDust(scene);
  const cockpit = createCockpit();
  const turretView = createTurretInterior();
  camera.add(cockpit.root, turretView.root);

  let pipeline = createPipeline(renderer, scene, camera, FEATURES.bloom && policy.bloom);
  // Degrade only below ~36 fps (28 ms): tolerant of 30 fps caps on battery saver.
  const adaptive = createAdaptiveQuality(
    { dpr: policy.maxDpr, floor: 0.75, targetMs: 28, warmupSeconds: 4, step: 0.15 },
    pipeline !== null,
  );

  // ── Systems ──
  const audio = createAudio();
  const input = createInput(renderer.domElement);
  const rig = createCameraRig(camera, !policy.cameraMotion);
  const transport = createLocalTransport();
  const hud = createHud(stage);

  let mode: Mode = 'attract';
  let seat: Seat = 'pilot';
  let view: ViewMode = 'first';
  let difficulty: DifficultySettings = DIFFICULTY_PRESETS.standard;
  let latest: Snapshot | null = null;
  let receivedAt = 0;
  let lastZone = 0;
  let turretSide = 1;
  const shown = new Set<string>();

  const isTurret = (s: Seat): boolean => s !== 'pilot';

  const applyHumans = (human: Seat | null): void => {
    for (const s of SEATS) transport.setHuman(s, s === human);
  };

  const takeSeat = (next: Seat): void => {
    seat = next;
    applyHumans(seat);
    hud.setSeat(seat);
    rig.snap();
    if (isTurret(seat)) input.requestLock();
    else input.releaseLock();
  };

  const startAttract = (): void => {
    mode = 'attract';
    stage.dataset.playing = 'false';
    hud.setVisible(false);
    applyHumans(null);
    input.releaseLock();
    transport.reset(Math.floor(Math.random() * 2 ** 31), DIFFICULTY_PRESETS.standard);
    transport.pause(false);
    rig.snap();
  };

  const startRun = (): void => {
    mode = 'playing';
    stage.dataset.playing = 'true';
    view = 'first';
    hud.setVisible(true);
    shown.clear();
    lastZone = 0;
    transport.reset(Math.floor(Math.random() * 2 ** 31), difficulty);
    takeSeat('pilot');
    transport.pause(false);
    audio.setPaused(false);
    screens.show('none');
  };

  const setPaused = (paused: boolean): void => {
    if (mode !== 'playing' && mode !== 'paused') return;
    mode = paused ? 'paused' : 'playing';
    stage.dataset.playing = String(!paused);
    transport.pause(paused);
    audio.setPaused(paused);
    screens.show(paused ? 'pause' : 'none');
    if (paused) input.releaseLock();
    else if (isTurret(seat)) input.requestLock();
  };

  const screens = createScreens(stage, {
    onLaunch: (d) => {
      difficulty = d;
      audio.start();
      startRun();
    },
    onResume: () => setPaused(false),
    onRestart: () => {
      difficulty = screens.difficulty;
      startRun();
    },
    onRest: () => {
      startAttract();
      audio.setPaused(true);
      screens.show('rest');
    },
    onHome: () => screens.show('start'),
  });

  // Turret look needs pointer lock: clicking the view in a turret (re)acquires it.
  renderer.domElement.addEventListener('pointerdown', () => {
    if (mode === 'playing' && isTurret(seat) && view === 'first') input.requestLock();
  });
  // Browsers release pointer lock on Esc without sending the key to the page: treat it as pause.
  document.addEventListener('pointerlockchange', () => {
    if (!input.locked && mode === 'playing' && isTurret(seat) && view === 'first') setPaused(true);
  });

  // ── Events → feedback (sound, sparks, shake, HUD). Audio only while a human plays. ──
  const shipNow = new Vector3();
  const sfx = (name: Sfx, x: number, intensity = 1): void => {
    if (mode === 'playing') audio.play(name, (x - shipNow.x) / 30, intensity);
  };

  const onSnapshot = (s: Snapshot): void => {
    latest = s;
    receivedAt = performance.now();
    shipNow.set(s.ship.x, s.ship.y, s.ship.z);

    for (const e of s.events) {
      const near = Math.max(0, 1 - Math.hypot(e.x - s.ship.x, e.y - s.ship.y, e.z - s.ship.z) / 150);
      switch (e.type) {
        case 'pilotFire':
          sfx('pilotFire', e.x, seat === 'pilot' ? 1 : 0.4);
          break;
        case 'turretFire': {
          const mine = SEATS[e.value] === seat;
          sfx('turretFire', e.x, mine ? 1 : 0.4);
          if (mine) {
            turretSide = -turretSide;
            turretView.fire(turretSide);
          }
          break;
        }
        case 'missileFire':
          sfx('missileFire', e.x);
          break;
        case 'enemyFire':
          sfx('enemyFire', e.x, 0.25 + near);
          break;
        case 'wingsOpen':
          sfx('wingsOpen', e.x, 0.4 + near);
          break;
        case 'hit':
          sparks.burst(e.x, e.y, e.z, e.value === 0 ? 5 : 8, 18, e.value === 0 ? 'hot' : 'cold');
          sfx('hit', e.x);
          break;
        case 'kill':
          if (e.value === 2) {
            sparks.burst(e.x, e.y, e.z, 500, 90, 'hot');
            sparks.burst(e.x, e.y, e.z, 250, 60, 'cold');
            sparks.blast(e.x, e.y, e.z, 70);
            sfx('bigKill', e.x);
            rig.addTrauma(1);
            hud.flash(0.55);
          } else {
            const big = e.value === EnemyKind.Moth;
            sparks.burst(e.x, e.y, e.z, big ? 70 : 45, big ? 38 : 30, 'hot');
            sparks.burst(e.x, e.y, e.z, 12, 20, 'cold');
            sparks.blast(e.x, e.y, e.z, big ? 7 : 5);
            sfx('kill', e.x, 0.5 + near);
            rig.addTrauma(0.15 * near);
          }
          break;
        case 'nodeDown':
          sparks.burst(e.x, e.y, e.z, 160, 50, 'hot');
          sparks.blast(e.x, e.y, e.z, 16);
          sfx('kill', e.x, 1.4);
          rig.addTrauma(0.35);
          break;
        case 'shieldHit':
          sparks.burst(e.x, e.y, e.z, 14, 14, 'cold');
          sfx('shieldHit', e.x);
          rig.addTrauma(0.22);
          if (mode === 'playing') hud.damage(0.3);
          break;
        case 'hullHit':
          sparks.burst(e.x, e.y, e.z, 28, 22, 'hot');
          sfx('hullHit', e.x);
          rig.addTrauma(0.5);
          if (mode === 'playing') hud.damage(0.85);
          break;
        case 'overheat':
          if (SEATS[e.value] === seat) {
            sfx('overheat', e.x);
            if (mode === 'playing' && !shown.has('heat')) {
              shown.add('heat');
              hud.hint('Barrels overheated · fire in bursts to keep them cool');
            }
          }
          break;
        case 'pickup':
          sparks.burst(e.x, e.y, e.z, 30, 16, 'cold');
          sfx('pickup', e.x);
          if (mode === 'playing') hud.hint(POD_NAMES[e.value] ?? 'Salvage', 2.5);
          break;
        case 'phase': {
          const phase = PHASES[e.value];
          if (phase === 'boss' && mode === 'playing') {
            hud.hint('The Ossuary · destroy its four amber hearts', 6);
          } else if (phase === 'jump') {
            sfx('jump', 0);
          } else if (phase === 'won' || phase === 'lost') {
            if (phase === 'lost') {
              sparks.burst(e.x, e.y, e.z, 320, 40, 'hot');
              sparks.blast(e.x, e.y, e.z, 14);
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
              input.releaseLock();
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

    // Contextual onboarding: teach while playing (Paradox of the Active User).
    if (mode !== 'playing') return;
    const once = (key: string, text: string, secs?: number): void => {
      if (shown.has(key)) return;
      shown.add(key);
      hud.hint(text, secs);
    };
    if (s.time > 1) once('basics', 'W A S D steer · Mouse aims · Hold click to fire', 6);
    if (s.time > 12) once('seats', 'Press 2 or 3 to take a gun turret · bots crew the empty seats', 6);
    if (s.time > 24) once('pods', 'Fly through or shoot salvage pods for power-ups', 5);
    if (s.zone !== lastZone && s.phase === 'run') {
      lastZone = s.zone;
      hud.hint(`Zone ${s.zone + 1} · ${ZONE_NAMES[s.zone] ?? ''}`, 4);
    }
    if (seat === 'pilot' && !shown.has('behind')) {
      for (let o = 0; o < s.enemies.length; o += ENEMY_STRIDE) {
        if (s.enemies[o + 6] === EnemyKind.Moth && (s.enemies[o + 2] ?? 0) > s.ship.z) {
          once('behind', 'Moths behind · press 2 or 3 to man a turret, or let the bots handle them', 6);
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

  // ── Frame loop: render only; the sim ticks in the worker. ──
  const clock = new Clock();
  const inputBuf = emptyInput();
  const shipPos = new Vector3();
  const shipVel = new Vector3();
  let t = 0;
  let fpsFrames = 0;
  let fpsTime = 0;

  const frame = (): void => {
    const rawDt = clock.getDelta();
    const dt = Math.min(rawDt, 1 / 20);
    t += dt;

    // Adaptive quality + live FPS readout (dev label).
    if (mode !== 'paused') {
      const change = adaptive.sample(rawDt);
      if (change === 'dpr') {
        renderer.setPixelRatio(adaptive.dpr);
        resize();
      } else if (change === 'bloom') {
        pipeline?.dispose();
        pipeline = null;
      }
    }
    fpsFrames++;
    fpsTime += rawDt;
    if (fpsTime >= 1) {
      debugLabel?.set(
        `${backend} · ${Math.round(fpsFrames / fpsTime)} fps · dpr ${adaptive.dpr.toFixed(2)} · bloom ${adaptive.bloom ? 'on' : 'off'}`,
      );
      fpsFrames = 0;
      fpsTime = 0;
    }

    // Keys.
    if (input.pressed('Escape')) {
      if (screens.current === 'controls')
        screens.show(mode === 'paused' ? 'pause' : mode === 'attract' ? 'start' : 'none');
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
    if (mode === 'playing') {
      if (input.pressed('Digit1')) takeSeat('pilot');
      if (input.pressed('Digit2')) takeSeat('dorsal');
      if (input.pressed('Digit3')) takeSeat('ventral');
      if (input.pressed('Tab')) takeSeat(SEATS[(SEATS.indexOf(seat) + 1) % SEATS.length] ?? 'pilot');
      if (input.pressed('KeyC')) {
        view = view === 'first' ? 'chase' : 'first';
        rig.snap();
        if (view === 'chase') input.releaseLock();
        else if (isTurret(seat)) input.requestLock();
      }
    }

    const look = input.consumeLook();
    if (mode === 'playing' && isTurret(seat) && view === 'first') {
      rig.look(look.dx * LOOK_SENSITIVITY, look.dy * LOOK_SENSITIVITY);
    }

    const s = latest;
    if (s) {
      const live = mode === 'playing' || mode === 'attract' || mode === 'ended';
      const since = live ? Math.min(0.05, (performance.now() - receivedAt) / 1000) : 0;
      shipVel.set(s.ship.vx, s.ship.vy, s.ship.vz);
      shipPos.set(s.ship.x + s.ship.vx * since, s.ship.y + s.ship.vy * since, s.ship.z + s.ship.vz * since);
      const speed = -s.ship.vz;

      // View: attract mode is a cinematic outside shot; play is first-person unless C.
      const viewSeat: Seat = mode === 'attract' ? 'pilot' : seat;
      const viewMode: ViewMode = mode === 'attract' ? 'chase' : view;
      const firstPilot = viewMode === 'first' && viewSeat === 'pilot';
      const firstTurret = viewMode === 'first' && viewSeat !== 'pilot';

      vesper.root.position.copy(shipPos);
      vesper.root.rotation.set(s.ship.vy * 0.018, 0, -s.ship.vx * 0.035);
      // In the cockpit the camera sits inside the port hull: hide the exterior there.
      vesper.root.visible = s.phase !== 'lost' && !firstPilot;
      vesper.setThrust(Math.min(2, speed / 60));
      vesper.setSignal(s.buffs.pulse > 0 ? 1 : 0.5 + Math.sin(t * 1.4) * 0.3);
      cockpit.root.visible = firstPilot && s.phase !== 'lost';
      turretView.root.visible = firstTurret && s.phase !== 'lost';
      if (viewSeat !== 'pilot') turretView.setOverheated(s.turrets[viewSeat].overheated);

      const mx = mode === 'playing' ? input.mouse.x : Math.sin(t * 0.2) * 0.3;
      const my = mode === 'playing' ? input.mouse.y : Math.sin(t * 0.13) * 0.15;
      rig.update(viewSeat, viewMode, shipPos, shipVel, mx, my, speed, dt, s.phase === 'jump');

      if (mode === 'playing') {
        input.build(seat, camera, inputBuf);
        const aimMouse = isTurret(seat) && view === 'first' ? CENTER : input.mouse;
        const locked = assistAim(s, since, camera, aimMouse, seat, difficulty.aimAssist, inputBuf).locked;
        transport.sendInput(seat, inputBuf);
        hud.update(s, aimMouse.x, aimMouse.y, locked);
      }

      entities.update(s, since, t);
      pods.update(s.pods, since, s.ship.vz, t);
      dust.update(camera, speed);
      audio.engine(Math.min(1, speed / 90));
    }

    cockpit.update(dt);
    turretView.update(dt);
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
