import { sql, type Kysely } from 'kysely';

// Extensions and shared functions (ARCHITECTURE.md §3: one Postgres carrying
// relational data, pgvector and the pg-boss queue).
//
// pgvector isn't a trusted extension, so the migration role needs the right to create
// it (a superuser locally and in CI; `rds_superuser` or similar on a managed host).

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS vector`.execute(db);

  // Nobody but the migration role creates objects in public (§10 "the app has no DDL").
  await sql`REVOKE CREATE ON SCHEMA public FROM PUBLIC`.execute(db);

  await sql`CREATE SCHEMA app`.execute(db);

  // The organization the current transaction acts for, set by the API with
  // set_config('app.org_id', <uuid>, true). Unset or empty means null, so row-level
  // security hides every row rather than failing open.
  await sql`
    CREATE FUNCTION app.current_org_id() RETURNS uuid
      LANGUAGE sql STABLE PARALLEL SAFE
      AS $$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$
  `.execute(db);

  await sql`
    CREATE FUNCTION app.touch_updated_at() RETURNS trigger
      LANGUAGE plpgsql
      AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$
  `.execute(db);

  // Append-only tables (§8.1) refuse UPDATE and DELETE for every role, owner included.
  await sql`
    CREATE FUNCTION app.refuse_change() RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
          USING ERRCODE = 'insufficient_privilege';
      END
      $$
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP SCHEMA IF EXISTS app CASCADE`.execute(db);
  await sql`DROP EXTENSION IF EXISTS vector`.execute(db);
}
