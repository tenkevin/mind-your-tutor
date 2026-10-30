import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const page = (name: string) => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@ideamap/contracts', replacement: page('../../packages/contracts/src/index.ts') },
      // The bare package only; '@ideamap/ui/styles.css' still resolves through its exports.
      { find: /^@ideamap\/ui$/, replacement: page('../../packages/ui/src/index.ts') },
    ],
  },
  // Sign-in and the API are served from this origin through the dev proxy, so the
  // session cookie stays host-only and same-site (F5). `pnpm dev:auth` runs the API.
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/auth': { target: 'http://localhost:3000', changeOrigin: false },
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
  build: {
    rolldownOptions: {
      // reference.html renders every @ideamap/ui class, for QA and visual checks.
      input: { main: page('index.html'), reference: page('reference.html') },
      // Both pages share @ideamap/ui; name its chunk (and so its CSS) ui-*.
      output: {
        codeSplitting: {
          groups: [{ name: 'ui', test: /[\\/]packages[\\/]ui[\\/]/ }],
        },
      },
    },
  },
});
