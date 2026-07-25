import { describe, expect, it } from 'vitest';
import { MatchSimulation } from './matchSimulation.js';

const input = (sequence: number, overrides: Record<string, unknown> = {}) => ({
  sequence,
  clientTime: sequence,
  moveX: 0,
  moveZ: 0,
  facingX: 1,
  facingZ: 0,
  jump: false,
  dodge: false,
  punch: false,
  ...overrides,
});

const playingSimulation = () => {
  const simulation = new MatchSimulation('TEST1', 17);
  simulation.addPlayer('attacker', 'Attacker', 'boy');
  simulation.addPlayer('target', 'Target', 'girl');
  for (let tick = 0; tick < 91; tick += 1) simulation.step();
  return simulation;
};

describe('authoritative match movement and combat', () => {
  it('applies tuned punch knockback and preserves momentum through the control lock', () => {
    const simulation = playingSimulation();
    simulation.testSetPlayerPosition('attacker', { x: -5, y: 1.75, z: 20 });
    simulation.testSetPlayerPosition('target', { x: 4, y: 1.75, z: 20 });
    simulation.setInput('attacker', input(1, { punch: true }));
    simulation.step();
    simulation.setInput('attacker', input(2));
    for (let tick = 0; tick < 4; tick += 1) simulation.step();
    let target = simulation.snapshot().players.find((player) => player.id === 'target')!;
    expect(target.velocity.x).toBeCloseTo(11.5, 1);
    expect(target.velocity.y).toBeCloseTo(3.4, 1);
    simulation.step();
    target = simulation.snapshot().players.find((player) => player.id === 'target')!;
    expect(target.velocity.x).toBeGreaterThan(10);
    expect(target.action).toBe('stunned');
  });

  it('rejects the same punch through the center obstacle', () => {
    const simulation = playingSimulation();
    simulation.testSetPlayerPosition('attacker', { x: -5, y: 1.75, z: 0 });
    simulation.testSetPlayerPosition('target', { x: 4, y: 1.75, z: 0 });
    simulation.setInput('attacker', input(1, { punch: true }));
    simulation.step();
    simulation.setInput('attacker', input(2));
    for (let tick = 0; tick < 5; tick += 1) simulation.step();
    const target = simulation.snapshot().players.find((player) => player.id === 'target')!;
    expect(target.velocity.x).toBe(0);
  });
});
