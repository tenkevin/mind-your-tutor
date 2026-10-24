import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  // Test against workspace sources, as typecheck does (tsconfig.json customConditions).
  resolve: { conditions: ['@ideamap/source'] },
  ssr: { resolve: { conditions: ['@ideamap/source'] } },
  test: {
    // Database tests migrate their own database; give slow CI runners room.
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // Timing tests run in their own project, after the others and one file at a time,
    // so parallel test files don't skew what they measure.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          exclude: [...configDefaults.exclude, ...['src/**/*.perf.test.ts']],
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: 'perf',
          include: ['src/**/*.perf.test.ts'],
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
