import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)) },
  },
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          physics: ['@dimforge/rapier3d-compat'],
          network: ['socket.io-client'],
        },
      },
    },
  },
});
