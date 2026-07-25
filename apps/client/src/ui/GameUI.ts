import type { CharacterChoice } from '@knockback/shared';
import type { BotDifficulty } from '../game/bot/BotController.js';
import type { GameSettings } from '../settings.js';

export interface UIActions {
  startBot: (character: CharacterChoice, difficulty: BotDifficulty) => void;
  openOnline: () => void;
  createRoom: (name: string, character: CharacterChoice) => void;
  joinRoom: (code: string, name: string, character: CharacterChoice) => void;
  quickPlay: (name: string, character: CharacterChoice) => void;
  ready: (character: CharacterChoice) => void;
  resume: () => void;
  leave: () => void;
  rematch: () => void;
  settingsChanged: () => void;
}

export class GameUI {
  readonly root: HTMLElement;
  readonly hud: HTMLElement;
  private screen: HTMLElement;
  private toast: HTMLElement;
  character: CharacterChoice = 'boy';
  difficulty: BotDifficulty = 'normal';
  constructor(
    private readonly settings: GameSettings,
    private readonly actions: UIActions,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'ui-root';
    this.screen = document.createElement('div');
    this.screen.className = 'screen-layer';
    this.hud = document.createElement('div');
    this.hud.className = 'hud hidden';
    this.toast = document.createElement('div');
    this.toast.className = 'toast hidden';
    this.root.append(this.screen, this.hud, this.toast);
    document.body.append(this.root);
    this.showMain();
  }
  showMain(): void {
    this.hud.classList.add('hidden');
    this.screen.classList.remove('hidden');
    this.screen.innerHTML = `<main class="menu main-menu"><div class="eyebrow">ORBITAL COMBAT LEAGUE</div><h1><span>KNOCKBACK</span><strong>ARENA</strong></h1><p class="tagline">One punch. No health bars. Don't fall.</p><div class="menu-actions"><button data-action="bot" class="primary"><small>SOLO</small> Play Against Bot</button><button data-action="online"><small>1V1</small> Online</button><button data-action="how">How to Play</button><button data-action="settings">Settings</button><button data-action="credits">Credits</button></div><div class="desktop-note">DESKTOP • KEYBOARD + MOUSE RECOMMENDED</div></main>`;
    this.bind('bot', () => this.showCharacterSelect('bot'));
    this.bind('online', this.actions.openOnline);
    this.bind('how', () => this.showHow());
    this.bind('settings', () => this.showSettings());
    this.bind('credits', () => this.showCredits());
  }
  showCharacterSelect(destination: 'bot' | 'online'): void {
    this.screen.innerHTML = `<main class="menu wide"><button class="back" data-action="back">← BACK</button><div class="eyebrow">CHOOSE YOUR FIGHTER</div><h2>Enter the arena</h2><div class="fighter-select"><button class="fighter-card ${this.character === 'boy' ? 'selected' : ''}" data-fighter="boy"><div class="portrait boy">♂</div><strong>VEX</strong><span>Blue comet</span></button><button class="fighter-card ${this.character === 'girl' ? 'selected' : ''}" data-fighter="girl"><div class="portrait girl">♀</div><strong>NOVA</strong><span>Coral cyclone</span></button></div>${destination === 'bot' ? `<label class="field">BOT DIFFICULTY<select id="difficulty"><option>Easy</option><option selected>Normal</option><option>Hard</option></select></label>` : ''}<button class="primary ready-button" data-action="continue">${destination === 'bot' ? 'START BOT MATCH' : 'CONTINUE ONLINE'}</button></main>`;
    this.screen.querySelectorAll<HTMLElement>('[data-fighter]').forEach((element) =>
      element.addEventListener('click', () => {
        this.character = element.dataset.fighter as CharacterChoice;
        this.showCharacterSelect(destination);
      }),
    );
    this.bind('back', () => (destination === 'bot' ? this.showMain() : this.showOnline()));
    this.bind('continue', () => {
      if (destination === 'bot') {
        const select = this.screen.querySelector<HTMLSelectElement>('#difficulty');
        this.difficulty = (select?.value.toLowerCase() ?? 'normal') as BotDifficulty;
        this.actions.startBot(this.character, this.difficulty);
      } else this.showOnline();
    });
  }
  showOnline(status = 'Checking server…'): void {
    this.screen.classList.remove('hidden');
    this.screen.innerHTML = `<main class="menu online-menu"><button class="back" data-action="back">← BACK</button><div class="eyebrow">ONLINE 1V1</div><h2>Find a rival</h2><div class="server-status"><i></i><span>${status}</span></div><label class="field">GUEST NAME<input id="guestName" maxlength="20" value="Pilot ${Math.floor(100 + Math.random() * 900)}" /></label><button class="primary" data-action="quick">QUICK PLAY</button><button data-action="create">CREATE PRIVATE ROOM</button><div class="join-row"><input id="roomCode" maxlength="5" placeholder="ROOM CODE" aria-label="Room code" /><button data-action="join">JOIN</button></div><p class="fineprint">If the free server is sleeping, Bot Mode remains available.</p></main>`;
    this.bind('back', () => this.showMain());
    this.bind('quick', () => this.actions.quickPlay(this.name(), this.character));
    this.bind('create', () => this.actions.createRoom(this.name(), this.character));
    this.bind('join', () => {
      const field = this.screen.querySelector<HTMLInputElement>('#roomCode');
      const code = field?.value.trim().toUpperCase() ?? '';
      if (!/^[A-HJ-NP-Z2-9]{5}$/.test(code)) {
        this.notify('Enter a valid 5-character room code.');
        field?.classList.add('invalid');
        return;
      }
      this.actions.joinRoom(code, this.name(), this.character);
    });
  }
  private name(): string {
    return this.screen.querySelector<HTMLInputElement>('#guestName')?.value.trim() || 'Guest Pilot';
  }
  showSearching(cancel: () => void): void {
    this.screen.innerHTML = `<main class="menu"><div class="search-orbit"></div><div class="eyebrow">QUICK PLAY</div><h2>Searching for a rival…</h2><p>The arena server may need a moment to wake.</p><button data-action="cancel">CANCEL</button></main>`;
    this.bind('cancel', cancel);
  }
  showLobby(
    code: string,
    players: Array<{ name: string; ready: boolean }>,
    onCopy: () => void,
  ): void {
    this.screen.innerHTML = `<main class="menu lobby"><button class="back" data-action="leave">← LEAVE</button><div class="eyebrow">PRIVATE ARENA</div><h2>Room <button class="room-code" data-action="copy">${code} ⧉</button></h2><div class="lobby-slots">${players.map((player) => `<div><i class="${player.ready ? 'ready' : ''}"></i><strong>${this.escape(player.name)}</strong><span>${player.ready ? 'READY' : 'CHOOSING'}</span></div>`).join('')} ${players.length < 2 ? '<div class="waiting"><i></i><strong>Waiting for rival</strong><span>SHARE THE CODE</span></div>' : ''}</div><button class="primary" data-action="ready">READY UP</button></main>`;
    this.bind('leave', this.actions.leave);
    this.bind('copy', onCopy);
    this.bind('ready', () => this.actions.ready(this.character));
  }
  startHud(): void {
    this.screen.classList.add('hidden');
    this.hud.classList.remove('hidden');
    this.hud.innerHTML = `<div class="score"><div><span>YOU</span><strong id="scoreA">0</strong></div><b>FIRST TO 3</b><div><strong id="scoreB">0</strong><span>RIVAL</span></div></div><div id="warning" class="warning hidden"></div><div id="countdown" class="countdown"></div><div class="connection"><i></i><span id="ping">BOT MODE</span></div><div class="controls-hint"><kbd>WASD</kbd> MOVE <kbd>SPACE</kbd> JUMP <kbd>SHIFT</kbd> DODGE <kbd>LMB</kbd> PUNCH</div>`;
  }
  updateHud(
    a: number,
    b: number,
    countdown: number,
    collapseSeconds: number,
    warning: string,
    ping?: number,
  ): void {
    this.setText('scoreA', a);
    this.setText('scoreB', b);
    const countdownElement = this.hud.querySelector('#countdown');
    if (countdownElement)
      countdownElement.textContent =
        countdown > 0 ? (countdown < 0.5 ? 'GO!' : String(Math.ceil(countdown))) : '';
    const warningElement = this.hud.querySelector('#warning');
    if (warningElement) {
      warningElement.textContent =
        warning || `OUTER RING FALLS IN ${Math.max(0, Math.ceil(collapseSeconds))}`;
      warningElement.classList.toggle('danger', Boolean(warning));
      warningElement.classList.toggle('hidden', collapseSeconds > 12 && !warning);
    }
    if (ping !== undefined) this.setText('ping', `${ping} MS`);
  }
  showPause(online: boolean): void {
    if (document.pointerLockElement) document.exitPointerLock();
    this.screen.classList.remove('hidden');
    this.screen.innerHTML = `<main class="menu pause"><div class="eyebrow">MATCH PAUSED</div><h2>Take a breath</h2><button class="primary" data-action="resume">RESUME</button><button data-action="settings">SETTINGS</button>${online ? '<button data-action="leave">LEAVE ONLINE MATCH</button>' : '<button data-action="rematch">RESTART BOT MATCH</button>'}<button data-action="main">MAIN MENU</button></main>`;
    this.bind('resume', this.actions.resume);
    this.bind('settings', () => this.showSettings(() => this.showPause(online)));
    this.bind('leave', this.actions.leave);
    this.bind('rematch', this.actions.rematch);
    this.bind('main', this.actions.leave);
  }
  showMatchOver(won: boolean): void {
    this.screen.classList.remove('hidden');
    this.screen.innerHTML = `<main class="menu result"><div class="result-burst">${won ? '★' : '✦'}</div><div class="eyebrow">MATCH COMPLETE</div><h2>${won ? 'Arena Champion!' : 'Lost to the void'}</h2><button class="primary" data-action="rematch">REMATCH</button><button data-action="main">MAIN MENU</button></main>`;
    this.bind('rematch', this.actions.rematch);
    this.bind('main', this.actions.leave);
  }
  showSettings(back: () => void = () => this.showMain()): void {
    this.screen.classList.remove('hidden');
    this.screen.innerHTML = `<main class="menu settings"><button class="back" data-action="back">← BACK</button><div class="eyebrow">SETTINGS</div><h2>Tune your rig</h2>${this.range('Master volume', 'masterVolume', this.settings.masterVolume)}${this.range('Effects volume', 'effectsVolume', this.settings.effectsVolume)}${this.range('Music volume', 'musicVolume', this.settings.musicVolume)}${this.range('Mouse sensitivity', 'mouseSensitivity', this.settings.mouseSensitivity, 0.15, 1.5)}${this.range('Camera shake', 'cameraShake', this.settings.cameraShake)}<label class="toggle"><input data-setting="invertY" type="checkbox" ${this.settings.invertY ? 'checked' : ''}/> INVERT Y</label><label class="toggle"><input data-setting="reducedMotion" type="checkbox" ${this.settings.reducedMotion ? 'checked' : ''}/> REDUCED MOTION</label><label class="toggle"><input data-setting="showFps" type="checkbox" ${this.settings.showFps ? 'checked' : ''}/> SHOW FPS</label><label class="field">GRAPHICS<select data-setting="quality"><option>low</option><option>medium</option><option>high</option></select></label><button data-action="reset">RESET DEFAULTS</button></main>`;
    const quality = this.screen.querySelector<HTMLSelectElement>('[data-setting="quality"]');
    if (quality) quality.value = this.settings.quality;
    this.screen
      .querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-setting]')
      .forEach((control) =>
        control.addEventListener('input', () => {
          const key = control.dataset.setting as keyof GameSettings;
          if (control instanceof HTMLInputElement && control.type === 'checkbox')
            (this.settings[key] as boolean) = control.checked;
          else if (control instanceof HTMLInputElement)
            (this.settings[key] as number) = Number(control.value);
          else
            (this.settings[key] as GameSettings['quality']) =
              control.value as GameSettings['quality'];
          this.actions.settingsChanged();
        }),
      );
    this.bind('back', back);
    this.bind('reset', () => {
      localStorage.removeItem('knockback-arena-settings-v1');
      location.reload();
    });
  }
  private range(label: string, key: keyof GameSettings, value: number, min = 0, max = 1): string {
    return `<label class="range"><span>${label.toUpperCase()}</span><input data-setting="${key}" type="range" min="${min}" max="${max}" step="0.05" value="${value}" /></label>`;
  }
  private showHow(): void {
    this.screen.innerHTML = `<main class="menu wide"><button class="back" data-action="back">← BACK</button><div class="eyebrow">HOW TO PLAY</div><h2>Own the platform</h2><div class="how-grid"><div><kbd>W A S D</kbd><strong>MOVE</strong><p>Camera-relative, full 360° control.</p></div><div><kbd>MOUSE</kbd><strong>LOOK</strong><p>Free third-person camera. No lock-on.</p></div><div><kbd>LMB</kbd><strong>PUNCH</strong><p>One committed, three-tile strike.</p></div><div><kbd>SHIFT</kbd><strong>DODGE</strong><p>Brief evasive burst with a cooldown.</p></div><div><kbd>SPACE</kbd><strong>JUMP</strong><p>Take high ground and escape hazards.</p></div><div><b>3</b><strong>WIN ROUNDS</strong><p>Knock your rival into the void.</p></div></div></main>`;
    this.bind('back', () => this.showMain());
  }
  private showCredits(): void {
    this.screen.innerHTML = `<main class="menu"><button class="back" data-action="back">← BACK</button><div class="eyebrow">CREDITS</div><h2>Built for the void</h2><p>Original procedural art, code-generated audio, Three.js, Rapier, Socket.IO, and a stubborn refusal to add health bars.</p><p class="fineprint">See ATTRIBUTIONS.md for open-source licenses.</p></main>`;
    this.bind('back', () => this.showMain());
  }
  notify(message: string): void {
    this.toast.textContent = message;
    this.toast.classList.remove('hidden');
    window.setTimeout(() => this.toast.classList.add('hidden'), 3200);
  }
  private setText(id: string, value: string | number): void {
    const element = this.hud.querySelector(`#${id}`);
    if (element) element.textContent = String(value);
  }
  private bind(action: string, callback: () => void): void {
    this.screen
      .querySelector<HTMLElement>(`[data-action="${action}"]`)
      ?.addEventListener('click', callback);
  }
  private escape(value: string): string {
    const span = document.createElement('span');
    span.textContent = value;
    return span.innerHTML;
  }
}
