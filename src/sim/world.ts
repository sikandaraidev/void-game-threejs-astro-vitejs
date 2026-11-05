import * as C from './constants';
import { mulberry32 } from './rng';
import { botGunnerInput, botPilotInput } from './bots';
import {
  BULLET_STRIDE,
  ENEMY_STRIDE,
  EnemyKind,
  PHASES,
  emptyInput,
  type Phase,
  type Seat,
  type SeatInput,
  type SimEvent,
  type SimEventType,
  type Snapshot,
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
  phase: Float32Array;
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
  tick: number;
  time: number;
  phase: Phase;
  phaseTime: number;
  ship: { x: number; y: number; z: number; vx: number; vy: number; speed: number };
  hull: number;
  shield: number;
  sinceDamage: number;
  boost: number;
  heat: number;
  overheated: boolean;
  pilotCooldown: number;
  pilotSide: number;
  turretCooldown: number;
  score: number;
  kills: number;
  humans: Record<Seat, boolean>;
  inputs: Record<Seat, SeatInput>;
  playerBullets: BulletPool;
  enemyBolts: BulletPool;
  enemies: EnemyPool;
  shardTimer: number;
  chaserTimer: number;
  boss: Boss | null;
  /** Bot pilot memory: it reacts on a human-like cadence, not every tick. */
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
  };
}

function enemyPool(size: number): EnemyPool {
  return {
    size,
    active: new Uint8Array(size),
    kind: new Uint8Array(size),
    x: new Float32Array(size),
    y: new Float32Array(size),
    z: new Float32Array(size),
    vx: new Float32Array(size),
    vy: new Float32Array(size),
    vz: new Float32Array(size),
    hp: new Float32Array(size),
    maxHp: new Float32Array(size),
    age: new Float32Array(size),
    fireTimer: new Float32Array(size),
    phase: new Float32Array(size),
  };
}

