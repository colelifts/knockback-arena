import RAPIER from '@dimforge/rapier3d-compat';
import type { CharacterChoice, MatchSnapshot, PlayerInput } from '@knockback/shared';
import { loadSettings, saveSettings } from '../settings.js';
import { GameEngine } from '../game/core/GameEngine.js';
import { NetworkClient, type RoomView } from '../game/networking/NetworkClient.js';
import { GameUI } from '../ui/GameUI.js';
import type { BotDifficulty } from '../game/bot/BotController.js';

declare global {
  interface Window {
    __KA_TEST__?: {
      startBot: () => void;
      state: () => ReturnType<GameEngine['getTestState']>;
      key: (code: string, down: boolean) => void;
      punch: () => void;
    };
  }
}
export class GameApp {
  private settings = loadSettings();
  private engine!: GameEngine;
  private ui!: GameUI;
  private network = new NetworkClient();
  private mode: 'menu' | 'bot' | 'online' = 'menu';
  private lastCharacter: CharacterChoice = 'boy';
  private lastDifficulty: BotDifficulty = 'normal';
  async start(): Promise<void> {
    await RAPIER.init();
    this.ui = new GameUI(this.settings, {
      startBot: (character, difficulty) => this.startBot(character, difficulty),
      openOnline: () => void this.openOnline(),
      createRoom: (name, character) => this.createRoom(name, character),
      joinRoom: (code, name, character) => this.joinRoom(code, name, character),
      quickPlay: (name, character) => this.quickPlay(name, character),
      ready: (character) => this.network.ready(character),
      resume: () => this.resume(),
      leave: () => this.leave(),
      rematch: () => this.rematch(),
      settingsChanged: () => saveSettings(this.settings),
    });
    this.engine = new GameEngine(this.settings, {
      pause: () => this.pause(),
      event: (event, data) => this.onGameEvent(event, data),
      hud: (a, b, countdown, collapse, warning) =>
        this.ui.updateHud(
          a,
          b,
          countdown,
          collapse,
          warning,
          this.mode === 'online' ? this.network.ping : undefined,
        ),
      sendInput: (input: PlayerInput) => this.network.sendInput(input),
    });
    this.bindNetwork();
    window.__KA_TEST__ = {
      startBot: () => this.startBot('boy', 'normal'),
      state: () => this.engine.getTestState(),
      key: (code, down) => this.engine.testKey(code, down),
      punch: () => this.engine.testPunch(),
    };
  }
  private bindNetwork(): void {
    this.network.addEventListener('joined', (event) => {
      const detail = (event as CustomEvent<{ room: RoomView }>).detail;
      this.ui.showLobby(
        detail.room.code,
        detail.room.players,
        () =>
          void navigator.clipboard
            .writeText(detail.room.code)
            .then(() => this.ui.notify('Room code copied.')),
      );
    });
    this.network.addEventListener('room', (event) => {
      const room = (event as CustomEvent<RoomView>).detail;
      this.ui.showLobby(
        room.code,
        room.players,
        () =>
          void navigator.clipboard
            .writeText(room.code)
            .then(() => this.ui.notify('Room code copied.')),
      );
    });
    this.network.addEventListener('match', (event) => {
      const seed = (event as CustomEvent<{ seed: number }>).detail.seed;
      this.mode = 'online';
      this.ui.startHud();
      this.engine.startOnline(seed, this.network.playerId);
    });
    this.network.addEventListener('snapshot', (event) =>
      this.engine.applySnapshot((event as CustomEvent<MatchSnapshot>).detail),
    );
    this.network.addEventListener('error', (event) => {
      const error = (event as CustomEvent<{ code?: string }>).detail;
      this.ui.notify(this.errorMessage(error.code ?? 'SERVER_ERROR'));
    });
    this.network.addEventListener('queue', (event) => {
      const state = (event as CustomEvent<{ searching: boolean }>).detail;
      if (state.searching)
        this.ui.showSearching(() => {
          this.network.cancelQueue();
          this.ui.showOnline('Server online');
        });
    });
  }
  private async ensureNetwork(): Promise<boolean> {
    try {
      await this.network.connect(import.meta.env.VITE_GAME_SERVER_URL || 'http://localhost:3001');
      return true;
    } catch {
      this.ui.showOnline('Waking multiplayer server…');
      this.ui.notify('Multiplayer is waking up or unavailable. Bot Mode still works.');
      return false;
    }
  }
  private async openOnline(): Promise<void> {
    this.ui.showCharacterSelect('online');
    await this.ensureNetwork();
  }
  private async createRoom(name: string, character: CharacterChoice): Promise<void> {
    if (await this.ensureNetwork()) this.network.create(name, character);
  }
  private async joinRoom(code: string, name: string, character: CharacterChoice): Promise<void> {
    if (await this.ensureNetwork()) this.network.join(code, name, character);
  }
  private async quickPlay(name: string, character: CharacterChoice): Promise<void> {
    if (await this.ensureNetwork()) this.network.quickPlay(name, character);
  }
  private startBot(character: CharacterChoice, difficulty: BotDifficulty): void {
    this.mode = 'bot';
    this.lastCharacter = character;
    this.lastDifficulty = difficulty;
    this.ui.startHud();
    this.engine.startBot(character, difficulty);
  }
  private pause(): void {
    if (this.mode === 'menu') return;
    this.engine.setPaused(true);
    this.ui.showPause(this.mode === 'online');
  }
  private resume(): void {
    this.engine.setPaused(false);
    this.ui.startHud();
  }
  private leave(): void {
    this.network.disconnect();
    this.engine.stop();
    this.mode = 'menu';
    this.ui.showMain();
  }
  private rematch(): void {
    if (this.mode === 'online') this.network.rematch();
    else {
      this.engine.rematchBot();
      this.ui.startHud();
    }
  }
  private onGameEvent(event: string, data?: unknown): void {
    if (event === 'matchOver') {
      const won = Boolean((data as { won?: boolean } | undefined)?.won);
      this.engine.setPaused(true);
      this.ui.showMatchOver(won);
    }
    if (event === 'collapse') this.ui.notify('The outer ring has fallen!');
    if (event === 'go') this.ui.notify('GO!');
  }
  private errorMessage(code: string): string {
    return (
      (
        {
          ROOM_NOT_FOUND: 'That room no longer exists.',
          ROOM_FULL: 'That room is already full.',
          INVALID_ROOM_CODE: 'Enter a valid five-character room code.',
          RECONNECT_EXPIRED: 'The reconnect window expired.',
          VERSION_MISMATCH: 'Client and server versions do not match. Refresh the page.',
          RATE_LIMITED: 'Too many requests. Please wait a moment.',
        } as Record<string, string>
      )[code] ?? 'Multiplayer request failed. Try again or play Bot Mode.'
    );
  }
}
