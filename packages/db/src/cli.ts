#!/usr/bin/env node
import { Kysely, PostgresDialect } from 'kysely';
import { createPool } from './client.js';
import { migrateDown, migrateDownAll, migrateUp, migrator, resetDatabase } from './migrate.js';

// pnpm db:migrate | db:down | db:reset | db:status. Connects to DATABASE_URL as the
// migration role, never as the app role.

const USAGE = 'usage: ideamap-db <up|down|down-all|reset|status>';

/** The docker compose database from `pnpm db:up`; local development only. */
const LOCAL_URL = 'postgres://postgres:postgres@localhost:5433/ideamap';

async function main(command: string | undefined): Promise<void> {
  const url = process.env.DATABASE_URL ?? LOCAL_URL;
  const db = new Kysely<unknown>({ dialect: new PostgresDialect({ pool: createPool(url) }) });
  const started = performance.now();
  try {
    switch (command) {
      case 'up':
        report(await migrateUp(db));
        break;
      case 'down':
        report(await migrateDown(db));
        break;
      case 'down-all':
        report(await migrateDownAll(db));
        break;
      case 'reset':
        report(await resetDatabase(db));
        break;
      case 'status':
        for (const m of await migrator(db).getMigrations()) {
          console.log(`${m.executedAt ? 'applied' : 'pending'}  ${m.name}`);
        }
        break;
      default:
        console.error(USAGE);
        process.exitCode = 2;
        return;
    }
    console.log(`done in ${Math.round(performance.now() - started)} ms`);
  } finally {
    await db.destroy();
  }
}

function report(result: Awaited<ReturnType<typeof migrateUp>>): void {
  const results = result.results ?? [];
  if (results.length === 0) console.log('nothing to do');
  for (const r of results)
    console.log(`${r.direction === 'Up' ? 'up  ' : 'down'}  ${r.migrationName}`);
}

main(process.argv[2]).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
