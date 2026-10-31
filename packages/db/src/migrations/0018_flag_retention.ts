import { sql, type Kysely } from 'kysely';
import { RETENTION_ROLE } from './helpers.js';

// Safety flag retention (ARCHITECTURE.md D32; task A2). A flag is an alert, not the
// school's record. It is deleted with its transcript at the district's AI retention
// period (the foreign key from 0017 already does that), or once it has been resolved
// for the district's early-deletion window, whichever comes first.
//
// The window is an organization setting like every period in 0015, and is read when the
// retention job runs, not stamped on the flag: a change applies to every resolved flag
// at once, and the organization trigger audits it. Like the others, "kept for N days"
// means due once N + 1 days old. The retention role sees and deletes only resolved
// flags already past the window, and reads ids and dates, no more.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE organization
      ADD COLUMN flag_resolved_retention_days integer NOT NULL DEFAULT 30
        CHECK (flag_resolved_retention_days BETWEEN 1 AND 3650)
  `.execute(db);

  // The moment before which a flag resolved then is due, for this organization.
  await sql`
    CREATE FUNCTION app.flag_resolved_cutoff(org uuid) RETURNS timestamptz
      LANGUAGE sql STABLE PARALLEL SAFE
      SET search_path = pg_catalog, pg_temp
      AS $$
        SELECT now() - make_interval(days => 1 + o.flag_resolved_retention_days)
        FROM public.organization o WHERE o.id = org
      $$
  `.execute(db);
  await sql`REVOKE ALL ON FUNCTION app.flag_resolved_cutoff(uuid) FROM PUBLIC`.execute(db);
  await sql`GRANT EXECUTE ON FUNCTION app.flag_resolved_cutoff(uuid) TO ${sql.id(RETENTION_ROLE)}`.execute(
    db,
  );

  const r = sql.id(RETENTION_ROLE);
  await sql`GRANT SELECT (flag_resolved_retention_days) ON organization TO ${r}`.execute(db);
  await sql`CREATE INDEX safety_flag_resolved ON safety_flag (org_id, resolved_at) WHERE status = 'resolved'`.execute(
    db,
  );
  await sql`GRANT SELECT (id, org_id, status, resolved_at), DELETE ON safety_flag TO ${r}`.execute(
    db,
  );
  for (const command of ['SELECT', 'DELETE']) {
    await sql`
      CREATE POLICY ${sql.id(`retention_${command.toLowerCase()}`)} ON safety_flag
        FOR ${sql.raw(command)} TO ${r}
        USING (status = 'resolved' AND resolved_at < app.flag_resolved_cutoff(org_id))
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const r = sql.id(RETENTION_ROLE);
  await sql`DROP POLICY IF EXISTS retention_select ON safety_flag`.execute(db);
  await sql`DROP POLICY IF EXISTS retention_delete ON safety_flag`.execute(db);
  await sql`REVOKE ALL ON safety_flag FROM ${r}`.execute(db);
  await sql`DROP INDEX IF EXISTS safety_flag_resolved`.execute(db);
  await sql`DROP FUNCTION IF EXISTS app.flag_resolved_cutoff(uuid)`.execute(db);
  await sql`ALTER TABLE organization DROP COLUMN flag_resolved_retention_days`.execute(db);
}
