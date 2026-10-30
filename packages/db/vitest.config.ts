import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Read the contracts from source, as tsconfig.json does, so tests need no build.
    alias: {
      '@ideamap/contracts': fileURLToPath(new URL('../contracts/src/index.ts', import.meta.url)),
    },
  },
  test: {
    // Timing tests assert latency budgets, so test files never share the CPU (F1e).
    fileParallelism: false,
    // Each DB test file migrates its own database; give slow CI runners room.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
