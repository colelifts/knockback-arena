import { z } from 'zod';

const environmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ALLOWED_ORIGINS: z
    .string()
    .default(
      'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173',
    ),
  GAME_TICK_RATE: z.coerce.number().int().min(10).max(60).default(30),
  SNAPSHOT_RATE: z.coerce.number().int().min(5).max(30).default(20),
  ROOM_RECONNECT_SECONDS: z.coerce.number().int().min(5).max(120).default(15),
  ROOM_IDLE_MINUTES: z.coerce.number().int().min(1).max(120).default(10),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type ServerConfig = ReturnType<typeof readConfig>;
export const readConfig = (source: NodeJS.ProcessEnv = process.env) => {
  const parsed = environmentSchema.parse(source);
  return {
    ...parsed,
    allowedOrigins: parsed.ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
};
