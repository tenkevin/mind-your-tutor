import { randomBytes } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import { createDb, type Db } from '../client.js';
import { migrateUp } from '../migrate.js';
import { APP_ROLE, CLASS_SETTING, ORG_SETTING } from '../migrations/helpers.js';
import type { Database } from '../schema.js';

// Test databases. DATABASE_URL names a server and a role that may create databases
// (the migration role; a superuser in CI). Each test file gets its own new database,
// migrated from empty, and drops it afterwards, so files can run in parallel.
//
// Without DATABASE_URL the database tests are skipped locally, and fail in CI.

export const adminUrl = process.env.DATABASE_URL;

if (!adminUrl && process.env.CI) {
  throw new Error('DATABASE_URL must be set in CI: the database tests may not be skipped.');
}

/** `describe` for database tests: skipped when there is no database to use. */
export const hasDatabase = Boolean(adminUrl);

function urlFor(database: string): string {
  const url = new URL(adminUrl!);
  url.pathname = `/${database}`;
  return url.toString();
}

export interface TestDatabase {
  name: string;
  url: string;
  db: Db;
  /** Milliseconds the migrations took. */
  migrateMs: number;
  drop(): Promise<void>;
}

/** A new, empty database. `migrate: false` leaves it unmigrated. */
export async function freshDatabase(options: { migrate?: boolean } = {}): Promise<TestDatabase> {
  const name = `ideamap_test_${randomBytes(6).toString('hex')}`;
  const admin = createDb(adminUrl!, { max: 1 });
  await sql`CREATE DATABASE ${sql.id(name)}`.execute(admin);
  await admin.destroy();

  const url = urlFor(name);
  const db = createDb(url, { max: 4 });
  let migrateMs = 0;
  const drop = async () => {
    await db.destroy();
    const again = createDb(adminUrl!, { max: 1 });
    await sql`DROP DATABASE IF EXISTS ${sql.id(name)} WITH (FORCE)`.execute(again);
    await again.destroy();
  };
  if (options.migrate !== false) {
    const started = performance.now();
    try {
      await migrateUp(db);
    } catch (error) {
      await drop();
      throw error;
    }
    migrateMs = performance.now() - started;
  }

  return { name, url, db, migrateMs, drop };
}

/**
 * Run `fn` as the app role, acting for `orgId` (or for no organization). This is
 * exactly what the API gets: SET ROLE drops the test connection's own privileges.
 */
export function asApp<T>(
  db: Db,
  orgId: string | null,
  fn: (trx: Transaction<Database>) => Promise<T>,
  classId: string | null = null,
): Promise<T> {
  return db.transaction().execute(async (trx) => {
    await sql`SET LOCAL ROLE ${sql.id(APP_ROLE)}`.execute(trx);
    if (orgId) await sql`SELECT set_config(${ORG_SETTING}, ${orgId}, true)`.execute(trx);
    if (classId) await sql`SELECT set_config(${CLASS_SETTING}, ${classId}, true)`.execute(trx);
    return fn(trx);
  });
}

/** The Postgres error code an operation fails with, or null if it succeeds. */
export async function errorCode(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : 'not-a-postgres-error';
  }
}

export const PG = {
  foreignKey: '23503',
  unique: '23505',
  check: '23514',
  notNull: '23502',
  insufficientPrivilege: '42501',
  rlsViolation: '42501',
} as const;
