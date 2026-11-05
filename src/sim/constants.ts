/** Simulation tuning. All distances in metres, times in seconds. Forward = -Z. */
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

export const CORRIDOR_X = 22;
export const CORRIDOR_Y = 12;
export const STEER_ACCEL = 95;
export const STEER_DAMP = 5;
export const STEER_MAX = 26;

export const SPEED_BASE = 45;
export const SPEED_BOOST = 82;
export const SPEED_BRAKE = 24;
export const BOOST_DRAIN = 38;
export const BOOST_REGEN = 16;

export const ZONE_LENGTH = 2200;
export const ZONE_COUNT = 3;

/** VESPER collision radius (the visual hull is ~20 m long; gameplay uses a forgiving sphere). */
export const SHIP_RADIUS = 3.2;
export const HULL_MAX = 100;
export const SHIELD_MAX = 60;
export const SHIELD_DELAY = 4;
export const SHIELD_REGEN = 8;

export const PILOT_FIRE_INTERVAL = 1 / 8;
export const PILOT_BULLET_SPEED = 300;
export const PILOT_DAMAGE = 1;
/** Forward cannons sit under the cockpit, either side of the nose. */
export const PILOT_MUZZLE = { x: 1.6, y: -0.6, z: -6 } as const;

export const TURRET_FIRE_INTERVAL = 1 / 11;
export const TURRET_BULLET_SPEED = 260;
export const TURRET_DAMAGE = 0.8;
export const TURRET_HEAT_PER_SHOT = 0.05;
export const TURRET_COOL = 0.45;
export const TURRET_RESUME = 0.35;
/** Turret pivots relative to the ship centre (top and bottom of the middle bridge). */
export const TURRET_OFFSETS = {
  dorsal: { x: 0, y: 2.4, z: 1.5 },
  ventral: { x: 0, y: -2.4, z: 1.5 },
} as const;

export const MISSILE_SPEED = 170;
export const MISSILE_DAMAGE = 3;
export const MISSILE_TURN = 7;

export const BULLET_LIFE = 1.4;
export const ENEMY_BOLT_SPEED = 75;
export const ENEMY_BOLT_LIFE = 5;
export const ENEMY_BOLT_RADIUS = 0.8;
export const ENEMY_BOLT_DAMAGE = 10;
export const RAM_DAMAGE = 22;

export const MAX_PLAYER_BULLETS = 320;
export const MAX_ENEMY_BOLTS = 320;
export const MAX_ENEMIES = 40;
export const MAX_PODS = 16;

/** Hollow Fleet. Needle = swarming interceptor; Moth = heavy fighter that hunts from behind. */
export const ENEMY_STATS = {
  needle: { hp: 4, radius: 3.4, speed: 95, turn: 2.2 },
  moth: { hp: 9, radius: 4.6, speed: 48, turn: 1.4 },
} as const;
export const ENEMY_DESPAWN = 850;

export const POD_LIFE = 14;
export const POD_RADIUS = 2.4;
export const POD_COLLECT_RADIUS = 7;
export const BUFF = { overcharge: 8, coolant: 10, pulse: 4, missiles: 6, patch: 25 } as const;
/** Time scale for the enemy side during a Lodestone Pulse. */
export const PULSE_SCALE = 0.35;

/** The Ossuary: destination guardian. Held ahead of the ship; four amber hearts are the weak points. */
export const BOSS_DISTANCE_AHEAD = 260;
export const BOSS_BODY_RADIUS = 22;
export const BOSS_NODE_RADIUS = 5;
export const BOSS_NODE_HP = 30;
export const BOSS_NODES = [
  { x: -26, y: 14, z: 12 },
  { x: 26, y: 14, z: 12 },
  { x: -18, y: -22, z: 16 },
  { x: 18, y: -22, z: 16 },
] as const;

export const JUMP_DURATION = 3.2;

export const SCORE = { needle: 100, moth: 220, node: 500, boss: 2500, pod: 50 } as const;
