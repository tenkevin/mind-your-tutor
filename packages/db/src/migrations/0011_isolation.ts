import { sql, type Kysely } from 'kysely';
import { APP_ROLE } from './helpers.js';

// Closes the isolation gaps found by F4's QA (docs/qa/reports/F4.md, items 1, 2 and 4).
//
// 1. The event key ledger. interaction_event_key had no foreign key on the student,
//    the app role could insert into it directly, and its uniques were global, so one
//    organization could write keys for another's students, block their events and
//    probe which seq numbers they had. Now the ledger references the student by
//    (org_id, student_id), its id is unique per organization, and the app role can only
//    read it: keys are written by app.record_interaction_event_keys(), the trigger on
//    interaction_event, which runs as its owner (the migration role), checks every row
//    against the caller's organization and pins its search_path.
// 2. Class library settings. A teacher changes how the AI uses shared documents "for
//    their class only" (D11), so class_library_setting gets the same restrictive
//    class_scope policy as the class uploads: visible and writable only inside
//    `withClass`, for that class.
// 4. Temporary tables. Every role may create them through PUBLIC's default TEMP right
//    on the database. The app has no DDL (§10), so this database revokes it. Superusers
//    and the database owner keep it; nothing else here uses temporary tables.
//
// The app role also loses EXECUTE on the app schema's functions, which PUBLIC had by
// default, except the two its row-level security policies call. Trigger functions
// don't need EXECUTE to fire.

const LEDGER_FUNCTION = 'app.record_interaction_event_keys()';

/** Functions in the app schema that PUBLIC could execute before this migration. */
const PUBLIC_FUNCTIONS = [
  'app.current_org_id()',
  'app.current_class_id()',
  'app.touch_updated_at()',
  'app.refuse_change()',
  'app.guard_curriculum_version()',
  'app.guard_class_pin()',
  LEDGER_FUNCTION,
];

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. The ledger.
  await sql`
    ALTER TABLE interaction_event_key
      ADD CONSTRAINT interaction_event_key_student
        FOREIGN KEY (org_id, student_id) REFERENCES app_user (org_id, id)
  `.execute(db);
  // An event id from one organization says nothing about another's. (student_id, seq)
  // stays as it was: a student belongs to one organization, and the foreign key now
  // makes the ledger agree.
  await sql`ALTER TABLE interaction_event_key DROP CONSTRAINT interaction_event_key_pkey`.execute(
    db,
  );
  await sql`ALTER TABLE interaction_event_key ADD PRIMARY KEY (org_id, id)`.execute(db);
  await sql`REVOKE INSERT ON interaction_event_key FROM ${sql.id(APP_ROLE)}`.execute(db);

  // Rows reach this trigger only after passing interaction_event's own row-level
  // security, so for the app role they're already the current organization's. The
  // check repeats that, and the student's membership, before the insert, so a bad row
  // fails here rather than on a unique key that would say what the ledger holds. The
  // ledger's forced row-level security applies to a non-superuser owner too, but a
  // superuser owner bypasses it, so this check is the guard that always holds.
  // With no organization set, only a role that bypasses row-level security gets here.
  await sql`
    CREATE OR REPLACE FUNCTION app.record_interaction_event_keys() RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, pg_temp
      AS $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM inserted i
          WHERE i.org_id IS DISTINCT FROM coalesce(app.current_org_id(), i.org_id)
            OR NOT EXISTS (
              SELECT 1 FROM public.app_user u WHERE u.org_id = i.org_id AND u.id = i.student_id
            )
        ) THEN
          RAISE EXCEPTION 'interaction events can only be recorded for students of the current organization'
            USING ERRCODE = 'insufficient_privilege';
        END IF;
        INSERT INTO public.interaction_event_key (id, org_id, student_id, seq, recorded_at)
          SELECT id, org_id, student_id, seq, recorded_at FROM inserted;
        RETURN NULL;
      END
      $$
  `.execute(db);

  // 2. Class library settings.
  await sql`
    CREATE POLICY class_scope ON class_library_setting AS RESTRICTIVE
      USING (class_id = app.current_class_id())
      WITH CHECK (class_id = app.current_class_id())
  `.execute(db);

  // 4. Temporary tables, for this database only.
  await sql`
    DO $$ BEGIN
      EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
    END $$
  `.execute(db);

  // Functions: only what the policies need.
  for (const fn of PUBLIC_FUNCTIONS) {
    await sql`REVOKE EXECUTE ON FUNCTION ${sql.raw(fn)} FROM PUBLIC`.execute(db);
  }
  for (const fn of ['app.current_org_id()', 'app.current_class_id()']) {
    await sql`GRANT EXECUTE ON FUNCTION ${sql.raw(fn)} TO ${sql.id(APP_ROLE)}`.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const fn of PUBLIC_FUNCTIONS) {
    await sql`GRANT EXECUTE ON FUNCTION ${sql.raw(fn)} TO PUBLIC`.execute(db);
  }
  await sql`
    DO $$ BEGIN
      EXECUTE format('GRANT TEMPORARY ON DATABASE %I TO PUBLIC', current_database());
    END $$
  `.execute(db);
  await sql`DROP POLICY IF EXISTS class_scope ON class_library_setting`.execute(db);

  // The ledger as 0008 made it.
  await sql`
    CREATE OR REPLACE FUNCTION app.record_interaction_event_keys() RETURNS trigger
      LANGUAGE plpgsql
      SECURITY INVOKER
      AS $$
      BEGIN
        INSERT INTO interaction_event_key (id, org_id, student_id, seq, recorded_at)
          SELECT id, org_id, student_id, seq, recorded_at FROM inserted;
        RETURN NULL;
      END
      $$
  `.execute(db);
  await sql`GRANT INSERT ON interaction_event_key TO ${sql.id(APP_ROLE)}`.execute(db);
  await sql`ALTER TABLE interaction_event_key DROP CONSTRAINT interaction_event_key_pkey`.execute(
    db,
  );
  await sql`ALTER TABLE interaction_event_key ADD PRIMARY KEY (id)`.execute(db);
  await sql`
    ALTER TABLE interaction_event_key DROP CONSTRAINT IF EXISTS interaction_event_key_student
  `.execute(db);
}
