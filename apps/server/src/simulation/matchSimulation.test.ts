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
  brace: false,
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
  it('moves a stationary target exactly 2.5 tiles before returning control', () => {
    const simulation = playingSimulation();
    simulation.testSetPlayerPosition('attacker', { x: -5, y: 1.75, z: 20 });
    simulation.testSetPlayerPosition('target', { x: 4, y: 1.75, z: 20 });
    simulation.setInput('attacker', input(1, { punch: true }));
    simulation.step();
    simulation.setInput('attacker', input(2));
    for (let tick = 0; tick < 4; tick += 1) simulation.step();
    let target = simulation.snapshot().players.find((player) => player.id === 'target')!;
    const hitPosition = target.position.x;
    expect(target.velocity.x).toBeCloseTo(10 / 0.6, 1);
    expect(target.velocity.y).toBeCloseTo(3.4, 1);
    for (let tick = 0; tick < 18; tick += 1) simulation.step();
    target = simulation.snapshot().players.find((player) => player.id === 'target')!;
    expect(target.position.x - hitPosition).toBeCloseTo(10, 4);
  });

  it('lets a front-facing brace sharply reduce knockback', () => {
    const simulation = playingSimulation();
    simulation.testSetPlayerPosition('attacker', { x: -5, y: 1.75, z: 20 });
    simulation.testSetPlayerPosition('target', { x: 4, y: 1.75, z: 20 });
    simulation.setInput('target', input(1, { facingX: -1, brace: true }));
    simulation.setInput('attacker', input(1, { punch: true }));
    simulation.step();
    simulation.setInput('attacker', input(2));
    for (let tick = 0; tick < 4; tick += 1) simulation.step();
    const target = simulation.snapshot().players.find((player) => player.id === 'target')!;
    expect(target.velocity.x).toBeCloseTo((10 / 0.6) * 0.38, 1);
  });

  it('rewards a perfect dodge with a stronger counter-punch', () => {
    const simulation = playingSimulation();
    simulation.testSetPlayerPosition('attacker', { x: -5, y: 1.75, z: 20 });
    simulation.testSetPlayerPosition('target', { x: 4, y: 1.75, z: 20 });
    simulation.setInput('attacker', input(1, { punch: true }));
    simulation.step();
    simulation.setInput('attacker', input(2));
    simulation.step();
    simulation.setInput('target', input(1, { facingX: -1, dodge: true }));
    simulation.step();
    simulation.setInput('target', input(2, { facingX: -1 }));
    simulation.step();
    simulation.step();

    const dodger = simulation.snapshot().players.find((player) => player.id === 'target')!;
    expect(dodger.velocity.x).toBeLessThan(0);

    simulation.testSetPlayerPosition('attacker', { x: -5, y: 1.75, z: 20 });
    simulation.testSetPlayerPosition('target', { x: 4, y: 1.75, z: 20 });
    for (let tick = 0; tick < 5; tick += 1) simulation.step();
    simulation.setInput('target', input(3, { facingX: -1, punch: true }));
    simulation.step();
    simulation.setInput('target', input(4, { facingX: -1 }));
    for (let tick = 0; tick < 4; tick += 1) simulation.step();
    const countered = simulation.snapshot().players.find((player) => player.id === 'attacker')!;
    expect(countered.velocity.x).toBeCloseTo(-(10 / 0.6) * 1.3, 1);
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
