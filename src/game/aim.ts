import { Vector3, type PerspectiveCamera, type Vector2 } from 'three/webgpu';
import { BOSS_NODES, PILOT_BULLET_SPEED, TURRET_BULLET_SPEED, TURRET_OFFSET } from '../sim/constants';
import { ENEMY_STRIDE, type Seat, type SeatInput, type Snapshot } from '../sim/types';

/**
 * Aim assist ("reticle magnetism"), standard in console/arcade shooters.
 * Picks the target whose screen position is nearest the reticle (within a radius), then
 * aims at its predicted intercept point. Without this, a shot toward the mouse ray misses
 * anything that moves, because bolts take time to arrive.
 * Fitts's law: the effective target becomes larger without changing the visuals.
 */
export interface AimResult {
  locked: boolean;
}

const p = new Vector3();
const v = new Vector3();
const ndc = new Vector3();
const origin = new Vector3();
const best = new Vector3();
const bestVel = new Vector3();

export function assistAim(
  s: Snapshot,
  since: number,
  camera: PerspectiveCamera,
  mouse: Vector2,
  seat: Seat,
  strength: number,
  out: SeatInput,
): AimResult {
  if (strength <= 0) return { locked: false };
  const ship = s.ship;
  const shipVz = ship.vz;
  origin.set(ship.x + ship.vx * since, ship.y + ship.vy * since, ship.z + shipVz * since);
  if (seat !== 'pilot') origin.add(v.set(TURRET_OFFSET.x, TURRET_OFFSET.y, TURRET_OFFSET.z));

  const radius = strength; // in NDC units, aspect-corrected
  let bestD = radius * radius;
  let found = false;

  const consider = (x: number, y: number, z: number, vx: number, vy: number, vz: number): void => {
    p.set(x + vx * since, y + vy * since, z + vz * since);
    ndc.copy(p).project(camera);
    if (ndc.z > 1 || ndc.z < -1) return; // behind the camera
    const dx = (ndc.x - mouse.x) * camera.aspect;
    const dy = ndc.y - mouse.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best.copy(p);
      bestVel.set(vx, vy, vz);
      found = true;
    }
  };

  const e = s.enemies;
  for (let o = 0; o < e.length; o += ENEMY_STRIDE) {
    consider(e[o] ?? 0, e[o + 1] ?? 0, e[o + 2] ?? 0, e[o + 3] ?? 0, e[o + 4] ?? 0, e[o + 5] ?? 0);
  }
  if (s.boss && s.phase === 'boss') {
    for (let n = 0; n < BOSS_NODES.length; n++) {
      const node = BOSS_NODES[n];
      if (!node || (s.boss.nodes[n] ?? 0) <= 0) continue;
      // The Warden holds station ahead of the ship: it moves at ship velocity.
      consider(s.boss.x + node.x, s.boss.y + node.y, s.boss.z + node.z, 0, 0, shipVz);
    }
  }
  if (!found) return { locked: false };

  // Bolts inherit ship velocity, so lead on the target's velocity relative to the ship.
  const speed = seat === 'pilot' ? PILOT_BULLET_SPEED : TURRET_BULLET_SPEED;
  let t = best.distanceTo(origin) / speed;
  for (let k = 0; k < 2; k++) {
    p.set(
      best.x + (bestVel.x - ship.vx) * t,
      best.y + (bestVel.y - ship.vy) * t,
      best.z + (bestVel.z - shipVz) * t,
    );
    t = p.distanceTo(origin) / speed;
  }
  out.aimX = p.x;
  out.aimY = p.y;
  out.aimZ = p.z;
  return { locked: true };
}
