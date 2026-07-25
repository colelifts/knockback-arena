import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  SIMULATION_HZ,
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
  constructor(
    private readonly settings: GameSettings,
    private readonly callbacks: EngineCallbacks,
  ) {
    this.canvas.id = 'game-canvas';
    document.body.prepend(this.canvas);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: settings.quality !== 'low',
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(
      Math.min(
        devicePixelRatio,
        settings.quality === 'high' ? 1.75 : settings.quality === 'medium' ? 1.35 : 1,
      ),
    );
    this.renderer.shadowMap.enabled = settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene.background = new THREE.Color(0x050619);
    this.scene.fog = new THREE.FogExp2(0x080a22, 0.009);
    this.physics = new RAPIER.World({ x: 0, y: -28, z: 0 });
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
    this.canvas.addEventListener('click', () => this.audio.unlock());
    this.createEnvironment();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      this.paused = document.hidden;
    });
  }
  private createEnvironment(): void {
    const ambient = new THREE.HemisphereLight(0x7dcfff, 0x090617, 1.6);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xf4f1ff, 3.2);
    sun.position.set(-28, 44, 20);
    sun.castShadow = this.settings.shadows;
    sun.shadow.mapSize.set(
      this.settings.quality === 'high' ? 2048 : 1024,
      this.settings.quality === 'high' ? 2048 : 1024,
    );
    sun.shadow.camera.left = -50;
    sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 45;
    sun.shadow.camera.bottom = -45;
    this.scene.add(sun);
    const accent = new THREE.PointLight(0xff3c9d, 50, 80, 2);
    accent.position.set(12, 18, 8);
    this.scene.add(accent);
    const starsGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i += 1) {
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
        new THREE.PointsMaterial({ color: 0x9bdcff, size: 0.34, transparent: true, opacity: 0.8 }),
      ),
    );
  }
  startBot(character: CharacterChoice, difficulty: BotDifficulty): void {
    this.reset();
    this.world = new ArenaWorld(this.scene, this.physics, 0x4b4e4f43);
    this.localMatch = new LocalMatch(
      this.physics,
      this.scene,
      this.world,
      character,
      difficulty,
      this.audio,
      (event, data) => this.callbacks.event(event, data),
    );
    this.running = true;
    this.paused = false;
    this.lastTime = performance.now();
    if (!this.frameHandle) this.frameHandle = requestAnimationFrame((time) => this.frame(time));
  }
  startOnline(seed: number, localId: string): void {
    this.reset();
    this.world = new ArenaWorld(this.scene, this.physics, seed);
    this.localId = localId;
    this.running = true;
    this.paused = false;
    this.lastTime = performance.now();
    if (!this.frameHandle) this.frameHandle = requestAnimationFrame((time) => this.frame(time));
  }
  applySnapshot(snapshot: MatchSnapshot): void {
    this.onlineSnapshot = snapshot;
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
    this.lastTime = time;
    if (this.running && !this.paused) {
      if (this.localMatch) this.updateLocal(dt);
      else this.updateOnline(dt);
      this.world?.update(dt, time / 1000);
      this.renderer.render(this.scene, this.camera);
    }
    if (this.running) this.frameHandle = requestAnimationFrame((next) => this.frame(next));
  }
  private updateLocal(dt: number): void {
    const frame = this.input.frame();
    this.localMatch!.setHumanInput(frame, this.cameraRig.forward(), this.cameraRig.right());
    this.localMatch!.update(dt);
    const position = this.localMatch!.human.body.translation();
    const velocity = this.localMatch!.human.body.linvel();
    this.cameraRig.update(
      new THREE.Vector3(position.x, position.y, position.z),
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
    const cameraForward = this.cameraRig.forward();
    const cameraRight = this.cameraRig.right();
    const moveX = cameraRight.x * input.moveX + cameraForward.x * input.moveZ;
    const moveZ = cameraRight.z * input.moveX + cameraForward.z * input.moveZ;
    this.onlineAccumulator += dt;
    if (this.onlineAccumulator >= 1 / 30) {
      this.onlineAccumulator = 0;
      this.callbacks.sendInput({
        sequence: ++this.onlineSequence,
        clientTime: performance.now(),
        moveX,
        moveZ,
        facingX: moveX || cameraForward.x,
        facingZ: moveZ || cameraForward.z,
        jump: input.jump,
        dodge: input.dodge,
        punch: input.punch,
      });
    }
    for (const player of snapshot.players) {
      const avatar = this.onlineAvatars.get(player.id)!;
      const target = new THREE.Vector3(
        player.position.x,
        player.position.y - 1.65,
        player.position.z,
      );
      avatar.position.lerp(target, 1 - Math.exp(-dt * 16));
      avatar.rotation.y = Math.atan2(player.facing.x, player.facing.z);
      avatar.setAction(player.action);
      avatar.animate(dt, Math.hypot(player.velocity.x, player.velocity.z));
    }
    const local =
      snapshot.players.find((player) => player.id === this.localId) ?? snapshot.players[0];
    if (local)
      this.cameraRig.update(
        new THREE.Vector3(local.position.x, local.position.y, local.position.z),
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
    this.world?.group.removeFromParent();
    this.world = null;
    for (const avatar of this.onlineAvatars.values()) avatar.removeFromParent();
    this.onlineAvatars.clear();
    this.onlineSnapshot = null;
  }
  stop(): void {
    this.running = false;
    this.reset();
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
    if (document.pointerLockElement) document.exitPointerLock();
  }
  private resize(): void {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight, false);
  }
  getTestState() {
    const fighter = this.localMatch?.human;
    const onlinePlayer = this.onlineSnapshot?.players.find((player) => player.id === this.localId);
    const position = fighter?.body.translation() ?? onlinePlayer?.position;
    return {
      running: this.running,
      phase: this.localMatch?.phase ?? this.onlineSnapshot?.phase ?? 'menu',
      position: position ? { ...position } : null,
      score: fighter?.score ?? 0,
      tick: this.onlineSnapshot?.tick ?? this.localMatch?.tick ?? 0,
      localId: this.localId,
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
}
