import { describe, expect, it } from 'vitest';
import { choosePreset, decidePolicy, type DeviceInfo } from '../src/platform/devicePolicy';

const desktop: DeviceInfo = {
  backend: 'webgpu',
  isMobile: false,
  isSafari: false,
  memoryGb: 16,
  cores: 12,
  devicePixelRatio: 2,
  prefersReducedMotion: false,
};

describe('choosePreset', () => {
  it('gives strong WebGPU desktops high', () => {
    expect(choosePreset(desktop)).toBe('high');
  });
  it('treats the WebGL2 fallback one tier lower', () => {
    expect(choosePreset({ ...desktop, backend: 'webgl2' })).toBe('medium');
  });
  it('drops weak machines', () => {
    expect(choosePreset({ ...desktop, cores: 4 })).toBe('medium');
    expect(choosePreset({ ...desktop, cores: 4, backend: 'webgl2' })).toBe('low');
    expect(choosePreset({ ...desktop, memoryGb: 2 })).toBe('medium');
  });
  it('does not penalise browsers that hide deviceMemory', () => {
    expect(choosePreset({ ...desktop, memoryGb: undefined })).toBe('high');
  });
  it('puts phones on low', () => {
    expect(choosePreset({ ...desktop, isMobile: true })).toBe('low');
  });
});

describe('decidePolicy', () => {
  it('never exceeds the device pixel ratio', () => {
    expect(decidePolicy({ ...desktop, devicePixelRatio: 1 }).maxDpr).toBe(1);
  });
  it('caps Safari DPR at 1.5', () => {
    expect(decidePolicy({ ...desktop, isSafari: true, devicePixelRatio: 3 }).maxDpr).toBe(1.5);
  });
  it('disables bloom on low', () => {
    expect(decidePolicy({ ...desktop, isMobile: true }).bloom).toBe(false);
  });
  it('respects reduced motion', () => {
    expect(decidePolicy({ ...desktop, prefersReducedMotion: true }).cameraMotion).toBe(false);
  });
});
