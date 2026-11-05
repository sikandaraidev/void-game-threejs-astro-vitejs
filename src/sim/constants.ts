/** Simulation tuning. All distances in metres, times in seconds. Forward = -Z. */
export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

export const CORRIDOR_X = 16;
export const CORRIDOR_Y = 9;
export const STEER_ACCEL = 95;
export const STEER_DAMP = 6;
export const STEER_MAX = 26;

export const SPEED_BASE = 45;
export const SPEED_BOOST = 82;
export const SPEED_BRAKE = 24;
export const BOOST_DRAIN = 38;
export const BOOST_REGEN = 16;

export const ZONE_LENGTH = 2200;
export const ZONE_COUNT = 3;

export const SHIP_RADIUS = 1.7;
export const HULL_MAX = 100;
export const SHIELD_MAX = 50;
export const SHIELD_DELAY = 4;
export const SHIELD_REGEN = 8;

export const PILOT_FIRE_INTERVAL = 1 / 8;
export const PILOT_BULLET_SPEED = 280;
export const PILOT_DAMAGE = 1;

export const TURRET_FIRE_INTERVAL = 1 / 12;
export const TURRET_BULLET_SPEED = 250;
export const TURRET_DAMAGE = 0.7;
export const TURRET_HEAT_PER_SHOT = 0.055;
export const TURRET_COOL = 0.45;
export const TURRET_RESUME = 0.35;
/** Turret mount relative to the ship centre. */
export const TURRET_OFFSET = { x: 0, y: 0.9, z: 0.6 } as const;

export const BULLET_LIFE = 1.3;
export const ENEMY_BOLT_SPEED = 70;
export const ENEMY_BOLT_LIFE = 5;
export const ENEMY_BOLT_RADIUS = 0.7;
export const ENEMY_BOLT_DAMAGE = 14;
export const RAM_DAMAGE = 22;

export const MAX_PLAYER_BULLETS = 256;
export const MAX_ENEMY_BOLTS = 256;
export const MAX_ENEMIES = 48;

export const BOSS_DISTANCE_AHEAD = 150;
export const BOSS_BODY_RADIUS = 13;
export const BOSS_NODE_RADIUS = 3;
export const BOSS_NODE_HP = 26;
/** Weak-point offsets on the guardian (Von Restorff: the only amber pulsing things). */
export const BOSS_NODES = [
  { x: -12, y: 4, z: 6 },
  { x: 12, y: 4, z: 6 },
  { x: -7, y: -9, z: 8 },
  { x: 7, y: -9, z: 8 },
] as const;

export const JUMP_DURATION = 3.2;

export const SCORE = { shard: 100, chaser: 150, node: 500, boss: 2500 } as const;