export function createWorld(
  seed: number,
  humans: Record<Seat, boolean> = { pilot: true, gunner: false },
): World {
  return {
    rand: mulberry32(seed),
    tick: 0,
    time: 0,
    phase: 'run',
    phaseTime: 0,
    ship: { x: 0, y: 0, z: 0, vx: 0, vy: 0, speed: C.SPEED_BASE },
    hull: C.HULL_MAX,
    shield: C.SHIELD_MAX,
    sinceDamage: 99,
    boost: 100,
    heat: 0,
    overheated: false,
    pilotCooldown: 0,
    pilotSide: 1,
    turretCooldown: 0,
    score: 0,
    kills: 0,
    humans: { ...humans },
    inputs: { pilot: emptyInput(), gunner: emptyInput() },
    playerBullets: bulletPool(C.MAX_PLAYER_BULLETS),
    enemyBolts: bulletPool(C.MAX_ENEMY_BOLTS),
    enemies: enemyPool(C.MAX_ENEMIES),
    shardTimer: 2.5,
    chaserTimer: 18,
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
  carry: { vx: number; vy: number; vz: number },
  life: number,
  damage: number,
): boolean {
  const i = freeSlot(pool.active);
  if (i < 0) return false;
  const len = Math.hypot(dx, dy, dz) || 1;
  pool.active[i] = 1;
  pool.x[i] = ox;
  pool.y[i] = oy;
  pool.z[i] = oz;
  pool.vx[i] = (dx / len) * speed + carry.vx;
  pool.vy[i] = (dy / len) * speed + carry.vy;
  pool.vz[i] = (dz / len) * speed + carry.vz;
  pool.life[i] = life;
  pool.damage[i] = damage;
  return true;
}

/** Squared distance from point (cx,cy,cz) to the segment aâ†’b. Prevents fast bullets tunnelling. */
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

function damageShip(w: World, amount: number, x: number, y: number, z: number): void {
  if (w.phase === 'jump' || w.phase === 'won' || w.phase === 'lost') return;
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

function spawnEnemy(w: World, kind: EnemyKind): void {
  const e = w.enemies;
  const i = freeSlot(e.active);
  if (i < 0) return;
  const r = w.rand;
  e.active[i] = 1;
  e.kind[i] = kind;
  e.x[i] = w.ship.x + (r() * 2 - 1) * C.CORRIDOR_X;
  e.y[i] = w.ship.y + (r() * 2 - 1) * C.CORRIDOR_Y;
  e.vx[i] = 0;
  e.vy[i] = 0;
  e.age[i] = 0;
  e.phase[i] = r() * Math.PI * 2;
  if (kind === EnemyKind.Shard) {
    e.z[i] = w.ship.z - 280 - r() * 60;
    e.vz[i] = -12;
    e.hp[i] = e.maxHp[i] = 4;
    e.fireTimer[i] = 1.5 + r() * 1.5;
  } else {
    e.z[i] = w.ship.z + 150;
    e.vz[i] = -(w.ship.speed + 30);
    e.hp[i] = e.maxHp[i] = 4;
    e.fireTimer[i] = 2.5 + r();
  }
}

function enemyRadius(kind: number): number {
  return kind === EnemyKind.Shard ? 3.4 : 2.8;
}

function aimBolt(w: World, ox: number, oy: number, oz: number, spread: number): void {
  const s = w.ship;
  // Intercept: find t where the bolt meets the ship's predicted position (two refinement passes).
  let t = Math.hypot(s.x - ox, s.y - oy, s.z - oz) / C.ENEMY_BOLT_SPEED;
  for (let k = 0; k < 2; k++) {
    t = Math.hypot(s.x + s.vx * t - ox, s.y + s.vy * t - oy, s.z - s.speed * t - oz) / C.ENEMY_BOLT_SPEED;
  }
  // Lateral lead is deliberately partial, plus spread: dodging is a skill, not luck.
  const tx = s.x + s.vx * t * 0.7 + (w.rand() * 2 - 1) * spread;
  const ty = s.y + s.vy * t * 0.7 + (w.rand() * 2 - 1) * spread;
  const tz = s.z - s.speed * t;
  if (
    fireBullet(
      w.enemyBolts,
      ox,
      oy,
      oz,
      tx - ox,
      ty - oy,
      tz - oz,
      C.ENEMY_BOLT_SPEED,
      ZERO,
      C.ENEMY_BOLT_LIFE,
      C.ENEMY_BOLT_DAMAGE,
    )
  )
    emit(w, 'enemyFire', ox, oy, oz);
}

const ZERO = { vx: 0, vy: 0, vz: 0 } as const;

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

function updateWeapons(w: World, pilot: SeatInput, gunner: SeatInput): void {
  const s = w.ship;
  const carry = { vx: s.vx, vy: s.vy, vz: -s.speed };
  const combat = w.phase === 'run' || w.phase === 'boss';

  w.pilotCooldown -= C.DT;
  if (combat && pilot.fire && w.pilotCooldown <= 0) {
    w.pilotCooldown = C.PILOT_FIRE_INTERVAL;
    w.pilotSide = -w.pilotSide;
    const ox = s.x + w.pilotSide * 1.1;
    const oy = s.y - 0.05;
    const oz = s.z - 1.6;
    let dx = pilot.aimX - ox;
    let dy = pilot.aimY - oy;
    let dz = pilot.aimZ - oz;
    // Forward guns only cover the front cone.
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
        carry,
        C.BULLET_LIFE,
        C.PILOT_DAMAGE,
      )
    )
      emit(w, 'pilotFire', ox, oy, oz);
  }

  w.heat = Math.max(0, w.heat - C.TURRET_COOL * C.DT);
  if (w.overheated && w.heat < C.TURRET_RESUME) w.overheated = false;
  w.turretCooldown -= C.DT;
  if (combat && gunner.fire && !w.overheated && w.turretCooldown <= 0) {
    w.turretCooldown = C.TURRET_FIRE_INTERVAL;
    const ox = s.x + C.TURRET_OFFSET.x;
    const oy = s.y + C.TURRET_OFFSET.y;
    const oz = s.z + C.TURRET_OFFSET.z;
    if (
      fireBullet(
        w.playerBullets,
        ox,
        oy,
        oz,
        gunner.aimX - ox,
        gunner.aimY - oy,
        gunner.aimZ - oz,
        C.TURRET_BULLET_SPEED,
        carry,
        C.BULLET_LIFE,
        C.TURRET_DAMAGE,
      )
    ) {
      emit(w, 'turretFire', ox, oy, oz);
      w.heat += C.TURRET_HEAT_PER_SHOT;
      if (w.heat >= 1) {
        w.heat = 1;
        w.overheated = true;
        emit(w, 'overheat', ox, oy, oz);
      }
    }
  }
}

