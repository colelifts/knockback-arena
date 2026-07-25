import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  ARENA_COLUMNS,
  ARENA_ROWS,
  TILE_SIZE,
  generateBouncers,
  ringForTile,
  tileKey,
  tileToWorld,
  worldToTile,
  type BouncerSpawn,
  type MeteorState,
} from '@knockback/shared';

interface TileRuntime {
  instance: number;
  x: number;
  z: number;
  y: number;
  rotationX: number;
  collider: RAPIER.Collider | null;
  ring: number;
  falling: boolean;
  velocity: number;
}
interface BouncerRuntime {
  spawn: BouncerSpawn;
  group: THREE.Group;
  ring: number;
  cooldown: Map<string, number>;
}
interface ObstacleRuntime {
  mesh: THREE.Mesh;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider | null;
  ring: number;
  size: THREE.Vector3;
  falling: boolean;
  velocity: number;
}

export class ArenaWorld {
  readonly group = new THREE.Group();
  readonly obstacles: THREE.Object3D[] = [];
  readonly bouncers: BouncerRuntime[] = [];
  private readonly tiles = new Map<string, TileRuntime>();
  private readonly obstacleRuntimes: ObstacleRuntime[] = [];
  private readonly meteorVisuals = new Map<number, THREE.Group>();
  private readonly tileTransform = new THREE.Object3D();
  private tileMesh: THREE.InstancedMesh | null = null;
  private warningRing: number | null = null;
  constructor(
    private readonly scene: THREE.Scene,
    private readonly physics: RAPIER.World,
    seed: number,
  ) {
    scene.add(this.group);
    this.createArena();
    this.createObstacles();
    this.createBouncers(seed);
  }
  private createArena(): void {
    const tileGeometry = new THREE.BoxGeometry(TILE_SIZE - 0.05, 0.72, TILE_SIZE - 0.05);
    const tileMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.72,
      metalness: 0.04,
    });
    this.tileMesh = new THREE.InstancedMesh(tileGeometry, tileMaterial, ARENA_COLUMNS * ARENA_ROWS);
    this.tileMesh.receiveShadow = true;
    this.tileMesh.frustumCulled = false;
    this.group.add(this.tileMesh);
    let instance = 0;
    for (let row = 0; row < ARENA_ROWS; row += 1)
      for (let col = 0; col < ARENA_COLUMNS; col += 1) {
        const ring = ringForTile({ col, row });
        const point = tileToWorld({ col, row });
        this.tileTransform.position.set(point.x, 0, point.z);
        this.tileTransform.rotation.set(0, 0, 0);
        this.tileTransform.updateMatrix();
        this.tileMesh.setMatrixAt(instance, this.tileTransform.matrix);
        this.tileMesh.setColorAt(instance, new THREE.Color(ring % 2 === 0 ? 0x79c9f4 : 0x9d8eea));
        const collider = this.physics.createCollider(
          RAPIER.ColliderDesc.cuboid((TILE_SIZE - 0.02) / 2, 0.36, (TILE_SIZE - 0.02) / 2)
            .setTranslation(point.x, 0, point.z)
            .setFriction(0.9),
        );
        this.tiles.set(tileKey({ col, row }), {
          instance,
          x: point.x,
          z: point.z,
          y: 0,
          rotationX: 0,
          collider,
          ring,
          falling: false,
          velocity: 0,
        });
        instance += 1;
      }
    this.tileMesh.instanceMatrix.needsUpdate = true;
    if (this.tileMesh.instanceColor) this.tileMesh.instanceColor.needsUpdate = true;
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(ARENA_COLUMNS * TILE_SIZE + 1.2, 0.12, ARENA_ROWS * TILE_SIZE + 1.2),
      new THREE.MeshBasicMaterial({
        color: 0x45d9ff,
        transparent: true,
        opacity: 0.28,
        wireframe: true,
      }),
    );
    edge.position.y = -0.43;
    this.group.add(edge);
  }
  private addObstacle(position: THREE.Vector3, size: THREE.Vector3, color = 0x6178c9): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshStandardMaterial({
        color,
        emissive: 0x243473,
        emissiveIntensity: 0.16,
        roughness: 0.7,
        metalness: 0.04,
      }),
    );
    mesh.position.copy(position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.obstacles.push(mesh);
    const body = this.physics.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z),
    );
    const collider = this.physics.createCollider(
      RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2).setFriction(0.85),
      body,
    );
    this.obstacleRuntimes.push({
      mesh,
      body,
      collider,
      ring: ringForTile(worldToTile(position)),
      size: size.clone(),
      falling: false,
      velocity: 0,
    });
  }
  private createObstacles(): void {
    this.addObstacle(new THREE.Vector3(0, 2, 0), new THREE.Vector3(7.6, 4, 7.6), 0x735fc6);
    this.addObstacle(new THREE.Vector3(-18, 1.5, -10), new THREE.Vector3(8, 3, 2));
    this.addObstacle(new THREE.Vector3(18, 1.5, 10), new THREE.Vector3(8, 3, 2));
    this.addObstacle(new THREE.Vector3(-10, 1, 14), new THREE.Vector3(4, 2, 6));
    this.addObstacle(new THREE.Vector3(10, 1, -14), new THREE.Vector3(4, 2, 6));
    for (const [x, z] of [
      [-24, 15],
      [24, -15],
      [-25, -16],
      [25, 16],
    ] as const)
      this.addObstacle(new THREE.Vector3(x, 2.7, z), new THREE.Vector3(2.2, 5.4, 2.2), 0x51a6ba);
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 5.2, 4.2, 8),
      new THREE.MeshStandardMaterial({
        color: 0x9a79d7,
        emissive: 0x432b85,
        emissiveIntensity: 0.18,
        metalness: 0.04,
        roughness: 0.68,
      }),
    );
    tower.position.y = 6.1;
    tower.castShadow = true;
    this.group.add(tower);
  }
  private createBouncers(seed: number): void {
    for (const spawn of generateBouncers(seed)) {
      const point = tileToWorld(spawn);
      const group = new THREE.Group();
      group.position.set(point.x, 0.55, point.z);
      const center = new THREE.Mesh(
        new THREE.CylinderGeometry(0.76, 0.88, 0.48, 18),
        new THREE.MeshStandardMaterial({
          color: 0xffca36,
          emissive: 0xff6b00,
          emissiveIntensity: 1.6,
          metalness: 0.2,
        }),
      );
      center.position.y = 0.22;
      group.add(center);
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(0.25, 0.8, 5),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      arrow.rotation.x = Math.PI / 2;
      arrow.rotation.z = Math.atan2(spawn.direction.row, spawn.direction.col) - Math.PI / 2;
      arrow.position.set(spawn.direction.col * 0.65, 0.65, spawn.direction.row * 0.65);
      group.add(arrow);
      this.group.add(group);
      this.bouncers.push({ spawn, group, ring: ringForTile(spawn), cooldown: new Map() });
    }
  }
  setCollapse(collapsedRings: number, warningRing: number | null): void {
    this.warningRing = warningRing;
    for (const tile of this.tiles.values()) {
      if (tile.ring < collapsedRings && !tile.falling) {
        if (tile.collider) this.physics.removeCollider(tile.collider, true);
        tile.collider = null;
        tile.falling = true;
        tile.velocity = -1.5;
      }
      if (tile.ring >= collapsedRings && tile.falling) {
        tile.y = 0;
        tile.rotationX = 0;
        tile.velocity = 0;
        tile.falling = false;
        tile.collider = this.physics.createCollider(
          RAPIER.ColliderDesc.cuboid((TILE_SIZE - 0.02) / 2, 0.36, (TILE_SIZE - 0.02) / 2)
            .setTranslation(tile.x, 0, tile.z)
            .setFriction(0.9),
        );
      }
      if (!tile.falling) {
        const warning = tile.ring === warningRing;
        this.tileMesh?.setColorAt(
          tile.instance,
          new THREE.Color(warning ? 0xff756d : tile.ring % 2 === 0 ? 0x79c9f4 : 0x9d8eea),
        );
      }
      this.updateTileInstance(tile);
    }
    if (this.tileMesh) this.tileMesh.instanceMatrix.needsUpdate = true;
    if (this.tileMesh?.instanceColor) this.tileMesh.instanceColor.needsUpdate = true;
    for (const bouncer of this.bouncers)
      if (bouncer.ring < collapsedRings) bouncer.group.visible = false;
    for (const bouncer of this.bouncers)
      if (bouncer.ring >= collapsedRings) bouncer.group.visible = true;
    for (const obstacle of this.obstacleRuntimes) {
      if (obstacle.ring < collapsedRings && !obstacle.falling) {
        if (obstacle.collider) this.physics.removeCollider(obstacle.collider, true);
        obstacle.collider = null;
        obstacle.falling = true;
        obstacle.velocity = -1;
      }
      if (obstacle.ring >= collapsedRings && obstacle.falling) {
        obstacle.mesh.position.y = obstacle.body.translation().y;
        obstacle.mesh.rotation.set(0, 0, 0);
        obstacle.falling = false;
        obstacle.velocity = 0;
        obstacle.collider = this.physics.createCollider(
          RAPIER.ColliderDesc.cuboid(
            obstacle.size.x / 2,
            obstacle.size.y / 2,
            obstacle.size.z / 2,
          ).setFriction(0.85),
          obstacle.body,
        );
      }
    }
  }
  update(dt: number, time: number): void {
    let tilesChanged = false;
    for (const tile of this.tiles.values())
      if (tile.falling) {
        tile.velocity -= 16 * dt;
        tile.y += tile.velocity * dt;
        tile.rotationX += dt * 0.25;
        this.updateTileInstance(tile);
        tilesChanged = true;
      }
    if (tilesChanged && this.tileMesh) this.tileMesh.instanceMatrix.needsUpdate = true;
    for (const obstacle of this.obstacleRuntimes)
      if (obstacle.falling) {
        obstacle.velocity -= 16 * dt;
        obstacle.mesh.position.y += obstacle.velocity * dt;
        obstacle.mesh.rotation.z += dt * 0.22;
      }
    for (const bouncer of this.bouncers) {
      const spinner = bouncer.group.getObjectByName('spinner');
      if (spinner) spinner.rotation.z += dt * 1.8;
      bouncer.group.position.y = 0.55 + Math.sin(time * 2 + bouncer.group.position.x) * 0.04;
    }
    if (this.warningRing !== null) this.group.position.y = Math.sin(time * 35) * 0.02;
    else this.group.position.y *= Math.max(0, 1 - dt * 8);
    for (const group of this.meteorVisuals.values()) {
      const meteor = group.getObjectByName('meteor');
      if (meteor) meteor.rotation.y += dt * 4;
    }
  }
  updateMeteors(meteors: MeteorState[], tick: number): void {
    const active = new Set(meteors.map((meteor) => meteor.id));
    for (const [id, group] of this.meteorVisuals)
      if (!active.has(id)) {
        group.removeFromParent();
        this.meteorVisuals.delete(id);
      }
    for (const meteor of meteors) {
      let group = this.meteorVisuals.get(meteor.id);
      if (!group) {
        group = new THREE.Group();
        group.position.set(meteor.x, 0.4, meteor.z);
        const marker = new THREE.Mesh(
          new THREE.RingGeometry(2.5, 3.1, 36),
          new THREE.MeshBasicMaterial({
            color: 0xff4838,
            transparent: true,
            opacity: 0.82,
            side: THREE.DoubleSide,
          }),
        );
        marker.rotation.x = -Math.PI / 2;
        marker.name = 'marker';
        group.add(marker);
        const rock = new THREE.Mesh(
          new THREE.IcosahedronGeometry(1.1, 1),
          new THREE.MeshStandardMaterial({
            color: 0x26130f,
            emissive: 0xff4b0b,
            emissiveIntensity: 1.8,
            roughness: 0.9,
          }),
        );
        rock.name = 'meteor';
        rock.position.y = 26;
        group.add(rock);
        this.group.add(group);
        this.meteorVisuals.set(meteor.id, group);
      }
      const progress = Math.max(
        0,
        Math.min(1, (tick - meteor.warningTick) / (meteor.impactTick - meteor.warningTick)),
      );
      const marker = group.getObjectByName('marker')!;
      marker.scale.setScalar(1 + Math.sin(progress * Math.PI * 9) * 0.08);
      const rock = group.getObjectByName('meteor')!;
      rock.position.y = progress < 1 ? 26 * (1 - progress * progress) : -1;
      rock.visible = tick <= meteor.impactTick + 5;
    }
  }
  cameraHit(from: THREE.Vector3, to: THREE.Vector3): number | null {
    const direction = to.clone().sub(from);
    const length = direction.length();
    direction.normalize();
    const ray = new RAPIER.Ray(from, direction);
    const hit = this.physics.castRay(ray, length, true);
    return hit ? hit.timeOfImpact : null;
  }
  dispose(): void {
    this.group.removeFromParent();
    for (const tile of this.tiles.values())
      if (tile.collider) this.physics.removeCollider(tile.collider, true);
    for (const obstacle of this.obstacleRuntimes) this.physics.removeRigidBody(obstacle.body);
    for (const meteor of this.meteorVisuals.values()) meteor.removeFromParent();
    this.meteorVisuals.clear();
  }
  private updateTileInstance(tile: TileRuntime): void {
    if (!this.tileMesh) return;
    this.tileTransform.position.set(tile.x, tile.y, tile.z);
    this.tileTransform.rotation.set(tile.rotationX, 0, 0);
    this.tileTransform.updateMatrix();
    this.tileMesh.setMatrixAt(tile.instance, this.tileTransform.matrix);
  }
}
