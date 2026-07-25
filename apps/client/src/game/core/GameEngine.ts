import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  CLIENT_FIXED_STEP,
  BRACE_MOVE_MULTIPLIER,
  DODGE_SPEED,
  FIXED_STEP,
  GRAVITY,
  SIMULATION_HZ,
  VISUAL_ROTATION_SPEED,
  rotateAngleToward,
  stepHorizontalVelocity,
  type CharacterChoice,
  type MatchSnapshot,
  type PlayerInput,
} from '@knockback/shared';
import { ArenaWorld } from '../world/ArenaWorld.js';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera.js';
import { InputController } from '../input/InputController.js';
import { AudioSystem } from '../audio/AudioSystem.js';
import { LocalMatch } from './LocalMatch.js';
import { CharacterAvatar } from '../characters/CharacterAvatar.js';
import type { BotDifficulty } from '../bot/BotController.js';
import type { GameSettings } from '../../settings.js';

export interface EngineCallbacks {
  pause: () => void;
  event: (event: string, data?: unknown) => void;
  hud: (a: number, b: number, countdown: number, collapse: number, warning: string) => void;
  sendInput: (input: PlayerInput) => void;
  networkStats: () => { ping: number; missingSnapshots: number; snapshotBytes: number };
}
export class GameEngine {
  readonly canvas = document.createElement('canvas');
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 240);
  private physics: RAPIER.World;
  private world: ArenaWorld | null = null;
  private cameraRig: ThirdPersonCamera;
  private input: InputController;
  private audio: AudioSystem;
  private localMatch: LocalMatch | null = null;
  private onlineAvatars = new Map<string, CharacterAvatar>();
  private onlineSnapshot: MatchSnapshot | null = null;
  private localId = '';
  private running = false;
  private paused = false;
  private lastTime = performance.now();
  private frameHandle = 0;
  private onlineSequence = 0;
  private onlineAccumulator = 0;
  private readonly snapshotBuffer: MatchSnapshot[] = [];
  private readonly inputHistory: PlayerInput[] = [];
  private predictedPosition = new THREE.Vector3();
  private predictedVelocity = new THREE.Vector3();
  private predictionReady = false;
  private predictionError = 0;
  private pendingJump = false;
  private pendingDodge = false;
  private pendingPunch = false;
  private readonly cameraTarget = new THREE.Vector3();
  private readonly avatarTarget = new THREE.Vector3();
  private readonly debugOverlay: HTMLPreElement | null;
  private debugFrames = 0;
  private debugElapsed = 0;
  private debugFps = 0;
  private physicsMs = 0;
  private readonly frameTimes: number[] = [];
  private longFrameCount = 0;
  private readonly effects: Array<{
    object: THREE.Object3D;
    age: number;
    duration: number;
    kind: string;
  }> = [];
  constructor(
    private readonly settings: GameSettings,
    private readonly callbacks: EngineCallbacks,
  ) {
    this.canvas.id = 'game-canvas';
    document.body.prepend(this.canvas);
    const debugEnabled =
      new URLSearchParams(location.search).get('debug') === '1' || settings.showFps;
    this.debugOverlay = debugEnabled ? document.createElement('pre') : null;
    if (this.debugOverlay) {
      this.debugOverlay.className = 'debug-overlay';
      this.debugOverlay.dataset.testid = 'debug-overlay';
      document.body.append(this.debugOverlay);
    }
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, settings.quality === 'high' ? 1.15 : 1));
    this.renderer.shadowMap.enabled = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.scene.background = new THREE.Color(0x86d7f5);
    this.scene.fog = new THREE.FogExp2(0xbbeafd, 0.0065);
    this.physics = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    this.physics.integrationParameters.dt = CLIENT_FIXED_STEP;
    this.cameraRig = new ThirdPersonCamera(this.camera, settings);
    this.audio = new AudioSystem(settings);
    this.input = new InputController(
      this.canvas,
      (dx, dy) => this.cameraRig.rotate(dx, dy),
      () => callbacks.pause(),
    );
    this.canvas.addEventListener('wheel', (event) => this.cameraRig.zoom(event.deltaY), {
      passive: true,
    });
    document.addEventListener(
      'pointerdown',
      () => {
        this.audio.unlock();
        if (!this.running) this.audio.startMenuMusic();
      },
      { once: true },
    );
    document.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('button'))
        void this.audio.play('ui');
    });
    this.createEnvironment();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      this.paused = document.hidden;
    });
  }
  private createEnvironment(): void {
    const ambient = new THREE.HemisphereLight(0xe9fbff, 0x5c78b8, 2.25);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff0c2, 3.4);
    sun.position.set(-28, 44, 20);
    sun.castShadow = false;
    this.scene.add(sun);
    const accent = new THREE.PointLight(0xffa8dc, 24, 70, 2);
    accent.position.set(12, 18, 8);
    this.scene.add(accent);
    const starsGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(180 * 3);
    for (let i = 0; i < 180; i += 1) {
      const radius = 90 + Math.random() * 120;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.scene.add(
      new THREE.Points(
        starsGeometry,
        new THREE.PointsMaterial({ color: 0xffffff, size: 0.32, transparent: true, opacity: 0.34 }),
      ),
    );
    const cloudGeometry = new THREE.SphereGeometry(1, 10, 7);
    const cloudMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    const clouds = new THREE.InstancedMesh(cloudGeometry, cloudMaterial, 14);
    const transform = new THREE.Object3D();
    for (let index = 0; index < 14; index += 1) {
      const angle = (index / 14) * Math.PI * 2;
      const radius = 55 + (index % 5) * 12;
      transform.position.set(
        Math.cos(angle) * radius,
        10 + (index % 7) * 4,
        Math.sin(angle) * radius,
      );
      transform.scale.set(5 + (index % 4) * 2, 1.8 + (index % 3), 3.2 + (index % 5));
      transform.updateMatrix();
      clouds.setMatrixAt(index, transform.matrix);
    }
    this.scene.add(clouds);
  }
  startBot(character: CharacterChoice, difficulty: BotDifficulty): void {
    this.reset();
    this.frameTimes.length = 0;
    this.longFrameCount = 0;
    this.world = new ArenaWorld(this.scene, this.physics, 0x4b4e4f43);
    this.localMatch = new LocalMatch(
      this.physics,
      this.scene,
      this.world,
      character,
      difficulty,
      this.audio,
      (event, data) => {
        this.spawnCombatEffect(event, data);
        this.callbacks.event(event, data);
      },
    );
    this.running = true;
    this.audio.startArenaMusic();
    this.paused = false;
    this.input.setEnabled(true);
    this.lastTime = performance.now();
    if (!this.frameHandle) this.frameHandle = requestAnimationFrame((time) => this.frame(time));
  }
  startOnline(seed: number, localId: string): void {
    this.reset();
    this.frameTimes.length = 0;
    this.longFrameCount = 0;
    this.world = new ArenaWorld(this.scene, this.physics, seed);
    this.localId = localId;
    this.running = true;
    this.audio.startArenaMusic();
    this.paused = false;
    this.input.setEnabled(true);
    this.lastTime = performance.now();
    if (!this.frameHandle) this.frameHandle = requestAnimationFrame((time) => this.frame(time));
  }
  applySnapshot(snapshot: MatchSnapshot): void {
    const previous = this.onlineSnapshot;
    if (previous) {
      const newlyHit = snapshot.players.filter(
        (player) =>
          player.action === 'hit' &&
          previous.players.find((candidate) => candidate.id === player.id)?.action !== 'hit',
      );
      if (newlyHit.length === 2) {
        const position = {
          x: (newlyHit[0]!.position.x + newlyHit[1]!.position.x) / 2,
          y: (newlyHit[0]!.position.y + newlyHit[1]!.position.y) / 2,
          z: (newlyHit[0]!.position.z + newlyHit[1]!.position.z) / 2,
        };
        this.spawnCombatEffect('clash', { position });
        this.callbacks.event('clash', { position });
      } else if (newlyHit[0]) {
        this.spawnCombatEffect('hit', { position: newlyHit[0].position });
        this.callbacks.event('hit', { position: newlyHit[0].position });
      }
      for (const player of snapshot.players) {
        const wasReady = previous.players.find(
          (candidate) => candidate.id === player.id,
        )?.counterReady;
        if (player.counterReady && !wasReady) {
          this.spawnCombatEffect('perfectDodge', { position: player.position });
          if (player.id === this.localId)
            this.callbacks.event('perfectDodge', { position: player.position });
        }
      }
    }
    this.snapshotBuffer.push(snapshot);
    if (this.snapshotBuffer.length > 12) this.snapshotBuffer.shift();
    this.onlineSnapshot = snapshot;
    this.reconcileLocal(snapshot);
    this.world?.setCollapse(snapshot.collapsedRings, snapshot.warningRing);
    this.world?.updateMeteors(snapshot.meteors, snapshot.tick);
    for (const player of snapshot.players)
      if (!this.onlineAvatars.has(player.id)) {
        const avatar = new CharacterAvatar(player.character, player.id === this.localId);
        this.onlineAvatars.set(player.id, avatar);
        this.scene.add(avatar);
      }
  }
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.input.setEnabled(!paused);
  }
  rematchBot(): void {
    this.localMatch?.rematch();
    this.paused = false;
    this.input.setEnabled(true);
  }
  private frame(time: number): void {
    this.frameHandle = 0;
    const dt = Math.min(0.05, (time - this.lastTime) / 1000);
    const frameMs = dt * 1000;
    this.frameTimes.push(frameMs);
    if (this.frameTimes.length > 600) this.frameTimes.shift();
    if (frameMs > 34) this.longFrameCount += 1;
    this.lastTime = time;
    if (this.running && !this.paused) {
      if (this.localMatch) this.updateLocal(dt);
      else this.updateOnline(dt);
      this.world?.update(dt, time / 1000);
      this.updateEffects(dt);
      this.renderer.render(this.scene, this.camera);
      this.updateDebug(dt);
    }
    if (this.running) this.frameHandle = requestAnimationFrame((next) => this.frame(next));
  }
  private updateLocal(dt: number): void {
    const physicsStarted = performance.now();
    const frame = this.input.frame();
    this.localMatch!.setHumanInput(frame, this.cameraRig.forward(), this.cameraRig.right());
    this.localMatch!.update(dt);
    this.physicsMs = performance.now() - physicsStarted;
    const position = this.localMatch!.human.body.translation();
    const velocity = this.localMatch!.human.body.linvel();
    this.cameraRig.update(
      this.cameraTarget.set(position.x, position.y, position.z),
      Math.hypot(velocity.x, velocity.z),
      dt,
      (from, to) => this.world?.cameraHit(from, to) ?? null,
    );
    const warning = this.localMatch!.warningRing !== null ? '⚠ RING COLLAPSE — MOVE INWARD' : '';
    this.callbacks.hud(
      this.localMatch!.human.score,
      this.localMatch!.bot.score,
      this.localMatch!.countdown,
      this.localMatch!.collapseSeconds,
      warning,
    );
  }
  private updateOnline(dt: number): void {
    const snapshot = this.onlineSnapshot;
    if (!snapshot) return;
    const input = this.input.frame();
    this.pendingJump ||= input.jump;
    this.pendingDodge ||= input.dodge;
    this.pendingPunch ||= input.punch;
    const cameraForward = this.cameraRig.forward();
    const cameraRight = this.cameraRig.right();
    const moveX = cameraRight.x * input.moveX + cameraForward.x * input.moveZ;
    const moveZ = cameraRight.z * input.moveX + cameraForward.z * input.moveZ;
    this.onlineAccumulator += dt;
    while (this.onlineAccumulator >= FIXED_STEP) {
      this.onlineAccumulator -= FIXED_STEP;
      const outgoing: PlayerInput = {
        sequence: ++this.onlineSequence,
        clientTime: performance.now(),
        moveX,
        moveZ,
        facingX: moveX || cameraForward.x,
        facingZ: moveZ || cameraForward.z,
        jump: this.pendingJump,
        dodge: this.pendingDodge,
        punch: this.pendingPunch,
        brace: input.brace,
      };
      this.pendingJump = false;
      this.pendingDodge = false;
      this.pendingPunch = false;
      this.inputHistory.push(outgoing);
      if (this.inputHistory.length > 120) this.inputHistory.shift();
      this.callbacks.sendInput(outgoing);
    }
    const localSnapshot = snapshot.players.find((player) => player.id === this.localId);
    if (localSnapshot && this.predictionReady && snapshot.phase === 'playing') {
      const next = stepHorizontalVelocity(
        this.predictedVelocity,
        moveX,
        moveZ,
        localSnapshot.grounded,
        dt,
        input.brace ? BRACE_MOVE_MULTIPLIER : 1,
      );
      this.predictedVelocity.x = next.x;
      this.predictedVelocity.z = next.z;
      this.predictedPosition.x += next.x * dt;
      this.predictedPosition.z += next.z * dt;
    }
    const renderTick = snapshot.tick - SIMULATION_HZ * 0.065;
    const earlier = [...this.snapshotBuffer].reverse().find((item) => item.tick <= renderTick);
    const later = this.snapshotBuffer.find((item) => item.tick >= renderTick) ?? snapshot;
    const interpolation = earlier
      ? THREE.MathUtils.clamp(
          (renderTick - earlier.tick) / Math.max(1, later.tick - earlier.tick),
          0,
          1,
        )
      : 1;
    for (const player of snapshot.players) {
      const avatar = this.onlineAvatars.get(player.id)!;
      let x = player.position.x;
      let y = player.position.y;
      let z = player.position.z;
      if (player.id === this.localId && this.predictionReady) {
        x = this.predictedPosition.x;
        y = this.predictedPosition.y;
        z = this.predictedPosition.z;
      } else if (earlier) {
        const first = earlier.players.find((candidate) => candidate.id === player.id);
        const second = later.players.find((candidate) => candidate.id === player.id);
        if (first && second) {
          x = THREE.MathUtils.lerp(first.position.x, second.position.x, interpolation);
          y = THREE.MathUtils.lerp(first.position.y, second.position.y, interpolation);
          z = THREE.MathUtils.lerp(first.position.z, second.position.z, interpolation);
        }
      }
      const target = this.avatarTarget.set(x, y - 1.65, z);
      avatar.position.lerp(target, player.id === this.localId ? 1 : 1 - Math.exp(-dt * 24));
      avatar.rotation.y = rotateAngleToward(
        avatar.rotation.y,
        Math.atan2(player.facing.x, player.facing.z),
        VISUAL_ROTATION_SPEED * dt,
      );
      avatar.setAction(player.action);
      avatar.setCounterReady(player.counterReady === true);
      avatar.animate(dt, Math.hypot(player.velocity.x, player.velocity.z));
    }
    const local =
      snapshot.players.find((player) => player.id === this.localId) ?? snapshot.players[0];
    if (local)
      this.cameraRig.update(
        this.cameraTarget.set(
          this.predictionReady ? this.predictedPosition.x : local.position.x,
          this.predictionReady ? this.predictedPosition.y : local.position.y,
          this.predictionReady ? this.predictedPosition.z : local.position.z,
        ),
        Math.hypot(local.velocity.x, local.velocity.z),
        dt,
        (from, to) => this.world?.cameraHit(from, to) ?? null,
      );
    this.callbacks.hud(
      snapshot.players.find((player) => player.id === this.localId)?.score ?? 0,
      snapshot.players.find((player) => player.id !== this.localId)?.score ?? 0,
      snapshot.countdown,
      Math.max(0, (snapshot.nextCollapseTick - snapshot.tick) / SIMULATION_HZ),
      snapshot.warningRing !== null ? '⚠ RING COLLAPSE — MOVE INWARD' : '',
    );
    if (snapshot.phase === 'matchOver')
      this.callbacks.event('matchOver', {
        won:
          (snapshot.players.find((player) => player.id === this.localId)?.score ?? 0) >
          (snapshot.players.find((player) => player.id !== this.localId)?.score ?? 0),
      });
  }
  reset(): void {
    this.localMatch?.dispose();
    this.localMatch = null;
    this.world?.dispose();
    this.world = null;
    for (const avatar of this.onlineAvatars.values()) avatar.removeFromParent();
    this.onlineAvatars.clear();
    this.onlineSnapshot = null;
    this.snapshotBuffer.length = 0;
    this.inputHistory.length = 0;
    this.predictionReady = false;
    this.audio.stopMusic();
  }
  stop(): void {
    this.running = false;
    this.reset();
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
    if (document.pointerLockElement) document.exitPointerLock();
    this.audio.startMenuMusic();
  }
  private resize(): void {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight, false);
  }
  getTestState() {
    const fighter = this.localMatch?.human;
    const onlinePlayer = this.onlineSnapshot?.players.find((player) => player.id === this.localId);
    const position =
      fighter?.body.translation() ??
      (this.predictionReady ? this.predictedPosition : onlinePlayer?.position);
    const sortedFrameTimes = [...this.frameTimes].sort((a, b) => a - b);
    const frameP95Ms =
      sortedFrameTimes[
        Math.min(sortedFrameTimes.length - 1, Math.floor(sortedFrameTimes.length * 0.95))
      ] ?? 0;
    return {
      running: this.running,
      phase: this.localMatch?.phase ?? this.onlineSnapshot?.phase ?? 'menu',
      position: position ? { ...position } : null,
      score: fighter?.score ?? onlinePlayer?.score ?? 0,
      opponentScore:
        this.localMatch?.bot.score ??
        this.onlineSnapshot?.players.find((player) => player.id !== this.localId)?.score ??
        0,
      tick: this.onlineSnapshot?.tick ?? this.localMatch?.tick ?? 0,
      localId: this.localId,
      debug: {
        draws: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        bodies: this.physics.bodies.len(),
        predictionError: this.predictionError,
        fps: this.debugFps,
        frameP95Ms,
        longFrames: this.longFrameCount,
        ...(this.localMatch?.debugState ?? {}),
      },
      players:
        this.onlineSnapshot?.players.map((player) => ({
          id: player.id,
          position: { ...player.position },
        })) ?? [],
    };
  }
  testKey(code: string, down: boolean): void {
    this.input.testKey(code, down);
  }
  testPunch(): void {
    this.input.testPunch();
  }
  testRingOut(): void {
    this.localMatch?.testRingOutHuman();
  }

  private updateDebug(dt: number): void {
    if (!this.debugOverlay) return;
    this.debugFrames += 1;
    this.debugElapsed += dt;
    if (this.debugElapsed < 0.25) return;
    this.debugFps = this.debugFrames / this.debugElapsed;
    this.debugFrames = 0;
    this.debugElapsed = 0;
    const local = this.localMatch?.debugState;
    const online = this.onlineSnapshot?.players.find((player) => player.id === this.localId);
    const network = this.callbacks.networkStats();
    const bodies = this.physics.bodies.len();
    const render = this.renderer.info.render;
    this.debugOverlay.textContent = [
      `FPS ${this.debugFps.toFixed(0)} | frame ${(dt * 1000).toFixed(1)} ms | physics ${this.physicsMs.toFixed(2)} ms`,
      `ping ${network.ping} ms | missing snapshots ${network.missingSnapshots} | payload ${network.snapshotBytes} B`,
      `prediction ${this.predictionError.toFixed(3)} m | bodies ${bodies} | draws ${render.calls} | triangles ${render.triangles}`,
      `p95 frame ${(
        [...this.frameTimes].sort((a, b) => a - b)[
          Math.min(this.frameTimes.length - 1, Math.floor(this.frameTimes.length * 0.95))
        ] ?? 0
      ).toFixed(1)} ms | long frames ${this.longFrameCount}`,
      `speed ${(local?.speed ?? Math.hypot(online?.velocity.x ?? 0, online?.velocity.z ?? 0)).toFixed(2)} | grounded ${local?.grounded ?? online?.grounded ?? false} | action ${local?.action ?? online?.action ?? 'idle'}`,
    ].join('\n');
  }

  private reconcileLocal(snapshot: MatchSnapshot): void {
    const authoritative = snapshot.players.find((player) => player.id === this.localId);
    if (!authoritative) return;
    this.inputHistory.splice(
      0,
      this.inputHistory.findIndex((input) => input.sequence > authoritative.lastProcessedInput) < 0
        ? this.inputHistory.length
        : this.inputHistory.findIndex((input) => input.sequence > authoritative.lastProcessedInput),
    );
    const replayPosition = this.cameraTarget.set(
      authoritative.position.x,
      authoritative.position.y,
      authoritative.position.z,
    );
    let replayVelocity = { x: authoritative.velocity.x, z: authoritative.velocity.z };
    for (const input of this.inputHistory) {
      replayVelocity = stepHorizontalVelocity(
        replayVelocity,
        input.moveX,
        input.moveZ,
        authoritative.grounded,
        FIXED_STEP,
        input.brace ? BRACE_MOVE_MULTIPLIER : 1,
      );
      replayPosition.x += replayVelocity.x * FIXED_STEP;
      replayPosition.z += replayVelocity.z * FIXED_STEP;
      if (input.dodge) {
        const length = Math.hypot(input.moveX, input.moveZ) || 1;
        replayVelocity = {
          x: (input.moveX / length) * DODGE_SPEED,
          z: (input.moveZ / length) * DODGE_SPEED,
        };
      }
    }
    if (!this.predictionReady) {
      this.predictedPosition.copy(replayPosition);
      this.predictionReady = true;
    } else {
      this.predictionError = this.predictedPosition.distanceTo(replayPosition);
      const blend = this.predictionError > 2 ? 1 : this.predictionError > 0.15 ? 0.35 : 0.12;
      this.predictedPosition.lerp(replayPosition, blend);
    }
    this.predictedPosition.y = authoritative.position.y;
    this.predictedVelocity.set(replayVelocity.x, authoritative.velocity.y, replayVelocity.z);
  }
  private spawnCombatEffect(event: string, data: unknown): void {
    const detail = data as
      { position?: { x: number; y: number; z: number }; yaw?: number } | undefined;
    const position = detail?.position;
    if (!position) return;
    if (event === 'punch') {
      const arc = new THREE.Mesh(
        new THREE.RingGeometry(0.75, 2.15, 28, 1, -0.72, 1.44),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.72,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      arc.position.set(position.x, position.y + 0.25, position.z);
      arc.rotation.set(-Math.PI / 2, 0, -(detail?.yaw ?? 0));
      this.scene.add(arc);
      this.effects.push({ object: arc, age: 0, duration: 0.18, kind: 'arc' });
    }
    if (event === 'hit' || event === 'clash') {
      const burst = new THREE.Group();
      burst.position.set(position.x, position.y + 0.35, position.z);
      const sparkCount = event === 'clash' ? 14 : 10;
      for (let index = 0; index < sparkCount; index += 1) {
        const spark = new THREE.Mesh(
          new THREE.OctahedronGeometry(event === 'clash' ? 0.18 : 0.14),
          new THREE.MeshBasicMaterial({
            color:
              event === 'clash'
                ? index % 2
                  ? 0x6ff7ff
                  : 0xffffff
                : index % 2
                  ? 0xffef70
                  : 0xffffff,
          }),
        );
        const angle = (index / sparkCount) * Math.PI * 2;
        spark.position.set(
          Math.cos(angle) * 0.6,
          Math.sin(index * 2.1) * 0.35,
          Math.sin(angle) * 0.6,
        );
        burst.add(spark);
      }
      this.scene.add(burst);
      this.effects.push({
        object: burst,
        age: 0,
        duration: event === 'clash' ? 0.38 : 0.32,
        kind: 'hit',
      });
      this.cameraRig.addShake(event === 'clash' ? 0.58 : 0.46);
    }
    if (event === 'dodge') {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.45, 1.1, 24),
        new THREE.MeshBasicMaterial({
          color: 0x9ff6ff,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide,
        }),
      );
      ring.position.set(position.x, position.y - 1.5, position.z);
      ring.rotation.x = -Math.PI / 2;
      this.scene.add(ring);
      this.effects.push({ object: ring, age: 0, duration: 0.22, kind: 'dodge' });
    }
    if (event === 'perfectDodge') {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.6, 1.5, 24),
        new THREE.MeshBasicMaterial({
          color: 0x7dff70,
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide,
        }),
      );
      ring.position.set(position.x, position.y + 0.2, position.z);
      ring.rotation.x = -Math.PI / 2;
      this.scene.add(ring);
      this.effects.push({ object: ring, age: 0, duration: 0.38, kind: 'dodge' });
    }
  }
  private updateEffects(dt: number): void {
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index]!;
      effect.age += dt;
      const progress = effect.age / effect.duration;
      effect.object.scale.setScalar(1 + progress * (effect.kind === 'hit' ? 1.4 : 0.7));
      effect.object.rotation.y += dt * 3;
      effect.object.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial)
          child.material.opacity = Math.max(0, 1 - progress);
      });
      if (progress >= 1) {
        effect.object.removeFromParent();
        this.effects.splice(index, 1);
      }
    }
  }
}