function updateSpawns(w: World): void {
  if (w.phase !== 'run' && w.phase !== 'boss') return;
  const zone = zoneOf(w);
  const shardEvery = w.phase === 'boss' ? 3.6 : ([2.1, 1.45, 1.0][zone] ?? 1);
  const chaserEvery = w.phase === 'boss' ? 6 : ([11, 6.5, 4.2][zone] ?? 4);
  w.shardTimer -= C.DT;
  w.chaserTimer -= C.DT;
  if (w.shardTimer <= 0) {
    w.shardTimer = shardEvery * (0.7 + w.rand() * 0.6);
    spawnEnemy(w, EnemyKind.Shard);
    if (zone >= 1 && w.rand() < 0.35) spawnEnemy(w, EnemyKind.Shard);
  }
  if (w.chaserTimer <= 0) {
    w.chaserTimer = chaserEvery * (0.7 + w.rand() * 0.6);
    spawnEnemy(w, EnemyKind.Chaser);
  }
}

function updateEnemies(w: World): void {
  const e = w.enemies;
  const s = w.ship;
  const combat = w.phase === 'run' || w.phase === 'boss';
  for (let i = 0; i < e.size; i++) {
    if (e.active[i] === 0) continue;
    const age = (e.age[i] = (e.age[i] ?? 0) + C.DT);
    const ph = e.phase[i] ?? 0;
    const ez = e.z[i] ?? 0;
    if (e.kind[i] === EnemyKind.Shard) {
      e.vx[i] = Math.cos(age * 1.3 + ph) * 9;
      e.vy[i] = Math.sin(age * 0.9 + ph) * 4;
      e.vz[i] = -12;
    } else {
      const overtaking = age > 14;
      const targetZ = overtaking ? s.z - 260 : s.z + 26 + Math.sin(age + ph) * 6;
      const targetX = s.x + Math.sin(age * 0.9 + ph) * 12;
      const targetY = s.y + Math.cos(age * 0.7 + ph) * 6;
      e.vz[i] = -s.speed + Math.max(-60, Math.min(40, (targetZ - ez) * 1.6));
      e.vx[i] = (targetX - (e.x[i] ?? 0)) * 1.8;
      e.vy[i] = (targetY - (e.y[i] ?? 0)) * 1.8;
    }
    e.x[i] = (e.x[i] ?? 0) + (e.vx[i] ?? 0) * C.DT;
    e.y[i] = (e.y[i] ?? 0) + (e.vy[i] ?? 0) * C.DT;
    e.z[i] = ez + (e.vz[i] ?? 0) * C.DT;

    const rel = (e.z[i] ?? 0) - s.z;
    if (rel > 60 || rel < -420 || w.phase === 'jump') {
      e.active[i] = 0;
      continue;
    }

    e.fireTimer[i] = (e.fireTimer[i] ?? 0) - C.DT;
    const inRange = e.kind[i] === EnemyKind.Shard ? rel < -25 && rel > -240 : rel > 8 && rel < 60;
    if (combat && inRange && (e.fireTimer[i] ?? 0) <= 0) {
      e.fireTimer[i] = (e.kind[i] === EnemyKind.Shard ? 1.1 : 0.9) + w.rand() * 1.0;
      aimBolt(w, e.x[i] ?? 0, e.y[i] ?? 0, e.z[i] ?? 0, 1.6);
    }

    // Ramming the ship.
    const dx = (e.x[i] ?? 0) - s.x;
    const dy = (e.y[i] ?? 0) - s.y;
    const dz = (e.z[i] ?? 0) - s.z;
    const rr = enemyRadius(e.kind[i] ?? 0) + C.SHIP_RADIUS;
    if (dx * dx + dy * dy + dz * dz < rr * rr) {
      e.active[i] = 0;
      emit(w, 'kill', e.x[i] ?? 0, e.y[i] ?? 0, e.z[i] ?? 0, e.kind[i] ?? 0);
      damageShip(w, C.RAM_DAMAGE, s.x, s.y, s.z);
    }
  }
}

function moveBullets(
  pool: BulletPool,
  onMove: (i: number, ax: number, ay: number, az: number) => void,
): void {
  for (let i = 0; i < pool.size; i++) {
    if (pool.active[i] === 0) continue;
    const ax = pool.x[i] ?? 0;
    const ay = pool.y[i] ?? 0;
    const az = pool.z[i] ?? 0;
    pool.x[i] = ax + (pool.vx[i] ?? 0) * C.DT;
    pool.y[i] = ay + (pool.vy[i] ?? 0) * C.DT;
    pool.z[i] = az + (pool.vz[i] ?? 0) * C.DT;
    pool.life[i] = (pool.life[i] ?? 0) - C.DT;
    if ((pool.life[i] ?? 0) <= 0) {
      pool.active[i] = 0;
      continue;
    }
    onMove(i, ax, ay, az);
  }
}

