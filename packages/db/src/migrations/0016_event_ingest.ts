import { sql, type Kysely } from 'kysely';
import { APP_ROLE, dropTables, grantApp, tenantTable } from './helpers.js';

// Event ingest (ARCHITECTURE.md §8.2, §8.5, D19, D22, D24, D26; task M2).
//
// 1. interaction_event.level: the educational level (D18), generated from the type so
//    it can never disagree with M1's catalogue, and a check that the type is one of
//    the catalogue's. Nothing outside §8.2 can be stored, whatever writes the row.
// 2. Opt-out (D24): tracing_opt_out, set by the district, and
//    interaction_event.tracing_opted_out, stamped on each event as it is stored.
//    Opted-out students keep their events (the app needs mastery), and D16 audits,
//    aggregates and D25 research leave out every event carrying the mark.
// 3. interaction_text.kind gains 'challenge', for `feedback.challenged` text (§8.2).
// 4. privacy_miss (D26): one row per typed text in which the server backstop found
//    a real roster name or contact detail the device layer should have removed.
//    Counts only: never the text, the name, or the student.
// 5. app.purge_student_events (D22): raw events are deleted when a student leaves the
//    district and on a FERPA delete, with the map views and AI outputs they point to
//    (§8.5). Append-only stays absolute for every other path: the replacement trigger
//    allows a DELETE only of the student this function is purging, inside it, and the
//    app role still has no DELETE privilege on these tables. Settles open question 7.
//
// Every function pins search_path to pg_catalog, pg_temp and names tables by schema.

/** The setting the purge function sets for the rows it may delete; see refuse_tracker_change. */
const PURGE_SETTING = 'app.purge_student_id';

/**
 * M1's catalogue (§8.2) as it stood for this migration: type → educational level.
 * Frozen like the migration; `event_ingest.test.ts` checks it still equals
 * `EVENT_LEVELS`, so a catalogue change (a user decision, D19) needs a new migration.
 */
export const CATALOGUE_AT_0016 = {
  'idea.opened': 'participating',
  'idea.active_time': 'participating',
  'quiz.started': 'participating',
  'quiz.answered': 'participating',
  'quiz.finished': 'participating',
  'hint.requested': 'participating',
  'review.link_rebuilt': 'participating',
  'teachback.done': 'participating',
  'teachback.judged': 'other',
  'feedback.shown': 'participating',
  'feedback.challenged': 'participating',
  'feedback.ruled': 'teaching',
  'teacher.feedback.approved': 'teaching',
  'teacher.feedback.edited': 'teaching',
  'mission.completed': 'participating',
  'map.shown': 'other',
  'ai.output_shown': 'other',
} as const;

