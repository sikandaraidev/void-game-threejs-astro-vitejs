/**
 * Feature flags. A disabled feature's factory returns `null`; callers use optional chaining.
 * Pattern from the Threejs-Punk case study (Blueprint v2 §2.4).
 */
export const FEATURES = {
  bloom: true,
  starfield: true,
  debugLabel: import.meta.env.DEV,
} as const;

export type FeatureName = keyof typeof FEATURES;
