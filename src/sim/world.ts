import * as C from './constants';
import { botPilotInput, botTurretInput } from './bots';
import { DIFFICULTY_PRESETS, type DifficultySettings } from './difficulty';
import { mulberry32 } from './rng';
import {
  BULLET_STRIDE,
  ENEMY_STRIDE,
  EnemyKind,
  PHASES,
  POD_STRIDE,
  PodKind,
  SEATS,
  TURRET_SEATS,
  emptyInput,
  type Phase,
  type Seat,
  type SeatInput,
  type SimEvent,
  type SimEventType,
  type Snapshot,
  type TurretSeat,
} from './types';

/** Struct-of-arrays projectile pool: no allocation during play. */
export interface BulletPool {
  readonly size: number;
  active: Uint8Array;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  life: Float32Array;
  damage: Float32Array;
  /** Player missiles: index of the enemy they home on (-1 = none). Unused for enemy bolts. */
  target: Int16Array;
  missile: Uint8Array;
}

export interface EnemyPool {
  readonly size: number;
  active: Uint8Array;
  kind: Uint8Array;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  hp: Float32Array;
  maxHp: Float32Array;
  age: Float32Array;
  fireTimer: Float32Array;
  /** Dogfight state machine. */
  mode: Uint8Array;
  modeTime: Float32Array;
  /** Waypoint in SHIP-RELATIVE coordinates. */
  wx: Float32Array;
  wy: Float32Array;
  wz: Float32Array;
  /** Moth wing openness 0..1 (the firing tell). */
  aux: Float32Array;
  phase: Float32Array;
}

export interface PodPool {
  readonly size: number;
  active: Uint8Array;
  kind: Uint8Array;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  life: Float32Array;
}

export interface Turret {
  heat: number;
  overheated: boolean;
  cooldown: number;
  side: number;
}

export interface Boss {
  x: number;
  y: number;
  z: number;
  t: number;
  nodeHp: number[];
  fireTimer: number;
}

export interface World {
  rand: () => number;
  difficulty: DifficultySettings;
  tick: number;
  time: number;
  phase: Phase;
  phaseTime: number;
  ship: { x: number; y: number; z: number; vx: number; vy: number; speed: number };
  hull: number;
  shield: number;
  sinceDamage: number;
  boost: number;
  pilotCooldown: number;
  pilotSide: number;
  turrets: Record<TurretSeat, Turret>;
  buffs: { overcharge: number; coolant: number; pulse: number; missiles: number };
  score: number;
  kills: number;
  humans: Record<Seat, boolean>;
  inputs: Record<Seat, SeatInput>;
  playerBullets: BulletPool;
  enemyBolts: BulletPool;
  enemies: EnemyPool;
  pods: PodPool;
  squadTimer: number;
  boss: Boss | null;
  /** Bot pilot memory: reacts on a human-like cadence, not every tick. */
  bot: { dodgeX: number; dodgeY: number; dodgeUntil: number; nextThink: number };
  events: SimEvent[];
}

function bulletPool(size: number): BulletPool {
  return {
    size,
    active: new Uint8Array(size),
    x: new Float32Array(size),
    y: new Float32Array(size),
    z: new Float32Array(size),
    vx: new Float32Array(size),
    vy: new Float32Array(size),
    vz: new Float32Array(size),
    life: new Float32Array(size),
    damage: new Float32Array(size),
    target: new Int16Array(size).fill(-1),
    missile: new Uint8Array(size),
  };
}

function enemyPool(size: number): EnemyPool {
  const f = (): Float32Array => new Float32Array(size);
  return {
    size,
    active: new Uint8Array(size),
    kind: new Uint8Array(size),
    x: f(),
    y: f(),
    z: f(),
    vx: f(),
    vy: f(),
    vz: f(),
    hp: f(),
    maxHp: f(),
    age: f(),
    fireTimer: f(),
    mode: new Uint8Array(size),
    modeTime: f(),
    wx: f(),
    wy: f(),
    wz: f(),
    aux: f(),
    phase: f(),
  };
}

function podPool(size: number): PodPool {
  return {
    size,
    active: new Uint8Array(size),
    kind: new Uint8Array(size),
    x: new Float32Array(size),
    y: new Float32Array(size),
    z: new Float32Array(size),
    life: new Float32Array(size),
  };
}

const turret = (): Turret => ({ heat: 0, overheated: false, cooldown: 0, side: 1 });

export function createWorld(
  seed: number,
  humans: Partial<Record<Seat, boolean>> = { pilot: true },
  difficulty: DifficultySettings = DIFFICULTY_PRESETS.standard,
): World {
  return {
    rand: mulberry32(seed),
    difficulty: { ...difficulty },
    tick: 0,
    time: 0,
    phase: 'run',
    phaseTime: 0,
    ship: { x: 0, y: 0, z: 0, vx: 0, vy: 0, speed: C.SPEED_BASE },
    hull: C.HULL_MAX,
    shield: C.SHIELD_MAX,
    sinceDamage: 99,
    boost: 100,
    pilotCooldown: 0,
    pilotSide: 1,
    turrets: { dorsal: turret(), ventral: turret() },
    buffs: { overcharge: 0, coolant: 0, pulse: 0, missiles: 0 },
    score: 0,
    kills: 0,
    humans: {
      pilot: humans.pilot ?? false,
      dorsal: humans.dorsal ?? false,
      ventral: humans.ventral ?? false,
    },
    inputs: { pilot: emptyInput(), dorsal: emptyInput(), ventral: emptyInput() },
    playerBullets: bulletPool(C.MAX_PLAYER_BULLETS),
    enemyBolts: bulletPool(C.MAX_ENEMY_BOLTS),
    enemies: enemyPool(C.MAX_ENEMIES),
    pods: podPool(C.MAX_PODS),
    squadTimer: 2,
    boss: null,
    bot: { dodgeX: 0, dodgeY: 0, dodgeUntil: 0, nextThink: 0 },
    events: [],
  };
}

