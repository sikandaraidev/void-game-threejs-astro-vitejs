import * as C from './constants';
import { EnemyKind, type SeatInput, type TurretSeat } from './types';
import type { World } from './world';

/**
 * Bot crew for any empty seat. Readable and a little imperfect: they cover a seat, they don't
 * carry the run. Bots read World directly (they run inside the sim, on the host).
 */

const blank = (): SeatInput => ({
  steerX: 0,
  steerY: 0,
  boost: false,
  brake: false,
  fire: false,
  aimX: 0,
  aimY: 0,
  aimZ: 0,
});
const pilotOut = blank();
const turretOut: Record<TurretSeat, SeatInput> = { dorsal: blank(), ventral: blank() };

/** Aim point that leads a target, given the shot speed (bolts inherit ship velocity). */
function lead(w: World, ox: number, oy: number, oz: number, i: number, speed: number, out: SeatInput): void {
  const s = w.ship;
  const e = w.enemies;
  const tx = e.x[i] ?? 0;
  const ty = e.y[i] ?? 0;
  const tz = e.z[i] ?? 0;
  const rvx = (e.vx[i] ?? 0) - s.vx;
  const rvy = (e.vy[i] ?? 0) - s.vy;
  const rvz = (e.vz[i] ?? 0) + s.speed;
  let t = Math.hypot(tx - ox, ty - oy, tz - oz) / speed;
  t = Math.hypot(tx + rvx * t - ox, ty + rvy * t - oy, tz + rvz * t - oz) / speed;
  out.aimX = tx + rvx * t;
  out.aimY = ty + rvy * t;
  out.aimZ = tz + rvz * t;
}

export function botPilotInput(w: World): SeatInput {
  const s = w.ship;
  const e = w.enemies;
  const out = pilotOut;
  out.fire = false;
  out.boost = false;
  out.brake = false;

  // Target: nearest enemy ahead, else a living Ossuary heart.
  let best = -1;
  let bestScore = 320;
  for (let i = 0; i < e.size; i++) {
    if (e.active[i] === 0) continue;
    const rel = (e.z[i] ?? 0) - s.z;
    if (rel > -25) continue;
    const score = -rel + Math.hypot((e.x[i] ?? 0) - s.x, (e.y[i] ?? 0) - s.y) * 3;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }

  let goalX = Math.sin(w.time * 0.35) * C.CORRIDOR_X * 0.5;
  let goalY = Math.sin(w.time * 0.23) * C.CORRIDOR_Y * 0.4;
  if (best >= 0) {
    lead(w, s.x, s.y, s.z + C.PILOT_MUZZLE.z, best, C.PILOT_BULLET_SPEED, out);
    out.fire = true;
    goalX = (e.x[best] ?? 0) * 0.5;
    goalY = (e.y[best] ?? 0) * 0.5;
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

  // Grab a nearby pod ahead (humans love it when the bot does this; it reads as smart).
  const p = w.pods;
  for (let i = 0; i < p.size; i++) {
    if (p.active[i] === 0) continue;
    const rel = (p.z[i] ?? 0) - s.z;
    if (rel < -150 || rel > -10) continue;
    goalX = p.x[i] ?? goalX;
    goalY = p.y[i] ?? goalY;
    break;
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
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
        if (w.rand() < 0.7) {
          mem.dodgeX = s.x - Math.sign(dx || 1) * 10;
          mem.dodgeY = s.y - Math.sign(dy || 1) * 6;
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

/** Each turret covers its own hemisphere (dorsal: above, ventral: below), preferring Moths and chasers. */
export function botTurretInput(w: World, seat: TurretSeat): SeatInput {
  const s = w.ship;
  const e = w.enemies;
  const t = w.turrets[seat];
  const off = C.TURRET_OFFSETS[seat];
  const out = turretOut[seat];
  out.fire = false;
  const ox = s.x + off.x;
  const oy = s.y + off.y;
  const oz = s.z + off.z;
  const up = seat === 'dorsal' ? 1 : -1;

  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < e.size; i++) {
    if (e.active[i] === 0) continue;
    const ry = ((e.y[i] ?? 0) - oy) * up;
    if (ry < -4) continue; // the hull blocks the other hemisphere
    const d = Math.hypot((e.x[i] ?? 0) - ox, (e.y[i] ?? 0) - oy, (e.z[i] ?? 0) - oz);
    if (d > 170) continue;
    const rz = (e.z[i] ?? 0) - s.z;
    const priority = (e.kind[i] === EnemyKind.Moth ? 0.5 : 1) * (rz > -20 ? 0.7 : 1);
    const score = d * priority;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }

  if (best >= 0) {
    lead(w, ox, oy, oz, best, C.TURRET_BULLET_SPEED, out);
    // Bots manage heat: they let the barrels cool before they lock.
    out.fire = !t.overheated && t.heat < 0.85;
  } else {
    out.aimX = s.x;
    out.aimY = s.y + up * 20;
    out.aimZ = s.z + 100;
  }
  return out;
}
