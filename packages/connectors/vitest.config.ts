import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Test against workspace sources, as typecheck does (tsconfig.json customConditions).
  resolve: { conditions: ['@ideamap/source'] },
  ssr: { resolve: { conditions: ['@ideamap/source'] } },
  test: {
    // Timing tests assert latency budgets, so test files never share the CPU (F1e).
    fileParallelism: false,
  },
});