const RUN_LENGTH = C.ZONE_LENGTH * C.ZONE_COUNT;

function emit(w: World, type: SimEventType, x: number, y: number, z: number, value = 0): void {
  w.events.push({ type, x, y, z, value });
}

function setPhase(w: World, phase: Phase): void {
  w.phase = phase;
  w.phaseTime = 0;
  emit(w, 'phase', w.ship.x, w.ship.y, w.ship.z, PHASES.indexOf(phase));
}

function freeSlot(active: Uint8Array): number {
  for (let i = 0; i < active.length; i++) if (active[i] === 0) return i;
  return -1;
}

function fireBullet(
  pool: BulletPool,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  speed: number,
  cvx: number,
  cvy: number,
  cvz: number,
  life: number,
  damage: number,
): number {
  const i = freeSlot(pool.active);
  if (i < 0) return -1;
  const len = Math.hypot(dx, dy, dz) || 1;
  pool.active[i] = 1;
  pool.x[i] = ox;
  pool.y[i] = oy;
  pool.z[i] = oz;
  pool.vx[i] = (dx / len) * speed + cvx;
  pool.vy[i] = (dy / len) * speed + cvy;
  pool.vz[i] = (dz / len) * speed + cvz;
  pool.life[i] = life;
  pool.damage[i] = damage;
  pool.target[i] = -1;
  pool.missile[i] = 0;
  return i;
}

/** Squared distance from point (cx,cy,cz) to the segment a→b. Prevents fast bullets tunnelling. */
export function segmentPointDistSq(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const lenSq = abx * abx + aby * aby + abz * abz;
  let t = lenSq > 0 ? ((cx - ax) * abx + (cy - ay) * aby + (cz - az) * abz) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const px = ax + abx * t - cx;
  const py = ay + aby * t - cy;
  const pz = az + abz * t - cz;
  return px * px + py * py + pz * pz;
}

function damageShip(w: World, raw: number, x: number, y: number, z: number): void {
  if (w.phase === 'jump' || w.phase === 'won' || w.phase === 'lost') return;
  const amount = raw * w.difficulty.enemyDamage;
  w.sinceDamage = 0;
  if (w.shield > 0) {
    w.shield -= amount;
    if (w.shield < 0) {
      w.hull += w.shield;
      w.shield = 0;
    }
    emit(w, 'shieldHit', x, y, z, amount);
  } else {
    w.hull -= amount;
    emit(w, 'hullHit', x, y, z, amount);
  }
  if (w.hull <= 0) {
    w.hull = 0;
    setPhase(w, 'lost');
  }
}

export function enemyRadius(kind: number): number {
  return kind === EnemyKind.Needle ? C.ENEMY_STATS.needle.radius : C.ENEMY_STATS.moth.radius;
}

const sign = (r: () => number): number => (r() < 0.5 ? -1 : 1);

// ───────────────────────────── Spawning ─────────────────────────────

function spawnEnemy(w: World, kind: EnemyKind, rx: number, ry: number, rz: number, rvz: number): void {
  const e = w.enemies;
  const i = freeSlot(e.active);
  if (i < 0) return;
  const s = w.ship;
  const stats = kind === EnemyKind.Needle ? C.ENEMY_STATS.needle : C.ENEMY_STATS.moth;
  e.active[i] = 1;
  e.kind[i] = kind;
  e.x[i] = s.x + rx;
  e.y[i] = s.y + ry;
  e.z[i] = s.z + rz;
  e.vx[i] = s.vx;
  e.vy[i] = s.vy;
  e.vz[i] = -s.speed + rvz;
  e.hp[i] = e.maxHp[i] = stats.hp;
  e.age[i] = 0;
  e.fireTimer[i] = 1 + w.rand() * 1.5;
  e.mode[i] = 0;
  e.modeTime[i] = 0;
  e.aux[i] = 0;
  e.phase[i] = w.rand() * Math.PI * 2;
  if (kind === EnemyKind.Needle) setNeedleAttack(w, i);
}

function aliveEnemies(w: World): number {
  let n = 0;
  for (let i = 0; i < w.enemies.size; i++) n += w.enemies.active[i] ?? 0;
  return n;
}

