import { describe, expect, it } from 'vitest';
import { ZONE_COUNT, ZONE_LENGTH } from '../src/sim/constants';
import { createWorld, segmentPointDistSq, snapshotOf, stepWorld, type World } from '../src/sim/world';

function runBots(seed: number, maxTicks = 60 * 60 * 6): { world: World; sawBoss: boolean; ticks: number } {
  const world = createWorld(seed, { pilot: false, gunner: false });
  let sawBoss = false;
  let ticks = 0;
  while (ticks < maxTicks && world.phase !== 'won' && world.phase !== 'lost') {
    stepWorld(world);
    if (world.phase === 'boss') sawBoss = true;
    ticks++;
  }
  return { world, sawBoss, ticks };
}

describe('segmentPointDistSq', () => {
  it('catches a fast bullet passing through a target between ticks', () => {
    // Bullet jumps from z=+5 to z=-5 past a target at the origin.
    expect(segmentPointDistSq(0, 0, 5, 0, 0, -5, 0, 0, 0)).toBe(0);
  });
  it('measures to the nearest endpoint outside the segment', () => {
    expect(segmentPointDistSq(0, 0, 0, 0, 0, 1, 0, 0, 3)).toBe(4);
  });
});

describe('a full bot-crewed run', () => {
  const seeds = [1, 2, 3, 4, 5];
  const runs = seeds.map((seed) => ({ seed, ...runBots(seed) }));

  it('always ends (won or lost) within the time cap', () => {
    for (const r of runs) expect(['won', 'lost']).toContain(r.world.phase);
  });

  it('is winnable: bots reach the Warden and at least one crew completes the jump', () => {
    expect(runs.some((r) => r.sawBoss)).toBe(true);
    expect(runs.some((r) => r.world.phase === 'won')).toBe(true);
  });

  it('a won run covers all zones and lands in the 2–6 minute prototype window', () => {
    const won = runs.find((r) => r.world.phase === 'won');
    expect(won).toBeDefined();
    if (!won) return;
    expect(-won.world.ship.z).toBeGreaterThan(ZONE_LENGTH * ZONE_COUNT);
    const minutes = won.ticks / 60 / 60;
    expect(minutes).toBeGreaterThan(2);
    expect(minutes).toBeLessThan(6);
  });

  it('there is real combat: kills and damage happen', () => {
    for (const r of runs) expect(r.world.kills).toBeGreaterThan(5);
    expect(runs.some((r) => r.world.hull < 100 || r.world.phase === 'lost')).toBe(true);
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
        `seed ${r.seed}: ${r.world.phase} at ${(r.ticks / 3600).toFixed(2)} min, score ${r.world.score}, kills ${r.world.kills}, hull ${r.world.hull.toFixed(0)}`,
      );
    }
  });
});

describe('snapshots', () => {
  it('pack only active entities with the right stride', () => {
    const w = createWorld(9, { pilot: false, gunner: false });
    for (let i = 0; i < 600; i++) stepWorld(w);
    const s = snapshotOf(w);
    expect(s.enemies.length % 8).toBe(0);
    expect(s.playerBullets.length % 6).toBe(0);
    expect(s.progress).toBeGreaterThan(0);
    expect(s.progress).toBeLessThanOrEqual(1);
  });
});
