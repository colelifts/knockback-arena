import { z } from 'zod';
import { GAME_VERSION } from './constants.js';

export const characterSchema = z.enum(['boy', 'girl']);
export const difficultySchema = z.enum(['easy', 'normal', 'hard']);
export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{5}$/);
export const playerInputSchema = z.object({
  sequence: z.number().int().nonnegative(),
  clientTime: z.number().finite(),
  moveX: z.number().min(-1).max(1),
  moveZ: z.number().min(-1).max(1),
  facingX: z.number().min(-1).max(1),
  facingZ: z.number().min(-1).max(1),
  jump: z.boolean(),
  dodge: z.boolean(),
  punch: z.boolean(),
  brace: z.boolean(),
});
export const helloSchema = z.object({
  version: z.literal(GAME_VERSION),
  reconnectToken: z.string().max(128).optional(),
});
export const guestNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9 _-]+$/);
export const createRoomSchema = z.object({ name: guestNameSchema, character: characterSchema });
export const joinRoomSchema = createRoomSchema.extend({ code: roomCodeSchema });
export const readySchema = z.object({ ready: z.boolean(), character: characterSchema });
