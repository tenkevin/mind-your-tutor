import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Test against workspace sources, as typecheck does (tsconfig.json customConditions).
  resolve: { conditions: ['@ideamap/source'] },
  ssr: { resolve: { conditions: ['@ideamap/source'] } },
  test: {
    // Each DB test file migrates its own database; the retention scale test seeds 1M rows.
    testTimeout: 600_000,
    hookTimeout: 120_000,
  },
});
