import * as THREE from 'three';
import type { GameSettings } from '../../settings.js';

export class ThirdPersonCamera {
  yaw = -Math.PI / 2;
  pitch = 0.32;
  distance = 11;
  private current = new THREE.Vector3();
  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private readonly settings: GameSettings,
  ) {}
  rotate(dx: number, dy: number): void {
    const scale = this.settings.mouseSensitivity * 0.0022;
    this.yaw -= dx * scale;
    this.pitch += dy * scale * (this.settings.invertY ? 1 : -1);
    this.pitch = THREE.MathUtils.clamp(this.pitch, -0.25, 1.12);
  }
  zoom(delta: number): void {
    this.distance = THREE.MathUtils.clamp(this.distance + Math.sign(delta) * 1.1, 6.5, 16);
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
    const focus = target.clone().add(new THREE.Vector3(0, 2.3, 0));
    const horizontal = Math.cos(this.pitch) * this.distance;
    const desired = new THREE.Vector3(
      focus.x + Math.sin(this.yaw) * horizontal,
      focus.y + Math.sin(this.pitch) * this.distance + 0.8,
      focus.z + Math.cos(this.yaw) * horizontal,
    );
    const hit = raycast(focus, desired);
    if (hit !== null) desired.lerp(focus, Math.max(0, 1 - (hit - 0.5) / this.distance));
    const follow = 1 - Math.exp(-dt * 12);
    if (this.current.lengthSq() === 0) this.current.copy(desired);
    else this.current.lerp(desired, follow);
    this.camera.position.copy(this.current);
    this.camera.lookAt(focus);
    this.camera.fov = THREE.MathUtils.lerp(
      this.camera.fov,
      62 + Math.min(9, speed * 0.55),
      1 - Math.exp(-dt * 7),
    );
    this.camera.updateProjectionMatrix();
  }
}
