import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@ideamap/contracts': fileURLToPath(
        new URL('../../packages/contracts/src/index.ts', import.meta.url),
      ),
    },
  },
  // Sign-in and the API through the dev proxy, as the teacher app (F5).
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/auth': { target: 'http://localhost:3000', changeOrigin: false },
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
      '/events': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
});
