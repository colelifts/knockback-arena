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
    const length = Math.hypot(dx, dz) || 1;
    const strafe = meteor ? 0 : (Math.random() - 0.5) * (distance < 14 ? 0.75 : 0.2);
    this.decision = {
      moveX: dx / length + (-dz / length) * strafe,
      moveZ: dz / length + (dx / length) * strafe,
      jump: Math.random() < 0.08 && distance > 6,
      dodge: distance < 13 && Math.random() < profile.dodge,
      punch: distance < 11.5 && Math.random() < profile.aggression,
    };
    return this.decision;
  }
}
