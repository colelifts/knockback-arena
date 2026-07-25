import type { GameSettings } from '../../settings.js';

type Sound =
  | 'jump'
  | 'punch'
  | 'hit'
  | 'dodge'
  | 'meteor'
  | 'collapse'
  | 'countdown'
  | 'go'
  | 'launch'
  | 'win'
  | 'footstep'
  | 'ui';

const files: Record<Sound, string[]> = {
  jump: ['/assets/audio/sfx/jump.ogg'],
  punch: ['/assets/audio/sfx/punch-whoosh.ogg'],
  hit: ['/assets/audio/sfx/hit-heavy-1.ogg', '/assets/audio/sfx/hit-heavy-2.ogg'],
  dodge: ['/assets/audio/sfx/dodge.ogg'],
  meteor: ['/assets/audio/sfx/meteor-impact.ogg'],
  collapse: ['/assets/audio/sfx/ring-collapse.ogg'],
  countdown: ['/assets/audio/sfx/countdown.ogg'],
  go: ['/assets/audio/sfx/go.ogg'],
  launch: ['/assets/audio/sfx/bouncer.ogg'],
  win: ['/assets/audio/sfx/victory.ogg'],
  footstep: [
    '/assets/audio/sfx/footstep-1.ogg',
    '/assets/audio/sfx/footstep-2.ogg',
    '/assets/audio/sfx/footstep-3.ogg',
  ],
  ui: ['/assets/audio/sfx/ui-select.ogg'],
};

export class AudioSystem {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly loadingBuffers = new Map<string, Promise<AudioBuffer | null>>();
  private music: HTMLAudioElement | null = null;
  private musicSource: MediaElementAudioSourceNode | null = null;

  constructor(private readonly settings: GameSettings) {}

  unlock(): void {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.sfxBus = this.context.createGain();
      this.musicBus = this.context.createGain();
      this.ambienceBus = this.context.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      this.ambienceBus.connect(this.master);
      this.master.connect(this.context.destination);
      void this.loadAll();
    }
    this.updateBusVolumes();
    if (this.context.state === 'suspended') void this.context.resume();
  }

  private async loadAll(): Promise<void> {
    const unique = [...new Set(Object.values(files).flat())];
    await Promise.all(unique.map((url) => this.loadBuffer(url)));
  }

  private loadBuffer(url: string): Promise<AudioBuffer | null> {
    const existing = this.buffers.get(url);
    if (existing) return Promise.resolve(existing);
    const pending = this.loadingBuffers.get(url);
    if (pending) return pending;
    const request = (async () => {
      if (!this.context) return null;
      const response = await fetch(url);
      if (!response.ok) return null;
      const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
      this.buffers.set(url, buffer);
      return buffer;
    })().finally(() => this.loadingBuffers.delete(url));
    this.loadingBuffers.set(url, request);
    return request;
  }

  private updateBusVolumes(): void {
    if (!this.context || !this.master || !this.sfxBus || !this.musicBus || !this.ambienceBus)
      return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.settings.masterVolume, now, 0.02);
    this.sfxBus.gain.setTargetAtTime(this.settings.effectsVolume, now, 0.02);
    this.musicBus.gain.setTargetAtTime(this.settings.musicVolume * 0.42, now, 0.08);
    this.ambienceBus.gain.setTargetAtTime(this.settings.musicVolume * 0.12, now, 0.08);
  }

  async play(
    sound: Sound,
    position?: { x: number; z: number },
    listener?: { x: number; z: number },
  ): Promise<void> {
    this.unlock();
    if (!this.context || !this.sfxBus) return;
    const choices = files[sound];
    const url = choices[Math.floor(Math.random() * choices.length)]!;
    const buffer = this.buffers.get(url) ?? (await this.loadBuffer(url));
    if (!buffer) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = sound === 'footstep' ? 0.96 + Math.random() * 0.08 : 1;
    let output: AudioNode = gain;
    if (position && listener) {
      const dx = position.x - listener.x;
      const dz = position.z - listener.z;
      const distance = Math.hypot(dx, dz);
      gain.gain.value = 1 / (1 + Math.max(0, distance - 2) * 0.12);
      const panner = this.context.createStereoPanner();
      panner.pan.value = Math.max(-0.75, Math.min(0.75, dx / 18));
      gain.connect(panner);
      output = panner;
    }
    output.connect(this.sfxBus);
    source.connect(gain);
    source.start();
  }

  startArenaMusic(): void {
    this.startMusic('/assets/audio/music/arena-plains');
  }

  startMenuMusic(): void {
    this.startMusic('/assets/audio/music/menu-upbeat');
  }

  private startMusic(basePath: string): void {
    this.unlock();
    if (!this.context || !this.musicBus) return;
    const supportsOgg = document.createElement('audio').canPlayType('audio/ogg') !== '';
    const desired = `${basePath}.${supportsOgg || basePath.endsWith('menu-upbeat') ? 'ogg' : 'mp3'}`;
    if (!this.music) {
      this.music = new Audio(desired);
      this.music.loop = true;
      this.music.preload = 'auto';
      this.musicSource = this.context.createMediaElementSource(this.music);
      this.musicSource.connect(this.musicBus);
    } else if (!this.music.src.endsWith(desired)) {
      this.music.src = desired;
      this.music.load();
    }
    void this.music.play().catch(() => undefined);
  }

  stopMusic(): void {
    this.music?.pause();
  }
}
