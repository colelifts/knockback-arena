import type { GameSettings } from '../../settings.js';
export class AudioSystem {
  private context: AudioContext | null = null;
  constructor(private readonly settings: GameSettings) {}
  unlock(): void {
    try {
      this.context ??= new AudioContext();
      void this.context.resume();
    } catch {
      /* audio is optional */
    }
  }
  play(kind: 'jump' | 'punch' | 'hit' | 'dodge' | 'meteor' | 'countdown' | 'win'): void {
    if (!this.context || this.settings.masterVolume <= 0) return;
    const frequencies = {
      jump: 420,
      punch: 150,
      hit: 75,
      dodge: 260,
      meteor: 55,
      countdown: 600,
      win: 880,
    };
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = kind === 'hit' || kind === 'meteor' ? 'sawtooth' : 'sine';
    oscillator.frequency.value = frequencies[kind];
    gain.gain.setValueAtTime(0.0001, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.12 * this.settings.masterVolume * this.settings.effectsVolume,
      this.context.currentTime + 0.012,
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      this.context.currentTime + (kind === 'meteor' ? 0.65 : 0.18),
    );
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start();
    oscillator.stop(this.context.currentTime + (kind === 'meteor' ? 0.7 : 0.2));
  }
}
