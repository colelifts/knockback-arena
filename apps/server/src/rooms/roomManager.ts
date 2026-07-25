import {
  generateRoomCode,
  hashSeed,
  RECONNECT_SECONDS,
  type CharacterChoice,
} from '@knockback/shared';
import { randomUUID } from 'node:crypto';
import { MatchSimulation } from '../simulation/matchSimulation.js';

export interface RoomPlayer {
  socketId: string | null;
  token: string;
  name: string;
  character: CharacterChoice;
  ready: boolean;
  disconnectedAt: number | null;
}
export interface GameRoom {
  code: string;
  players: Map<string, RoomPlayer>;
  simulation: MatchSimulation;
  createdAt: number;
  lastActiveAt: number;
  rematchVotes: Set<string>;
}

export class RoomManager {
  readonly rooms = new Map<string, GameRoom>();
  private roomCounter = 1;
  create(
    socketId: string,
    name: string,
    character: CharacterChoice,
  ): { room: GameRoom; playerId: string; token: string } {
    let code = generateRoomCode(Date.now() + this.roomCounter++);
    while (this.rooms.has(code)) code = generateRoomCode(Date.now() + this.roomCounter++);
    const room: GameRoom = {
      code,
      players: new Map(),
      simulation: new MatchSimulation(code, hashSeed(`${code}:${Date.now()}`)),
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      rematchVotes: new Set(),
    };
    this.rooms.set(code, room);
    return this.add(room, socketId, name, character);
  }
  join(
    code: string,
    socketId: string,
    name: string,
    character: CharacterChoice,
  ): { room: GameRoom; playerId: string; token: string } {
    const room = this.rooms.get(code);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    if (room.players.size >= 2) throw new Error('ROOM_FULL');
    return this.add(room, socketId, name, character);
  }
  private add(room: GameRoom, socketId: string, name: string, character: CharacterChoice) {
    const playerId = randomUUID();
    const token = randomUUID();
    room.players.set(playerId, {
      socketId,
      token,
      name,
      character,
      ready: false,
      disconnectedAt: null,
    });
    room.simulation.addPlayer(playerId, name, character);
    room.lastActiveAt = Date.now();
    return { room, playerId, token };
  }
  findBySocket(socketId: string): { room: GameRoom; playerId: string; player: RoomPlayer } | null {
    for (const room of this.rooms.values())
      for (const [playerId, player] of room.players)
        if (player.socketId === socketId) return { room, playerId, player };
    return null;
  }
  disconnect(socketId: string, now = Date.now()): void {
    const found = this.findBySocket(socketId);
    if (found) {
      found.player.socketId = null;
      found.player.disconnectedAt = now;
    }
  }
  reconnect(
    token: string,
    socketId: string,
    now = Date.now(),
  ): { room: GameRoom; playerId: string } | null {
    for (const room of this.rooms.values())
      for (const [playerId, player] of room.players) {
        if (
          player.token === token &&
          player.disconnectedAt !== null &&
          now - player.disconnectedAt <= RECONNECT_SECONDS * 1000
        ) {
          player.socketId = socketId;
          player.disconnectedAt = null;
          room.lastActiveAt = now;
          return { room, playerId };
        }
      }
    return null;
  }
  cleanup(now = Date.now(), idleMs = 10 * 60_000): number {
    let removed = 0;
    for (const [code, room] of this.rooms) {
      for (const [id, player] of room.players)
        if (
          player.disconnectedAt !== null &&
          now - player.disconnectedAt > RECONNECT_SECONDS * 1000
        ) {
          room.players.delete(id);
          room.simulation.removePlayer(id);
        }
      if (room.players.size === 0 || now - room.lastActiveAt > idleMs) {
        this.rooms.delete(code);
        removed += 1;
      }
    }
    return removed;
  }
}
