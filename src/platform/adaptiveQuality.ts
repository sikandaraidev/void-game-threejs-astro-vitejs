/**
 * One-way adaptive quality (Threejs-Punk pattern, Blueprint v2 §2.4).
 * Measures frame time in 1 s windows after a warm-up. If frames are too slow it first lowers
 * the pixel ratio in steps down to a floor, then drops bloom. It never raises quality again
 * mid-session, which avoids visible oscillation.
 */
export type QualityChange = 'dpr' | 'bloom' | null;

export interface AdaptiveOptions {
  dpr: number;
  floor: number;
  /** Frame time budget in ms; above this we degrade. 22 ms ≈ 45 fps. */
  targetMs: number;
  warmupSeconds: number;
  step: number;
}

export interface AdaptiveQuality {
  readonly dpr: number;
  readonly bloom: boolean;
  /** Feed the real (unclamped) frame delta in seconds. */
  sample(dt: number): QualityChange;
}

export function createAdaptiveQuality(o: AdaptiveOptions, bloom: boolean): AdaptiveQuality {
  let dpr = o.dpr;
  let bloomOn = bloom;
  let elapsed = 0;
  let windowMs = 0;
  let frames = 0;
  let cooldown = 0;

  return {
    get dpr() {
      return dpr;
    },
    get bloom() {
      return bloomOn;
    },
    sample(dt) {
      elapsed += dt;
      if (elapsed < o.warmupSeconds) return null;
      // Ignore hitches longer than 250 ms (tab switches, GC): they are not steady load.
      if (dt > 0.25) return null;
      windowMs += dt * 1000;
      frames++;
      if (windowMs < 1000) return null;
      const avg = windowMs / frames;
      windowMs = 0;
      frames = 0;
      if (cooldown > 0) {
        cooldown--;
        return null;
      }
      if (avg <= o.targetMs) return null;
      cooldown = 1;
      if (dpr > o.floor + 1e-3) {
        dpr = Math.max(o.floor, dpr - o.step);
        return 'dpr';
      }
      if (bloomOn) {
        bloomOn = false;
        return 'bloom';
      }
      return null;
    },
  };
}
