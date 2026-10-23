import { sql, type Kysely } from 'kysely';
import { Migrator, NO_MIGRATIONS, type MigrationResultSet } from 'kysely/migration';
import { migrations } from './migrations/index.js';

// Kysely's migrator runs pending migrations in one transaction, holding a lock so two
// deploys can't migrate at once. Its bookkeeping tables live in the `public` schema
// and the app role has no access to them.

/** Migrations work on any Kysely instance, whatever its table types. */
function untyped<DB>(db: Kysely<DB>): Kysely<unknown> {
  return db as unknown as Kysely<unknown>;
}

export function migrator<DB>(db: Kysely<DB>): Migrator {
  return new Migrator({ db: untyped(db), provider: { getMigrations: async () => migrations } });
}

function check(result: MigrationResultSet): MigrationResultSet {
  if (result.error) {
    const failed = result.results?.find((r) => r.status === 'Error');
    const where = failed ? ` (${failed.migrationName})` : '';
    throw new Error(`Migration failed${where}: ${String(result.error)}`, { cause: result.error });
  }
  return result;
}

export async function migrateUp<DB>(db: Kysely<DB>): Promise<MigrationResultSet> {
  return check(await migrator(db).migrateToLatest());
}

/** Undo the most recent migration. */
export async function migrateDown<DB>(db: Kysely<DB>): Promise<MigrationResultSet> {
  return check(await migrator(db).migrateDown());
}

/** Undo every migration. */
export async function migrateDownAll<DB>(db: Kysely<DB>): Promise<MigrationResultSet> {
  return check(await migrator(db).migrateTo(NO_MIGRATIONS));
}

/**
 * Drop everything the migrations made and migrate again: a clean database for tests
 * and local work. Drops schemas rather than running every `down`, so it works even
 * from a half-migrated state. The app role is cluster-wide and is left in place.
 */
export async function resetDatabase<DB>(db: Kysely<DB>): Promise<MigrationResultSet> {
  await sql`DROP SCHEMA IF EXISTS pgboss CASCADE`.execute(untyped(db));
  await sql`DROP SCHEMA IF EXISTS app CASCADE`.execute(untyped(db));
  await sql`DROP SCHEMA IF EXISTS public CASCADE`.execute(untyped(db));
  await sql`CREATE SCHEMA public`.execute(untyped(db));
  return migrateUp(db);
}
