import type { DifficultySettings } from './difficulty';

/** Three crew positions. Any seat without a human is crewed by a bot. */
export type Seat = 'pilot' | 'dorsal' | 'ventral';
export type TurretSeat = Exclude<Seat, 'pilot'>;
export const SEATS: readonly Seat[] = ['pilot', 'dorsal', 'ventral'];
export const TURRET_SEATS: readonly TurretSeat[] = ['dorsal', 'ventral'];

export type Phase = 'run' | 'boss' | 'jump' | 'won' | 'lost';
export const PHASES: readonly Phase[] = ['run', 'boss', 'jump', 'won', 'lost'];

export const EnemyKind = { Needle: 0, Moth: 1 } as const;
export type EnemyKind = (typeof EnemyKind)[keyof typeof EnemyKind];

export const PodKind = { Shield: 0, Patch: 1, Overcharge: 2, Coolant: 3, Missiles: 4, Pulse: 5 } as const;
export type PodKind = (typeof PodKind)[keyof typeof PodKind];
export const POD_NAMES = [
  'Shield Cell',
  'Patch Kit',
  'Overcharge',
  'Coolant',
  'Swarm Missiles',
  'Lodestone Pulse',
] as const;

/** One seat's input for one tick. Aim is a world-space point the weapon should hit. */
export interface SeatInput {
  steerX: number;
  steerY: number;
  boost: boolean;
  brake: boolean;
  fire: boolean;
  aimX: number;
  aimY: number;
  aimZ: number;
}

export function emptyInput(): SeatInput {
  return { steerX: 0, steerY: 0, boost: false, brake: false, fire: false, aimX: 0, aimY: 0, aimZ: -1000 };
}

export type SimEventType =
  | 'pilotFire'
  | 'turretFire'
  | 'missileFire'
  | 'enemyFire'
  | 'hit'
  | 'kill'
  | 'shieldHit'
  | 'hullHit'
  | 'nodeDown'
  | 'phase'
  | 'overheat'
  | 'pickup'
  | 'wingsOpen';

export interface SimEvent {
  type: SimEventType;
  x: number;
  y: number;
  z: number;
  /**
   * Event-specific: enemy kind (kill), phase index (phase), pod kind (pickup),
   * seat index in SEATS (turretFire / overheat), 2 = boss (kill).
   */
  value: number;
}

/** Strides of packed arrays in a snapshot. */
export const ENEMY_STRIDE = 9; // x y z vx vy vz kind hpFrac aux(wing openness)
export const BULLET_STRIDE = 7; // x y z vx vy vz isMissile
export const POD_STRIDE = 4; // x y z kind

export interface TurretState {
  heat: number;
  overheated: boolean;
}

export interface Snapshot {
  tick: number;
  time: number;
  phase: Phase;
  /** 0..1 across the whole run (zones + boss). */
  progress: number;
  zone: number;
  ship: { x: number; y: number; z: number; vx: number; vy: number; vz: number };
  hull: number;
  shield: number;
  boost: number;
  turrets: Record<TurretSeat, TurretState>;
  buffs: { overcharge: number; coolant: number; pulse: number; missiles: number };
  score: number;
  kills: number;
  humans: Record<Seat, boolean>;
  enemies: Float32Array;
  playerBullets: Float32Array;
  enemyBolts: Float32Array;
  pods: Float32Array;
  boss: { x: number; y: number; z: number; nodes: number[] } | null;
  events: SimEvent[];
}

export type ToSim =
  | { type: 'input'; seat: Seat; input: SeatInput }
  | { type: 'control'; seat: Seat; human: boolean }
  | { type: 'reset'; seed: number; difficulty: DifficultySettings }
  | { type: 'pause'; paused: boolean };

export type FromSim = { type: 'snapshot'; snapshot: Snapshot };
