import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Test against workspace sources, as typecheck does (tsconfig.json customConditions).
  resolve: { conditions: ['@ideamap/source'] },
  ssr: { resolve: { conditions: ['@ideamap/source'] } },
  test: {
    // Database tests migrate their own database; give slow CI runners room.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