function updatePlayerBullets(w: World): void {
  const b = w.playerBullets;
  const e = w.enemies;
  const boss = w.boss;
  moveBullets(b, (i, ax, ay, az) => {
    const bx = b.x[i] ?? 0;
    const by = b.y[i] ?? 0;
    const bz = b.z[i] ?? 0;
    for (let j = 0; j < e.size; j++) {
      if (e.active[j] === 0) continue;
      const r = enemyRadius(e.kind[j] ?? 0);
      if (segmentPointDistSq(ax, ay, az, bx, by, bz, e.x[j] ?? 0, e.y[j] ?? 0, e.z[j] ?? 0) < r * r) {
        b.active[i] = 0;
        e.hp[j] = (e.hp[j] ?? 0) - (b.damage[i] ?? 0);
        if ((e.hp[j] ?? 0) <= 0) {
          e.active[j] = 0;
          w.kills++;
          w.score += e.kind[j] === EnemyKind.Shard ? C.SCORE.shard : C.SCORE.chaser;
          emit(w, 'kill', e.x[j] ?? 0, e.y[j] ?? 0, e.z[j] ?? 0, e.kind[j] ?? 0);
        } else {
          emit(w, 'hit', bx, by, bz, 1);
        }
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
  moveBullets(b, (i, ax, ay, az) => {
    const rel = (b.z[i] ?? 0) - s.z;
    if (rel > 80 || w.phase === 'jump') {
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
      z: s.z - 520,
      t: 0,
      nodeHp: C.BOSS_NODES.map(() => C.BOSS_NODE_HP),
      fireTimer: 4,
    };
    setPhase(w, 'boss');
  }
  const boss = w.boss;
  if (!boss) return;
  boss.t += C.DT;
  boss.x = Math.sin(boss.t * 0.4) * 7;
  boss.y = Math.sin(boss.t * 0.27) * 3.5;
  const targetZ = s.z - C.BOSS_DISTANCE_AHEAD;
  boss.z += (targetZ - boss.z) * Math.min(1, C.DT * (w.phase === 'jump' ? 0 : 1.2));
  if (w.phase !== 'boss') return;

  boss.fireTimer -= C.DT;
  if (boss.fireTimer <= 0) {
    const down = boss.nodeHp.filter((h) => h <= 0).length;
    boss.fireTimer = Math.max(0.85, 2.3 - down * 0.4);
    const alive = C.BOSS_NODES.filter((_, n) => (boss.nodeHp[n] ?? 0) > 0);
    const node = alive[Math.floor(w.rand() * alive.length)] ?? { x: 0, y: 0, z: 0 };
    const volley = 4 + down;
    for (let k = 0; k < volley; k++) aimBolt(w, boss.x + node.x, boss.y + node.y, boss.z + node.z, 9);
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

export function stepWorld(w: World): void {
  w.events.length = 0;
  if (w.phase === 'won' || w.phase === 'lost') return;
  w.tick++;
  w.time += C.DT;
  w.phaseTime += C.DT;

  const pilot = w.humans.pilot ? w.inputs.pilot : botPilotInput(w);
  const gunner = w.humans.gunner ? w.inputs.gunner : botGunnerInput(w);

  updateShip(w, pilot);
  updateWeapons(w, pilot, gunner);
  updateSpawns(w);
  updateBoss(w);
  updateEnemies(w);
  updatePlayerBullets(w);
  updateEnemyBolts(w);

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
  const writeBullet =
    (p: BulletPool) =>
    (out: Float32Array, o: number, i: number): void => {
      out[o] = p.x[i] ?? 0;
      out[o + 1] = p.y[i] ?? 0;
      out[o + 2] = p.z[i] ?? 0;
      out[o + 3] = p.vx[i] ?? 0;
      out[o + 4] = p.vy[i] ?? 0;
      out[o + 5] = p.vz[i] ?? 0;
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
    heat: w.heat,
    overheated: w.overheated,
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
    }),
    playerBullets: pack(w.playerBullets, BULLET_STRIDE, writeBullet(w.playerBullets)),
    enemyBolts: pack(w.enemyBolts, BULLET_STRIDE, writeBullet(w.enemyBolts)),
    boss: w.boss ? { x: w.boss.x, y: w.boss.y, z: w.boss.z, nodes: [...w.boss.nodeHp] } : null,
    events: [...w.events],
  };
}
