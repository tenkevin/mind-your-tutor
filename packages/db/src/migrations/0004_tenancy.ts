import { sql, type Kysely } from 'kysely';
import { dropTables, grantApp, tenantTable, touchUpdatedAt } from './helpers.js';

// Organization and User (ARCHITECTURE.md §5, §10).
//
// Every tenant table from here on carries `org_id`, has row-level security forced on
// it, and references its parents by `(org_id, id)`, so a row can never point at
// another organization's data.

export async function up(db: Kysely<unknown>): Promise<void> {
  // A school or district: the data owner under FERPA (§10).
  await sql`
    CREATE TABLE organization (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
      -- §10 "AI transcripts: retention configurable per district (default 90 days)".
      text_retention_days integer NOT NULL DEFAULT 90 CHECK (text_retention_days BETWEEN 1 AND 3650),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `.execute(db);
  await touchUpdatedAt(db, 'organization');
  // An organization sees only itself.
  await tenantTable(db, 'organization', 'id');
  await grantApp(db, 'organization', ['SELECT', 'UPDATE']);

  // "User" is a reserved word, so the table is app_user. §10's COPPA row limits what
  // is kept to name, school email and roster ids. Nothing free-form: no bio, no
  // birthday, no profile blob. Elsewhere students are referred to by this table's
  // random id, which is the pseudonymous id of §8.2 and §10.
  await sql`
    CREATE TABLE app_user (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organization (id),
      role text NOT NULL CHECK (role IN ('admin', 'author', 'teacher', 'student')),
      name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
      -- School email, stored lower-case. Optional: young students may have none.
      email text CHECK (email = lower(email) AND length(email) <= 320 AND email LIKE '%_@_%'),
      -- Roster ids: the SSO provider and its subject id (§10 sign-in), and the
      -- OneRoster sourcedId from a roster import.
      sso_provider text CHECK (sso_provider IN ('google', 'clever', 'classlink')),
      sso_subject text CHECK (length(sso_subject) BETWEEN 1 AND 255),
      roster_source_id text CHECK (length(roster_source_id) BETWEEN 1 AND 255),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (org_id, id),
      UNIQUE (org_id, email),
      UNIQUE (org_id, roster_source_id),
      UNIQUE (sso_provider, sso_subject),
      CHECK ((sso_provider IS NULL) = (sso_subject IS NULL))
    )
  `.execute(db);
  await touchUpdatedAt(db, 'app_user');
  await tenantTable(db, 'app_user');
  await grantApp(db, 'app_user', ['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await dropTables(db, ['app_user', 'organization']);
}
