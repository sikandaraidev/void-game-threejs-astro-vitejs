// Headless balance report: bot crews play full runs at each difficulty.
// Run: npx vite-node scripts/balance.ts
import { DIFFICULTY_PRESETS } from '../src/sim/difficulty';
import { createWorld, stepWorld } from '../src/sim/world';

const SEEDS = 8;
for (const name of ['story', 'standard', 'veteran'] as const) {
  let won = 0;
  let hull = 0;
  let mins = 0;
  let peak = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const w = createWorld(seed, {}, DIFFICULTY_PRESETS[name]);
    let t = 0;
    while (t < 60 * 60 * 7 && w.phase !== 'won' && w.phase !== 'lost') {
      stepWorld(w);
      t++;
      let alive = 0;
      for (let i = 0; i < w.enemies.size; i++) alive += w.enemies.active[i] ?? 0;
      peak = Math.max(peak, alive);
    }
    if (w.phase === 'won') {
      won++;
      hull += w.hull;
      mins += t / 3600;
    }
  }
  const avg = (v: number): string => (v / Math.max(1, won)).toFixed(won ? 2 : 0);
  console.info(
    `${name}: won ${won}/${SEEDS} · avg hull ${avg(hull)} · avg run ${avg(mins)} min · peak enemies ${peak}`,
  );
}
