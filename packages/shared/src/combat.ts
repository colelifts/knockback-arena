import { ELIMINATION_Y, PUNCH_HALF_ANGLE, PUNCH_REACH } from './constants.js';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface Wall {
  center: Vec3;
  half: Vec3;
}

const horizontalLength = (vector: Vec3): number => Math.hypot(vector.x, vector.z);
export const inPunchVolume = (attacker: Vec3, forward: Vec3, target: Vec3): boolean => {
  const offset = { x: target.x - attacker.x, y: target.y - attacker.y, z: target.z - attacker.z };
  const distance = horizontalLength(offset);
  if (distance > PUNCH_REACH || Math.abs(offset.y) > 3.5 || distance < 0.001) return false;
  const forwardLength = horizontalLength(forward);
  if (forwardLength < 0.001) return false;
  const cosine = (offset.x * forward.x + offset.z * forward.z) / (distance * forwardLength);
  return cosine >= Math.cos(PUNCH_HALF_ANGLE);
};

const segmentIntersectsAabb = (start: Vec3, end: Vec3, wall: Wall): boolean => {
  let minimum = 0;
  let maximum = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const delta = end[axis] - start[axis];
    const low = wall.center[axis] - wall.half[axis];
    const high = wall.center[axis] + wall.half[axis];
    if (Math.abs(delta) < 1e-8) {
      if (start[axis] < low || start[axis] > high) return false;
    } else {
      const inverse = 1 / delta;
      let first = (low - start[axis]) * inverse;
      let second = (high - start[axis]) * inverse;
      if (first > second) [first, second] = [second, first];
      minimum = Math.max(minimum, first);
      maximum = Math.min(maximum, second);
      if (minimum > maximum) return false;
    }
  }
  return true;
};

export const punchIsLegal = (attacker: Vec3, forward: Vec3, target: Vec3, walls: Wall[]): boolean =>
  inPunchVolume(attacker, forward, target) &&
  !walls.some((wall) => segmentIntersectsAabb(attacker, target, wall));
export const isRingOut = (position: Vec3): boolean => position.y < ELIMINATION_Y;
export const resolveRingOuts = (first: Vec3, second: Vec3): 'first' | 'second' | 'draw' | null => {
  const firstOut = isRingOut(first);
  const secondOut = isRingOut(second);
  if (firstOut && secondOut) return 'draw';
  if (firstOut) return 'second';
  if (secondOut) return 'first';
  return null;
};