function updateSpawns(w: World): void {
  if (w.phase !== 'run' && w.phase !== 'boss') return;
  w.squadTimer -= C.DT;
  if (w.squadTimer > 0) return;
  const zone = zoneOf(w);
  const base = w.phase === 'boss' ? 9 : ([8, 12, 16][zone] ?? 16);
  const target = Math.round(base * w.difficulty.enemyCount);
  if (aliveEnemies(w) >= target) return;
  w.squadTimer = 1.6 + w.rand() * 1.0;

  const mothChance = w.time < 25 ? 0 : zone === 0 ? 0.2 : 0.35;
  if (w.rand() < mothChance) {
    // Moths hunt in pairs from behind and below: the gunners' fight.
    const side = sign(w.rand);
    for (let k = 0; k < 2; k++)
      spawnEnemy(w, EnemyKind.Moth, side * (55 + k * 14), -10 - w.rand() * 20, 230 + k * 20, -20);
  } else {
    // Needle squadron in a loose V, head-on.
    const n = 3 + Math.floor(w.rand() * 3);
    const cx = (w.rand() * 2 - 1) * 30;
    const cy = (w.rand() * 2 - 1) * 14;
    for (let k = 0; k < n; k++) {
      const off = k - (n - 1) / 2;
      spawnEnemy(w, EnemyKind.Needle, cx + off * 9, cy - Math.abs(off) * 2, -460 - Math.abs(off) * 14, 90);
    }
  }
}

// ───────────────────────────── Dogfight AI ─────────────────────────────

/** Needle modes: 0 head-on attack run, 1 break and loop wide, 2 chase from behind, 3 overtake alongside. */
function setNeedleAttack(w: World, i: number): void {
  const e = w.enemies;
  e.mode[i] = 0;
  e.modeTime[i] = 0;
  // Pass close enough to feel it, not so close it rams.
  e.wx[i] = sign(w.rand) * (9 + w.rand() * 9);
  e.wy[i] = sign(w.rand) * (3 + w.rand() * 6);
  e.wz[i] = 90;
}

function updateEnemies(w: World): void {
  const e = w.enemies;
  const s = w.ship;
  const combat = w.phase === 'run' || w.phase === 'boss';
  const dtE = C.DT * (w.buffs.pulse > 0 ? C.PULSE_SCALE : 1);
  const svz = -s.speed;

  for (let i = 0; i < e.size; i++) {
    if (e.active[i] === 0) continue;
    if (w.phase === 'jump') {
      e.active[i] = 0;
      continue;
    }
    const kind = e.kind[i] ?? 0;
    const age = (e.age[i] = (e.age[i] ?? 0) + dtE);
    const mt = (e.modeTime[i] = (e.modeTime[i] ?? 0) + dtE);
    const ph = e.phase[i] ?? 0;
    const rx = (e.x[i] ?? 0) - s.x;
    const ry = (e.y[i] ?? 0) - s.y;
    const rz = (e.z[i] ?? 0) - s.z;
    let speed: number;
    let turn: number;

    if (kind === EnemyKind.Needle) {
      const st = C.ENEMY_STATS.needle;
      turn = st.turn;
      switch (e.mode[i]) {
        case 0:
          speed = st.speed;
          if (rz > 35) {
            e.mode[i] = 1;
            e.modeTime[i] = 0;
            e.wx[i] = sign(w.rand) * (60 + w.rand() * 30);
            e.wy[i] = sign(w.rand) * (20 + w.rand() * 20);
            e.wz[i] = 170;
          }
          break;
        case 1:
          speed = st.speed * 0.8;
          if (mt > 4.5 || Math.hypot(rx - (e.wx[i] ?? 0), ry - (e.wy[i] ?? 0), rz - (e.wz[i] ?? 0)) < 45) {
            e.mode[i] = 2;
            e.modeTime[i] = 0;
          }
          break;
        case 2:
          speed = st.speed * 0.55;
          e.wx[i] = Math.sin(age * 0.9 + ph) * 14;
          e.wy[i] = Math.cos(age * 0.7 + ph) * 8;
          e.wz[i] = 28;
          if (mt > 6.5) {
            e.mode[i] = 3;
            e.modeTime[i] = 0;
            e.wx[i] = sign(w.rand) * (30 + w.rand() * 15);
            e.wy[i] = sign(w.rand) * (12 + w.rand() * 10);
            e.wz[i] = -420;
          }
          break;
        default:
          speed = st.speed * 0.75;
          if (rz < -330) setNeedleAttack(w, i);
      }
    } else {
      const st = C.ENEMY_STATS.moth;
      turn = st.turn;
      speed = st.speed;
      // Orbit behind and below; the shape the gunners learn to read.
      const a = age * 0.32 + ph;
      e.wx[i] = Math.cos(a) * 52;
      e.wy[i] = Math.sin(a) * 26 - 8;
      e.wz[i] = 45 + Math.sin(a * 0.7) * 18;
    }

    // Steer the RELATIVE velocity toward the waypoint, then convert back to world velocity.
    const dx = (e.wx[i] ?? 0) - rx;
    const dy = (e.wy[i] ?? 0) - ry;
    const dz = (e.wz[i] ?? 0) - rz;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const arrive = Math.min(1, dist / 25);
    const k = Math.min(1, turn * dtE);
    const rvx = (e.vx[i] ?? 0) - s.vx;
    const rvy = (e.vy[i] ?? 0) - s.vy;
    const rvz = (e.vz[i] ?? 0) - svz;
    const nvx = rvx + ((dx / dist) * speed * arrive - rvx) * k;
    const nvy = rvy + ((dy / dist) * speed * arrive - rvy) * k;
    const nvz = rvz + ((dz / dist) * speed * arrive - rvz) * k;
    e.vx[i] = nvx + s.vx;
    e.vy[i] = nvy + s.vy;
    e.vz[i] = nvz + svz;
    e.x[i] = (e.x[i] ?? 0) + (e.vx[i] ?? 0) * dtE;
    e.y[i] = (e.y[i] ?? 0) + (e.vy[i] ?? 0) * dtE;
    e.z[i] = (e.z[i] ?? 0) + (e.vz[i] ?? 0) * dtE;

    if (Math.hypot(rx, ry, rz) > C.ENEMY_DESPAWN && age > 3) {
      e.active[i] = 0;
      continue;
    }

    // Weapons.
    e.fireTimer[i] = (e.fireTimer[i] ?? 0) - dtE;
    const ft = e.fireTimer[i] ?? 0;
    const spread = 2.4 / w.difficulty.enemyAccuracy;
    if (kind === EnemyKind.Needle) {
      const ahead = e.mode[i] === 0 && rz < -35 && rz > -280;
      const behind = e.mode[i] === 2 && rz > 10 && rz < 110;
      if (combat && (ahead || behind) && ft <= 0) {
        e.fireTimer[i] = 1.5 + w.rand() * 1.2;
        aimBolt(w, e.x[i] ?? 0, e.y[i] ?? 0, e.z[i] ?? 0, spread);
      }
    } else {
      // Wings open ~0.9 s before firing: a readable tell (fairness: telegraph every threat).
      const opening = ft < 0.9;
      const before = e.aux[i] ?? 0;
      e.aux[i] = Math.max(0, Math.min(1, before + (opening ? 3 : -2) * dtE));
      if (opening && before === 0 && combat) emit(w, 'wingsOpen', e.x[i] ?? 0, e.y[i] ?? 0, e.z[i] ?? 0);
      if (combat && ft <= 0) {
        e.fireTimer[i] = 2.6 + w.rand() * 1.2;
        for (let b = 0; b < 3; b++) aimBolt(w, e.x[i] ?? 0, e.y[i] ?? 0, e.z[i] ?? 0, spread * 1.6);
      }
    }

    // Ramming.
    const rr = enemyRadius(kind) + C.SHIP_RADIUS;
    const qx = (e.x[i] ?? 0) - s.x;
    const qy = (e.y[i] ?? 0) - s.y;
    const qz = (e.z[i] ?? 0) - s.z;
    if (qx * qx + qy * qy + qz * qz < rr * rr) {
      killEnemy(w, i, false);
      damageShip(w, C.RAM_DAMAGE, s.x, s.y, s.z);
    }
  }
}

