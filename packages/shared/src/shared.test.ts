import { describe, expect, it } from 'vitest';
import {
  ARENA_COLUMNS,
  ARENA_ROWS,
  METEOR_STUN_SECONDS,
  PUNCH_REACH,
  PUNCH_ACTIVE_SECONDS,
  PUNCH_COOLDOWN_SECONDS,
  PUNCH_WINDUP_SECONDS,
  DODGE_SECONDS,
  DODGE_SPEED,
  SIMULATION_HZ,
  SeededRandom,
  activeTiles,
  collapseOrder,
  generateRoomCode,
  inPunchVolume,
  isRingOut,
  isTileActive,
  playerInputSchema,
  punchIsLegal,
  resolveRingOuts,
  rotateAngleToward,
  safeBouncerLanding,
} from './index.js';

describe('deterministic shared game rules', () => {
  it('replays seeded randomness exactly', () => {
    const a = new SeededRandom(42);
    const b = new SeededRandom(42);
    expect(Array.from({ length: 20 }, () => a.next())).toEqual(
      Array.from({ length: 20 }, () => b.next()),
    );
  });
  it('generates readable deterministic room codes', () => {
    expect(generateRoomCode(123)).toBe(generateRoomCode(123));
    expect(generateRoomCode(123)).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
  });
  it('validates bounded inputs and rejects authoritative positions', () => {
    const valid = {
      sequence: 1,
      clientTime: 10,
      moveX: 0.5,
      moveZ: -1,
      facingX: 0,
      facingZ: 1,
      jump: false,
      dodge: true,
      punch: false,
    };
    expect(playerInputSchema.safeParse(valid).success).toBe(true);
    expect(playerInputSchema.safeParse({ ...valid, moveX: 2, position: { x: 100 } }).success).toBe(
      false,
    );
  });
  it('builds a 19 by 15 active arena and collapses outward', () => {
    expect(activeTiles(0)).toHaveLength(ARENA_COLUMNS * ARENA_ROWS);
    expect(collapseOrder()).toEqual([0, 1, 2, 3, 4]);
    expect(isTileActive({ col: 0, row: 0 }, 1)).toBe(false);
    expect(isTileActive({ col: 9, row: 7 }, 5)).toBe(true);
  });
  it('chooses the farthest safe bouncer landing before the edge', () => {
    expect(safeBouncerLanding({ col: 4, row: 7 }, { col: 1, row: 0 }, 1)).toEqual({
      col: 17,
      row: 7,
    });
    const blocked = new Set(['17:7']);
    expect(safeBouncerLanding({ col: 4, row: 7 }, { col: 1, row: 0 }, 1, blocked)).toEqual({
      col: 16,
      row: 7,
    });
  });
  it('keeps meteor stun exactly one second in simulation ticks', () => {
    expect(METEOR_STUN_SECONDS * SIMULATION_HZ).toBe(30);
  });
  it('limits punches to a forward 2.5-tile capsule/cone', () => {
    expect(PUNCH_REACH).toBe(10);
    expect(inPunchVolume({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 9.9, y: 1, z: 0 })).toBe(
      true,
    );
    expect(inPunchVolume({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 10.1, y: 1, z: 0 })).toBe(
      false,
    );
    expect(inPunchVolume({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 7, y: 1, z: 1.3 })).toBe(
      false,
    );
    expect(inPunchVolume({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: -2, y: 1, z: 0 })).toBe(
      false,
    );
  });
  it('keeps punch timing and dodge travel inside the tuned windows', () => {
    expect(PUNCH_WINDUP_SECONDS).toBeGreaterThanOrEqual(0.12);
    expect(PUNCH_ACTIVE_SECONDS).toBeGreaterThanOrEqual(0.08);
    expect(PUNCH_COOLDOWN_SECONDS).toBeGreaterThanOrEqual(0.48);
    expect(PUNCH_COOLDOWN_SECONDS).toBeLessThanOrEqual(0.58);
    expect(DODGE_SPEED * DODGE_SECONDS).toBeCloseTo(4.8, 5);
  });
  it('rotates through the shortest wrapped angle without overshoot', () => {
    const from = Math.PI - 0.05;
    const to = -Math.PI + 0.05;
    const next = rotateAngleToward(from, to, 0.04);
    expect(next).toBeCloseTo(from + 0.04, 6);
    expect(rotateAngleToward(0, 0.02, 1)).toBeCloseTo(0.02, 6);
  });
  it('blocks punches through a wall', () => {
    const wall = { center: { x: 4, y: 1, z: 0 }, half: { x: 0.5, y: 2, z: 2 } };
    expect(
      punchIsLegal({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 8, y: 1, z: 0 }, [wall]),
    ).toBe(false);
  });
  it('resolves ring-outs and simultaneous draws consistently', () => {
    const safe = { x: 0, y: 1, z: 0 };
    const out = { x: 0, y: -10, z: 0 };
    expect(isRingOut(out)).toBe(true);
    expect(resolveRingOuts(safe, out)).toBe('first');
    expect(resolveRingOuts(out, out)).toBe('draw');
  });
});
