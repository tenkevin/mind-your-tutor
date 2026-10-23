import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const page = (name: string) => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  plugins: [react()],
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