function aimBolt(w: World, ox: number, oy: number, oz: number, spread: number): void {
  const s = w.ship;
  // Intercept: find t where the bolt meets the ship's predicted position (two refinements).
  let t = Math.hypot(s.x - ox, s.y - oy, s.z - oz) / C.ENEMY_BOLT_SPEED;
  for (let k = 0; k < 2; k++) {
    t = Math.hypot(s.x + s.vx * t - ox, s.y + s.vy * t - oy, s.z - s.speed * t - oz) / C.ENEMY_BOLT_SPEED;
  }
  // Lateral lead is deliberately partial, plus spread: dodging is a skill, not luck.
  const tx = s.x + s.vx * t * 0.7 + (w.rand() * 2 - 1) * spread;
  const ty = s.y + s.vy * t * 0.7 + (w.rand() * 2 - 1) * spread;
  const tz = s.z - s.speed * t;
  const speed = C.ENEMY_BOLT_SPEED * (w.buffs.pulse > 0 ? C.PULSE_SCALE : 1);
  if (
    fireBullet(
      w.enemyBolts,
      ox,
      oy,
      oz,
      tx - ox,
      ty - oy,
      tz - oz,
      speed,
      0,
      0,
      0,
      C.ENEMY_BOLT_LIFE,
      C.ENEMY_BOLT_DAMAGE,
    ) >= 0
  )
    emit(w, 'enemyFire', ox, oy, oz);
}

function killEnemy(w: World, i: number, byPlayer: boolean): void {
  const e = w.enemies;
  e.active[i] = 0;
  const kind = e.kind[i] ?? 0;
  emit(w, 'kill', e.x[i] ?? 0, e.y[i] ?? 0, e.z[i] ?? 0, kind);
  if (!byPlayer) return;
  w.kills++;
  w.score += kind === EnemyKind.Needle ? C.SCORE.needle : C.SCORE.moth;
  const chance = w.difficulty.dropRate * (kind === EnemyKind.Moth ? 2 : 1);
  if (w.rand() < chance) spawnPod(w, e.x[i] ?? 0, e.y[i] ?? 0, e.z[i] ?? 0);
}

// ───────────────────────────── Pods (power-ups) ─────────────────────────────

function spawnPod(w: World, x: number, y: number, z: number): void {
  const p = w.pods;
  const i = freeSlot(p.active);
  if (i < 0) return;
  // Repairs are rarer when healthy; shields and repairs more likely when hurt (rubber-banding, gently).
  const hurt = w.hull < 50;
  const r = w.rand();
  let kind: PodKind;
  if (hurt && r < 0.3) kind = PodKind.Patch;
  else kind = Math.floor(w.rand() * 6) as PodKind;
  p.active[i] = 1;
  p.kind[i] = kind;
  p.x[i] = x;
  p.y[i] = y;
  p.z[i] = z;
  p.life[i] = C.POD_LIFE;
}

