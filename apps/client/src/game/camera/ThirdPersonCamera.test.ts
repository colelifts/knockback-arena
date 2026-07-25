import { describe, expect, it } from 'vitest';
import { MAX_CAMERA_PITCH, MIN_CAMERA_PITCH, applyVerticalLook } from './ThirdPersonCamera.js';

describe('third-person camera pitch', () => {
  it('maps mouse up to looking up and invert Y to the opposite direction', () => {
    expect(applyVerticalLook(0, -20, 1, false)).toBeLessThan(0);
    expect(applyVerticalLook(0, 20, 1, false)).toBeGreaterThan(0);
    expect(applyVerticalLook(0, -20, 1, true)).toBeGreaterThan(0);
  });
  it('clamps to the configured vertical range', () => {
    expect(applyVerticalLook(0, -100000, 1, false)).toBe(MIN_CAMERA_PITCH);
    expect(applyVerticalLook(0, 100000, 1, false)).toBe(MAX_CAMERA_PITCH);
  });
});
