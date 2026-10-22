import { defineConfig } from 'vitest/config';

// Read workspace packages from source, so tests don't need a build.
export default defineConfig({
  resolve: { conditions: ['@ideamap/source'] },
  ssr: { resolve: { conditions: ['@ideamap/source'] } },
});
