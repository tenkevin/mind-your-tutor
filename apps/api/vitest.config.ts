import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  // Test against workspace sources, as typecheck does (tsconfig.json customConditions).
  resolve: { conditions: ['@ideamap/source'] },
  ssr: { resolve: { conditions: ['@ideamap/source'] } },
  test: {
    // The default reporter hides a passing test's console output; the M2-P1 timing
    // summary and timeline are for the CI log, so CI uses the verbose reporter.
    reporters: process.env.CI ? ['verbose'] : ['default'],
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
