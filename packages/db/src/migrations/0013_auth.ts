import { sql, type Kysely } from 'kysely';
import { APP_ROLE, dropTables, grantApp, tenantTable } from './helpers.js';

// Sign-in: SSO tenants, sessions and roster ids for classes (ARCHITECTURE.md §10
// "Sign-in", "Access"; F5).
//
// Sign-in learns the organization from the identity token, before any organization is
// set, so `sso_tenant` maps a provider's tenant (a Google Workspace domain, a Clever
// district, a ClassLink tenant) to one organization. The app reads it only through
// `app.sso_tenant_org`, which returns one id for one exact (provider, tenant) pair.
// Everything else stays under row-level security: sessions are looked up inside the
// organization the session cookie names.
//

export async function up(db: Kysely<unknown>): Promise<void> {
  // Providers are configuration (F5), so a provider id is a slug, not a fixed list.
  await sql`ALTER TABLE app_user DROP CONSTRAINT app_user_sso_provider_check`.execute(db);
  await sql`
    ALTER TABLE app_user ADD CONSTRAINT app_user_sso_provider_check
      CHECK (sso_provider ~ '^[a-z][a-z0-9-]{1,31}$')
  `.execute(db);

  await sql`
    CREATE TABLE sso_tenant (
      provider text NOT NULL CHECK (provider ~ '^[a-z][a-z0-9-]{1,31}$'),
      tenant text NOT NULL CHECK (length(tenant) BETWEEN 1 AND 255),
      org_id uuid NOT NULL REFERENCES organization (id),
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (provider, tenant)
    )
  `.execute(db);
  await sql`CREATE INDEX sso_tenant_org ON sso_tenant (org_id)`.execute(db);
  await tenantTable(db, 'sso_tenant');
  await grantApp(db, 'sso_tenant', ['SELECT']);
  // The lookup below runs as this table's owner (the migration role), which row-level
  // security also binds, since it's forced. This policy lets the owner, and only the
  // owner, read every row; the app role still sees only its own organization's rows.
  await sql`CREATE POLICY sso_lookup ON sso_tenant FOR SELECT TO CURRENT_USER USING (true)`.execute(
    db,
  );
  await sql`
    CREATE FUNCTION app.sso_tenant_org(p_provider text, p_tenant text) RETURNS uuid
      LANGUAGE sql STABLE SECURITY DEFINER
      SET search_path = pg_catalog, pg_temp
      AS $$ SELECT org_id FROM public.sso_tenant WHERE provider = p_provider AND tenant = p_tenant $$
  `.execute(db);
  await sql`REVOKE ALL ON FUNCTION app.sso_tenant_org(text, text) FROM PUBLIC`.execute(db);
  await sql`GRANT EXECUTE ON FUNCTION app.sso_tenant_org(text, text) TO ${sql.id(APP_ROLE)}`.execute(
    db,
  );

  // A signed-in session. The cookie carries a random token; only its SHA-256 is kept.
  // Revoked on sign-out, and refused once idle past the role's limit or past
  // `expires_at`. The role is read from app_user on every request, so a role change
  // applies at once.
  await sql`
    CREATE TABLE auth_session (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL,
      user_id uuid NOT NULL,
      token_hash bytea NOT NULL UNIQUE CHECK (length(token_hash) = 32),
      provider text NOT NULL CHECK (provider ~ '^[a-z][a-z0-9-]{1,31}$'),
      created_at timestamptz NOT NULL,
      last_seen_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz,
      FOREIGN KEY (org_id, user_id) REFERENCES app_user (org_id, id) ON DELETE CASCADE
    )
  `.execute(db);
  await sql`CREATE INDEX auth_session_user ON auth_session (user_id)`.execute(db);
  await sql`CREATE INDEX auth_session_expires ON auth_session (expires_at)`.execute(db);
  await tenantTable(db, 'auth_session');
  await grantApp(db, 'auth_session', ['SELECT', 'INSERT', 'UPDATE', 'DELETE']);

  // OneRoster import matches classes by their sourcedId, as app_user already does.
  await sql`
    ALTER TABLE class
      ADD COLUMN roster_source_id text CHECK (length(roster_source_id) BETWEEN 1 AND 255),
      ADD CONSTRAINT class_org_id_roster_source_id_key UNIQUE (org_id, roster_source_id)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE class DROP CONSTRAINT class_org_id_roster_source_id_key,
      DROP COLUMN roster_source_id
  `.execute(db);
  await dropTables(db, ['auth_session', 'sso_tenant']);
  await sql`DROP FUNCTION IF EXISTS app.sso_tenant_org(text, text)`.execute(db);
  await sql`ALTER TABLE app_user DROP CONSTRAINT app_user_sso_provider_check`.execute(db);
  await sql`
    ALTER TABLE app_user ADD CONSTRAINT app_user_sso_provider_check
      CHECK (sso_provider IN ('google', 'clever', 'classlink'))
  `.execute(db);
}
