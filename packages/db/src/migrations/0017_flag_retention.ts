import { sql, type Kysely } from 'kysely';
import { RETENTION_ROLE } from './helpers.js';

// Safety flag retention (ARCHITECTURE.md D32; task A2). A flag is an alert, not the
// school's record. It is deleted with its transcript at the district's AI retention
// period (the foreign key from 0016 already does that), or 30 days after a teacher or
// admin resolves it, whichever comes first.
//
// The retention role may see and delete only resolved flags already past that period.
// Like every period in 0015, "kept for 30 days" means due once 31 days old, so a flag
// resolved exactly 30 days ago is never on the edge. It reads ids and dates, no more.

export const RESOLVED_FLAG_DAYS = 30;

export async function up(db: Kysely<unknown>): Promise<void> {
  const r = sql.id(RETENTION_ROLE);
  const due = sql`status = 'resolved' AND resolved_at < now() - make_interval(days => ${sql.lit(RESOLVED_FLAG_DAYS + 1)})`;
  await sql`CREATE INDEX safety_flag_resolved ON safety_flag (org_id, resolved_at) WHERE status = 'resolved'`.execute(
    db,
  );
  await sql`GRANT SELECT (id, org_id, status, resolved_at), DELETE ON safety_flag TO ${r}`.execute(
    db,
  );
  for (const command of ['SELECT', 'DELETE']) {
    await sql`
      CREATE POLICY ${sql.id(`retention_${command.toLowerCase()}`)} ON safety_flag
        FOR ${sql.raw(command)} TO ${r} USING (${due})
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const r = sql.id(RETENTION_ROLE);
  await sql`DROP POLICY IF EXISTS retention_select ON safety_flag`.execute(db);
  await sql`DROP POLICY IF EXISTS retention_delete ON safety_flag`.execute(db);
  await sql`REVOKE ALL ON safety_flag FROM ${r}`.execute(db);
  await sql`DROP INDEX IF EXISTS safety_flag_resolved`.execute(db);
}
