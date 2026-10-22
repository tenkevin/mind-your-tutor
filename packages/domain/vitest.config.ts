import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Test against workspace sources, as typecheck does (tsconfig.json customConditions).
  resolve: { conditions: ['@ideamap/source'] },
  ssr: { resolve: { conditions: ['@ideamap/source'] } },
});
