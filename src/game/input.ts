import { Raycaster, Vector2, Vector3, type PerspectiveCamera } from 'three/webgpu';
import type { Seat, SeatInput } from '../sim/types';

/**
 * Keyboard + mouse (Jakob's law: genre-standard). Gamepad joins in a later phase.
 * Pilot: WASD / arrows steer, Shift boost, X brake, mouse aims, click or Space fires.
 * Gunner: mouse aims the turret, click or Space fires.
 */
export interface Input {
  /** Normalised mouse position, -1..1 (y up). */
  readonly mouse: Vector2;
  build(seat: Seat, camera: PerspectiveCamera, out: SeatInput): SeatInput;
  /** True once per key press (for Tab, Esc, H). */
  pressed(code: string): boolean;
  /** Drop unconsumed presses so they don't fire later. */
  endFrame(): void;
  dispose(): void;
}

const AIM_DISTANCE = { pilot: 230, gunner: 170 } as const;

export function createInput(surface: HTMLElement): Input {
  const down = new Set<string>();
  const edges = new Set<string>();
  const mouse = new Vector2();
  let mouseDown = false;
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
    build(seat, camera, out) {
      out.fire = mouseDown || down.has('Space');
      ray.setFromCamera(mouse, camera);
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
