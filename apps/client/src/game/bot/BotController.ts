import type { InputFrame } from '../input/InputController.js';
import type { RigidBody } from '@dimforge/rapier3d-compat';

export type BotDifficulty = 'easy' | 'normal' | 'hard';
const profiles = {
  easy: { reaction: 0.42, aggression: 0.48, dodge: 0.16 },
  normal: { reaction: 0.24, aggression: 0.7, dodge: 0.32 },
  hard: { reaction: 0.14, aggression: 0.86, dodge: 0.5 },
};

export class BotController {
  private timer = 0;
  private decision: InputFrame = { moveX: 0, moveZ: 0, jump: false, dodge: false, punch: false };
  private stuckTimer = 0;
  private lastPosition = { x: Number.NaN, z: Number.NaN };
  constructor(private readonly difficulty: BotDifficulty) {}
  update(
    dt: number,
    bot: RigidBody,
    human: RigidBody,
    hazardPoints: Array<{ x: number; z: number }>,
    activeHalfWidth: number,
    activeHalfDepth: number,
  ): InputFrame {
    this.timer -= dt;
    if (this.timer > 0) return { ...this.decision, jump: false, dodge: false, punch: false };
    const profile = profiles[this.difficulty];
    this.timer = profile.reaction * (0.75 + Math.random() * 0.5);
    const here = bot.translation();
    const target = human.translation();
    let dx = target.x - here.x;
    let dz = target.z - here.z;
    const distance = Math.hypot(dx, dz);
    const meteor = hazardPoints.find((point) => Math.hypot(point.x - here.x, point.z - here.z) < 6);
    if (meteor) {
      dx = here.x - meteor.x;
      dz = here.z - meteor.z;
    }
    const edgeMargin = 6;
    if (Math.abs(here.x) > activeHalfWidth - edgeMargin) dx = -Math.sign(here.x);
    if (Math.abs(here.z) > activeHalfDepth - edgeMargin) dz = -Math.sign(here.z);
    const moved = Math.hypot(here.x - this.lastPosition.x, here.z - this.lastPosition.z);
    const tryingToMove = Math.hypot(this.decision.moveX, this.decision.moveZ) > 0.4;
    this.stuckTimer = tryingToMove && moved < 0.2 ? this.stuckTimer + profile.reaction : 0;
    this.lastPosition = { x: here.x, z: here.z };
    const recovering = this.stuckTimer > 0.85;
    if (recovering) {
      dx = -here.x + (Math.random() - 0.5) * 6;
      dz = -here.z + (Math.random() - 0.5) * 6;
      this.stuckTimer = 0;
    }
    const steeringLength = Math.hypot(dx, dz) || 1;
    const strafe = meteor ? 0 : (Math.random() - 0.5) * (distance < 14 ? 0.75 : 0.2);
    this.decision = {
      moveX: dx / steeringLength + (-dz / steeringLength) * strafe,
      moveZ: dz / steeringLength + (dx / steeringLength) * strafe,
      jump: recovering || (Math.random() < 0.08 && distance > 6),
      dodge: recovering || (distance < 11 && Math.random() < profile.dodge),
      punch: distance < 9.7 && Math.random() < profile.aggression,
    };
    return this.decision;
  }
}
