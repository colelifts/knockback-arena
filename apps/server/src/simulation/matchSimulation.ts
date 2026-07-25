import {
  AIR_ACCELERATION,
  BASE_KNOCKBACK,
  COLLAPSE_FIRST_SECONDS,
  COLLAPSE_INTERVAL_SECONDS,
  COLLAPSE_WARNING_SECONDS,
  DODGE_COOLDOWN_SECONDS,
  DODGE_SECONDS,
  DODGE_SPEED,
  FIXED_STEP,
  GRAVITY,
  GROUND_ACCELERATION,
  JUMP_SPEED,
  METEOR_STUN_SECONDS,
  MOVE_SPEED,
  PUNCH_ACTIVE_SECONDS,
  PUNCH_COOLDOWN_SECONDS,
  PUNCH_WINDUP_SECONDS,
  ROUND_COUNTDOWN_SECONDS,
  ROUND_TIME_LIMIT_SECONDS,
  ROUNDS_TO_WIN,
  SIMULATION_HZ,
  activeTiles,
  collapseOrder,
  isTileActive,
  punchIsLegal,
  resolveRingOuts,
  tileToWorld,
  worldToTile,
  type CharacterChoice,
  type MatchSnapshot,
  type MeteorState,
  type PlayerInput,
  type PlayerSnapshot,
  SeededRandom,
} from '@knockback/shared';
import { arenaWalls } from './obstacles.js';

interface RuntimePlayer extends PlayerSnapshot {
  input: PlayerInput;
  dodgeReadyTick: number;
  dodgeUntilTick: number;
  punchReadyTick: number;
  punchStartedTick: number;
  hitThisPunch: boolean;
}

const emptyInput = (): PlayerInput => ({
  sequence: 0,
  clientTime: 0,
  moveX: 0,
  moveZ: 0,
  facingX: 0,
  facingZ: 1,
  jump: false,
  dodge: false,
  punch: false,
});
const ticks = (seconds: number): number => Math.round(seconds * SIMULATION_HZ);

export class MatchSimulation {
  readonly seed: number;
  tick = 0;
  phase: MatchSnapshot['phase'] = 'countdown';
  collapsedRings = 0;
  warningRing: number | null = null;
  nextCollapseTick = ticks(COLLAPSE_FIRST_SECONDS);
  meteors: MeteorState[] = [];
  private readonly random: SeededRandom;
  private readonly players = new Map<string, RuntimePlayer>();
  private phaseStartedTick = 0;
  private nextMeteorTick: number;
  private meteorId = 0;

  constructor(
    readonly roomCode: string,
    seed: number,
  ) {
    this.seed = seed;
    this.random = new SeededRandom(seed);
    this.nextMeteorTick = ticks(6);
  }

  addPlayer(id: string, name: string, character: CharacterChoice): void {
    const index = this.players.size;
    const spawn = index === 0 ? { x: -14, y: 1.75, z: 0 } : { x: 14, y: 1.75, z: 0 };
    this.players.set(id, {
      id,
      name,
      character,
      position: spawn,
      velocity: { x: 0, y: 0, z: 0 },
      facing: { x: index === 0 ? 1 : -1, z: 0 },
      grounded: true,
      action: 'idle',
      score: 0,
      lastProcessedInput: 0,
      stunnedUntilTick: 0,
      input: emptyInput(),
      dodgeReadyTick: 0,
      dodgeUntilTick: 0,
      punchReadyTick: 0,
      punchStartedTick: -999,
      hitThisPunch: false,
    });
  }

  removePlayer(id: string): void {
    this.players.delete(id);
  }
  setInput(id: string, input: PlayerInput): void {
    const player = this.players.get(id);
    if (player && input.sequence > player.input.sequence) player.input = input;
  }

  updatePlayerIdentity(id: string, name: string, character: CharacterChoice): void {
    const player = this.players.get(id);
    if (player) {
      player.name = name;
      player.character = character;
    }
  }

  step(): void {
    this.tick += 1;
    if (
      this.phase === 'countdown' &&
      this.tick - this.phaseStartedTick >= ticks(ROUND_COUNTDOWN_SECONDS)
    ) {
      this.phase = 'playing';
      this.phaseStartedTick = this.tick;
      this.nextCollapseTick = this.tick + ticks(COLLAPSE_FIRST_SECONDS);
      this.nextMeteorTick = this.tick + ticks(6);
    }
    if (this.phase !== 'playing') {
      for (const player of this.players.values()) player.lastProcessedInput = player.input.sequence;
      return;
    }
    this.updateCollapse();
    this.updateMeteors();
    for (const player of this.players.values()) this.stepPlayer(player);
    this.resolveCombat();
    this.resolveRound();
  }

