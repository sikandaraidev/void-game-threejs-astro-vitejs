import * as C from './constants';
import { EnemyKind, type SeatInput } from './types';
import type { World } from './world';

/**
 * Bot crew. Deliberately readable and a little imperfect: they cover a seat, they don't carry the run.
 * Bots read World directly (they run inside the sim, on the host).
 */

const pilotOut: SeatInput = {
  steerX: 0,
  steerY: 0,
  boost: false,
  brake: false,
  fire: false,
  aimX: 0,
  aimY: 0,
  aimZ: 0,
};
const gunnerOut: SeatInput = { ...pilotOut };

function lead(
  w: World,
  ox: number,
  oy: number,
  oz: number,
  tx: number,
  ty: number,
  tz: number,
  tvx: number,
  tvy: number,
  tvz: number,
  speed: number,
  out: SeatInput,
): void {
  const s = w.ship;
  const t = Math.hypot(tx - ox, ty - oy, tz - oz) / speed;
  // Bullets inherit ship velocity, so lead on velocity relative to the ship.
  out.aimX = tx + (tvx - s.vx) * t;
  out.aimY = ty + (tvy - s.vy) * t;
  out.aimZ = tz + (tvz + s.speed) * t;
}

export function botPilotInput(w: World): SeatInput {
  const s = w.ship;
  const e = w.enemies;
  const out = pilotOut;
  out.fire = false;
  out.boost = false;
  out.brake = false;

  // Target: nearest enemy ahead, or a living boss node.
  let best = -1;
  let bestDist = 260;
  for (let i = 0; i < e.size; i++) {
    if (e.active[i] === 0) continue;
    const rel = (e.z[i] ?? 0) - s.z;
    if (rel > -20) continue;
    const d = -rel + Math.abs((e.x[i] ?? 0) - s.x) * 2;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }

  let goalX = Math.sin(w.time * 0.35) * C.CORRIDOR_X * 0.5;
  let goalY = Math.sin(w.time * 0.23) * C.CORRIDOR_Y * 0.4;
  if (best >= 0) {
    lead(
      w,
      s.x,
      s.y,
      s.z - 1.6,
      e.x[best] ?? 0,
      e.y[best] ?? 0,
      e.z[best] ?? 0,
      e.vx[best] ?? 0,
      e.vy[best] ?? 0,
      e.vz[best] ?? 0,
      C.PILOT_BULLET_SPEED,
      out,
    );
    out.fire = true;
    goalX = (e.x[best] ?? 0) * 0.6;
    goalY = (e.y[best] ?? 0) * 0.6;
  } else if (w.boss) {
    const n = C.BOSS_NODES.findIndex((_, k) => (w.boss?.nodeHp[k] ?? 0) > 0);
    const node = C.BOSS_NODES[n];
    if (node) {
      out.aimX = w.boss.x + node.x;
      out.aimY = w.boss.y + node.y;
      out.aimZ = w.boss.z + node.z;
      out.fire = true;
    }
  } else {
    out.aimX = s.x;
    out.aimY = s.y;
    out.aimZ = s.z - 200;
  }

  // Dodge like a person: think every ~0.3 s, and only notice a threat ~70% of the time.
  const mem = w.bot;
  if (w.time >= mem.nextThink) {
    mem.nextThink = w.time + 0.25 + w.rand() * 0.15;
    const b = w.enemyBolts;
    for (let i = 0; i < b.size; i++) {
      if (b.active[i] === 0) continue;
      const rel = (b.z[i] ?? 0) - s.z;
      if (rel > 0 || rel < -60) continue;
      const dx = (b.x[i] ?? 0) - s.x;
      const dy = (b.y[i] ?? 0) - s.y;
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) {
        if (w.rand() < 0.7) {
          mem.dodgeX = s.x - Math.sign(dx || 1) * 8;
          mem.dodgeY = s.y - Math.sign(dy || 1) * 5;
          mem.dodgeUntil = w.time + 0.5;
        }
        break;
      }
    }
  }
  if (w.time < mem.dodgeUntil) {
    goalX = mem.dodgeX;
    goalY = mem.dodgeY;
  }

  out.steerX = Math.max(-1, Math.min(1, (goalX - s.x) * 0.25 - s.vx * 0.05));
  out.steerY = Math.max(-1, Math.min(1, (goalY - s.y) * 0.25 - s.vy * 0.05));
  return out;
}

export function botGunnerInput(w: World): SeatInput {
  const s = w.ship;
  const e = w.enemies;
  const out = gunnerOut;
  out.fire = false;
  const ox = s.x + C.TURRET_OFFSET.x;
  const oy = s.y + C.TURRET_OFFSET.y;
  const oz = s.z + C.TURRET_OFFSET.z;

  // Gunner covers behind and the flanks; chasers first.
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < e.size; i++) {
    if (e.active[i] === 0) continue;
    const rel = (e.z[i] ?? 0) - s.z;
    if (rel < -60) continue;
    const d = Math.hypot((e.x[i] ?? 0) - s.x, (e.y[i] ?? 0) - s.y, rel);
    const score = d * (e.kind[i] === EnemyKind.Chaser ? 0.5 : 1);
    if (score < bestScore && d < 140) {
      bestScore = score;
      best = i;
    }
  }

  if (best >= 0) {
    lead(
      w,
      ox,
      oy,
      oz,
      e.x[best] ?? 0,
      e.y[best] ?? 0,
      e.z[best] ?? 0,
      e.vx[best] ?? 0,
      e.vy[best] ?? 0,
      e.vz[best] ?? 0,
      C.TURRET_BULLET_SPEED,
      out,
    );
    // Bots manage heat: they let the barrel cool before it locks.
    out.fire = !w.overheated && w.heat < 0.85;
  } else {
    out.aimX = s.x;
    out.aimY = s.y + 2;
    out.aimZ = s.z + 100;
  }
  return out;
}
