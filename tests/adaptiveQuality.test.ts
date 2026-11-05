import { describe, expect, it } from 'vitest';
import { createAdaptiveQuality } from '../src/platform/adaptiveQuality';

const opts = { dpr: 1.25, floor: 0.65, targetMs: 22, warmupSeconds: 2, step: 0.15 };

function run(q: ReturnType<typeof createAdaptiveQuality>, frameMs: number, seconds: number) {
  const changes: string[] = [];
  const n = Math.round((seconds * 1000) / frameMs);
  for (let i = 0; i < n; i++) {
    const c = q.sample(frameMs / 1000);
    if (c) changes.push(c);
  }
  return changes;
}

describe('adaptiveQuality', () => {
  it('leaves fast machines alone', () => {
    const q = createAdaptiveQuality(opts, true);
    expect(run(q, 16, 20)).toEqual([]);
    expect(q.dpr).toBe(1.25);
    expect(q.bloom).toBe(true);
  });

  it('does nothing during warm-up (shader compile hitches)', () => {
    const q = createAdaptiveQuality(opts, true);
    expect(run(q, 60, 1.9)).toEqual([]);
  });

  it('steps resolution down to the floor, then drops bloom, on a slow GPU', () => {
    const q = createAdaptiveQuality(opts, true);
    const changes = run(q, 40, 30);
    expect(changes.filter((c) => c === 'dpr').length).toBe(4);
    expect(changes.at(-1)).toBe('bloom');
    expect(q.dpr).toBeCloseTo(0.65);
    expect(q.bloom).toBe(false);
  });

  it('ignores single long hitches', () => {
    const q = createAdaptiveQuality(opts, true);
    run(q, 16, 3);
    expect(q.sample(0.5)).toBeNull();
    expect(run(q, 16, 5)).toEqual([]);
  });
});
