import { sql, type Kysely } from 'kysely';
import { getConstructionPlans } from 'pg-boss';
import { APP_ROLE } from './helpers.js';

// The pg-boss job queue (ARCHITECTURE.md §3), in its own `pgboss` schema.
//
// pg-boss ships the SQL that builds its schema. It wraps that SQL in BEGIN/COMMIT;
// this migration already runs inside the migrator's transaction, so the wrapper is
// taken off. pg-boss is pinned to an exact version in package.json: this migration
// builds that version's schema. Upgrading pg-boss means a new migration that runs
// `getMigrationPlans` (workers start pg-boss with `migrate: false`).
//
// Queue tables are not tenant data and have no row-level security, so job payloads
// carry ids only, never student text or names.

const SCHEMA = 'pgboss';

export function constructionSql(): string {
  const plan = getConstructionPlans(SCHEMA).trim();
  const begin = /^BEGIN;/;
  const commit = /COMMIT;$/;
  if (!begin.test(plan) || !commit.test(plan)) {
    throw new Error('pg-boss construction SQL is no longer wrapped in BEGIN/COMMIT; review 0003.');
  }
  return plan.replace(begin, '').replace(commit, '');
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql.raw(constructionSql()).execute(db);

  const role = sql.id(APP_ROLE);
  const schema = sql.id(SCHEMA);
  await sql`GRANT USAGE ON SCHEMA ${schema} TO ${role}`.execute(db);
  await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`.execute(
    db,
  );
  await sql`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`.execute(db);
  await sql`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${schema} TO ${role}`.execute(db);
  // pg-boss adds a table per partitioned queue; queues are created by the migration
  // role, and the app role can use their tables.
  await sql`
    ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema}
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}
  `.execute(db);
  await sql`
    ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT USAGE, SELECT ON SEQUENCES TO ${role}
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const role = sql.id(APP_ROLE);
  const schema = sql.id(SCHEMA);
  await sql`
    ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema}
      REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM ${role}
  `.execute(db);
  await sql`
    ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} REVOKE USAGE, SELECT ON SEQUENCES FROM ${role}
  `.execute(db);
  await sql`DROP SCHEMA IF EXISTS ${schema} CASCADE`.execute(db);
}
