import { sql, type Kysely } from 'kysely';

// Shared building blocks for migrations. A migration that has run must never change,
// so these helpers are frozen too: to change what one does, add a new helper.

/** The role the API and workers log in as (ARCHITECTURE.md §10). Created in 0002. */
export const APP_ROLE = 'ideamap_app';

/** The session setting that carries the caller's organization for row-level security. */
export const ORG_SETTING = 'app.org_id';

/** The session setting that carries the class for class-scoped tables (D11, from 0010). */
export const CLASS_SETTING = 'app.class_id';

/** The session setting that names the user the app acts for, for audit rows (from 0012). */
export const ACTOR_SETTING = 'app.actor_id';

/**
 * The role the retention job runs as (from 0012). It sees and deletes only rows past
 * their organization's retention period, and can't read their text.
 */
export const RETENTION_ROLE = 'ideamap_retention';

type Db = Kysely<unknown>;

/**
 * Turn on row-level security for a tenant table and force it, so even the table's
 * owner only sees the current organization's rows. With no organization set,
 * `app.current_org_id()` is null and every row is hidden.
 */
export async function tenantTable(db: Db, table: string, orgColumn = 'org_id'): Promise<void> {
  const t = sql.table(table);
  const c = sql.ref(orgColumn);
  await sql`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`.execute(db);
  await sql`ALTER TABLE ${t} FORCE ROW LEVEL SECURITY`.execute(db);
  await sql`
    CREATE POLICY tenant_isolation ON ${t}
      USING (${c} = app.current_org_id())
      WITH CHECK (${c} = app.current_org_id())
  `.execute(db);
}

/** Grant the app role exactly these privileges on a table, and nothing else. */
export async function grantApp(
  db: Db,
  table: string,
  privileges: readonly ('SELECT' | 'INSERT' | 'UPDATE' | 'DELETE')[],
): Promise<void> {
  await sql`GRANT ${sql.raw(privileges.join(', '))} ON ${sql.table(table)} TO ${sql.id(APP_ROLE)}`.execute(
    db,
  );
}

/** Keep `updated_at` current on every update (function from 0001). */
export async function touchUpdatedAt(db: Db, table: string): Promise<void> {
  await sql`
    CREATE TRIGGER touch_updated_at BEFORE UPDATE ON ${sql.table(table)}
      FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()
  `.execute(db);
}

/** Refuse UPDATE and DELETE on every row, whoever asks (function from 0001). */
export async function appendOnly(db: Db, table: string): Promise<void> {
  await sql`
    CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON ${sql.table(table)}
      FOR EACH ROW EXECUTE FUNCTION app.refuse_change()
  `.execute(db);
}

export async function dropTables(db: Db, tables: readonly string[]): Promise<void> {
  for (const table of tables) {
    await sql`DROP TABLE IF EXISTS ${sql.table(table)} CASCADE`.execute(db);
  }
}
