import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  ARENA_COLUMNS,
  ARENA_ROWS,
  BASE_KNOCKBACK,
  BRACE_FRONT_KNOCKBACK_MULTIPLIER,
  BRACE_MOVE_MULTIPLIER,
  CLIENT_FIXED_STEP,
  CLIENT_SIMULATION_HZ,
  COLLAPSE_FIRST_SECONDS,
  COLLAPSE_INTERVAL_SECONDS,
  COLLAPSE_WARNING_SECONDS,
  DODGE_COOLDOWN_SECONDS,
  DODGE_INVULNERABLE_SECONDS,
  DODGE_SECONDS,
  DODGE_SPEED,
  ELIMINATION_Y,
  HIT_CONTROL_LOCK_SECONDS,
  JUMP_SPEED,
  METEOR_STUN_SECONDS,
  MAX_FRAME_ACCUMULATOR_SECONDS,
  MAX_PHYSICS_SUBSTEPS,
  PUNCH_ACTIVE_SECONDS,
  PUNCH_COOLDOWN_SECONDS,
  PUNCH_RECOVERY_SECONDS,
  PUNCH_MOVE_MULTIPLIER,
  PUNCH_VERTICAL_KNOCKBACK,
  PUNCH_WINDUP_SECONDS,
  FLANK_KNOCKBACK_MULTIPLIER,
  PERFECT_DODGE_COUNTER_SECONDS,
  PERFECT_DODGE_KNOCKBACK_MULTIPLIER,
  ROUND_COUNTDOWN_SECONDS,
  ROUNDS_TO_WIN,
  TILE_SIZE,
  VISUAL_ROTATION_SPEED,
  activeTiles,
  collapseOrder,
  generateBouncers,
  inPunchVolume,
  rotateAngleToward,
  stepHorizontalVelocity,
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
  dodgeInvulnerableUntil: number;
  punchReady: number;
  punchStart: number;
  hit: boolean;
  stunUntil: number;
  bouncerUntil: number;
  bouncerStart: THREE.Vector3;
  bouncerEnd: THREE.Vector3;
  lastGroundedTick: number;
  jumpBufferedUntil: number;
  facingYaw: number;
  grounded: boolean;
  controlLockedUntil: number;
  footstepReadyTick: number;
  counterReadyUntil: number;
  bracing: boolean;
}
const secondsToTicks = (seconds: number) => Math.round(seconds * CLIENT_SIMULATION_HZ);

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
  private lastCountdownSecond = 4;
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
        .setLinearDamping(0)
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
      input: { moveX: 0, moveZ: 0, jump: false, dodge: false, punch: false, brace: false },
      score: 0,
      dodgeReady: 0,
      dodgeUntil: 0,
      dodgeInvulnerableUntil: 0,
      punchReady: 0,
      punchStart: -999,
      hit: false,
      stunUntil: 0,
      bouncerUntil: 0,
      bouncerStart: new THREE.Vector3(),
      bouncerEnd: new THREE.Vector3(),
      lastGroundedTick: 0,
      jumpBufferedUntil: 0,
      facingYaw: x < 0 ? Math.PI / 2 : -Math.PI / 2,
      grounded: true,
      controlLockedUntil: 0,
      footstepReadyTick: 0,
      counterReadyUntil: 0,
      bracing: false,
    };
  }
  setHumanInput(input: InputFrame, cameraForward: THREE.Vector3, cameraRight: THREE.Vector3): void {
    this.human.input = {
      jump: input.jump || this.human.input.jump,
      dodge: input.dodge || this.human.input.dodge,
      punch: input.punch || this.human.input.punch,
      brace: input.brace,
      moveX: cameraRight.x * input.moveX + cameraForward.x * input.moveZ,
      moveZ: cameraRight.z * input.moveX + cameraForward.z * input.moveZ,
    };
  }
  update(delta: number): void {
    this.accumulator = Math.min(this.accumulator + delta, MAX_FRAME_ACCUMULATOR_SECONDS);
    let substeps = 0;
    while (this.accumulator >= CLIENT_FIXED_STEP && substeps < MAX_PHYSICS_SUBSTEPS) {
      this.fixedStep();
      this.accumulator -= CLIENT_FIXED_STEP;
      substeps += 1;
    }
    if (substeps === MAX_PHYSICS_SUBSTEPS) this.accumulator = 0;
    for (const fighter of [this.human, this.bot]) this.syncVisual(fighter, delta);
  }
  private fixedStep(): void {
    this.tick += 1;
    this.countdown =
      this.phase === 'countdown'
        ? Math.max(0, ROUND_COUNTDOWN_SECONDS - (this.tick - this.phaseTick) / CLIENT_SIMULATION_HZ)
        : 0;
    const countdownSecond = Math.ceil(this.countdown);
    if (
      this.phase === 'countdown' &&
      countdownSecond > 0 &&
      countdownSecond < this.lastCountdownSecond
    )
      void this.audio.play('countdown');
    this.lastCountdownSecond = countdownSecond;
    if (
      this.phase === 'countdown' &&
      this.tick - this.phaseTick >= secondsToTicks(ROUND_COUNTDOWN_SECONDS)
    ) {
      this.phase = 'playing';
      this.nextCollapse = this.tick + secondsToTicks(COLLAPSE_FIRST_SECONDS);
      this.nextMeteor = this.tick + secondsToTicks(6);
      this.onEvent('go');
      void this.audio.play('go');
    }
    if (this.phase !== 'playing') {
      this.physics.step();
      this.consumeOneShots(this.human);
      return;
    }
    const activeWidth = ((ARENA_COLUMNS - this.collapsedRings * 2) * TILE_SIZE) / 2;
    const activeDepth = ((ARENA_ROWS - this.collapsedRings * 2) * TILE_SIZE) / 2;
    this.bot.input = this.botController.update(
      CLIENT_FIXED_STEP,
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
    this.consumeOneShots(this.human);
    this.consumeOneShots(this.bot);
  }
  private consumeOneShots(fighter: Fighter): void {
    fighter.input.jump = false;
    fighter.input.dodge = false;
    fighter.input.punch = false;
  }
  private stepFighter(fighter: Fighter): void {
    const stunned = this.tick < fighter.stunUntil;
    const controlLocked = this.tick < fighter.controlLockedUntil;
    const punchDuration = secondsToTicks(
      PUNCH_WINDUP_SECONDS + PUNCH_ACTIVE_SECONDS + PUNCH_RECOVERY_SECONDS,
    );
    const punching = this.tick - fighter.punchStart < punchDuration;
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
      fighter.bracing = false;
      fighter.body.setLinvel({ x: 0, y: fighter.body.linvel().y, z: 0 }, true);
      return;
    }
    if (controlLocked) {
      fighter.bracing = false;
      fighter.grounded = this.isGrounded(fighter);
      return;
    }
    const velocity = fighter.body.linvel();
    const length = Math.hypot(fighter.input.moveX, fighter.input.moveZ);
    const dx = length > 1 ? fighter.input.moveX / length : fighter.input.moveX;
    const dz = length > 1 ? fighter.input.moveZ / length : fighter.input.moveZ;
    if (fighter.input.dodge && this.tick >= fighter.dodgeReady && !punching) {
      const useX = length > 0.1 ? dx : Math.sin(fighter.facingYaw);
      const useZ = length > 0.1 ? dz : Math.cos(fighter.facingYaw);
      fighter.body.setLinvel({ x: useX * DODGE_SPEED, y: velocity.y, z: useZ * DODGE_SPEED }, true);
      fighter.dodgeUntil = this.tick + secondsToTicks(DODGE_SECONDS);
      fighter.dodgeInvulnerableUntil = this.tick + secondsToTicks(DODGE_INVULNERABLE_SECONDS);
      fighter.dodgeReady = this.tick + secondsToTicks(DODGE_COOLDOWN_SECONDS);
      void this.audio.play('dodge', fighter.body.translation(), this.human.body.translation());
      this.onEvent('dodge', { position: fighter.body.translation(), yaw: fighter.facingYaw });
    }
    const dodging = this.tick < fighter.dodgeUntil;
    fighter.bracing = fighter.input.brace && fighter.grounded && !dodging && !punching;
    if (!dodging) {
      const horizontal = stepHorizontalVelocity(
        velocity,
        dx,
        dz,
        fighter.grounded,
        CLIENT_FIXED_STEP,
        fighter.bracing ? BRACE_MOVE_MULTIPLIER : punching ? PUNCH_MOVE_MULTIPLIER : 1,
      );
      fighter.body.setLinvel(
        {
          x: horizontal.x,
          y: velocity.y,
          z: horizontal.z,
        },
        true,
      );
    }
    const grounded = this.isGrounded(fighter);
    fighter.grounded = grounded;
    if (grounded) fighter.lastGroundedTick = this.tick;
    if (fighter.input.jump) fighter.jumpBufferedUntil = this.tick + secondsToTicks(0.12);
    const canCoyoteJump = this.tick - fighter.lastGroundedTick <= secondsToTicks(0.1);
    if (fighter.jumpBufferedUntil >= this.tick && canCoyoteJump) {
      fighter.body.setLinvel({ ...fighter.body.linvel(), y: JUMP_SPEED }, true);
      fighter.jumpBufferedUntil = 0;
      fighter.lastGroundedTick = -999;
      void this.audio.play('jump', fighter.body.translation(), this.human.body.translation());
    }
    if (
      fighter.input.punch &&
      this.tick >= fighter.punchReady &&
      !dodging &&
      !fighter.bracing &&
      !punching
    ) {
      fighter.punchStart = this.tick;
      fighter.punchReady = this.tick + secondsToTicks(PUNCH_COOLDOWN_SECONDS);
      fighter.hit = false;
      void this.audio.play('punch', fighter.body.translation(), this.human.body.translation());
      this.onEvent('punch', { position: fighter.body.translation(), yaw: fighter.facingYaw });
    }
    if (length > 0.1) fighter.facingYaw = Math.atan2(dx, dz);
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
    if (!active || attacker.hit) return;
    const source = attacker.body.translation();
    const destination = target.body.translation();
    const forward = {
      x: Math.sin(attacker.facingYaw),
      y: 0,
      z: Math.cos(attacker.facingYaw),
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
    if (this.tick < target.dodgeInvulnerableUntil) {
      target.counterReadyUntil = this.tick + secondsToTicks(PERFECT_DODGE_COUNTER_SECONDS);
      attacker.hit = true;
      return;
    }
    const targetFacesAttacker =
      Math.sin(target.facingYaw) * -forward.x + Math.cos(target.facingYaw) * -forward.z;
    const directionMultiplier = targetFacesAttacker < 0.35 ? FLANK_KNOCKBACK_MULTIPLIER : 1;
    const braceMultiplier =
      target.bracing && targetFacesAttacker >= 0.35 ? BRACE_FRONT_KNOCKBACK_MULTIPLIER : 1;
    const counterMultiplier =
      attacker.counterReadyUntil >= this.tick ? PERFECT_DODGE_KNOCKBACK_MULTIPLIER : 1;
    const forwardSpeed = Math.max(
      0,
      attacker.body.linvel().x * forward.x + attacker.body.linvel().z * forward.z,
    );
    const force =
      BASE_KNOCKBACK *
      (1 + Math.min(0.22, forwardSpeed / 55)) *
      (target.grounded ? 1 : 1.12) *
      directionMultiplier *
      braceMultiplier *
      counterMultiplier;
    target.body.setLinvel(
      {
        x: forward.x * force,
        y: PUNCH_VERTICAL_KNOCKBACK,
        z: forward.z * force,
      },
      true,
    );
    target.controlLockedUntil = this.tick + secondsToTicks(HIT_CONTROL_LOCK_SECONDS);
    attacker.hit = true;
    attacker.counterReadyUntil = 0;
    void this.audio.play('hit', destination, this.human.body.translation());
    this.onEvent('hit', { position: destination });
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
      void this.audio.play('collapse');
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
        void this.audio.play('meteor', meteor, this.human.body.translation());
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
      void this.audio.play('launch');
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
    this.lastCountdownSecond = 4;
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
    for (const fighter of [this.human, this.bot]) {
      fighter.dodgeUntil = 0;
      fighter.dodgeInvulnerableUntil = 0;
      fighter.punchStart = -999;
      fighter.controlLockedUntil = 0;
      fighter.counterReadyUntil = 0;
      fighter.bracing = false;
      fighter.stunUntil = 0;
      fighter.grounded = true;
    }
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
                secondsToTicks(PUNCH_WINDUP_SECONDS + PUNCH_ACTIVE_SECONDS + PUNCH_RECOVERY_SECONDS)
              ? 'punch'
              : fighter.bracing
                ? 'brace'
                : !fighter.grounded
                  ? 'jump'
                  : speed > 0.8
                    ? 'run'
                    : 'idle';
    fighter.avatar.setAction(action);
    if (action === 'run' && fighter.grounded && this.tick >= fighter.footstepReadyTick) {
      fighter.footstepReadyTick = this.tick + secondsToTicks(0.34);
      void this.audio.play('footstep', fighter.body.translation(), this.human.body.translation());
    }
    fighter.avatar.rotation.y = rotateAngleToward(
      fighter.avatar.rotation.y,
      fighter.facingYaw,
      VISUAL_ROTATION_SPEED * dt,
    );
    fighter.avatar.animate(dt, speed);
  }
  dispose(): void {
    for (const fighter of [this.human, this.bot]) {
      fighter.avatar.removeFromParent();
      this.physics.removeRigidBody(fighter.body);
    }
  }
  get collapseSeconds(): number {
    return Math.max(0, (this.nextCollapse - this.tick) / CLIENT_SIMULATION_HZ);
  }
  get debugState(): { speed: number; grounded: boolean; action: string } {
    const velocity = this.human.body.linvel();
    return {
      speed: Math.hypot(velocity.x, velocity.z),
      grounded: this.human.grounded,
      action:
        this.tick < this.human.stunUntil || this.tick < this.human.controlLockedUntil
          ? 'stunned'
          : this.tick < this.human.dodgeUntil
            ? 'dodge'
            : this.tick - this.human.punchStart <
                secondsToTicks(PUNCH_WINDUP_SECONDS + PUNCH_ACTIVE_SECONDS + PUNCH_RECOVERY_SECONDS)
              ? 'punch'
              : this.human.bracing
                ? 'brace'
                : Math.hypot(velocity.x, velocity.z) > 0.8
                  ? 'run'
                  : 'idle',
    };
  }
  testRingOutHuman(): void {
    const position = this.human.body.translation();
    this.human.body.setTranslation({ x: position.x, y: ELIMINATION_Y - 2, z: position.z }, true);
  }
}
