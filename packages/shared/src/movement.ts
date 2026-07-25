import {
  AIR_ACCELERATION,
  AIR_MOVE_SPEED,
  GROUND_ACCELERATION,
  GROUND_DECELERATION,
  GROUND_REVERSE_ACCELERATION,
  MAX_MOVE_SPEED,
  MOVE_SPEED,
} from './constants.js';

export interface HorizontalVelocity {
  x: number;
  z: number;
}

const moveToward = (current: HorizontalVelocity, target: HorizontalVelocity, amount: number) => {
  const dx = target.x - current.x;
  const dz = target.z - current.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= amount || distance < 1e-8) return target;
  return { x: current.x + (dx / distance) * amount, z: current.z + (dz / distance) * amount };
};

export const stepHorizontalVelocity = (
  velocity: HorizontalVelocity,
  inputX: number,
  inputZ: number,
  grounded: boolean,
  dt: number,
): HorizontalVelocity => {
  const inputLength = Math.hypot(inputX, inputZ);
  const normalizedX = inputLength > 1 ? inputX / inputLength : inputX;
  const normalizedZ = inputLength > 1 ? inputZ / inputLength : inputZ;
  const hasInput = inputLength > 0.001;
  const targetSpeed = grounded ? MOVE_SPEED : AIR_MOVE_SPEED;
  const target = hasInput
    ? { x: normalizedX * targetSpeed, z: normalizedZ * targetSpeed }
    : { x: 0, z: 0 };
  const dot = velocity.x * target.x + velocity.z * target.z;
  const acceleration = !grounded
    ? AIR_ACCELERATION
    : !hasInput
      ? GROUND_DECELERATION
      : dot < 0
        ? GROUND_REVERSE_ACCELERATION
        : GROUND_ACCELERATION;
  const next = moveToward(velocity, target, acceleration * dt);
  const speed = Math.hypot(next.x, next.z);
  if (speed <= MAX_MOVE_SPEED) return next;
  return { x: (next.x / speed) * MAX_MOVE_SPEED, z: (next.z / speed) * MAX_MOVE_SPEED };
};

export const shortestAngleDelta = (from: number, to: number): number =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));

export const rotateAngleToward = (from: number, to: number, maxRadians: number): number => {
  const delta = shortestAngleDelta(from, to);
  return from + Math.sign(delta) * Math.min(Math.abs(delta), maxRadians);
};

export const yawFromDirection = (x: number, z: number): number => Math.atan2(x, z);
export const directionFromYaw = (yaw: number): HorizontalVelocity => ({
  x: Math.sin(yaw),
  z: Math.cos(yaw),
});
