import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  ARENA_COLUMNS,
  ARENA_ROWS,
  BASE_KNOCKBACK,
  COLLAPSE_FIRST_SECONDS,
  COLLAPSE_INTERVAL_SECONDS,
  COLLAPSE_WARNING_SECONDS,
  DODGE_COOLDOWN_SECONDS,
  DODGE_SECONDS,
  DODGE_SPEED,
  ELIMINATION_Y,
  FIXED_STEP,
  JUMP_SPEED,
  METEOR_STUN_SECONDS,
  MOVE_SPEED,
  PUNCH_ACTIVE_SECONDS,
  PUNCH_COOLDOWN_SECONDS,
  PUNCH_WINDUP_SECONDS,
  ROUND_COUNTDOWN_SECONDS,
  ROUNDS_TO_WIN,
  SIMULATION_HZ,
  TILE_SIZE,
  activeTiles,
  collapseOrder,
  generateBouncers,
  inPunchVolume,
  safeBouncerLanding,
  tileToWorld,
  type CharacterChoice,
  type MatchSnapshot,
  type MeteorState,
  SeededRandom,
} from '@knockback/shared';
import { CharacterAvatar } from '../characters/CharacterAvatar.js';
import type { InputFrame } from '../input/InputController.js';
import { BotController, type BotDifficulty } from '../bot/BotController.js';
import type { ArenaWorld } from '../world/ArenaWorld.js';
import type { AudioSystem } from '../audio/AudioSystem.js';

interface Fighter {
  id: string;
  body: RAPIER.RigidBody;
  avatar: CharacterAvatar;
  input: InputFrame;
  score: number;
  dodgeReady: number;
  dodgeUntil: number;
  punchReady: number;
  punchStart: number;
  hit: boolean;
  stunUntil: number;
  bouncerUntil: number;
  bouncerStart: THREE.Vector3;
  bouncerEnd: THREE.Vector3;
  lastGroundedTick: number;
  jumpBufferedUntil: number;
}
const secondsToTicks = (seconds: number) => Math.round(seconds * SIMULATION_HZ);