function collectPod(w: World, i: number): void {
  const p = w.pods;
  p.active[i] = 0;
  const kind = p.kind[i] ?? 0;
  w.score += C.SCORE.pod;
  switch (kind) {
    case PodKind.Shield:
      w.shield = C.SHIELD_MAX;
      break;
    case PodKind.Patch:
      w.hull = Math.min(C.HULL_MAX, w.hull + C.BUFF.patch);
      break;
    case PodKind.Overcharge:
      w.buffs.overcharge = C.BUFF.overcharge;
      break;
    case PodKind.Coolant:
      w.buffs.coolant = C.BUFF.coolant;
      for (const t of TURRET_SEATS) {
        w.turrets[t].heat = 0;
        w.turrets[t].overheated = false;
      }
      break;
    case PodKind.Missiles:
      w.buffs.missiles += C.BUFF.missiles;
      break;
    case PodKind.Pulse:
      w.buffs.pulse = C.BUFF.pulse;
      break;
  }
  emit(w, 'pickup', p.x[i] ?? 0, p.y[i] ?? 0, p.z[i] ?? 0, kind);
}

function updatePods(w: World): void {
  const p = w.pods;
  const s = w.ship;
  for (let i = 0; i < p.size; i++) {
    if (p.active[i] === 0) continue;
    // Pods drift forward at 85% of ship speed, so they slide slowly back past the canopy.
    p.z[i] = (p.z[i] ?? 0) - s.speed * 0.85 * C.DT;
    p.life[i] = (p.life[i] ?? 0) - C.DT;
    const dx = (p.x[i] ?? 0) - s.x;
    const dy = (p.y[i] ?? 0) - s.y;
    const dz = (p.z[i] ?? 0) - s.z;
    if ((p.life[i] ?? 0) <= 0 || dz > 80) {
      p.active[i] = 0;
      continue;
    }
    if (dx * dx + dy * dy + dz * dz < C.POD_COLLECT_RADIUS ** 2) collectPod(w, i);
  }
}

// ───────────────────────────── Ship and weapons ─────────────────────────────

function updateShip(w: World, pilot: SeatInput): void {
  const s = w.ship;
  let target = C.SPEED_BASE;
  if (w.phase === 'jump') {
    target = 600;
  } else if (pilot.boost && w.boost > 0) {
    target = C.SPEED_BOOST;
    w.boost = Math.max(0, w.boost - C.BOOST_DRAIN * C.DT);
  } else {
    if (pilot.brake) target = C.SPEED_BRAKE;
    w.boost = Math.min(100, w.boost + C.BOOST_REGEN * C.DT);
  }
  s.speed += (target - s.speed) * Math.min(1, C.DT * (w.phase === 'jump' ? 1.2 : 3));

  const steerX = Math.max(-1, Math.min(1, pilot.steerX));
  const steerY = Math.max(-1, Math.min(1, pilot.steerY));
  s.vx += (steerX * C.STEER_ACCEL - s.vx * C.STEER_DAMP) * C.DT;
  s.vy += (steerY * C.STEER_ACCEL - s.vy * C.STEER_DAMP) * C.DT;
  s.vx = Math.max(-C.STEER_MAX, Math.min(C.STEER_MAX, s.vx));
  s.vy = Math.max(-C.STEER_MAX, Math.min(C.STEER_MAX, s.vy));
  s.x += s.vx * C.DT;
  s.y += s.vy * C.DT;
  if (Math.abs(s.x) > C.CORRIDOR_X) {
    s.x = Math.sign(s.x) * C.CORRIDOR_X;
    s.vx = 0;
  }
  if (Math.abs(s.y) > C.CORRIDOR_Y) {
    s.y = Math.sign(s.y) * C.CORRIDOR_Y;
    s.vy = 0;
  }
  s.z -= s.speed * C.DT;
}

