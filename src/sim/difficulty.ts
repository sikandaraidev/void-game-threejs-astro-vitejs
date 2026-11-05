/**
 * Difficulty. Presets for most players (Hick's law), plus Custom for those who want control.
 * Everything here is a multiplier the sim and client read; nothing is hard-coded per level.
 */
export interface DifficultySettings {
  /** Damage you take from enemies. */
  enemyDamage: number;
  /** How many enemies are on screen at once. */
  enemyCount: number;
  /** Enemy accuracy (higher = tighter shots). */
  enemyAccuracy: number;
  /** Aim-assist radius on screen (0 = off). Client-side. */
  aimAssist: number;
  /** Chance a destroyed enemy drops a power-up pod. */
  dropRate: number;
}

export type DifficultyName = 'story' | 'standard' | 'veteran' | 'custom';

export const DIFFICULTY_PRESETS: Record<Exclude<DifficultyName, 'custom'>, DifficultySettings> = {
  story: { enemyDamage: 0.5, enemyCount: 0.7, enemyAccuracy: 0.6, aimAssist: 0.18, dropRate: 0.2 },
  standard: { enemyDamage: 1, enemyCount: 1, enemyAccuracy: 1, aimAssist: 0.12, dropRate: 0.13 },
  veteran: { enemyDamage: 1.4, enemyCount: 1.35, enemyAccuracy: 1.4, aimAssist: 0.05, dropRate: 0.08 },
};

export const DIFFICULTY_LABELS: Record<DifficultyName, string> = {
  story: 'Story',
  standard: 'Standard',
  veteran: 'Veteran',
  custom: 'Custom',
};

/** Slider ranges for Custom. */
export const DIFFICULTY_RANGES: Record<
  keyof DifficultySettings,
  { min: number; max: number; step: number; label: string }
> = {
  enemyDamage: { min: 0.25, max: 2, step: 0.05, label: 'Damage taken' },
  enemyCount: { min: 0.5, max: 2, step: 0.05, label: 'Enemy numbers' },
  enemyAccuracy: { min: 0.4, max: 2, step: 0.05, label: 'Enemy accuracy' },
  aimAssist: { min: 0, max: 0.25, step: 0.01, label: 'Aim assist' },
  dropRate: { min: 0, max: 0.4, step: 0.01, label: 'Power-up drops' },
};

export function clampSettings(s: DifficultySettings): DifficultySettings {
  const out = { ...s };
  for (const key of Object.keys(DIFFICULTY_RANGES) as (keyof DifficultySettings)[]) {
    const r = DIFFICULTY_RANGES[key];
    const v = Number(out[key]);
    out[key] = Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : DIFFICULTY_PRESETS.standard[key];
  }
  return out;
}