const TRACKER_TABLES = [
  'interaction_event',
  'interaction_event_key',
  'generated_map_view',
  'ai_output',
] as const;

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Level from type, and only catalogue types.
  const types = Object.keys(CATALOGUE_AT_0016);
  const cases = sql.join(
    Object.entries(CATALOGUE_AT_0016).map(
      ([type, level]) => sql`WHEN ${sql.lit(type)} THEN ${sql.lit(level)}`,
    ),
    sql` `,
  );
  await sql`
    ALTER TABLE interaction_event
      ADD CONSTRAINT interaction_event_type_catalogue
        CHECK (type IN (${sql.join(types.map((t) => sql.lit(t)))})),
      -- Never null: the check above admits only types the CASE names. Not declared NOT
      -- NULL, so an unknown type fails that check (23514) rather than a null level.
      ADD COLUMN level text GENERATED ALWAYS AS (CASE type ${cases} END) STORED,
      -- D24: the student was opted out of tracing when this event was stored.
      ADD COLUMN tracing_opted_out boolean NOT NULL DEFAULT false
  `.execute(db);

  // 2. Students the district has opted out of tracing (for itself or for a family).
  // One row while opted out; opting back in removes it (both are audited by the API).
  await sql`
    CREATE TABLE tracing_opt_out (
      student_id uuid PRIMARY KEY,
      org_id uuid NOT NULL,
      opted_out_at timestamptz NOT NULL DEFAULT now(),
      -- The admin who recorded it.
      set_by uuid,
      FOREIGN KEY (org_id, student_id) REFERENCES app_user (org_id, id) ON DELETE CASCADE,
      FOREIGN KEY (org_id, set_by) REFERENCES app_user (org_id, id)
    )
  `.execute(db);
  await tenantTable(db, 'tracing_opt_out');
  await grantApp(db, 'tracing_opt_out', ['SELECT', 'INSERT', 'DELETE']);

  // 3. Challenge text.
  await sql`ALTER TABLE interaction_text DROP CONSTRAINT interaction_text_kind_check`.execute(db);
  await sql`
    ALTER TABLE interaction_text ADD CONSTRAINT interaction_text_kind_check
      CHECK (kind IN ('chat', 'teachback', 'transcript', 'challenge'))
  `.execute(db);

  // 4. Privacy misses.
  await sql`
    CREATE TABLE privacy_miss (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL,
      class_id uuid NOT NULL,
      -- Where the backstop ran: event ingest now, the model gateway later (A7).
      source text NOT NULL CHECK (source IN ('event_ingest')),
      names integer NOT NULL CHECK (names >= 0),
      emails integer NOT NULL CHECK (emails >= 0),
      phones integer NOT NULL CHECK (phones >= 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (names + emails + phones > 0),
      FOREIGN KEY (org_id, class_id) REFERENCES class (org_id, id) ON DELETE CASCADE
    )
  `.execute(db);
  await sql`CREATE INDEX privacy_miss_org ON privacy_miss (org_id, created_at)`.execute(db);
  await sql`CREATE INDEX privacy_miss_class ON privacy_miss (class_id, created_at)`.execute(db);
  await tenantTable(db, 'privacy_miss');
  await grantApp(db, 'privacy_miss', ['SELECT', 'INSERT']);

  // 5. Append-only, except for the purge. Replaces app.refuse_change() on the four
  // tracker tables only; every other append-only table keeps it.
  await sql`
    CREATE FUNCTION app.refuse_tracker_change() RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = pg_catalog, pg_temp
      AS $$
      BEGIN
        IF TG_OP = 'DELETE'
           AND OLD.student_id IS NOT NULL
           AND current_setting(${sql.lit(PURGE_SETTING)}, true) = OLD.student_id::text THEN
          RETURN OLD;
        END IF;
        RAISE EXCEPTION '% is append-only', TG_TABLE_NAME
          USING ERRCODE = 'insufficient_privilege';
      END
      $$
  `.execute(db);
  for (const table of TRACKER_TABLES) {
    const t = sql.table(table);
    await sql`DROP TRIGGER append_only ON ${t}`.execute(db);
    await sql`
      CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON ${t}
        FOR EACH ROW EXECUTE FUNCTION app.refuse_tracker_change()
    `.execute(db);
  }

  // Runs as the owner, for the current organization only, and only for its admin
  // (the user set with actAs). Returns what it removed. The setting is local to the
  // transaction and cleared before returning, so nothing after it can reuse it.
  await sql`
    CREATE FUNCTION app.purge_student_events(student uuid) RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, pg_temp
      AS $$
      DECLARE
        org uuid := app.current_org_id();
        events bigint;
        keys bigint;
        views bigint;
        outputs bigint;
      BEGIN
        IF org IS NULL OR NOT EXISTS (
          SELECT 1 FROM public.app_user AS a
          WHERE a.org_id = org AND a.id = app.current_actor_id() AND a.role = 'admin'
        ) THEN
          RAISE EXCEPTION 'only an admin of the organization can remove a student''s events'
            USING ERRCODE = 'insufficient_privilege';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM public.app_user AS s
          WHERE s.org_id = org AND s.id = student AND s.role = 'student'
        ) THEN
          RAISE EXCEPTION 'no such student in this organization'
            USING ERRCODE = 'no_data_found';
        END IF;

        PERFORM set_config(${sql.lit(PURGE_SETTING)}, student::text, true);
        DELETE FROM public.interaction_event AS e WHERE e.org_id = org AND e.student_id = student;
        GET DIAGNOSTICS events = ROW_COUNT;
        DELETE FROM public.interaction_event_key AS k WHERE k.org_id = org AND k.student_id = student;
        GET DIAGNOSTICS keys = ROW_COUNT;
        DELETE FROM public.generated_map_view AS v WHERE v.org_id = org AND v.student_id = student;
        GET DIAGNOSTICS views = ROW_COUNT;
        DELETE FROM public.ai_output AS o WHERE o.org_id = org AND o.student_id = student;
        GET DIAGNOSTICS outputs = ROW_COUNT;
        PERFORM set_config(${sql.lit(PURGE_SETTING)}, '', true);

        RETURN jsonb_build_object(
          'interactionEvents', events, 'eventKeys', keys,
          'generatedMapViews', views, 'aiOutputs', outputs);
      END
      $$
  `.execute(db);
  await sql`REVOKE ALL ON FUNCTION app.refuse_tracker_change() FROM PUBLIC`.execute(db);
  await sql`REVOKE ALL ON FUNCTION app.purge_student_events(uuid) FROM PUBLIC`.execute(db);
  await sql`GRANT EXECUTE ON FUNCTION app.purge_student_events(uuid) TO ${sql.id(APP_ROLE)}`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of TRACKER_TABLES) {
    const t = sql.table(table);
    await sql`DROP TRIGGER IF EXISTS append_only ON ${t}`.execute(db);
    await sql`
      CREATE TRIGGER append_only BEFORE UPDATE OR DELETE ON ${t}
        FOR EACH ROW EXECUTE FUNCTION app.refuse_change()
    `.execute(db);
  }
  await sql`DROP FUNCTION IF EXISTS app.purge_student_events(uuid)`.execute(db);
  await sql`DROP FUNCTION IF EXISTS app.refuse_tracker_change()`.execute(db);
  await dropTables(db, ['privacy_miss', 'tracing_opt_out']);
  await sql`ALTER TABLE interaction_text DROP CONSTRAINT interaction_text_kind_check`.execute(db);
  await sql`
    ALTER TABLE interaction_text ADD CONSTRAINT interaction_text_kind_check
      CHECK (kind IN ('chat', 'teachback', 'transcript'))
  `.execute(db);
  await sql`
    ALTER TABLE interaction_event
      DROP COLUMN tracing_opted_out,
      DROP COLUMN level,
      DROP CONSTRAINT interaction_event_type_catalogue
  `.execute(db);
}
