import { io, type Socket } from 'socket.io-client';
import {
  GAME_VERSION,
  type CharacterChoice,
  type MatchSnapshot,
  type PlayerInput,
} from '@knockback/shared';

export interface RoomView {
  code: string;
  players: Array<{
    id: string;
    name: string;
    character: CharacterChoice;
    ready: boolean;
    connected: boolean;
  }>;
}
export class NetworkClient extends EventTarget {
  private socket: Socket | null = null;
  playerId = '';
  room: RoomView | null = null;
  snapshot: MatchSnapshot | null = null;
  private pingMs = 0;
  private missingSnapshots = 0;
  private lastSnapshotTick = 0;
  private snapshotBytes = 0;
  private pingTimer = 0;
  connect(url: string): Promise<void> {
    this.disconnect();
    this.socket = io(url, {
      timeout: 8000,
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 750,
      reconnectionDelayMax: 5000,
    });
    this.socket.on('connect', () => {
      this.emit('status', { connected: true });
      const token = sessionStorage.getItem('ka-reconnect-token');
      if (token) this.socket?.emit('session:reconnect', { token });
      window.clearInterval(this.pingTimer);
      const samplePing = () => {
        const started = performance.now();
        this.socket?.timeout(2500).emit('latency:ping', started, (error: unknown) => {
          if (!error) this.pingMs = Math.round(performance.now() - started);
        });
      };
      samplePing();
      this.pingTimer = window.setInterval(samplePing, 2000);
    });
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('MULTIPLAYER_WAKING')), 9000);
      this.socket!.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket!.once('connect_error', () => {
        clearTimeout(timer);
        reject(new Error('MULTIPLAYER_WAKING'));
      });
      this.socket!.on('server:hello', (data: { version: string }) => {
        if (data.version !== GAME_VERSION) this.emit('error', { code: 'VERSION_MISMATCH' });
      });
      this.socket!.on(
        'room:joined',
        (data: { playerId: string; reconnectToken: string; room: RoomView }) => {
          this.playerId = data.playerId;
          this.room = data.room;
          sessionStorage.setItem('ka-reconnect-token', data.reconnectToken);
          this.emit('joined', data);
        },
      );
      this.socket!.on('room:state', (room: RoomView) => {
        this.room = room;
        this.emit('room', room);
      });
      this.socket!.on('match:started', (data: unknown) => this.emit('match', data));
      this.socket!.on('snapshot', (snapshot: MatchSnapshot) => {
        if (this.lastSnapshotTick && snapshot.tick - this.lastSnapshotTick > 3)
          this.missingSnapshots += Math.floor((snapshot.tick - this.lastSnapshotTick) / 1.5) - 1;
        this.lastSnapshotTick = snapshot.tick;
        this.snapshotBytes = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
        this.snapshot = snapshot;
        this.emit('snapshot', snapshot);
      });
      this.socket!.on(
        'session:restored',
        (data: { playerId: string; room: RoomView; snapshot: MatchSnapshot }) => {
          this.playerId = data.playerId;
          this.room = data.room;
          this.snapshot = data.snapshot;
          this.emit('room', data.room);
          this.emit('snapshot', data.snapshot);
          this.emit('status', { connected: true, restored: true });
        },
      );
      this.socket!.on('server:error', (error: unknown) => this.emit('error', error));
      this.socket!.on('queue:state', (state: unknown) => this.emit('queue', state));
      this.socket!.on('disconnect', () => this.emit('status', { connected: false }));
    });
  }
  private emit(name: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }
  create(name: string, character: CharacterChoice): void {
    this.socket?.emit('room:create', { name, character });
  }
  join(code: string, name: string, character: CharacterChoice): void {
    this.socket?.emit('room:join', { code, name, character });
  }
  quickPlay(name: string, character: CharacterChoice): void {
    this.socket?.emit('queue:join', { name, character });
  }
  cancelQueue(): void {
    this.socket?.emit('queue:cancel');
  }
  ready(character: CharacterChoice): void {
    this.socket?.emit('room:ready', { ready: true, character });
  }
  sendInput(input: PlayerInput): void {
    this.socket?.emit('input', input);
  }
  rematch(): void {
    this.socket?.emit('match:rematch');
  }
  testRingOut(): void {
    this.socket?.emit('test:ring-out');
  }
  disconnect(): void {
    window.clearInterval(this.pingTimer);
    this.socket?.disconnect();
    this.socket = null;
  }
  get ping(): number {
    return this.socket?.connected ? this.pingMs : 0;
  }
  get telemetry(): { ping: number; missingSnapshots: number; snapshotBytes: number } {
    return {
      ping: this.ping,
      missingSnapshots: this.missingSnapshots,
      snapshotBytes: this.snapshotBytes,
    };
  }
}
