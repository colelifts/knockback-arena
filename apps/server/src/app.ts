import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { Server as SocketServer, type Socket } from 'socket.io';
import pino from 'pino';
import {
  GAME_VERSION,
  SIMULATION_HZ,
  createRoomSchema,
  joinRoomSchema,
  playerInputSchema,
  readySchema,
  type CharacterChoice,
} from '@knockback/shared';
import { readConfig, type ServerConfig } from './config.js';
import { MatchmakingQueue } from './matchmaking/queue.js';
import { RoomManager, type GameRoom } from './rooms/roomManager.js';
import { RateLimiter } from './security/rateLimiter.js';

interface Session {
  playerId: string;
  roomCode: string;
}
interface GameServer {
  httpServer: HttpServer;
  io: SocketServer;
  rooms: RoomManager;
  start: (port?: number) => Promise<number>;
  stop: () => Promise<void>;
}

export const createGameServer = (overrides: Partial<ServerConfig> = {}): GameServer => {
  const config = { ...readConfig(), ...overrides };
  const logger = pino({ level: config.LOG_LEVEL });
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.allowedOrigins }));
  app.use(express.json({ limit: '8kb' }));
  const rooms = new RoomManager();
  const queue = new MatchmakingQueue();
  app.get('/health', (_request, response) => response.json({ ok: true }));
  app.get('/version', (_request, response) => response.json({ version: GAME_VERSION }));
  app.get('/status', (_request, response) =>
    response.json({
      online: true,
      rooms: rooms.rooms.size,
      players: [...rooms.rooms.values()].reduce((sum, room) => sum + room.players.size, 0),
      version: GAME_VERSION,
    }),
  );
  app.use((_request, response) => response.status(404).json({ error: 'Not found' }));
  const httpServer = createHttpServer(app);
  const io = new SocketServer(httpServer, {
    cors: { origin: config.allowedOrigins, methods: ['GET', 'POST'] },
    allowRequest: (request, callback) => {
      const origin = request.headers.origin;
      callback(null, origin === undefined || config.allowedOrigins.includes(origin));
    },
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 16_384,
  });
  const sessions = new Map<string, Session>();
  const actionLimiter = new RateLimiter(12, 4);
  const inputLimiter = new RateLimiter(90, 45);

  const publicRoom = (room: GameRoom) => ({
    code: room.code,
    players: [...room.players.entries()].map(([id, player]) => ({
      id,
      name: player.name,
      character: player.character,
      ready: player.ready,
      connected: player.socketId !== null,
    })),
  });
  const emitRoom = (room: GameRoom) => io.to(room.code).emit('room:state', publicRoom(room));
  const enterRoom = (socket: Socket, room: GameRoom, playerId: string, token: string) => {
    sessions.set(socket.id, { playerId, roomCode: room.code });
    socket.join(room.code);
    socket.emit('room:joined', { playerId, reconnectToken: token, room: publicRoom(room) });
    emitRoom(room);
  };
  const reject = (socket: Socket, code: string) =>
    socket.emit('server:error', { code, message: code.replaceAll('_', ' ').toLowerCase() });

  io.on('connection', (socket) => {
    socket.emit('server:hello', { version: GAME_VERSION, tickRate: config.GAME_TICK_RATE });
    socket.on('room:create', (payload) => {
      if (!actionLimiter.allow(socket.id)) return reject(socket, 'RATE_LIMITED');
      const parsed = createRoomSchema.safeParse(payload);
      if (!parsed.success) return reject(socket, 'INVALID_MESSAGE');
      const created = rooms.create(socket.id, parsed.data.name, parsed.data.character);
      enterRoom(socket, created.room, created.playerId, created.token);
    });
    socket.on('room:join', (payload) => {
      if (!actionLimiter.allow(socket.id)) return reject(socket, 'RATE_LIMITED');
      const parsed = joinRoomSchema.safeParse(payload);
      if (!parsed.success) return reject(socket, 'INVALID_ROOM_CODE');
      try {
        const joined = rooms.join(
          parsed.data.code,
          socket.id,
          parsed.data.name,
          parsed.data.character,
        );
        enterRoom(socket, joined.room, joined.playerId, joined.token);
      } catch (error) {
        reject(socket, error instanceof Error ? error.message : 'JOIN_FAILED');
      }
    });
    socket.on('room:ready', (payload) => {
      const parsed = readySchema.safeParse(payload);
      const session = sessions.get(socket.id);
      if (!parsed.success || !session) return reject(socket, 'INVALID_MESSAGE');
      const room = rooms.rooms.get(session.roomCode);
      const player = room?.players.get(session.playerId);
      if (!room || !player) return;
      player.ready = parsed.data.ready;
      player.character = parsed.data.character;
      room.simulation.updatePlayerIdentity(session.playerId, player.name, player.character);
      emitRoom(room);
      if (
        room.players.size === 2 &&
        [...room.players.values()].every((candidate) => candidate.ready)
      ) {
        room.simulation.rematch();
        io.to(room.code).emit('match:started', { seed: room.simulation.seed });
      }
    });
    socket.on('input', (payload) => {
      if (!inputLimiter.allow(socket.id)) return;
      const parsed = playerInputSchema.safeParse(payload);
      const session = sessions.get(socket.id);
      if (!parsed.success || !session) return reject(socket, 'INVALID_MESSAGE');
      rooms.rooms.get(session.roomCode)?.simulation.setInput(session.playerId, parsed.data);
    });
    socket.on('queue:join', (payload) => {
      const parsed = createRoomSchema.safeParse(payload);
      if (!parsed.success || !actionLimiter.allow(socket.id))
        return reject(socket, 'INVALID_MESSAGE');
      socket.data.quickPlay = parsed.data;
      const pair = queue.join(socket.id);
      socket.emit('queue:state', { searching: pair === null });
      if (pair) {
        const [firstId, secondId] = pair;
        const firstSocket = io.sockets.sockets.get(firstId);
        const secondSocket = io.sockets.sockets.get(secondId);
        if (!firstSocket || !secondSocket) return;
        const firstData = firstSocket.data.quickPlay as {
          name: string;
          character: CharacterChoice;
        };
        const secondData = secondSocket.data.quickPlay as {
          name: string;
          character: CharacterChoice;
        };
        const created = rooms.create(firstId, firstData.name, firstData.character);
        const joined = rooms.join(
          created.room.code,
          secondId,
          secondData.name,
          secondData.character,
        );
        enterRoom(firstSocket, created.room, created.playerId, created.token);
        enterRoom(secondSocket, joined.room, joined.playerId, joined.token);
        for (const player of created.room.players.values()) player.ready = true;
        created.room.simulation.rematch();
        emitRoom(created.room);
        io.to(created.room.code).emit('match:started', { seed: created.room.simulation.seed });
      }
    });
    socket.on('queue:cancel', () => {
      queue.cancel(socket.id);
      socket.emit('queue:state', { searching: false });
    });
    socket.on('match:rematch', () => {
      const session = sessions.get(socket.id);
      const room = session ? rooms.rooms.get(session.roomCode) : undefined;
      if (!room || !session) return;
      room.rematchVotes.add(session.playerId);
      if (room.rematchVotes.size === 2) {
        room.rematchVotes.clear();
        room.simulation.rematch();
        io.to(room.code).emit('match:started', { seed: room.simulation.seed });
      }
    });
    socket.on('session:reconnect', (payload) => {
      const token =
        typeof payload === 'object' && payload !== null && 'token' in payload
          ? String(payload.token)
          : '';
      const restored = rooms.reconnect(token, socket.id);
      if (!restored) return reject(socket, 'RECONNECT_EXPIRED');
      sessions.set(socket.id, { playerId: restored.playerId, roomCode: restored.room.code });
      socket.join(restored.room.code);
      socket.emit('session:restored', {
        playerId: restored.playerId,
        room: publicRoom(restored.room),
        snapshot: restored.room.simulation.snapshot(),
      });
      emitRoom(restored.room);
    });
    socket.on('room:leave', () => socket.disconnect(true));
    socket.on('disconnect', () => {
      queue.cancel(socket.id);
      rooms.disconnect(socket.id);
      const session = sessions.get(socket.id);
      if (session) {
        const room = rooms.rooms.get(session.roomCode);
        if (room) {
          io.to(room.code).emit('player:disconnected', {
            playerId: session.playerId,
            reconnectSeconds: config.ROOM_RECONNECT_SECONDS,
          });
          emitRoom(room);
        }
      }
      sessions.delete(socket.id);
      actionLimiter.delete(socket.id);
      inputLimiter.delete(socket.id);
    });
  });

  let simulationTimer: NodeJS.Timeout | undefined;
  let cleanupTimer: NodeJS.Timeout | undefined;
  const stepMilliseconds = 1000 / config.GAME_TICK_RATE;
  const snapshotEvery = Math.max(1, Math.round(config.GAME_TICK_RATE / config.SNAPSHOT_RATE));
  const start = (port = config.PORT) =>
    new Promise<number>((resolve) => {
      simulationTimer = setInterval(() => {
        for (const room of rooms.rooms.values()) {
          const active =
            room.players.size === 2 &&
            [...room.players.values()].every((player) => player.ready && player.socketId !== null);
          if (active) room.simulation.step();
          if (active && room.simulation.tick % snapshotEvery === 0)
            io.to(room.code).emit('snapshot', room.simulation.snapshot());
        }
      }, stepMilliseconds);
      cleanupTimer = setInterval(
        () => rooms.cleanup(Date.now(), config.ROOM_IDLE_MINUTES * 60_000),
        30_000,
      );
      httpServer.listen(port, () => {
        const address = httpServer.address();
        const actualPort = typeof address === 'object' && address ? address.port : port;
        logger.info(
          { port: actualPort, simulationHz: SIMULATION_HZ },
          'Knockback Arena server online',
        );
        resolve(actualPort);
      });
    });
  const stop = () =>
    new Promise<void>((resolve, rejectStop) => {
      if (simulationTimer) clearInterval(simulationTimer);
      if (cleanupTimer) clearInterval(cleanupTimer);
      io.close(() => {
        if (!httpServer.listening) {
          resolve();
          return;
        }
        httpServer.close((error) => (error ? rejectStop(error) : resolve()));
      });
    });
  return { httpServer, io, rooms, start, stop };
};
