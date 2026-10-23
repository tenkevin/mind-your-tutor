#!/usr/bin/env node
import { createDb, DirectoryExportStore } from '@ideamap/db';
import { runRetention } from './retention.js';

// pnpm --filter @ideamap/worker retention: run the retention job once, now.
// DATABASE_URL is a login that is a member of ideamap_retention. EXPORT_DIR, if set,
// is the export store directory whose expired files are removed too.

const USAGE = 'usage: ideamap-worker retention';

async function main(command: string | undefined): Promise<void> {
  if (command !== 'retention') {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL must be set');
  const db = createDb(url);
  const controller = new AbortController();
  // Stop after the current batch on Ctrl-C or a shutdown; a rerun carries on.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => controller.abort());
  }
  const started = performance.now();
  try {
    const result = await runRetention(db, {
      store: process.env.EXPORT_DIR ? new DirectoryExportStore(process.env.EXPORT_DIR) : undefined,
      signal: controller.signal,
    });
    console.log(JSON.stringify(result));
    console.log(`done in ${Math.round(performance.now() - started)} ms`);
    if (result.aborted) process.exitCode = 130;
  } finally {
    await db.destroy();
  }
}

main(process.argv[2]).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