  private stepPlayer(player: RuntimePlayer): void {
    player.lastProcessedInput = player.input.sequence;
    const stunned = this.tick < player.stunnedUntilTick;
    if (stunned) {
      player.velocity.x = 0;
      player.velocity.z = 0;
      player.action = 'stunned';
    } else {
      const inputLength = Math.hypot(player.input.moveX, player.input.moveZ);
      const inputX = inputLength > 1 ? player.input.moveX / inputLength : player.input.moveX;
      const inputZ = inputLength > 1 ? player.input.moveZ / inputLength : player.input.moveZ;
      const wantsDodge = player.input.dodge && this.tick >= player.dodgeReadyTick;
      if (wantsDodge) {
        const directionLength = Math.hypot(inputX, inputZ);
        const dx = directionLength > 0.1 ? inputX / directionLength : player.facing.x;
        const dz = directionLength > 0.1 ? inputZ / directionLength : player.facing.z;
        player.velocity.x = dx * DODGE_SPEED;
        player.velocity.z = dz * DODGE_SPEED;
        player.dodgeUntilTick = this.tick + ticks(DODGE_SECONDS);
        player.dodgeReadyTick = this.tick + ticks(DODGE_COOLDOWN_SECONDS);
      }
      const dodging = this.tick < player.dodgeUntilTick;
      if (!dodging) {
        const acceleration = player.grounded ? GROUND_ACCELERATION : AIR_ACCELERATION;
        const blend = Math.min(1, acceleration * FIXED_STEP);
        player.velocity.x += (inputX * MOVE_SPEED - player.velocity.x) * blend;
        player.velocity.z += (inputZ * MOVE_SPEED - player.velocity.z) * blend;
      }
      if (inputLength > 0.1) player.facing = { x: inputX, z: inputZ };
      if (player.input.jump && player.grounded) {
        player.velocity.y = JUMP_SPEED;
        player.grounded = false;
      }
      if (player.input.punch && this.tick >= player.punchReadyTick && !dodging) {
        player.punchStartedTick = this.tick;
        player.punchReadyTick = this.tick + ticks(PUNCH_COOLDOWN_SECONDS);
        player.hitThisPunch = false;
      }
      player.action = dodging
        ? 'dodge'
        : this.tick - player.punchStartedTick < ticks(PUNCH_WINDUP_SECONDS + PUNCH_ACTIVE_SECONDS)
          ? 'punch'
          : !player.grounded
            ? 'jump'
            : inputLength > 0.1
              ? 'run'
              : 'idle';
    }
    player.velocity.y -= GRAVITY * FIXED_STEP;
    const previous = { ...player.position };
    player.position.x += player.velocity.x * FIXED_STEP;
    player.position.y += player.velocity.y * FIXED_STEP;
    player.position.z += player.velocity.z * FIXED_STEP;
    this.resolveWalls(player, previous);
    const tile = worldToTile(player.position);
    if (
      isTileActive(tile, this.collapsedRings) &&
      player.position.y <= 1.75 &&
      player.position.y > -0.5
    ) {
      player.position.y = 1.75;
      player.velocity.y = Math.max(0, player.velocity.y);
      player.grounded = true;
    } else if (player.position.y > 1.76) player.grounded = false;
  }

  private resolveWalls(player: RuntimePlayer, previous: { x: number; y: number; z: number }): void {
    for (const wall of arenaWalls) {
      const insideX = Math.abs(player.position.x - wall.center.x) < wall.half.x + 0.72;
      const insideZ = Math.abs(player.position.z - wall.center.z) < wall.half.z + 0.72;
      const insideY =
        player.position.y < wall.center.y + wall.half.y + 1.8 &&
        player.position.y > wall.center.y - wall.half.y;
      if (insideX && insideZ && insideY) {
        player.position.x = previous.x;
        player.position.z = previous.z;
        player.velocity.x = 0;
        player.velocity.z = 0;
      }
    }
  }

  private resolveCombat(): void {
    const players = [...this.players.values()];
    if (players.length !== 2) return;
    for (const [attacker, target] of [
      [players[0]!, players[1]!],
      [players[1]!, players[0]!],
    ] as const) {
      const age = this.tick - attacker.punchStartedTick;
      const active =
        age >= ticks(PUNCH_WINDUP_SECONDS) &&
        age < ticks(PUNCH_WINDUP_SECONDS + PUNCH_ACTIVE_SECONDS);
      if (!active || attacker.hitThisPunch || this.tick < target.dodgeUntilTick) continue;
      const forward = { x: attacker.facing.x, y: 0, z: attacker.facing.z };
      if (punchIsLegal(attacker.position, forward, target.position, arenaWalls)) {
        const forwardSpeed = Math.max(
          0,
          attacker.velocity.x * forward.x + attacker.velocity.z * forward.z,
        );
        const force =
          BASE_KNOCKBACK * (1 + Math.min(0.18, forwardSpeed / 60)) * (target.grounded ? 1 : 1.12);
        target.velocity.x = forward.x * force;
        target.velocity.z = forward.z * force;
        target.velocity.y = 5.2;
        target.grounded = false;
        attacker.hitThisPunch = true;
      }
    }
  }

