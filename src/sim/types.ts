export type Seat = 'pilot' | 'gunner';
export const SEATS: readonly Seat[] = ['pilot', 'gunner'];

export type Phase = 'run' | 'boss' | 'jump' | 'won' | 'lost';

export const EnemyKind = { Shard: 0, Chaser: 1 } as const;
export type EnemyKind = (typeof EnemyKind)[keyof typeof EnemyKind];

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
  | 'enemyFire'
  | 'hit'
  | 'kill'
  | 'shieldHit'
  | 'hullHit'
  | 'nodeDown'
  | 'phase'
  | 'overheat';

export interface SimEvent {
  type: SimEventType;
  x: number;
  y: number;
  z: number;
  /** Event-specific: enemy kind for kills, new phase index for 'phase'. */
  value: number;
}

export const PHASES: readonly Phase[] = ['run', 'boss', 'jump', 'won', 'lost'];

/** Stride of packed arrays in a snapshot. */
export const ENEMY_STRIDE = 8; // x y z vx vy vz kind hpFrac
export const BULLET_STRIDE = 6; // x y z vx vy vz

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
  heat: number;
  overheated: boolean;
  score: number;
  kills: number;
  humans: Record<Seat, boolean>;
  enemies: Float32Array;
  playerBullets: Float32Array;
  enemyBolts: Float32Array;
  boss: { x: number; y: number; z: number; nodes: number[] } | null;
  events: SimEvent[];
}

export type ToSim =
  | { type: 'input'; seat: Seat; input: SeatInput }
  | { type: 'control'; seat: Seat; human: boolean }
  | { type: 'reset'; seed: number }
  | { type: 'pause'; paused: boolean };

export type FromSim = { type: 'snapshot'; snapshot: Snapshot };
