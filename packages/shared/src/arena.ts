import {
  ARENA_COLUMNS,
  ARENA_ROWS,
  BOUNCER_COUNT,
  FINAL_SAFE_RING,
  TILE_SIZE,
} from './constants.js';
import { SeededRandom } from './seededRandom.js';

export interface TileCoordinate {
  col: number;
  row: number;
}
export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}
export interface BouncerSpawn extends TileCoordinate {
  direction: TileCoordinate;
}

export const tileKey = ({ col, row }: TileCoordinate): string => `${col}:${row}`;
export const ringForTile = ({ col, row }: TileCoordinate): number =>
  Math.min(col, ARENA_COLUMNS - 1 - col, row, ARENA_ROWS - 1 - row);
export const maximumRing = (): number => Math.floor(Math.min(ARENA_COLUMNS, ARENA_ROWS) / 2);
export const collapseOrder = (): number[] =>
  Array.from({ length: Math.min(FINAL_SAFE_RING, maximumRing()) }, (_, index) => index);
export const isTileActive = (tile: TileCoordinate, collapsedRings: number): boolean =>
  tile.col >= 0 &&
  tile.col < ARENA_COLUMNS &&
  tile.row >= 0 &&
  tile.row < ARENA_ROWS &&
  ringForTile(tile) >= collapsedRings;
export const tileToWorld = ({ col, row }: TileCoordinate): WorldPoint => ({
  x: (col - (ARENA_COLUMNS - 1) / 2) * TILE_SIZE,
  y: 0,
  z: (row - (ARENA_ROWS - 1) / 2) * TILE_SIZE,
});
export const worldToTile = ({ x, z }: Pick<WorldPoint, 'x' | 'z'>): TileCoordinate => ({
  col: Math.round(x / TILE_SIZE + (ARENA_COLUMNS - 1) / 2),
  row: Math.round(z / TILE_SIZE + (ARENA_ROWS - 1) / 2),
});
export const activeTiles = (collapsedRings: number): TileCoordinate[] => {
  const result: TileCoordinate[] = [];
  for (let row = 0; row < ARENA_ROWS; row += 1) {
    for (let col = 0; col < ARENA_COLUMNS; col += 1) {
      const tile = { col, row };
      if (isTileActive(tile, collapsedRings)) result.push(tile);
    }
  }
  return result;
};

const approvedBouncerSockets: TileCoordinate[] = [
  { col: 2, row: 2 },
  { col: 6, row: 2 },
  { col: 12, row: 2 },
  { col: 16, row: 3 },
  { col: 3, row: 7 },
  { col: 15, row: 7 },
  { col: 2, row: 12 },
  { col: 7, row: 12 },
  { col: 11, row: 11 },
  { col: 16, row: 12 },
  { col: 7, row: 5 },
  { col: 12, row: 8 },
];

export const generateBouncers = (seed: number): BouncerSpawn[] => {
  const random = new SeededRandom(seed ^ 0xb00ce);
  return random
    .shuffle(approvedBouncerSockets)
    .slice(0, BOUNCER_COUNT)
    .map((tile) => {
      const center = { col: (ARENA_COLUMNS - 1) / 2, row: (ARENA_ROWS - 1) / 2 };
      return {
        ...tile,
        direction: { col: Math.sign(center.col - tile.col), row: Math.sign(center.row - tile.row) },
      };
    });
};

export const safeBouncerLanding = (
  origin: TileCoordinate,
  direction: TileCoordinate,
  collapsedRings: number,
  blocked: ReadonlySet<string> = new Set(),
): TileCoordinate => {
  let best = origin;
  for (let distance = 1; distance < Math.max(ARENA_COLUMNS, ARENA_ROWS); distance += 1) {
    const candidate = {
      col: origin.col + direction.col * distance,
      row: origin.row + direction.row * distance,
    };
    if (!isTileActive(candidate, collapsedRings)) break;
    if (!blocked.has(tileKey(candidate))) best = candidate;
  }
  return best;
};
