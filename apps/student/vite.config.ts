import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const page = (name: string) => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@ideamap/ai/device',
        replacement: page('../../packages/ai/src/device-recognizer.ts'),
      },
      { find: '@ideamap/ai/anonymise', replacement: page('../../packages/ai/src/anonymise.ts') },
      { find: '@ideamap/contracts', replacement: page('../../packages/contracts/src/index.ts') },
      // The bare package only; '@ideamap/ui/styles.css' still resolves through its exports.
      { find: /^@ideamap\/ui$/, replacement: page('../../packages/ui/src/index.ts') },
    ],
  },
  // Sign-in and the API through the dev proxy, as the teacher app (F5).
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/auth': { target: 'http://localhost:3000', changeOrigin: false },
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
    },
  },
  build: {
    rolldownOptions: {
      // udl-reference.html shows every S5 UDL component, for QA and visual checks.
      input: { main: page('index.html'), udl: page('udl-reference.html') },
    },
  },
});
