import { afterEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { RECONNECT_SECONDS, SIMULATION_HZ } from '@knockback/shared';
import { MatchmakingQueue } from './matchmaking/queue.js';
import { RoomManager } from './rooms/roomManager.js';
import { MatchSimulation } from './simulation/matchSimulation.js';
import { createGameServer } from './app.js';

const sockets: Socket[] = [];
afterEach(() => sockets.splice(0).forEach((socket) => socket.disconnect()));
const event = <T>(socket: Socket, name: string): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${name}`)), 4000);
    socket.once(name, (value: T) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
const snapshotWithInput = async (socket: Socket, sequence: number) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const snapshot = await event<{
      players: Array<{ lastProcessedInput: number }>;
      collapsedRings: number;
    }>(socket, 'snapshot');
    if (snapshot.players.some((player) => player.lastProcessedInput === sequence)) return snapshot;
  }
  throw new Error(`Input ${sequence} was not acknowledged`);
};

describe('server state managers', () => {
  it('pairs quick play FIFO and supports cancellation', () => {
    const queue = new MatchmakingQueue();
    expect(queue.join('a')).toBeNull();
    queue.cancel('a');
    expect(queue.join('b')).toBeNull();
    expect(queue.join('c')).toEqual(['b', 'c']);
  });
  it('expires reconnects and cleans abandoned rooms', () => {
    const rooms = new RoomManager();
    const created = rooms.create('socket', 'Pilot', 'boy');
    rooms.disconnect('socket', 1_000);
    expect(rooms.reconnect(created.token, 'new', 1_000 + RECONNECT_SECONDS * 1000)).not.toBeNull();
    rooms.disconnect('new', 2_000);
    expect(rooms.reconnect(created.token, 'late', 2_001 + RECONNECT_SECONDS * 1000)).toBeNull();
    expect(rooms.cleanup(100_000)).toBe(1);
  });
  it('advances authoritative snapshots on fixed simulation ticks', () => {
    const simulation = new MatchSimulation('ABCDE', 12);
    simulation.addPlayer('a', 'A', 'boy');
    simulation.addPlayer('b', 'B', 'girl');
    for (let tick = 0; tick < SIMULATION_HZ * 4; tick += 1) simulation.step();
    expect(simulation.snapshot().phase).toBe('playing');
    expect(simulation.snapshot().tick).toBe(SIMULATION_HZ * 4);
  });
});

describe('socket integration', () => {
  it('creates, joins, readies, accepts input, emits snapshots, and rejects invalid messages', async () => {
    const server = createGameServer({
      PORT: 0,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      allowedOrigins: ['http://localhost:5173'],
    });
    const port = await server.start(0);
    const url = `http://localhost:${port}`;
    try {
      const first = connect(url, {
        transports: ['websocket'],
        extraHeaders: { Origin: 'http://localhost:5173' },
      });
      const second = connect(url, {
        transports: ['websocket'],
        extraHeaders: { Origin: 'http://localhost:5173' },
      });
      sockets.push(first, second);
      await Promise.all([event(first, 'connect'), event(second, 'connect')]);
      const joinedA = event<{ room: { code: string } }>(first, 'room:joined');
      first.emit('room:create', { name: 'Alpha', character: 'boy' });
      const roomA = await joinedA;
      const joinedB = event(second, 'room:joined');
      second.emit('room:join', { code: roomA.room.code, name: 'Beta', character: 'girl' });
      await joinedB;
      const startedA = event(first, 'match:started');
      first.emit('room:ready', { ready: true, character: 'boy' });
      second.emit('room:ready', { ready: true, character: 'girl' });
      await startedA;
      first.emit('input', {
        sequence: 7,
        clientTime: 1,
        moveX: 1,
        moveZ: 0,
        facingX: 1,
        facingZ: 0,
        jump: false,
        dodge: false,
        punch: false,
        brace: false,
      });
      const state = await snapshotWithInput(first, 7);
      expect(state.players.some((player) => player.lastProcessedInput === 7)).toBe(true);
      expect(state.collapsedRings).toBe(0);
      const error = event<{ code: string }>(first, 'server:error');
      first.emit('room:join', { code: 'bad!' });
      expect((await error).code).toBe('INVALID_ROOM_CODE');
    } finally {
      await server.stop();
    }
  });
  it('pairs two quick-play clients', async () => {
    const server = createGameServer({
      PORT: 0,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      allowedOrigins: ['http://localhost:5173'],
    });
    const port = await server.start(0);
    const url = `http://localhost:${port}`;
    try {
      const a = connect(url, { transports: ['websocket'] });
      const b = connect(url, { transports: ['websocket'] });
      sockets.push(a, b);
      await Promise.all([event(a, 'connect'), event(b, 'connect')]);
      const joinedA = event(a, 'room:joined');
      const joinedB = event(b, 'room:joined');
      a.emit('queue:join', { name: 'A', character: 'boy' });
      b.emit('queue:join', { name: 'B', character: 'girl' });
      await Promise.all([joinedA, joinedB]);
      expect(server.rooms.rooms.size).toBe(1);
    } finally {
      await server.stop();
    }
  });
});
