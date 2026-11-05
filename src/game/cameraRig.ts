import { Euler, MathUtils, Quaternion, Vector3, type PerspectiveCamera } from 'three/webgpu';
import { TURRET_OFFSET } from '../sim/constants';
import type { Seat } from '../sim/types';

/**
 * Pilot: a chase cam behind the ship, looking down the flight path.
 * Gunner: sits on the dorsal turret looking BACK, so the gunner sees what the pilot can't.
 * Shake uses the "trauma" model (shake = trauma²), and is disabled for reduced motion.
 */
export interface CameraRig {
  update(
    seat: Seat,
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
  const desiredQuat = new Quaternion();
  let trauma = 0;
  let snapNext = true;
  let t = 0;

  return {
    addTrauma(amount) {
      if (!reducedMotion) trauma = Math.min(1, trauma + amount);
    },
    snap() {
      snapNext = true;
    },
    update(seat, ship, vel, mouseX, mouseY, speed, dt, jumping) {
      t += dt;
      const k = snapNext ? 1 : 1 - Math.exp(-dt * 9);

      if (seat === 'pilot') {
        desired.set(ship.x - vel.x * 0.12, ship.y + 3.3 - vel.y * 0.08, ship.z + 12.5);
        target.set(ship.x + mouseX * 6, ship.y + 1.4 + mouseY * 3, ship.z - 40);
        pos.lerp(desired, k);
        camera.position.copy(pos);
        camera.up.set(0, 1, 0);
        camera.lookAt(target);
        // Gentle roll into turns.
        camera.rotateZ(-vel.x * 0.006);
      } else {
        desired.set(ship.x + TURRET_OFFSET.x, ship.y + TURRET_OFFSET.y + 0.9, ship.z + TURRET_OFFSET.z + 0.4);
        camera.position.copy(desired);
        pos.copy(desired);
        euler.set(mouseY * 0.55, Math.PI - mouseX * 1.05, 0);
        desiredQuat.setFromEuler(euler);
        if (snapNext) quat.copy(desiredQuat);
        else quat.slerp(desiredQuat, 1 - Math.exp(-dt * 12));
        camera.quaternion.copy(quat);
      }
      snapNext = false;

      // FOV sells speed; the jump punches it wide.
      const baseFov = seat === 'pilot' ? 62 : 72;
      const fov = jumping ? 112 : baseFov + Math.max(0, speed - 45) * 0.22;
      camera.fov = MathUtils.lerp(camera.fov, fov, 1 - Math.exp(-dt * (jumping ? 1.5 : 4)));
      camera.updateProjectionMatrix();

      if (trauma > 0) {
        const s = trauma * trauma;
        camera.position.x += Math.sin(t * 61) * 0.35 * s;
        camera.position.y += Math.sin(t * 47 + 1.3) * 0.3 * s;
        camera.rotateZ(Math.sin(t * 37 + 2.1) * 0.03 * s);
        trauma = Math.max(0, trauma - dt * 1.6);
      }
    },
  };
}
