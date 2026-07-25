import 'dotenv/config';
import { createGameServer } from './app.js';

const server = createGameServer();
await server.start();

const shutdown = async () => {
  await server.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
