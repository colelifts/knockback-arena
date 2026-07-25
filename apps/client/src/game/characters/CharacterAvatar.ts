import * as THREE from 'three';
import type { CharacterChoice } from '@knockback/shared';

const material = (color: number, roughness = 0.65, metalness = 0.05) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });
const mesh = (geometry: THREE.BufferGeometry, surface: THREE.Material, cast = true) => {
  const item = new THREE.Mesh(geometry, surface);
  item.castShadow = cast;
  item.receiveShadow = true;
  return item;
};

export class CharacterAvatar extends THREE.Group {
  private readonly modelRoot = new THREE.Group();
  private readonly leftArm = new THREE.Group();
  private readonly rightArm = new THREE.Group();
  private readonly leftLeg = new THREE.Group();
  private readonly rightLeg = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly stars = new THREE.Group();
  private action: string = 'idle';
  private actionTime = 0;
  private hairCurls: THREE.Mesh[] = [];
  constructor(
    readonly choice: CharacterChoice,
    local = false,
  ) {
    super();
    this.name = `fighter-${choice}`;
    // The authored face and toes point toward local -Z; simulation forward is +Z.
    // Keep that correction in one place so physics, combat, camera, and networking share one yaw.
    this.modelRoot.rotation.y = Math.PI;
    this.add(this.modelRoot);
    const primary = material(choice === 'boy' ? 0x20a7ff : 0xff4f9a, 0.5, 0.12);
    const secondary = material(choice === 'boy' ? 0x172b71 : 0x7b204d, 0.72);
    const skin = material(choice === 'boy' ? 0xd99670 : 0xe6aa87, 0.85);
    const hair = material(choice === 'boy' ? 0x17223d : 0x351a35, 0.9);
    const white = material(0xf2f5ff, 0.55);
    const sole = material(0x151a2a, 0.75);
    this.torso.position.y = 2.7;
    this.modelRoot.add(this.torso);
    const chest = mesh(new THREE.CapsuleGeometry(0.7, 1.05, 5, 10), primary);
    chest.scale.set(choice === 'girl' ? 0.92 : 1.06, 1, choice === 'girl' ? 0.88 : 1);
    this.torso.add(chest);
    const belt = mesh(new THREE.CylinderGeometry(0.68, 0.64, 0.22, 12), secondary);
    belt.position.y = -0.62;
    this.torso.add(belt);
    const head = mesh(new THREE.SphereGeometry(0.57, 18, 12), skin);
    head.position.y = 1.25;
    head.scale.set(0.93, 1.06, 0.92);
    this.torso.add(head);
    const eyeMaterial = material(0x11152b);
    for (const x of [-0.2, 0.2]) {
      const eye = mesh(new THREE.SphereGeometry(0.055, 8, 6), eyeMaterial, false);
      eye.position.set(x, 1.32, -0.51);
      this.torso.add(eye);
    }
    const smile = mesh(new THREE.TorusGeometry(0.15, 0.022, 5, 12, Math.PI), eyeMaterial, false);
    smile.position.set(0, 1.08, -0.53);
    smile.rotation.z = Math.PI;
    this.torso.add(smile);
    if (choice === 'boy') {
      const cap = mesh(
        new THREE.SphereGeometry(0.6, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.56),
        hair,
      );
      cap.position.y = 1.5;
      this.torso.add(cap);
      for (let i = 0; i < 5; i += 1) {
        const tuft = mesh(new THREE.ConeGeometry(0.15, 0.42, 7), hair);
        tuft.position.set((i - 2) * 0.2, 1.82 - Math.abs(i - 2) * 0.04, -0.05);
        tuft.rotation.z = (i - 2) * 0.18;
        this.torso.add(tuft);
      }
    } else {
      const crown = mesh(
        new THREE.SphereGeometry(0.63, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
        hair,
      );
      crown.position.y = 1.54;
      this.torso.add(crown);
      for (let row = 0; row < 4; row += 1)
        for (const side of [-1, 1]) {
          const curl = mesh(new THREE.SphereGeometry(0.22, 10, 8), hair);
          curl.scale.set(0.9, 1.25, 0.85);
          curl.position.set(side * (0.5 + (row % 2) * 0.04), 1.4 - row * 0.35, 0.12 + row * 0.05);
          this.torso.add(curl);
          this.hairCurls.push(curl);
        }
      for (let row = 0; row < 5; row += 1) {
        const curl = mesh(new THREE.SphereGeometry(0.25, 10, 8), hair);
        curl.scale.set(1.2, 1.18, 0.85);
        curl.position.set(Math.sin(row * 2) * 0.18, 1.35 - row * 0.33, 0.46);
        this.torso.add(curl);
        this.hairCurls.push(curl);
      }
    }
    const makeLimb = (group: THREE.Group, x: number, arm: boolean) => {
      group.position.set(x, arm ? 3.12 : 1.45, 0);
      this.modelRoot.add(group);
      const limb = mesh(
        arm ? new THREE.CapsuleGeometry(0.2, 0.85, 4, 8) : new THREE.CapsuleGeometry(0.27, 1, 4, 8),
        arm ? primary : secondary,
      );
      limb.position.y = arm ? -0.48 : -0.55;
      group.add(limb);
      const end = mesh(
        arm ? new THREE.SphereGeometry(0.25, 10, 8) : new THREE.BoxGeometry(0.52, 0.32, 0.85),
        arm ? skin : white,
      );
      end.position.set(0, arm ? -1.08 : -1.25, arm ? 0 : -0.16);
      group.add(end);
      if (!arm) {
        const outsole = mesh(new THREE.BoxGeometry(0.54, 0.12, 0.88), sole);
        outsole.position.set(0, -1.43, -0.16);
        group.add(outsole);
      }
    };
    makeLimb(this.leftArm, -0.88, true);
    makeLimb(this.rightArm, 0.88, true);
    makeLimb(this.leftLeg, -0.38, false);
    makeLimb(this.rightLeg, 0.38, false);
    const ring = mesh(
      new THREE.TorusGeometry(0.86, 0.04, 8, 32),
      material(local ? 0x62eaff : 0xff76bd, 0.3, 0.5),
      false,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.08;
    this.modelRoot.add(ring);
    for (let index = 0; index < 6; index += 1) {
      const star = mesh(new THREE.OctahedronGeometry(0.15), material(0xffe85c, 0.28, 0.25));
      star.visible = false;
      this.stars.add(star);
    }
    this.stars.position.y = 5.15;
    this.modelRoot.add(this.stars);
  }
  setAction(action: string): void {
    if (action !== this.action) {
      this.action = action;
      this.actionTime = 0;
    }
  }
  animate(dt: number, speed: number): void {
    this.actionTime += dt;
    const run = this.action === 'run' ? Math.min(1, speed / 7) : 0;
    const cycle = Math.sin(this.actionTime * 11);
    this.leftArm.rotation.x = cycle * run * 0.72;
    this.rightArm.rotation.x = -cycle * run * 0.72;
    this.leftLeg.rotation.x = -cycle * run * 0.58;
    this.rightLeg.rotation.x = cycle * run * 0.58;
    this.torso.position.y = 2.7 + Math.abs(cycle) * run * 0.06;
    if (this.action === 'punch') {
      const swing = Math.sin(Math.min(1, this.actionTime / 0.22) * Math.PI);
      this.rightArm.rotation.x = -1.7 * swing;
      this.rightArm.rotation.z = -0.2 * swing;
    }
    if (this.action === 'brace') {
      this.leftArm.rotation.x = -1.15;
      this.rightArm.rotation.x = -1.15;
      this.leftArm.rotation.z = -0.35;
      this.rightArm.rotation.z = 0.35;
      this.leftLeg.rotation.x = 0.18;
      this.rightLeg.rotation.x = 0.18;
    }
    if (this.action === 'dodge') {
      this.scale.set(1.2, 0.72, 1.35);
      this.rotation.z = cycle * 0.05;
    } else {
      const blend = Math.min(1, dt * 14);
      this.scale.set(
        THREE.MathUtils.lerp(this.scale.x, 1, blend),
        THREE.MathUtils.lerp(this.scale.y, 1, blend),
        THREE.MathUtils.lerp(this.scale.z, 1, blend),
      );
    }
    if (this.action === 'jump' || this.action === 'launched') {
      this.leftLeg.rotation.x = -0.35;
      this.rightLeg.rotation.x = 0.45;
      this.leftArm.rotation.z = -0.3;
      this.rightArm.rotation.z = 0.3;
    }
    const stunned = this.action === 'stunned';
    this.stars.children.forEach((star, index) => {
      star.visible = stunned;
      star.position.set(
        Math.cos(this.actionTime * 5 + (index * Math.PI) / 3) * 0.9,
        Math.sin(this.actionTime * 7 + index) * 0.12,
        Math.sin(this.actionTime * 5 + (index * Math.PI) / 3) * 0.9,
      );
      star.rotation.y += dt * 5;
    });
    if (stunned) this.rotation.z = Math.sin(this.actionTime * 12) * 0.05;
    else this.rotation.z *= Math.max(0, 1 - dt * 12);
    this.hairCurls.forEach((curl, index) => {
      curl.rotation.x = Math.sin(this.actionTime * 5 + index) * 0.07 * (1 + run);
    });
  }
}
