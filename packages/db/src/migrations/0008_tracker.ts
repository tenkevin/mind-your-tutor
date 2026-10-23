import { sql, type Kysely } from 'kysely';
import { appendOnly, dropTables, grantApp, tenantTable, touchUpdatedAt } from './helpers.js';

// The interaction tracker's storage (ARCHITECTURE.md §5, §8): InteractionEvent,
// InteractionText, GeneratedMapView, AiOutput and ProgressSnapshot.
//
// NOTE: the event catalogue is still a placeholder (task M1). interaction_event keeps
// to the draft envelope in §8.2 plus what storage needs (org_id for row-level
// security, recorded_at for monthly partitions). M1 may change these columns.

/** Months of partitions created ahead of the current one. */
export const PARTITIONS_AHEAD = 2;

export async function up(db: Kysely<unknown>): Promise<void> {
  // The append-only log (§8.1, §8.5). `payload` is validated per `type` with zod at
  // ingest; typed text is never in it, only a reference to interaction_text (§8.2), so
  // there is no foreign key and deleting text never breaks a replay.
  await sql`
    CREATE TABLE interaction_event (
      -- Client-generated ULID, so a resent event is not recorded twice.
      id text NOT NULL CHECK (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
      org_id uuid NOT NULL,
      -- Pseudonymous: app_user's random id, never a name or email.
      student_id uuid NOT NULL,
      class_id uuid NOT NULL,
      -- The curriculum version the student was on.
      version_id uuid NOT NULL,
      -- Per-student sequence number set by the server; replay order.
      seq bigint NOT NULL CHECK (seq >= 1),
      -- Client time; used for durations, seq decides order.
      at timestamptz NOT NULL,
      -- An EventType such as 'quiz.answered' (§8.2); the catalogue is M1's.
      type text NOT NULL CHECK (length(type) BETWEEN 1 AND 64),
      payload jsonb NOT NULL DEFAULT '{}',
      -- Server time the event was stored; the partition key.
      recorded_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (org_id, student_id) REFERENCES app_user (org_id, id),
      FOREIGN KEY (org_id, class_id) REFERENCES class (org_id, id),
      FOREIGN KEY (org_id, version_id) REFERENCES curriculum_version (org_id, id)
    ) PARTITION BY RANGE (recorded_at)
  `.execute(db);
  await sql`CREATE INDEX interaction_event_student_seq ON interaction_event (student_id, seq)`.execute(
    db,
  );
  // Replay keys state by (class, student) (§5 "Keys").
  await sql`
    CREATE INDEX interaction_event_class_student_seq ON interaction_event (class_id, student_id, seq)
  `.execute(db);

  // A unique index on a partitioned table must include the partition key, so the
  // id and (student_id, seq) are kept unique across all months by this unpartitioned
  // ledger, filled by a trigger on every insert. Ingest also reads it to drop ids it
  // has already recorded (§8.5).
  await sql`
    CREATE TABLE interaction_event_key (
      id text PRIMARY KEY,
      org_id uuid NOT NULL REFERENCES organization (id),
      student_id uuid NOT NULL,
      seq bigint NOT NULL,
      recorded_at timestamptz NOT NULL,
      UNIQUE (student_id, seq)
    )
  `.execute(db);
  await sql`
    CREATE FUNCTION app.record_interaction_event_keys() RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        INSERT INTO interaction_event_key (id, org_id, student_id, seq, recorded_at)
          SELECT id, org_id, student_id, seq, recorded_at FROM inserted;
        RETURN NULL;
      END
      $$
  `.execute(db);
  // One statement-level insert per batch, not one per row. It fires for inserts
  // through interaction_event, the only way the app role can insert; the partitions
  // themselves are reachable only by the owner.
  await sql`
    CREATE TRIGGER record_keys AFTER INSERT ON interaction_event
      REFERENCING NEW TABLE AS inserted
      FOR EACH STATEMENT EXECUTE FUNCTION app.record_interaction_event_keys()
  `.execute(db);
  // Append-only for every role. Row triggers on a partitioned table apply to all its
  // partitions, including ones created later. The app role is also granted only
  // SELECT and INSERT, and has no privileges on the partitions themselves.
  await appendOnly(db, 'interaction_event');
  await appendOnly(db, 'interaction_event_key');
  await tenantTable(db, 'interaction_event');
  await tenantTable(db, 'interaction_event_key');
  await grantApp(db, 'interaction_event', ['SELECT', 'INSERT']);
  await grantApp(db, 'interaction_event_key', ['SELECT', 'INSERT']);

  // Monthly partitions (§8.5). Run by the migration role (it owns the table; the app
  // role can't create tables): this migration creates the current month and
  // PARTITIONS_AHEAD more, and a scheduled job should call
  // app.ensure_interaction_event_partitions() monthly. Old months are retired by
  // detaching or dropping their partition, never by DELETE.
  await sql`
    CREATE FUNCTION app.create_interaction_event_partition(for_month date) RETURNS text
      LANGUAGE plpgsql
      SET search_path = public, pg_temp
      AS $$
      DECLARE
        start_at date := date_trunc('month', for_month::timestamp)::date;
        part_name text := format('interaction_event_y%sm%s', to_char(start_at, 'YYYY'), to_char(start_at, 'MM'));
      BEGIN
        EXECUTE format(
          'CREATE TABLE IF NOT EXISTS %I PARTITION OF interaction_event FOR VALUES FROM (%L) TO (%L)',
          part_name,
          start_at::timestamp AT TIME ZONE 'UTC',
          (start_at + interval '1 month') AT TIME ZONE 'UTC');
        RETURN part_name;
      END
      $$
  `.execute(db);
  await sql`
    CREATE FUNCTION app.ensure_interaction_event_partitions(months_ahead integer DEFAULT ${sql.lit(PARTITIONS_AHEAD)})
      RETURNS SETOF text
      LANGUAGE sql
      SET search_path = public, pg_temp
      AS $$
        SELECT app.create_interaction_event_partition((date_trunc('month', now() AT TIME ZONE 'UTC') + make_interval(months => n))::date)
        FROM generate_series(0, months_ahead) AS n
      $$
  `.execute(db);
  for (const fn of [
    'app.create_interaction_event_partition(date)',
    'app.ensure_interaction_event_partitions(integer)',
  ]) {
    await sql`REVOKE ALL ON FUNCTION ${sql.raw(fn)} FROM PUBLIC`.execute(db);
  }
  await sql`SELECT app.ensure_interaction_event_partitions()`.execute(db);

  // Typed input: chat turns, teach-back answers, transcripts (§8.2). The only place
  // student-written text is stored. Redacted before storage and deleted after the
  // organization's retention period (§10); `created_at` is indexed for those deletes.
  await sql`
    CREATE TABLE interaction_text (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL,
      class_id uuid NOT NULL,
      student_id uuid NOT NULL,
      kind text NOT NULL CHECK (kind IN ('chat', 'teachback', 'transcript')),
      body text NOT NULL CHECK (length(body) <= 20000),
      redacted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (org_id, class_id) REFERENCES class (org_id, id) ON DELETE CASCADE,
      FOREIGN KEY (org_id, student_id) REFERENCES app_user (org_id, id) ON DELETE CASCADE
    )
  `.execute(db);
  await sql`CREATE INDEX interaction_text_retention ON interaction_text (org_id, created_at)`.execute(
    db,
  );
  await sql`CREATE INDEX interaction_text_student ON interaction_text (student_id, created_at)`.execute(
    db,
  );
  await tenantTable(db, 'interaction_text');
  await grantApp(db, 'interaction_text', ['SELECT', 'INSERT', 'UPDATE', 'DELETE']);

  // What generateMap showed a student, stored once and pointed to by a `map.shown`
  // event (§8.4 rule 2). Replays read it and never regenerate, so it never changes.
  await sql`
    CREATE TABLE generated_map_view (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL,
      class_id uuid NOT NULL,
      student_id uuid NOT NULL,
      version_id uuid NOT NULL,
      generator text NOT NULL CHECK (length(generator) BETWEEN 1 AND 100),
      view jsonb NOT NULL CHECK (jsonb_typeof(view) = 'object'),
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (org_id, class_id) REFERENCES class (org_id, id),
      FOREIGN KEY (org_id, student_id) REFERENCES app_user (org_id, id),
      FOREIGN KEY (org_id, version_id) REFERENCES curriculum_version (org_id, id)
    )
  `.execute(db);
  await sql`CREATE INDEX generated_map_view_student ON generated_map_view (class_id, student_id, created_at)`.execute(
    db,
  );
  await appendOnly(db, 'generated_map_view');
  await tenantTable(db, 'generated_map_view');
  await grantApp(db, 'generated_map_view', ['SELECT', 'INSERT']);

  // What a model produced and a student was shown (explanations, feedback, questions,
  // Milo's lines), pointed to by an `ai.output_shown` event (§8.4 rule 2).
  await sql`
    CREATE TABLE ai_output (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL,
      class_id uuid NOT NULL,
      student_id uuid,
      version_id uuid,
      persona text CHECK (persona IN ('tutor', 'peer', 'agent', 'custom')),
      kind text NOT NULL CHECK (length(kind) BETWEEN 1 AND 64),
      content jsonb NOT NULL,
      model text CHECK (length(model) <= 100),
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (org_id, class_id) REFERENCES class (org_id, id),
      FOREIGN KEY (org_id, student_id) REFERENCES app_user (org_id, id),
      FOREIGN KEY (org_id, version_id) REFERENCES curriculum_version (org_id, id)
    )
  `.execute(db);
  await sql`CREATE INDEX ai_output_student ON ai_output (class_id, student_id, created_at)`.execute(
    db,
  );
  await appendOnly(db, 'ai_output');
  await tenantTable(db, 'ai_output');
  await grantApp(db, 'ai_output', ['SELECT', 'INSERT']);

  // A cache of replayed state (§8.1 "Fast reads"): state plus the last seq applied.
  // Derived, so it may be dropped and rebuilt from the events at any time.
  await sql`
    CREATE TABLE progress_snapshot (
      class_id uuid NOT NULL,
      student_id uuid NOT NULL,
      rules_version text NOT NULL CHECK (length(rules_version) BETWEEN 1 AND 64),
      org_id uuid NOT NULL,
      state jsonb NOT NULL,
      last_seq bigint NOT NULL CHECK (last_seq >= 0),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (class_id, student_id, rules_version),
      FOREIGN KEY (org_id, class_id) REFERENCES class (org_id, id) ON DELETE CASCADE,
      FOREIGN KEY (org_id, student_id) REFERENCES app_user (org_id, id) ON DELETE CASCADE
    )
  `.execute(db);
  await touchUpdatedAt(db, 'progress_snapshot');
  await tenantTable(db, 'progress_snapshot');
  await grantApp(db, 'progress_snapshot', ['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await dropTables(db, [
    'progress_snapshot',
    'ai_output',
    'generated_map_view',
    'interaction_text',
    'interaction_event',
    'interaction_event_key',
  ]);
  for (const fn of [
    'app.ensure_interaction_event_partitions(integer)',
    'app.create_interaction_event_partition(date)',
    'app.record_interaction_event_keys()',
  ]) {
    await sql`DROP FUNCTION IF EXISTS ${sql.raw(fn)}`.execute(db);
  }
}