/** Index of the living enemy nearest to a world point (for missile homing). */
function nearestEnemyTo(w: World, x: number, y: number, z: number, maxDist: number): number {
  const e = w.enemies;
  let best = -1;
  let bestD = maxDist * maxDist;
  for (let i = 0; i < e.size; i++) {
    if (e.active[i] === 0) continue;
    const d = ((e.x[i] ?? 0) - x) ** 2 + ((e.y[i] ?? 0) - y) ** 2 + ((e.z[i] ?? 0) - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function updateWeapons(w: World, inputs: Record<Seat, SeatInput>): void {
  const s = w.ship;
  const cvz = -s.speed;
  const combat = w.phase === 'run' || w.phase === 'boss';
  const rateMul = w.buffs.overcharge > 0 ? 0.5 : 1;

  // Pilot: forward cannons, alternating left/right; Swarm Missiles add a homing shot.
  const pilot = inputs.pilot;
  w.pilotCooldown -= C.DT;
  if (combat && pilot.fire && w.pilotCooldown <= 0) {
    w.pilotCooldown = C.PILOT_FIRE_INTERVAL * rateMul;
    w.pilotSide = -w.pilotSide;
    const ox = s.x + w.pilotSide * C.PILOT_MUZZLE.x;
    const oy = s.y + C.PILOT_MUZZLE.y;
    const oz = s.z + C.PILOT_MUZZLE.z;
    let dx = pilot.aimX - ox;
    let dy = pilot.aimY - oy;
    let dz = pilot.aimZ - oz;
    // Forward cannons only cover the front cone.
    const len = Math.hypot(dx, dy, dz) || 1;
    if (dz / len > -0.45) {
      dz = -0.45 * len;
      const lat = Math.hypot(dx, dy) || 1;
      const scale = (Math.sqrt(1 - 0.45 * 0.45) * len) / lat;
      dx *= scale;
      dy *= scale;
    }
    if (
      fireBullet(
        w.playerBullets,
        ox,
        oy,
        oz,
        dx,
        dy,
        dz,
        C.PILOT_BULLET_SPEED,
        s.vx,
        s.vy,
        cvz,
        C.BULLET_LIFE,
        C.PILOT_DAMAGE,
      ) >= 0
    )
      emit(w, 'pilotFire', ox, oy, oz);

    if (w.buffs.missiles > 0) {
      const target = nearestEnemyTo(w, pilot.aimX, pilot.aimY, pilot.aimZ, 400);
      const m = fireBullet(
        w.playerBullets,
        s.x,
        s.y - 1.2,
        s.z - 4,
        dx,
        dy,
        dz,
        C.MISSILE_SPEED,
        s.vx,
        s.vy,
        cvz,
        3,
        C.MISSILE_DAMAGE,
      );
      if (m >= 0) {
        w.playerBullets.missile[m] = 1;
        w.playerBullets.target[m] = target;
        w.buffs.missiles--;
        emit(w, 'missileFire', s.x, s.y - 1.2, s.z - 4);
      }
    }
  }

  // Turrets.
  for (let ti = 0; ti < TURRET_SEATS.length; ti++) {
    const seat = TURRET_SEATS[ti] ?? 'dorsal';
    const t = w.turrets[seat];
    const input = inputs[seat];
    const off = C.TURRET_OFFSETS[seat];
    t.heat = Math.max(0, t.heat - C.TURRET_COOL * C.DT);
    if (t.overheated && t.heat < C.TURRET_RESUME) t.overheated = false;
    t.cooldown -= C.DT;
    if (!combat || !input.fire || t.overheated || t.cooldown > 0) continue;
    t.cooldown = C.TURRET_FIRE_INTERVAL * rateMul;
    t.side = -t.side;
    const ox = s.x + off.x + t.side * 0.6;
    const oy = s.y + off.y;
    const oz = s.z + off.z;
    const fired = fireBullet(
      w.playerBullets,
      ox,
      oy,
      oz,
      input.aimX - ox,
      input.aimY - oy,
      input.aimZ - oz,
      C.TURRET_BULLET_SPEED,
      s.vx,
      s.vy,
      cvz,
      C.BULLET_LIFE,
      C.TURRET_DAMAGE,
    );
    if (fired < 0) continue;
    emit(w, 'turretFire', ox, oy, oz, SEATS.indexOf(seat));
    if (w.buffs.coolant > 0) continue;
    t.heat += C.TURRET_HEAT_PER_SHOT;
    if (t.heat >= 1) {
      t.heat = 1;
      t.overheated = true;
      emit(w, 'overheat', ox, oy, oz, SEATS.indexOf(seat));
    }
  }
}

function moveBullets(
  pool: BulletPool,
  dt: number,
  onMove: (i: number, ax: number, ay: number, az: number) => void,
): void {
  for (let i = 0; i < pool.size; i++) {
    if (pool.active[i] === 0) continue;
    const ax = pool.x[i] ?? 0;
    const ay = pool.y[i] ?? 0;
    const az = pool.z[i] ?? 0;
    pool.x[i] = ax + (pool.vx[i] ?? 0) * dt;
    pool.y[i] = ay + (pool.vy[i] ?? 0) * dt;
    pool.z[i] = az + (pool.vz[i] ?? 0) * dt;
    pool.life[i] = (pool.life[i] ?? 0) - dt;
    if ((pool.life[i] ?? 0) <= 0) {
      pool.active[i] = 0;
      continue;
    }
    onMove(i, ax, ay, az);
  }
}

function steerMissiles(w: World): void {
  const b = w.playerBullets;
  const e = w.enemies;
  for (let i = 0; i < b.size; i++) {
    if (b.active[i] === 0 || b.missile[i] === 0) continue;
    let t = b.target[i] ?? -1;
    if (t < 0 || e.active[t] === 0) {
      t = nearestEnemyTo(w, b.x[i] ?? 0, b.y[i] ?? 0, b.z[i] ?? 0, 300);
      b.target[i] = t;
      if (t < 0) continue;
    }
    const dx = (e.x[t] ?? 0) - (b.x[i] ?? 0);
    const dy = (e.y[t] ?? 0) - (b.y[i] ?? 0);
    const dz = (e.z[t] ?? 0) - (b.z[i] ?? 0);
    const len = Math.hypot(dx, dy, dz) || 1;
    const speed = Math.hypot(b.vx[i] ?? 0, b.vy[i] ?? 0, b.vz[i] ?? 0) || C.MISSILE_SPEED;
    const k = Math.min(1, C.MISSILE_TURN * C.DT);
    b.vx[i] = (b.vx[i] ?? 0) + ((dx / len) * speed - (b.vx[i] ?? 0)) * k;
    b.vy[i] = (b.vy[i] ?? 0) + ((dy / len) * speed - (b.vy[i] ?? 0)) * k;
    b.vz[i] = (b.vz[i] ?? 0) + ((dz / len) * speed - (b.vz[i] ?? 0)) * k;
  }
}

function updatePlayerBullets(w: World): void {
  const b = w.playerBullets;
  const e = w.enemies;
  const p = w.pods;
  const boss = w.boss;
  steerMissiles(w);
  moveBullets(b, C.DT, (i, ax, ay, az) => {
    const bx = b.x[i] ?? 0;
    const by = b.y[i] ?? 0;
    const bz = b.z[i] ?? 0;
    for (let j = 0; j < e.size; j++) {
      if (e.active[j] === 0) continue;
      const r = enemyRadius(e.kind[j] ?? 0) + (b.missile[i] ? 1.5 : 0);
      if (segmentPointDistSq(ax, ay, az, bx, by, bz, e.x[j] ?? 0, e.y[j] ?? 0, e.z[j] ?? 0) < r * r) {
        b.active[i] = 0;
        e.hp[j] = (e.hp[j] ?? 0) - (b.damage[i] ?? 0);
        if ((e.hp[j] ?? 0) <= 0) killEnemy(w, j, true);
        else emit(w, 'hit', bx, by, bz, 1);
        return;
      }
    }
    // Shooting a pod collects it: the gunners can grab power-ups too.
    for (let j = 0; j < p.size; j++) {
      if (p.active[j] === 0) continue;
      if (
        segmentPointDistSq(ax, ay, az, bx, by, bz, p.x[j] ?? 0, p.y[j] ?? 0, p.z[j] ?? 0) <
        C.POD_RADIUS ** 2
      ) {
        b.active[i] = 0;
        collectPod(w, j);
        return;
      }
    }
    if (!boss) return;
    for (let n = 0; n < C.BOSS_NODES.length; n++) {
      const hp = boss.nodeHp[n] ?? 0;
      const node = C.BOSS_NODES[n];
      if (hp <= 0 || !node) continue;
      const nx = boss.x + node.x;
      const ny = boss.y + node.y;
      const nz = boss.z + node.z;
      if (segmentPointDistSq(ax, ay, az, bx, by, bz, nx, ny, nz) < C.BOSS_NODE_RADIUS ** 2) {
        b.active[i] = 0;
        boss.nodeHp[n] = hp - (b.damage[i] ?? 0);
        if ((boss.nodeHp[n] ?? 0) <= 0) {
          w.score += C.SCORE.node;
          emit(w, 'nodeDown', nx, ny, nz, n);
          if (boss.nodeHp.every((h) => h <= 0)) {
            w.score += C.SCORE.boss;
            emit(w, 'kill', boss.x, boss.y, boss.z, 2);
            setPhase(w, 'jump');
          }
        } else {
          emit(w, 'hit', bx, by, bz, 2);
        }
        return;
      }
    }
    if (segmentPointDistSq(ax, ay, az, bx, by, bz, boss.x, boss.y, boss.z) < C.BOSS_BODY_RADIUS ** 2) {
      b.active[i] = 0;
      emit(w, 'hit', bx, by, bz, 0);
    }
  });
}

function updateEnemyBolts(w: World): void {
  const b = w.enemyBolts;
  const s = w.ship;
  const rr = (C.SHIP_RADIUS + C.ENEMY_BOLT_RADIUS) ** 2;
  const dt = C.DT * (w.buffs.pulse > 0 ? C.PULSE_SCALE : 1);
  moveBullets(b, dt, (i, ax, ay, az) => {
    const rel = (b.z[i] ?? 0) - s.z;
    if (rel > 120 || w.phase === 'jump') {
      b.active[i] = 0;
      return;
    }
    if (segmentPointDistSq(ax, ay, az, b.x[i] ?? 0, b.y[i] ?? 0, b.z[i] ?? 0, s.x, s.y, s.z) < rr) {
      b.active[i] = 0;
      damageShip(w, b.damage[i] ?? 0, b.x[i] ?? 0, b.y[i] ?? 0, b.z[i] ?? 0);
    }
  });
}

function updateBoss(w: World): void {
  const s = w.ship;
  if (w.phase === 'run' && -s.z >= RUN_LENGTH) {
    w.boss = {
      x: 0,
      y: 0,
      z: s.z - 900,
      t: 0,
      nodeHp: C.BOSS_NODES.map(() => C.BOSS_NODE_HP),
      fireTimer: 5,
    };
    setPhase(w, 'boss');
  }
  const boss = w.boss;
  if (!boss) return;
  boss.t += C.DT;
  boss.x = Math.sin(boss.t * 0.25) * 10;
  boss.y = Math.sin(boss.t * 0.17) * 5;
  const targetZ = s.z - C.BOSS_DISTANCE_AHEAD;
  boss.z += (targetZ - boss.z) * Math.min(1, C.DT * (w.phase === 'jump' ? 0 : 0.8));
  if (w.phase !== 'boss') return;

  boss.fireTimer -= C.DT * (w.buffs.pulse > 0 ? C.PULSE_SCALE : 1);
  if (boss.fireTimer <= 0) {
    const down = boss.nodeHp.filter((h) => h <= 0).length;
    boss.fireTimer = Math.max(0.9, 2.4 - down * 0.4);
    const alive = C.BOSS_NODES.filter((_, n) => (boss.nodeHp[n] ?? 0) > 0);
    const node = alive[Math.floor(w.rand() * alive.length)] ?? { x: 0, y: 0, z: 0 };
    const volley = 4 + down;
    for (let k = 0; k < volley; k++)
      aimBolt(w, boss.x + node.x, boss.y + node.y, boss.z + node.z, 10 / w.difficulty.enemyAccuracy);
  }
}

export function zoneOf(w: World): number {
  return Math.min(C.ZONE_COUNT - 1, Math.floor(-w.ship.z / C.ZONE_LENGTH));
}

export function progressOf(w: World): number {
  if (w.phase === 'run') return Math.min(1, -w.ship.z / RUN_LENGTH) * 0.8;
  if (w.phase === 'boss' && w.boss) {
    const down = w.boss.nodeHp.filter((h) => h <= 0).length;
    return 0.8 + 0.2 * (down / C.BOSS_NODES.length);
  }
  return w.phase === 'lost' ? Math.min(1, -w.ship.z / RUN_LENGTH) * 0.8 : 1;
}

const resolved: Record<Seat, SeatInput> = {
  pilot: emptyInput(),
  dorsal: emptyInput(),
  ventral: emptyInput(),
};

export function stepWorld(w: World): void {
  w.events.length = 0;
  if (w.phase === 'won' || w.phase === 'lost') return;
  w.tick++;
  w.time += C.DT;
  w.phaseTime += C.DT;

  resolved.pilot = w.humans.pilot ? w.inputs.pilot : botPilotInput(w);
  resolved.dorsal = w.humans.dorsal ? w.inputs.dorsal : botTurretInput(w, 'dorsal');
  resolved.ventral = w.humans.ventral ? w.inputs.ventral : botTurretInput(w, 'ventral');

  for (const k of ['overcharge', 'coolant', 'pulse'] as const) w.buffs[k] = Math.max(0, w.buffs[k] - C.DT);

  updateShip(w, resolved.pilot);
  updateWeapons(w, resolved);
  updateSpawns(w);
  updateBoss(w);
  updateEnemies(w);
  updatePlayerBullets(w);
  updateEnemyBolts(w);
  updatePods(w);

  w.sinceDamage += C.DT;
  if (w.sinceDamage > C.SHIELD_DELAY) w.shield = Math.min(C.SHIELD_MAX, w.shield + C.SHIELD_REGEN * C.DT);

  if (w.phase === 'jump' && w.phaseTime >= C.JUMP_DURATION) setPhase(w, 'won');
}

function pack<T extends { size: number; active: Uint8Array }>(
  pool: T,
  stride: number,
  write: (out: Float32Array, o: number, i: number) => void,
): Float32Array {
  let count = 0;
  for (let i = 0; i < pool.size; i++) if (pool.active[i] === 1) count++;
  const out = new Float32Array(count * stride);
  let o = 0;
  for (let i = 0; i < pool.size; i++) {
    if (pool.active[i] === 0) continue;
    write(out, o, i);
    o += stride;
  }
  return out;
}

export function snapshotOf(w: World): Snapshot {
  const e = w.enemies;
  const p = w.pods;
  const writeBullet =
    (b: BulletPool) =>
    (out: Float32Array, o: number, i: number): void => {
      out[o] = b.x[i] ?? 0;
      out[o + 1] = b.y[i] ?? 0;
      out[o + 2] = b.z[i] ?? 0;
      out[o + 3] = b.vx[i] ?? 0;
      out[o + 4] = b.vy[i] ?? 0;
      out[o + 5] = b.vz[i] ?? 0;
      out[o + 6] = b.missile[i] ?? 0;
    };
  return {
    tick: w.tick,
    time: w.time,
    phase: w.phase,
    progress: progressOf(w),
    zone: zoneOf(w),
    ship: { x: w.ship.x, y: w.ship.y, z: w.ship.z, vx: w.ship.vx, vy: w.ship.vy, vz: -w.ship.speed },
    hull: w.hull,
    shield: w.shield,
    boost: w.boost,
    turrets: {
      dorsal: { heat: w.turrets.dorsal.heat, overheated: w.turrets.dorsal.overheated },
      ventral: { heat: w.turrets.ventral.heat, overheated: w.turrets.ventral.overheated },
    },
    buffs: { ...w.buffs },
    score: w.score,
    kills: w.kills,
    humans: { ...w.humans },
    enemies: pack(e, ENEMY_STRIDE, (out, o, i) => {
      out[o] = e.x[i] ?? 0;
      out[o + 1] = e.y[i] ?? 0;
      out[o + 2] = e.z[i] ?? 0;
      out[o + 3] = e.vx[i] ?? 0;
      out[o + 4] = e.vy[i] ?? 0;
      out[o + 5] = e.vz[i] ?? 0;
      out[o + 6] = e.kind[i] ?? 0;
      out[o + 7] = (e.hp[i] ?? 0) / (e.maxHp[i] || 1);
      out[o + 8] = e.aux[i] ?? 0;
    }),
    playerBullets: pack(w.playerBullets, BULLET_STRIDE, writeBullet(w.playerBullets)),
    enemyBolts: pack(w.enemyBolts, BULLET_STRIDE, writeBullet(w.enemyBolts)),
    pods: pack(p, POD_STRIDE, (out, o, i) => {
      out[o] = p.x[i] ?? 0;
      out[o + 1] = p.y[i] ?? 0;
      out[o + 2] = p.z[i] ?? 0;
      out[o + 3] = p.kind[i] ?? 0;
    }),
    boss: w.boss ? { x: w.boss.x, y: w.boss.y, z: w.boss.z, nodes: [...w.boss.nodeHp] } : null,
    events: [...w.events],
  };
}
