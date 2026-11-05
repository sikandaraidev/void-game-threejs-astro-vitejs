import { describe, expect, it } from 'vitest';
import { ZONE_COUNT, ZONE_LENGTH } from '../src/sim/constants';
import { DIFFICULTY_PRESETS, clampSettings, type DifficultySettings } from '../src/sim/difficulty';
import { BULLET_STRIDE, ENEMY_STRIDE, POD_STRIDE } from '../src/sim/types';
import { createWorld, segmentPointDistSq, snapshotOf, stepWorld, type World } from '../src/sim/world';

interface RunResult {
  world: World;
  sawBoss: boolean;
  ticks: number;
  pickups: number;
  maxEnemies: number;
}

function runBots(
  seed: number,
  difficulty: DifficultySettings = DIFFICULTY_PRESETS.standard,
  maxTicks = 60 * 60 * 7,
): RunResult {
  const world = createWorld(seed, {}, difficulty);
  let sawBoss = false;
  let ticks = 0;
  let pickups = 0;
  let maxEnemies = 0;
  while (ticks < maxTicks && world.phase !== 'won' && world.phase !== 'lost') {
    stepWorld(world);
    if (world.phase === 'boss') sawBoss = true;
    for (const e of world.events) if (e.type === 'pickup') pickups++;
    let alive = 0;
    for (let i = 0; i < world.enemies.size; i++) alive += world.enemies.active[i] ?? 0;
    maxEnemies = Math.max(maxEnemies, alive);
    ticks++;
  }
  return { world, sawBoss, ticks, pickups, maxEnemies };
}

describe('segmentPointDistSq', () => {
  it('catches a fast bullet passing through a target between ticks', () => {
    expect(segmentPointDistSq(0, 0, 5, 0, 0, -5, 0, 0, 0)).toBe(0);
  });
  it('measures to the nearest endpoint outside the segment', () => {
    expect(segmentPointDistSq(0, 0, 0, 0, 0, 1, 0, 0, 3)).toBe(4);
  });
});

describe('a full bot-crewed run (standard)', () => {
  const runs = [1, 2, 3, 4, 5, 6].map((seed) => ({ seed, ...runBots(seed) }));

  it('always ends (won or lost) within the time cap', () => {
    for (const r of runs) expect(['won', 'lost']).toContain(r.world.phase);
  });

  it('is winnable: bots reach the Ossuary and at least one crew completes the jump', () => {
    expect(runs.some((r) => r.sawBoss)).toBe(true);
    expect(runs.some((r) => r.world.phase === 'won')).toBe(true);
  });

  it('a won run covers all zones in the 2â€“7 minute window', () => {
    const won = runs.find((r) => r.world.phase === 'won');
    if (!won) throw new Error('no won run');
    expect(-won.world.ship.z).toBeGreaterThan(ZONE_LENGTH * ZONE_COUNT);
    const minutes = won.ticks / 3600;
    expect(minutes).toBeGreaterThan(2);
    expect(minutes).toBeLessThan(7);
  });

  it('is overwhelming but fair: many enemies at once, real damage taken', () => {
    expect(Math.max(...runs.map((r) => r.maxEnemies))).toBeGreaterThanOrEqual(12);
    for (const r of runs) expect(r.world.kills).toBeGreaterThan(20);
    expect(runs.some((r) => r.world.hull < 100 || r.world.phase === 'lost')).toBe(true);
  });

  it('power-up pods drop and get collected', () => {
    expect(runs.reduce((n, r) => n + r.pickups, 0)).toBeGreaterThan(5);
  });

  it('is deterministic for a seed (required for replays and netcode)', () => {
    const again = runBots(3);
    const first = runs.find((r) => r.seed === 3);
    expect(again.world.score).toBe(first?.world.score);
    expect(again.ticks).toBe(first?.ticks);
  });

  it('logs the balance summary', () => {
    for (const r of runs) {
      console.info(
        `seed ${r.seed}: ${r.world.phase} ${(r.ticks / 3600).toFixed(2)}min kills ${r.world.kills} maxEnemies ${r.maxEnemies} pickups ${r.pickups} hull ${r.world.hull.toFixed(0)}`,
      );
    }
  });
});

describe('difficulty', () => {
  it('story is easier than veteran (more hull left on average)', () => {
    const avgHull = (d: DifficultySettings): number => {
      const rs = [11, 12, 13].map((s) => runBots(s, d));
      return rs.reduce((n, r) => n + r.world.hull, 0) / rs.length;
    };
    expect(avgHull(DIFFICULTY_PRESETS.story)).toBeGreaterThan(avgHull(DIFFICULTY_PRESETS.veteran));
  }, 60_000);

  it('clamps custom values into range and repairs bad input', () => {
    const c = clampSettings({
      enemyDamage: 99,
      enemyCount: -1,
      enemyAccuracy: Number.NaN,
      aimAssist: 0.1,
      dropRate: 0.2,
    });
    expect(c.enemyDamage).toBe(2);
    expect(c.enemyCount).toBe(0.5);
    expect(c.enemyAccuracy).toBe(DIFFICULTY_PRESETS.standard.enemyAccuracy);
  });
});

describe('seats', () => {
  it('a human seat with no input does nothing while bots crew the others', () => {
    const w = createWorld(4, { dorsal: true });
    for (let i = 0; i < 60 * 20; i++) stepWorld(w);
    expect(w.turrets.dorsal.heat).toBe(0); // idle human gunner never fired
    expect(w.kills).toBeGreaterThan(0); // the bot pilot and ventral bot still fight
  });
});

describe('snapshots', () => {
  it('pack only active entities with the right strides', () => {
    const w = createWorld(9, {});
    for (let i = 0; i < 60 * 30; i++) stepWorld(w);
    const s = snapshotOf(w);
    expect(s.enemies.length % ENEMY_STRIDE).toBe(0);
    expect(s.playerBullets.length % BULLET_STRIDE).toBe(0);
    expect(s.pods.length % POD_STRIDE).toBe(0);
    expect(s.progress).toBeGreaterThan(0);
    expect(s.progress).toBeLessThanOrEqual(1);
  });
});
