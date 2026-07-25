import { describe, expect, it } from 'vitest';
import { MOVE_SPEED, directionFromYaw, stepHorizontalVelocity, yawFromDirection } from './index.js';

const simulate = (hz: number, inputX: number, inputZ: number) => {
  let velocity = { x: 0, z: 0 };
  const position = { x: 0, z: 0 };
  for (let step = 0; step < hz; step += 1) {
    velocity = stepHorizontalVelocity(velocity, inputX, inputZ, true, 1 / hz);
    position.x += velocity.x / hz;
    position.z += velocity.z / hz;
  }
  return { velocity, position };
};

describe('shared movement controller', () => {
  it('produces frame-rate-independent travel at 30 and 60 Hz', () => {
    const at30 = simulate(30, 0, 1);
    const at60 = simulate(60, 0, 1);
    expect(Math.abs(at30.position.z - at60.position.z)).toBeLessThan(0.13);
    expect(at60.velocity.z).toBeCloseTo(MOVE_SPEED, 5);
  });
  it('normalizes diagonal input and brakes faster than it accelerates', () => {
    const diagonal = simulate(60, 1, 1);
    expect(Math.hypot(diagonal.velocity.x, diagonal.velocity.z)).toBeCloseTo(MOVE_SPEED, 5);
    const braking = stepHorizontalVelocity({ x: MOVE_SPEED, z: 0 }, 0, 0, true, 0.1);
    expect(braking.x).toBe(0);
    const reversing = stepHorizontalVelocity({ x: MOVE_SPEED, z: 0 }, -1, 0, true, 0.1);
    expect(reversing.x).toBeLessThan(braking.x);
  });
  it('reaches full ground speed and stops within four 60 Hz frames', () => {
    let velocity = { x: 0, z: 0 };
    for (let frame = 0; frame < 4; frame += 1)
      velocity = stepHorizontalVelocity(velocity, 0, 1, true, 1 / 60);
    expect(velocity.z).toBeCloseTo(MOVE_SPEED, 5);
    for (let frame = 0; frame < 3; frame += 1)
      velocity = stepHorizontalVelocity(velocity, 0, 0, true, 1 / 60);
    expect(velocity.z).toBe(0);
  });
  it('keeps movement and simulation facing aligned in all cardinal directions', () => {
    for (const direction of [
      { x: 0, z: 1 },
      { x: 1, z: 0 },
      { x: 0, z: -1 },
      { x: -1, z: 0 },
    ]) {
      const reconstructed = directionFromYaw(yawFromDirection(direction.x, direction.z));
      expect(reconstructed.x).toBeCloseTo(direction.x, 6);
      expect(reconstructed.z).toBeCloseTo(direction.z, 6);
    }
  });
});
