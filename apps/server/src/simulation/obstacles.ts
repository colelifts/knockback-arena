import type { Wall } from '@knockback/shared';

export const arenaWalls: Wall[] = [
  { center: { x: 0, y: 2, z: 0 }, half: { x: 3.8, y: 2, z: 3.8 } },
  { center: { x: -18, y: 1.5, z: -10 }, half: { x: 4, y: 1.5, z: 1 } },
  { center: { x: 18, y: 1.5, z: 10 }, half: { x: 4, y: 1.5, z: 1 } },
  { center: { x: -10, y: 1, z: 14 }, half: { x: 2, y: 1, z: 3 } },
  { center: { x: 10, y: 1, z: -14 }, half: { x: 2, y: 1, z: 3 } },
];
