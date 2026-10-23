import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (path: string) => fileURLToPath(new URL(`../../packages/${path}`, import.meta.url));

export default defineConfig({
  resolve: {
    // Read the workspace packages from source, as tsconfig.json does, so tests need no build.
    alias: [
      { find: /^@ideamap\/db\/testing$/, replacement: src('db/src/test/harness.ts') },
      { find: /^@ideamap\/db$/, replacement: src('db/src/index.ts') },
      { find: /^@ideamap\/contracts$/, replacement: src('contracts/src/index.ts') },
      { find: /^@ideamap\/connectors$/, replacement: src('connectors/src/index.ts') },
    ],
  },
  test: {
    // Each DB test file migrates its own database; give slow CI runners room.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
