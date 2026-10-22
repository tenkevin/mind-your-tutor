import { sql, type Kysely } from 'kysely';
import { APP_ROLE } from './helpers.js';

// The app role (ARCHITECTURE.md §10 "per-org row-level security in Postgres").
//
// Migrations run as the migration role, which owns every table. The API and workers
// run as `ideamap_app`: no superuser, no BYPASSRLS, no CREATE on any schema, and only
// the table privileges each later migration grants. The role is created NOLOGIN with
// no password; a deployment gives it a login and password outside the migrations
// (see packages/db/README.md). Roles are cluster-wide, so this tolerates the role
// already existing, for example from another database on the same server.

export async function up(db: Kysely<unknown>): Promise<void> {
  // Another database on the server may be migrating at the same moment, so a
  // concurrent CREATE is tolerated, and an existing role is altered only if it has
  // gained one of the dangerous attributes.
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${sql.lit(APP_ROLE)}) THEN
        BEGIN
          CREATE ROLE ${sql.id(APP_ROLE)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
        EXCEPTION WHEN duplicate_object OR unique_violation THEN
          NULL;
        END;
      END IF;
      IF EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = ${sql.lit(APP_ROLE)}
          AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
      ) THEN
        ALTER ROLE ${sql.id(APP_ROLE)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      END IF;
    END
    $$
  `.execute(db);

  await sql`GRANT USAGE ON SCHEMA public, app TO ${sql.id(APP_ROLE)}`.execute(db);
  await sql`GRANT EXECUTE ON FUNCTION app.current_org_id() TO ${sql.id(APP_ROLE)}`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // The role may be used by other databases on the server, so only this database's
  // grants are removed.
  await sql`REVOKE ALL ON SCHEMA public, app FROM ${sql.id(APP_ROLE)}`.execute(db);
  await sql`REVOKE ALL ON FUNCTION app.current_org_id() FROM ${sql.id(APP_ROLE)}`.execute(db);
}
