import { Euler, MathUtils, Quaternion, Vector3, type PerspectiveCamera } from 'three/webgpu';
import { TURRET_OFFSETS } from '../sim/constants';
import type { Seat } from '../sim/types';

/**
 * First-person camera rig.
 * - Pilot: sits in the cockpit at the front of the port hull, looks down the flight path; the
 *   view banks with the ship and glances slightly toward the mouse (head look).
 * - Dorsal / ventral gunner: sits in the turret; the mouse turns the turret freely in yaw,
 *   pitch limited by the hull (dorsal can't aim through the ship, nor ventral up through it).
 * - External chase view (C): for spectacle and orientation.
 * Shake uses the "trauma" model (shake = trauma²); disabled for reduced motion.
 */
export type ViewMode = 'first' | 'chase';

export const COCKPIT_EYE = { x: -2.7, y: 1.05, z: -5.4 } as const;

const PITCH_LIMITS: Record<Exclude<Seat, 'pilot'>, [number, number]> = {
  dorsal: [-0.12, 1.45],
  ventral: [-1.45, 0.12],
};

export interface CameraRig {
  /** Accumulate turret look (radians). */
  look(dYaw: number, dPitch: number): void;
  update(
    seat: Seat,
    mode: ViewMode,
    ship: Vector3,
    vel: Vector3,
    mouseX: number,
    mouseY: number,
    speed: number,
    dt: number,
    jumping: boolean,
  ): void;
  addTrauma(amount: number): void;
  snap(): void;
}

export function createCameraRig(camera: PerspectiveCamera, reducedMotion: boolean): CameraRig {
  const pos = new Vector3();
  const desired = new Vector3();
  const target = new Vector3();
  const euler = new Euler(0, 0, 0, 'YXZ');
  const quat = new Quaternion();
  const turret = { dorsal: { yaw: Math.PI, pitch: 0.25 }, ventral: { yaw: Math.PI, pitch: -0.25 } };
  let trauma = 0;
  let snapNext = true;
  let t = 0;
  let lastSeat: Seat = 'pilot';

  return {
    look(dYaw, dPitch) {
      if (lastSeat === 'pilot') return;
      const tr = turret[lastSeat];
      const [lo, hi] = PITCH_LIMITS[lastSeat];
      tr.yaw -= dYaw;
      tr.pitch = Math.max(lo, Math.min(hi, tr.pitch - dPitch));
    },
    addTrauma(amount) {
      if (!reducedMotion) trauma = Math.min(1, trauma + amount);
    },
    snap() {
      snapNext = true;
    },
    update(seat, mode, ship, vel, mouseX, mouseY, speed, dt, jumping) {
      t += dt;
      lastSeat = seat;
      let baseFov: number;

      if (mode === 'chase') {
        const k = snapNext ? 1 : 1 - Math.exp(-dt * 6);
        desired.set(ship.x - vel.x * 0.15, ship.y + 6 - vel.y * 0.1, ship.z + 30);
        pos.lerp(desired, k);
        camera.position.copy(pos);
        camera.up.set(0, 1, 0);
        target.set(ship.x + mouseX * 8, ship.y + 2 + mouseY * 4, ship.z - 50);
        camera.lookAt(target);
        camera.rotateZ(-vel.x * 0.004);
        baseFov = 60;
      } else if (seat === 'pilot') {
        camera.position.set(ship.x + COCKPIT_EYE.x, ship.y + COCKPIT_EYE.y, ship.z + COCKPIT_EYE.z);
        // Head look toward the reticle, plus ship bank (roll) and pitch from steering.
        euler.set(mouseY * 0.1 + vel.y * 0.012, -mouseX * 0.14, -vel.x * 0.022);
        quat.setFromEuler(euler);
        camera.quaternion.copy(quat);
        pos.copy(camera.position);
        baseFov = 68;
      } else {
        const off = TURRET_OFFSETS[seat];
        camera.position.set(
          ship.x + off.x,
          ship.y + off.y + (seat === 'dorsal' ? 0.5 : -0.5),
          ship.z + off.z,
        );
        const tr = turret[seat];
        euler.set(tr.pitch, tr.yaw, -vel.x * 0.01);
        quat.setFromEuler(euler);
        camera.quaternion.copy(quat);
        pos.copy(camera.position);
        baseFov = 74;
      }
      snapNext = false;

      // FOV sells speed; the jump punches it wide.
      const fov = jumping ? 115 : baseFov + Math.max(0, speed - 45) * 0.2;
      camera.fov = MathUtils.lerp(camera.fov, fov, 1 - Math.exp(-dt * (jumping ? 1.5 : 4)));
      camera.updateProjectionMatrix();

      if (trauma > 0) {
        const s = trauma * trauma;
        camera.position.x += Math.sin(t * 61) * 0.12 * s;
        camera.position.y += Math.sin(t * 47 + 1.3) * 0.1 * s;
        camera.rotateZ(Math.sin(t * 37 + 2.1) * 0.03 * s);
        camera.rotateX(Math.sin(t * 29 + 0.7) * 0.012 * s);
        trauma = Math.max(0, trauma - dt * 1.6);
      }
    },
  };
}
