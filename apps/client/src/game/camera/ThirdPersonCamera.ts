import * as THREE from 'three';
import type { GameSettings } from '../../settings.js';

export const MIN_CAMERA_PITCH = THREE.MathUtils.degToRad(-65);
export const MAX_CAMERA_PITCH = THREE.MathUtils.degToRad(55);
export const applyVerticalLook = (
  pitch: number,
  mouseDeltaY: number,
  sensitivity: number,
  invertY: boolean,
): number =>
  THREE.MathUtils.clamp(
    pitch + mouseDeltaY * sensitivity * 0.0022 * (invertY ? -1 : 1),
    MIN_CAMERA_PITCH,
    MAX_CAMERA_PITCH,
  );

export class ThirdPersonCamera {
  yaw = -Math.PI / 2;
  pitch = 0.58;
  distance = 14.5;
  private current = new THREE.Vector3();
  private readonly focus = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private shake = 0;
  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private readonly settings: GameSettings,
  ) {}
  rotate(dx: number, dy: number): void {
    const scale = this.settings.mouseSensitivity * 0.0022;
    this.yaw -= dx * scale;
    this.pitch = applyVerticalLook(
      this.pitch,
      dy,
      this.settings.mouseSensitivity,
      this.settings.invertY,
    );
  }
  zoom(delta: number): void {
    this.distance = THREE.MathUtils.clamp(this.distance + Math.sign(delta) * 1.1, 9, 19);
  }
  forward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }
  right(): THREE.Vector3 {
    const forward = this.forward();
    return new THREE.Vector3(-forward.z, 0, forward.x);
  }
  update(
    target: THREE.Vector3,
    speed: number,
    dt: number,
    raycast: (from: THREE.Vector3, to: THREE.Vector3) => number | null,
  ): void {
    const focus = this.focus.set(target.x, target.y + 2.3, target.z);
    const horizontal = Math.cos(this.pitch) * this.distance;
    const desired = this.desired.set(
      focus.x + Math.sin(this.yaw) * horizontal,
      focus.y + Math.sin(this.pitch) * this.distance + 0.8,
      focus.z + Math.cos(this.yaw) * horizontal,
    );
    const hit = raycast(focus, desired);
    if (hit !== null) desired.lerp(focus, Math.max(0, 1 - (hit - 0.5) / this.distance));
    const follow = 1 - Math.exp(-dt * 14);
    if (this.current.lengthSq() === 0) this.current.copy(desired);
    else this.current.lerp(desired, follow);
    this.camera.position.copy(this.current);
    if (this.shake > 0.001 && !this.settings.reducedMotion) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.max(0, 1 - dt * 16);
    }
    this.camera.lookAt(focus);
    this.camera.fov = THREE.MathUtils.lerp(
      this.camera.fov,
      60 + Math.min(4, speed * 0.25),
      1 - Math.exp(-dt * 7),
    );
    this.camera.updateProjectionMatrix();
  }
  addShake(amount: number): void {
    this.shake = Math.max(this.shake, amount * this.settings.cameraShake);
  }
}
