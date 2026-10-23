// Fails if a package's dist/ contains compiled test files (*.test.*).
// Used by packages/tracker's build: a test file is exempt from the tracker's
// determinism lint, so it must never ship as production code (ARCHITECTURE.md §8).
// Usage: node scripts/check-dist-tests.mjs <dist dir>
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/check-dist-tests.mjs <dist dir>');
  process.exit(2);
}
const found = readdirSync(dir, { recursive: true }).filter((f) => /\.test\./.test(String(f)));
if (found.length > 0) {
  console.error(
    `${dir} contains test files, so a test file is being imported by non-test code:\n` +
      found.map((f) => `  ${join(dir, String(f))}`).join('\n') +
      '\nTest files are exempt from the tracker determinism rules and must not ship. ' +
      'See ARCHITECTURE.md §8.',
  );
  process.exit(1);
}