export class LocalMatch {
  tick = 0;
  phase: MatchSnapshot['phase'] = 'countdown';
  collapsedRings = 0;
  warningRing: number | null = null;
  countdown = ROUND_COUNTDOWN_SECONDS;
  meteors: MeteorState[] = [];
  readonly human: Fighter;
  readonly bot: Fighter;
  private accumulator = 0;
  private phaseTick = 0;
  private nextCollapse = secondsToTicks(COLLAPSE_FIRST_SECONDS);
  private nextMeteor = secondsToTicks(6);
  private meteorId = 0;
  private random = new SeededRandom(0x4b4e4f43);
  private botController: BotController;
  private readonly bouncers = generateBouncers(0x4b4e4f43);
  constructor(
    private readonly physics: RAPIER.World,
    private readonly scene: THREE.Scene,
    private readonly world: ArenaWorld,
    character: CharacterChoice,
    difficulty: BotDifficulty,
    private readonly audio: AudioSystem,
    private readonly onEvent: (event: string, data?: unknown) => void,
  ) {
    this.human = this.createFighter('you', character, -14, true);
    this.bot = this.createFighter('bot', character === 'boy' ? 'girl' : 'boy', 14, false);
    this.botController = new BotController(difficulty);
  }
  private createFighter(id: string, choice: CharacterChoice, x: number, local: boolean): Fighter {
    const body = this.physics.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, 2, 0)
        .lockRotations()
        .setLinearDamping(1.7)
        .setCcdEnabled(true),
    );
    this.physics.createCollider(
      RAPIER.ColliderDesc.capsule(0.9, 0.72).setFriction(0.25).setRestitution(0),
      body,
    );
    const avatar = new CharacterAvatar(choice, local);
    this.scene.add(avatar);
    return {
      id,
      body,
      avatar,
      input: { moveX: 0, moveZ: 0, jump: false, dodge: false, punch: false },
      score: 0,
      dodgeReady: 0,
      dodgeUntil: 0,
      punchReady: 0,
      punchStart: -999,
      hit: false,
      stunUntil: 0,
      bouncerUntil: 0,
      bouncerStart: new THREE.Vector3(),
      bouncerEnd: new THREE.Vector3(),
      lastGroundedTick: 0,
      jumpBufferedUntil: 0,
    };
  }
  setHumanInput(input: InputFrame, cameraForward: THREE.Vector3, cameraRight: THREE.Vector3): void {
    this.human.input = {
      ...input,
      moveX: cameraRight.x * input.moveX + cameraForward.x * input.moveZ,
      moveZ: cameraRight.z * input.moveX + cameraForward.z * input.moveZ,
    };
  }
  update(delta: number): void {
    this.accumulator = Math.min(this.accumulator + delta, 0.2);
    while (this.accumulator >= FIXED_STEP) {
      this.fixedStep();
      this.accumulator -= FIXED_STEP;
    }
    for (const fighter of [this.human, this.bot]) this.syncVisual(fighter, delta);
  }
  private fixedStep(): void {
    this.tick += 1;
    this.countdown =
      this.phase === 'countdown'
        ? Math.max(0, ROUND_COUNTDOWN_SECONDS - (this.tick - this.phaseTick) / SIMULATION_HZ)
        : 0;
    if (
      this.phase === 'countdown' &&
      this.tick - this.phaseTick >= secondsToTicks(ROUND_COUNTDOWN_SECONDS)
    ) {
      this.phase = 'playing';
      this.nextCollapse = this.tick + secondsToTicks(COLLAPSE_FIRST_SECONDS);
      this.nextMeteor = this.tick + secondsToTicks(6);
      this.onEvent('go');
    }
    if (this.phase !== 'playing') {
      this.physics.step();
      return;
    }
    const activeWidth = ((ARENA_COLUMNS - this.collapsedRings * 2) * TILE_SIZE) / 2;
    const activeDepth = ((ARENA_ROWS - this.collapsedRings * 2) * TILE_SIZE) / 2;
    this.bot.input = this.botController.update(
      FIXED_STEP,
      this.bot.body,
      this.human.body,
      this.meteors.map(({ x, z }) => ({ x, z })),
      activeWidth,
      activeDepth,
    );
    this.stepFighter(this.human);
    this.stepFighter(this.bot);
    this.resolvePunch(this.human, this.bot);
    this.resolvePunch(this.bot, this.human);
    this.updateHazards();
    this.physics.step();
    this.checkBouncers(this.human);
    this.checkBouncers(this.bot);
    this.checkRingOuts();
  }
  private stepFighter(fighter: Fighter): void {
    const stunned = this.tick < fighter.stunUntil;
    const launched = this.tick < fighter.bouncerUntil;
    if (launched) {
      const duration = secondsToTicks(1.15);
      const progress = 1 - (fighter.bouncerUntil - this.tick) / duration;
      const point = fighter.bouncerStart.clone().lerp(fighter.bouncerEnd, progress);
      point.y += Math.sin(progress * Math.PI) * 11 + 2;
      fighter.body.setTranslation(point, true);
      fighter.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }
    if (stunned || this.phase !== 'playing') {
      fighter.body.setLinvel({ x: 0, y: fighter.body.linvel().y, z: 0 }, true);
      return;
    }
    const velocity = fighter.body.linvel();
    const length = Math.hypot(fighter.input.moveX, fighter.input.moveZ);
    const dx = length > 1 ? fighter.input.moveX / length : fighter.input.moveX;
    const dz = length > 1 ? fighter.input.moveZ / length : fighter.input.moveZ;
    if (fighter.input.dodge && this.tick >= fighter.dodgeReady) {
      const useX = length > 0.1 ? dx : Math.sin(fighter.avatar.rotation.y);
      const useZ = length > 0.1 ? dz : Math.cos(fighter.avatar.rotation.y);
      fighter.body.setLinvel({ x: useX * DODGE_SPEED, y: velocity.y, z: useZ * DODGE_SPEED }, true);
      fighter.dodgeUntil = this.tick + secondsToTicks(DODGE_SECONDS);
      fighter.dodgeReady = this.tick + secondsToTicks(DODGE_COOLDOWN_SECONDS);
      this.audio.play('dodge');
    } else if (this.tick >= fighter.dodgeUntil) {
      const blend = 0.18;
      fighter.body.setLinvel(
        {
          x: velocity.x + (dx * MOVE_SPEED - velocity.x) * blend,
          y: velocity.y,
          z: velocity.z + (dz * MOVE_SPEED - velocity.z) * blend,
        },
        true,
      );
    }
    const grounded = this.isGrounded(fighter);
    if (grounded) fighter.lastGroundedTick = this.tick;
    if (fighter.input.jump) fighter.jumpBufferedUntil = this.tick + secondsToTicks(0.12);
    const canCoyoteJump = this.tick - fighter.lastGroundedTick <= secondsToTicks(0.1);
    if (fighter.jumpBufferedUntil >= this.tick && canCoyoteJump) {
      fighter.body.setLinvel({ ...fighter.body.linvel(), y: JUMP_SPEED }, true);
      fighter.jumpBufferedUntil = 0;
      fighter.lastGroundedTick = -999;
      this.audio.play('jump');
    }
    if (fighter.input.punch && this.tick >= fighter.punchReady && this.tick >= fighter.dodgeUntil) {
      fighter.punchStart = this.tick;
      fighter.punchReady = this.tick + secondsToTicks(PUNCH_COOLDOWN_SECONDS);
      fighter.hit = false;
      this.audio.play('punch');
    }
    if (length > 0.1) fighter.avatar.rotation.y = Math.atan2(dx, dz);
  }
  private isGrounded(fighter: Fighter): boolean {
    const position = fighter.body.translation();
    const ray = new RAPIER.Ray(
      { x: position.x, y: position.y, z: position.z },
      { x: 0, y: -1, z: 0 },
    );
    return (
      this.physics.castRay(ray, 2.05, true, undefined, undefined, undefined, fighter.body) !== null
    );
  }
  private resolvePunch(attacker: Fighter, target: Fighter): void {
    const age = this.tick - attacker.punchStart;
    const active =
      age >= secondsToTicks(PUNCH_WINDUP_SECONDS) &&
      age < secondsToTicks(PUNCH_WINDUP_SECONDS + PUNCH_ACTIVE_SECONDS);
    if (!active || attacker.hit || this.tick < target.dodgeUntil) return;
    const source = attacker.body.translation();
    const destination = target.body.translation();
    const forward = {
      x: Math.sin(attacker.avatar.rotation.y),
      y: 0,
      z: Math.cos(attacker.avatar.rotation.y),
    };
    if (!inPunchVolume(source, forward, destination)) return;
    const direction = new THREE.Vector3(
      destination.x - source.x,
      destination.y - source.y,
      destination.z - source.z,
    );
    const distance = direction.length();
    direction.normalize();
    const ray = new RAPIER.Ray(source, direction);
    const hit = this.physics.castRay(
      ray,
      distance,
      true,
      undefined,
      undefined,
      undefined,
      attacker.body,
    );
    if (hit && hit.collider.parent() !== target.body) return;
    target.body.setLinvel(
      { x: forward.x * BASE_KNOCKBACK, y: 5.2, z: forward.z * BASE_KNOCKBACK },
      true,
    );
    attacker.hit = true;
    this.audio.play('hit');
    this.onEvent('hit', destination);
  }
  private updateHazards(): void {
    const warningAt = this.nextCollapse - secondsToTicks(COLLAPSE_WARNING_SECONDS);
    this.warningRing = this.tick >= warningAt ? this.collapsedRings : null;
    if (this.tick >= this.nextCollapse && this.collapsedRings < collapseOrder().length) {
      this.collapsedRings += 1;
      this.warningRing = null;
      this.nextCollapse =
        this.tick +
        secondsToTicks(COLLAPSE_INTERVAL_SECONDS * (this.collapsedRings >= 2 ? 0.82 : 1));
      this.onEvent('collapse');
    }
    this.world.setCollapse(this.collapsedRings, this.warningRing);
    if (this.tick >= this.nextMeteor) {
      const target = this.random.pick([this.human.body.translation(), this.bot.body.translation()]);
      const valid = activeTiles(this.collapsedRings);
      const near = valid.filter((tile) => {
        const point = tileToWorld(tile);
        return Math.hypot(point.x - target.x, point.z - target.z) < 12;
      });
      const point = tileToWorld(this.random.pick(near.length ? near : valid));
      this.meteors.push({
        id: ++this.meteorId,
        x: point.x + (this.random.next() - 0.5) * 3,
        z: point.z + (this.random.next() - 0.5) * 3,
        warningTick: this.tick,
        impactTick: this.tick + secondsToTicks(1.8),
      });
      this.nextMeteor = this.tick + secondsToTicks(5 + this.random.next() * 3);
    }
    for (const meteor of this.meteors)
      if (meteor.impactTick === this.tick) {
        this.audio.play('meteor');
        for (const fighter of [this.human, this.bot]) {
          const position = fighter.body.translation();
          if (Math.hypot(position.x - meteor.x, position.z - meteor.z) < 4.5) {
            fighter.stunUntil = this.tick + secondsToTicks(METEOR_STUN_SECONDS);
            fighter.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          }
        }
      }
    this.meteors = this.meteors.filter(
      (meteor) => this.tick <= meteor.impactTick + secondsToTicks(1.2),
    );
    this.world.updateMeteors(this.meteors, this.tick);
  }
  private checkBouncers(fighter: Fighter): void {
    if (!this.isGrounded(fighter) || this.tick < fighter.bouncerUntil) return;
    const position = fighter.body.translation();
    for (const spawn of this.bouncers) {
      const point = tileToWorld(spawn);
      if (Math.hypot(position.x - point.x, position.z - point.z) > 1.45) continue;
      const landing = safeBouncerLanding(spawn, spawn.direction, this.collapsedRings);
      const destination = tileToWorld(landing);
      fighter.bouncerStart.set(position.x, position.y, position.z);
      fighter.bouncerEnd.set(destination.x, 2, destination.z);
      fighter.bouncerUntil = this.tick + secondsToTicks(1.15);
      this.onEvent('launch');
      break;
    }
  }
  private checkRingOuts(): void {
    const humanOut = this.human.body.translation().y < ELIMINATION_Y;
    const botOut = this.bot.body.translation().y < ELIMINATION_Y;
    if (!humanOut && !botOut) return;
    if (!humanOut && botOut) this.human.score += 1;
    if (humanOut && !botOut) this.bot.score += 1;
    if (this.human.score >= ROUNDS_TO_WIN || this.bot.score >= ROUNDS_TO_WIN) {
      this.phase = 'matchOver';
      this.onEvent('matchOver', { won: this.human.score > this.bot.score });
    } else this.resetRound();
  }
  private resetRound(): void {
    this.phase = 'countdown';
    this.phaseTick = this.tick;
    this.collapsedRings = 0;
    this.warningRing = null;
    this.meteors = [];
    this.nextCollapse = this.tick + secondsToTicks(COLLAPSE_FIRST_SECONDS);
    this.nextMeteor = this.tick + secondsToTicks(6);
    this.human.body.setTranslation({ x: -14, y: 2, z: 0 }, true);
    this.bot.body.setTranslation({ x: 14, y: 2, z: 0 }, true);
    for (const fighter of [this.human, this.bot])
      fighter.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }
  rematch(): void {
    this.human.score = 0;
    this.bot.score = 0;
    this.resetRound();
  }
  private syncVisual(fighter: Fighter, dt: number): void {
    const position = fighter.body.translation();
    const velocity = fighter.body.linvel();
    fighter.avatar.position.set(position.x, position.y - 1.65, position.z);
    const speed = Math.hypot(velocity.x, velocity.z);
    const action =
      this.tick < fighter.stunUntil
        ? 'stunned'
        : this.tick < fighter.bouncerUntil
          ? 'launched'
          : this.tick < fighter.dodgeUntil
            ? 'dodge'
            : this.tick - fighter.punchStart <
                secondsToTicks(PUNCH_WINDUP_SECONDS + PUNCH_ACTIVE_SECONDS)
              ? 'punch'
              : !this.isGrounded(fighter)
                ? 'jump'
                : speed > 0.8
                  ? 'run'
                  : 'idle';
    fighter.avatar.setAction(action);
    fighter.avatar.animate(dt, speed);
  }
  dispose(): void {
    for (const fighter of [this.human, this.bot]) {
      fighter.avatar.removeFromParent();
      this.physics.removeRigidBody(fighter.body);
    }
  }
  get collapseSeconds(): number {
    return Math.max(0, (this.nextCollapse - this.tick) / SIMULATION_HZ);
  }
}
