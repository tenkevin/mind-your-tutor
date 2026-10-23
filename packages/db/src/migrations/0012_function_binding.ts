import { sql, type Kysely } from 'kysely';

// F4cx1: bind every application function to trusted schemas and remove any
// security-sensitive dependence on search-path lookup. PUBLIC has no CREATE on
// public (0001), and pg_temp is deliberately last in each configured path. Persistent
// relation references below remain schema-qualified so temporary objects cannot shadow
// them, even when the path changes in a caller's session.

const APP_FUNCTIONS = [
  'app.current_org_id()',
  'app.touch_updated_at()',
  'app.refuse_change()',
  'app.guard_curriculum_version()',
  'app.guard_class_pin()',
  'app.record_interaction_event_keys()',
  'app.create_interaction_event_partition(date)',
  'app.ensure_interaction_event_partitions(integer)',
  'app.current_class_id()',
];

export async function up(db: Kysely<unknown>): Promise<void> {
  // D2: only a published version, or an archived version retained for rollback,
  // can be pinned. Missing rows and unexpected/null states fail closed. Include the
  // class's organization and curriculum in the lookup as defense in depth; the FK
  // constraints remain the authoritative tenant and curriculum checks.
  await sql`
    CREATE OR REPLACE FUNCTION app.guard_class_pin() RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = pg_catalog, pg_temp
      AS $$
      DECLARE
        pinned_status text;
      BEGIN
        IF NEW.pinned_version_id IS NOT NULL
           AND (TG_OP = 'INSERT' OR NEW.pinned_version_id IS DISTINCT FROM OLD.pinned_version_id) THEN
          SELECT v.status INTO pinned_status
          FROM public.curriculum_version AS v
          WHERE v.id = NEW.pinned_version_id;

          IF NOT FOUND OR pinned_status IS NULL
             OR pinned_status NOT IN ('published', 'archived') THEN
            RAISE EXCEPTION 'class %: only a published or archived version can be pinned', NEW.id
              USING ERRCODE = 'check_violation';
          END IF;
        END IF;
        RETURN NEW;
      END
      $$
  `.execute(db);

  // Preserve the F4b organization and student checks. All persistent relations are
  // explicitly bound to public so even a caller-created temporary table cannot shadow
  // either lookup or the ledger insert.
  await sql`
    CREATE OR REPLACE FUNCTION app.record_interaction_event_keys() RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, pg_temp
      AS $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM inserted AS i
          WHERE i.org_id IS DISTINCT FROM coalesce(app.current_org_id(), i.org_id)
            OR NOT EXISTS (
              SELECT 1 FROM public.app_user AS u
              WHERE u.org_id = i.org_id AND u.id = i.student_id
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

  // Partition creation is callable by the migration/scheduler role only. Qualify
  // both the parent relation and the created relation in the dynamic DDL.
  await sql`
    CREATE OR REPLACE FUNCTION app.create_interaction_event_partition(for_month date)
      RETURNS text
      LANGUAGE plpgsql
      SET search_path = pg_catalog, pg_temp
      AS $$
      DECLARE
        start_at date := date_trunc('month', for_month::timestamp)::date;
        part_name text := format('interaction_event_y%sm%s', to_char(start_at, 'YYYY'), to_char(start_at, 'MM'));
      BEGIN
        EXECUTE format(
          'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.interaction_event FOR VALUES FROM (%L) TO (%L)',
          part_name,
          start_at::timestamp AT TIME ZONE 'UTC',
          (start_at + interval '1 month') AT TIME ZONE 'UTC');
        RETURN part_name;
      END
      $$
  `.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION app.ensure_interaction_event_partitions(months_ahead integer DEFAULT 2)
      RETURNS SETOF text
      LANGUAGE sql
      SET search_path = pg_catalog, pg_temp
      AS $$
        SELECT app.create_interaction_event_partition(
          (pg_catalog.date_trunc('month', pg_catalog.now() AT TIME ZONE 'UTC')
            + pg_catalog.make_interval(months => n))::date)
        FROM pg_catalog.generate_series(0, months_ahead) AS n
      $$
  `.execute(db);

  // Put a trusted, deliberate path on every app function, including trigger helpers
  // that currently have no relation references. This is the complete migration
  // function inventory; the regression test compares it with pg_proc.
  for (const fn of APP_FUNCTIONS) {
    await sql`ALTER FUNCTION ${sql.raw(fn)} SET search_path = pg_catalog, pg_temp`.execute(db);
  }
}

// This is a forward-only security hardening migration. A partial rollback leaves the
// safer function definitions installed. A full rollback immediately proceeds through
// earlier migrations, which drop the affected triggers/functions and their schemas.
export async function down(): Promise<void> {}
