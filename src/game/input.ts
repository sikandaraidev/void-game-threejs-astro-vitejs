import { Raycaster, Vector2, Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { Seat, SeatInput } from '../sim/types';

/**
 * Keyboard + mouse (Jakob's law: genre-standard). Gamepad joins in a later phase.
 * Pilot: WASD / arrows steer, Shift boost, X brake, mouse aims a reticle, click or Space fires.
 * Gunner: the mouse TURNS the turret (pointer lock when available), click or Space fires.
 * 1 / 2 / 3 take a seat; Tab cycles seats; C toggles the outside camera.
 */
export interface Input {
  /** Normalised mouse position, -1..1 (y up). Used for the pilot reticle. */
  readonly mouse: Vector2;
  /** Mouse movement since the last frame, in pixels (turret look). */
  consumeLook(): { dx: number; dy: number };
  build(seat: Seat, camera: PerspectiveCamera, out: SeatInput): SeatInput;
  /** True once per key press. */
  pressed(code: string): boolean;
  /** Drop unconsumed presses so they don't fire later. */
  endFrame(): void;
  requestLock(): void;
  releaseLock(): void;
  readonly locked: boolean;
  dispose(): void;
}

const AIM_DISTANCE: Record<Seat, number> = { pilot: 240, dorsal: 180, ventral: 180 };
const CENTER = new Vector2(0, 0);

export function createInput(surface: HTMLElement): Input {
  const down = new Set<string>();
  const edges = new Set<string>();
  const mouse = new Vector2();
  let mouseDown = false;
  let lookX = 0;
  let lookY = 0;
  const ray = new Raycaster();
  const point = new Vector3();

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    if (!e.repeat) edges.add(e.code);
    down.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    down.delete(e.code);
  };
  const onMove = (e: PointerEvent): void => {
    mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    lookX += e.movementX;
    lookY += e.movementY;
  };
  const onPointerDown = (e: PointerEvent): void => {
    if (e.button === 0) mouseDown = true;
  };
  const onPointerUp = (e: PointerEvent): void => {
    if (e.button === 0) mouseDown = false;
  };
  const onBlur = (): void => {
    down.clear();
    mouseDown = false;
  };
  const onContext = (e: Event): void => e.preventDefault();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('pointermove', onMove);
  surface.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('blur', onBlur);
  surface.addEventListener('contextmenu', onContext);

  const axis = (neg: string[], pos: string[]): number =>
    (pos.some((c) => down.has(c)) ? 1 : 0) - (neg.some((c) => down.has(c)) ? 1 : 0);

  return {
    mouse,
    get locked() {
      return document.pointerLockElement === surface;
    },
    consumeLook() {
      const out = { dx: lookX, dy: lookY };
      lookX = 0;
      lookY = 0;
      return out;
    },
    requestLock() {
      if (document.pointerLockElement === surface) return;
      try {
        const p = surface.requestPointerLock() as unknown;
        if (p instanceof Promise) p.catch(() => undefined);
      } catch {
        // Not allowed right now (needs a user gesture); clicking the view will lock it.
      }
    },
    releaseLock() {
      if (document.pointerLockElement === surface) document.exitPointerLock();
    },
    build(seat, camera, out) {
      out.fire = mouseDown || down.has('Space');
      // Pilot aims through the mouse reticle; gunners aim straight down the turret's view.
      ray.setFromCamera(seat === 'pilot' ? mouse : CENTER, camera);
      ray.ray.at(AIM_DISTANCE[seat], point);
      out.aimX = point.x;
      out.aimY = point.y;
      out.aimZ = point.z;
      if (seat === 'pilot') {
        out.steerX = axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
        out.steerY = axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
        out.boost = down.has('ShiftLeft') || down.has('ShiftRight');
        out.brake = down.has('KeyX');
      } else {
        out.steerX = 0;
        out.steerY = 0;
        out.boost = false;
        out.brake = false;
      }
      return out;
    },
    pressed(code) {
      const hit = edges.has(code);
      edges.delete(code);
      return hit;
    },
    endFrame() {
      edges.clear();
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointermove', onMove);
      surface.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('blur', onBlur);
      surface.removeEventListener('contextmenu', onContext);
    },
  };
}