  private updateCollapse(): void {
    const order = collapseOrder();
    if (this.collapsedRings >= order.length) return;
    const warningTick = this.nextCollapseTick - ticks(COLLAPSE_WARNING_SECONDS);
    this.warningRing = this.tick >= warningTick ? this.collapsedRings : null;
    if (this.tick >= this.nextCollapseTick) {
      this.collapsedRings += 1;
      this.warningRing = null;
      const pace = this.collapsedRings >= 2 ? 0.82 : 1;
      this.nextCollapseTick = this.tick + ticks(COLLAPSE_INTERVAL_SECONDS * pace);
    }
  }

  private updateMeteors(): void {
    if (this.tick >= this.nextMeteorTick) {
      const tiles = activeTiles(this.collapsedRings);
      const player = this.random.pick([...this.players.values()]);
      const near = tiles.filter((tile) => {
        const world = tileToWorld(tile);
        return Math.hypot(world.x - player.position.x, world.z - player.position.z) < 12;
      });
      const tile = this.random.pick(near.length > 0 ? near : tiles);
      const point = tileToWorld(tile);
      this.meteors.push({
        id: ++this.meteorId,
        x: point.x + (this.random.next() - 0.5) * 2,
        z: point.z + (this.random.next() - 0.5) * 2,
        warningTick: this.tick,
        impactTick: this.tick + ticks(1.8),
      });
      this.nextMeteorTick = this.tick + ticks(5 + this.random.next() * 3);
    }
    for (const meteor of this.meteors) {
      if (meteor.impactTick === this.tick) {
        for (const player of this.players.values()) {
          if (Math.hypot(player.position.x - meteor.x, player.position.z - meteor.z) <= 4.5) {
            player.stunnedUntilTick = this.tick + ticks(METEOR_STUN_SECONDS);
            player.velocity = { x: 0, y: 0, z: 0 };
          }
        }
      }
    }
    this.meteors = this.meteors.filter((meteor) => this.tick <= meteor.impactTick + ticks(1.2));
  }

  private resolveRound(): void {
    const players = [...this.players.values()];
    if (players.length !== 2) return;
    const result = resolveRingOuts(players[0]!.position, players[1]!.position);
    const timedOut = this.tick - this.phaseStartedTick >= ticks(ROUND_TIME_LIMIT_SECONDS);
    if (!result && !timedOut) return;
    if (result === 'first') players[0]!.score += 1;
    if (result === 'second') players[1]!.score += 1;
    if (players.some((player) => player.score >= ROUNDS_TO_WIN)) this.phase = 'matchOver';
    else {
      this.phase = 'countdown';
      this.resetRound(players);
    }
    this.phaseStartedTick = this.tick;
  }

  private resetRound(players: RuntimePlayer[]): void {
    players.forEach((player, index) => {
      player.position = { x: index === 0 ? -14 : 14, y: 1.75, z: 0 };
      player.velocity = { x: 0, y: 0, z: 0 };
      player.grounded = true;
      player.stunnedUntilTick = 0;
    });
    this.collapsedRings = 0;
    this.warningRing = null;
    this.meteors = [];
    this.nextCollapseTick = this.tick + ticks(COLLAPSE_FIRST_SECONDS);
    this.nextMeteorTick = this.tick + ticks(6);
  }

  rematch(): void {
    for (const player of this.players.values()) player.score = 0;
    this.phase = 'countdown';
    this.phaseStartedTick = this.tick;
    this.resetRound([...this.players.values()]);
  }

  snapshot(): MatchSnapshot {
    return {
      roomCode: this.roomCode,
      seed: this.seed,
      tick: this.tick,
      phase: this.phase,
      countdown:
        this.phase === 'countdown'
          ? Math.max(
              0,
              ROUND_COUNTDOWN_SECONDS - (this.tick - this.phaseStartedTick) / SIMULATION_HZ,
            )
          : 0,
      collapsedRings: this.collapsedRings,
      warningRing: this.warningRing,
      nextCollapseTick: this.nextCollapseTick,
      players: [...this.players.values()].map(
        ({
          input: _input,
          dodgeReadyTick: _a,
          dodgeUntilTick: _b,
          punchReadyTick: _c,
          punchStartedTick: _d,
          hitThisPunch: _e,
          ...player
        }) => player,
      ),
      meteors: [...this.meteors],
    };
  }
}
