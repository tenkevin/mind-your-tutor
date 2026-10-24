import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Read the contracts from source, as tsconfig.json does, so tests need no build.
    alias: {
      '@ideamap/contracts': fileURLToPath(new URL('../contracts/src/index.ts', import.meta.url)),
    },
  },
  test: {
    // Each DB test file migrates its own database; give slow CI runners room.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Timing tests run in their own project, after the others and one file at a time,
    // so parallel test files don't skew what they measure.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          exclude: [
            ...configDefaults.exclude,
            ...['src/**/*.perf.test.ts', 'src/performance.test.ts'],
          ],
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: 'perf',
          include: ['src/**/*.perf.test.ts', 'src/performance.test.ts'],
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
