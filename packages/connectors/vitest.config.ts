import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Test against workspace packages' source, so tests need no build first.
    alias: {
      '@ideamap/contracts': fileURLToPath(new URL('../contracts/src/index.ts', import.meta.url)),
    },
  },
});
