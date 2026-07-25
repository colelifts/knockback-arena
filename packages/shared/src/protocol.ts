import type { z } from 'zod';
import type { characterSchema, playerInputSchema } from './schemas.js';

export type CharacterChoice = z.infer<typeof characterSchema>;
export type PlayerInput = z.infer<typeof playerInputSchema>;
export interface PlayerSnapshot {
  id: string;
  name: string;
  character: CharacterChoice;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  facing: { x: number; z: number };
  grounded: boolean;
  action:
    | 'idle'
    | 'run'
    | 'jump'
    | 'punch'
    | 'dodge'
    | 'brace'
    | 'hit'
    | 'stunned'
    | 'launched'
    | 'fall'
    | 'victory'
    | 'defeat';
  score: number;
  lastProcessedInput: number;
  stunnedUntilTick: number;
  counterReady: boolean;
}
export interface MeteorState {
  id: number;
  x: number;
  z: number;
  warningTick: number;
  impactTick: number;
}
export interface MatchSnapshot {
  roomCode: string;
  seed: number;
  tick: number;
  phase: 'countdown' | 'playing' | 'roundOver' | 'matchOver';
  countdown: number;
  collapsedRings: number;
  warningRing: number | null;
  nextCollapseTick: number;
  players: PlayerSnapshot[];
  meteors: MeteorState[];
}
