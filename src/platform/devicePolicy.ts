/**
 * Device policy: turns what we know about the device into a quality decision.
 * Pure function so it is unit-tested; the browser probing lives in probeDevice().
 */

export type QualityPreset = 'low' | 'medium' | 'high';

export interface DeviceInfo {
  readonly backend: 'webgpu' | 'webgl2';
  readonly isMobile: boolean;
  readonly isSafari: boolean;
  /** navigator.deviceMemory in GB; undefined where the browser hides it. */
  readonly memoryGb: number | undefined;
  readonly cores: number;
  readonly devicePixelRatio: number;
  readonly prefersReducedMotion: boolean;
}

export interface DevicePolicy {
  readonly preset: QualityPreset;
  /** Upper bound for renderer pixel ratio. */
  readonly maxDpr: number;
  readonly bloom: boolean;
  readonly starCount: number;
  readonly cameraMotion: boolean;
  /** Face size of the baked sky cube texture. */
  readonly skySize: number;
}

export function choosePreset(info: DeviceInfo): QualityPreset {
  if (info.isMobile) return 'low';
  const lowMemory = info.memoryGb !== undefined && info.memoryGb < 4;
  if (lowMemory || info.cores <= 4) return info.backend === 'webgpu' ? 'medium' : 'low';
  return info.backend === 'webgpu' ? 'high' : 'medium';
}

const STARS: Record<QualityPreset, number> = { low: 2_000, medium: 5_000, high: 9_000 };
// Integrated GPUs are fill-rate bound: keep pixel ratios modest; adaptive quality lowers them further.
const DPR_CAP: Record<QualityPreset, number> = { low: 1, medium: 1.25, high: 1.75 };
const SKY_SIZE: Record<QualityPreset, number> = { low: 512, medium: 768, high: 1024 };

export function decidePolicy(info: DeviceInfo): DevicePolicy {
  const preset = choosePreset(info);
  // Safari caps DPR harder (fill-rate), as in the case study.
  const cap = info.isSafari ? Math.min(DPR_CAP[preset], 1.5) : DPR_CAP[preset];
  return {
    preset,
    maxDpr: Math.min(info.devicePixelRatio, cap),
    bloom: preset !== 'low',
    starCount: STARS[preset],
    cameraMotion: !info.prefersReducedMotion,
    skySize: SKY_SIZE[preset],
  };
}

interface NavigatorWithMemory extends Navigator {
  readonly deviceMemory?: number;
}

export function probeDevice(backend: DeviceInfo['backend']): DeviceInfo {
  const nav = navigator as NavigatorWithMemory;
  const ua = nav.userAgent;
  return {
    backend,
    isMobile: matchMedia('(pointer: coarse)').matches && /Mobi|Android|iPhone|iPad/i.test(ua),
    isSafari: /^((?!chrome|android).)*safari/i.test(ua),
    memoryGb: nav.deviceMemory,
    cores: nav.hardwareConcurrency || 4,
    devicePixelRatio: window.devicePixelRatio || 1,
    prefersReducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}
