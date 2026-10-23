import { sql, type Kysely } from 'kysely';
import { APP_ROLE, dropTables, grantApp, RETENTION_ROLE, tenantTable } from './helpers.js';

// Privacy baseline (ARCHITECTURE.md §8.2, §8.6 item 4, §10, D9, D11; task F6).
// The data inventory in docs/privacy/data-inventory.md describes every column.
//
// 1. Retention settings per organization. `text_retention_days` (0004) covers typed
//    student text; this adds AI transcripts and export files. Each is kept for that
//    many whole days and deleted once it is older.
// 2. A retention role, `ideamap_retention`, for the worker's retention job. It can see
//    and delete only rows already past their organization's limit, in every
//    organization, and can't read what they say (column grants leave out the text).
// 3. Audit writes by trigger on every config change, approval, library setting and
//    publish, with before and after values and secrets redacted. Triggers can't be
//    skipped by a code path that forgets to audit.
// 4. audit_event also refuses TRUNCATE, and gains class and curriculum columns so a
//    class's history can be listed.
// 5. A `student_record` export kind for FERPA export requests, and `export_subject`:
//    which students each export file holds, so deleting a student finds every file
//    that names them, whatever classes they are in by then.
//
// Every function pins search_path to pg_catalog, pg_temp and names tables by schema, so
// a temporary table can't stand in for a real one.

/** Keys whose values never reach the audit log. Kept equal to `SECRET_KEY` in privacy.ts. */
export const SECRET_KEY_PATTERN =
  '(secret|password|passwd|credential|api_?key|private_?key|access_?key|access_?token|refresh_?token|auth_?token|bearer|^token$)';

const AUDITED = [
  // table, target type, id column, class column, curriculum column, actor column,
  // ignored columns, key columns, verbs (insert, update, delete)
  [
    'organization',
    'organization',
    'id',
    '',
    '',
    '',
    'created_at,updated_at',
    '',
    'created,updated,deleted',
  ],
  [
    'class',
    'class',
    'id',
    'id',
    'curriculum_id',
    '',
    'org_id,created_at,updated_at',
    '',
    'created,updated,deleted',
  ],
  [
    'class_config',
    'class_config',
    'class_id',
    'class_id',
    '',
    'updated_by',
    'org_id,updated_by,updated_at',
    '',
    'created,updated,deleted',
  ],
  [
    'curriculum_defaults',
    'curriculum_defaults',
    'curriculum_id',
    '',
    'curriculum_id',
    'updated_by',
    'org_id,updated_by,updated_at',
    '',
    'created,updated,deleted',
  ],
  [
    'approved_explanation',
    'explanation',
    'curriculum_id',
    '',
    'curriculum_id',
    'approved_by',
    'org_id,approved_at',
    'idea_id',
    'approved,edited,withdrawn',
  ],
  [
    'class_library_setting',
    'library_setting',
    'library_doc_id',
    'class_id',
    'curriculum_id',
    'updated_by',
    'org_id,updated_by,updated_at',
    'library_doc_id',
    'set,changed,cleared',
  ],
  [
    'class_library_doc',
    'class_library_doc',
    'id',
    'class_id',
    '',
    'uploaded_by',
    'org_id,checksum,index_status,indexed_at,created_at,updated_at',
    '',
    'added,updated,removed',
  ],
] as const;

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1. Retention settings (§10 "retention configurable per district (default 90 days)").
  await sql`
    ALTER TABLE organization
      ADD COLUMN ai_retention_days integer NOT NULL DEFAULT 90
        CHECK (ai_retention_days BETWEEN 1 AND 3650),
      ADD COLUMN export_retention_days integer NOT NULL DEFAULT 7
        CHECK (export_retention_days BETWEEN 1 AND 365),
      -- Sign-in sessions (0014) are kept this long after they expire or are revoked.
      ADD COLUMN session_retention_days integer NOT NULL DEFAULT 30
        CHECK (session_retention_days BETWEEN 1 AND 365)
  `.execute(db);

  // 5. FERPA export files are export jobs too, so they expire with the others.
  await sql`ALTER TABLE export_job DROP CONSTRAINT export_job_kind_check`.execute(db);
  await sql`
    ALTER TABLE export_job ADD CONSTRAINT export_job_kind_check CHECK (kind IN (
      'template', 'data_checks', 'standards_alignment', 'drafted_rows', 'class_progress',
      'student_record'))
  `.execute(db);

  // Which students an export file holds (a student record, a class progress report).
  // Written with the export, kept after the file expires; ids only.
  await sql`ALTER TABLE export_job ADD CONSTRAINT export_job_org_id_id_key UNIQUE (org_id, id)`.execute(
    db,
  );
  await sql`
    CREATE TABLE export_subject (
      export_job_id uuid NOT NULL,
      student_id uuid NOT NULL,
      org_id uuid NOT NULL,
      PRIMARY KEY (export_job_id, student_id),
      FOREIGN KEY (org_id, export_job_id) REFERENCES export_job (org_id, id),
      FOREIGN KEY (org_id, student_id) REFERENCES app_user (org_id, id)
    )
  `.execute(db);
  await sql`CREATE INDEX export_subject_student ON export_subject (student_id)`.execute(db);
  await tenantTable(db, 'export_subject');
  await grantApp(db, 'export_subject', ['SELECT', 'INSERT']);

  // 4. Audit columns. before and after hold only what changed, with secrets redacted.
  await sql`
    ALTER TABLE audit_event
      ADD COLUMN class_id uuid,
      ADD COLUMN curriculum_id uuid,
      ADD COLUMN before jsonb CHECK (jsonb_typeof(before) = 'object'),
      ADD COLUMN after jsonb CHECK (jsonb_typeof(after) = 'object')
  `.execute(db);
  await sql`CREATE INDEX audit_event_class ON audit_event (class_id, at) WHERE class_id IS NOT NULL`.execute(
    db,
  );
  await sql`
    CREATE INDEX audit_event_curriculum ON audit_event (curriculum_id, at)
      WHERE curriculum_id IS NOT NULL
  `.execute(db);
  await sql`
    CREATE TRIGGER append_only_truncate BEFORE TRUNCATE ON audit_event
      FOR EACH STATEMENT EXECUTE FUNCTION app.refuse_change()
  `.execute(db);

  // The user the app is acting for, set with `actAs` (client.ts). Unset means null.
  await sql`
    CREATE FUNCTION app.current_actor_id() RETURNS uuid
      LANGUAGE sql STABLE PARALLEL SAFE
      SET search_path = pg_catalog, pg_temp
      AS $$ SELECT nullif(current_setting('app.actor_id', true), '')::uuid $$
  `.execute(db);

  // Replace the value of every key that looks like a secret, at any depth.
  await sql`
    CREATE FUNCTION app.redact_secrets(value jsonb) RETURNS jsonb
      LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
      SET search_path = pg_catalog, pg_temp
      AS $$
      BEGIN
        CASE jsonb_typeof(value)
          WHEN 'object' THEN
            RETURN coalesce((
              SELECT jsonb_object_agg(k, CASE
                -- The audit trigger flattens nested keys into paths such as
                -- config.token, so the last segment is checked too.
                WHEN k ~* ${sql.lit(SECRET_KEY_PATTERN)}
                  OR regexp_replace(k, '^.*[.]', '') ~* ${sql.lit(SECRET_KEY_PATTERN)}
                  THEN '"[redacted]"'::jsonb
                ELSE app.redact_secrets(v) END)
              FROM jsonb_each(value) AS e(k, v)), '{}'::jsonb);
          WHEN 'array' THEN
            RETURN coalesce((
              SELECT jsonb_agg(app.redact_secrets(v) ORDER BY i)
              FROM jsonb_array_elements(value) WITH ORDINALITY AS a(v, i)), '[]'::jsonb);
          ELSE
            RETURN value;
        END CASE;
      END
      $$
  `.execute(db);

  // 3. One audit row per changed row. For an update, before and after hold only the
  // columns that changed; a jsonb object column is compared one level down, so a due
  // date change reads `config.units`, not the whole config. An update that changes
  // only ignored columns (timestamps, indexing state) writes nothing.
  //
  // Arguments: target type, id column, class column, curriculum column, actor column,
  // ignored columns, key columns, verbs. Empty means none. The actor is the user set
  // with `actAs`, else the row's own actor column.
  await sql`
    CREATE FUNCTION app.audit_row_change() RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = pg_catalog, pg_temp
      AS $$
      DECLARE
        target_type text := TG_ARGV[0];
        ignored text[] := string_to_array(TG_ARGV[5], ',');
        key_cols text[] := string_to_array(TG_ARGV[6], ',');
        verbs text[] := string_to_array(TG_ARGV[7], ',');
        full_row jsonb;
        old_row jsonb;
        new_row jsonb;
        before_v jsonb := '{}';
        after_v jsonb := '{}';
        changed text[] := '{}';
        k text;
        k2 text;
        o jsonb;
        n jsonb;
        verb text;
      BEGIN
        IF TG_OP = 'DELETE' THEN full_row := to_jsonb(OLD); ELSE full_row := to_jsonb(NEW); END IF;
        IF TG_OP <> 'INSERT' THEN old_row := to_jsonb(OLD) - ignored; END IF;
        IF TG_OP <> 'DELETE' THEN new_row := to_jsonb(NEW) - ignored; END IF;

        IF TG_OP = 'UPDATE' THEN
          verb := verbs[2];
          FOR k IN SELECT jsonb_object_keys(new_row) ORDER BY 1 LOOP
            o := old_row -> k;
            n := new_row -> k;
            CONTINUE WHEN o IS NOT DISTINCT FROM n;
            IF jsonb_typeof(o) = 'object' AND jsonb_typeof(n) = 'object' THEN
              FOR k2 IN SELECT jsonb_object_keys(o) UNION SELECT jsonb_object_keys(n) ORDER BY 1 LOOP
                CONTINUE WHEN o -> k2 IS NOT DISTINCT FROM n -> k2;
                changed := changed || (k || '.' || k2);
                before_v := before_v || jsonb_build_object(k || '.' || k2, o -> k2);
                after_v := after_v || jsonb_build_object(k || '.' || k2, n -> k2);
              END LOOP;
            ELSE
              changed := changed || k;
              before_v := before_v || jsonb_build_object(k, o);
              after_v := after_v || jsonb_build_object(k, n);
            END IF;
          END LOOP;
          IF cardinality(changed) = 0 THEN RETURN NULL; END IF;
        ELSIF TG_OP = 'INSERT' THEN
          verb := verbs[1];
          after_v := new_row;
        ELSE
          verb := verbs[3];
          before_v := old_row;
        END IF;

        INSERT INTO public.audit_event
          (org_id, actor_id, action, target_type, target_id, class_id, curriculum_id, before, after, detail)
        VALUES (
          coalesce(full_row ->> 'org_id', full_row ->> 'id')::uuid,
          coalesce(app.current_actor_id(), (full_row ->> TG_ARGV[4])::uuid),
          target_type || '.' || verb,
          target_type,
          (full_row ->> TG_ARGV[1])::uuid,
          (full_row ->> TG_ARGV[2])::uuid,
          (full_row ->> TG_ARGV[3])::uuid,
          CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE app.redact_secrets(before_v) END,
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE app.redact_secrets(after_v) END,
          jsonb_build_object('changed', to_jsonb(changed))
            || CASE WHEN cardinality(key_cols) > 0
                 THEN jsonb_build_object('key', (SELECT jsonb_object_agg(c, full_row -> c) FROM unnest(key_cols) AS c))
                 ELSE '{}'::jsonb END);
        RETURN NULL;
      END
      $$
  `.execute(db);

  for (const [table, ...args] of AUDITED) {
    const list = sql.join(args.map((a) => sql.lit(a)));
    await sql`
      CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON ${sql.table(table)}
        FOR EACH ROW EXECUTE FUNCTION app.audit_row_change(${list})
    `.execute(db);
  }

  // Publishing (D2, §7): a version moving to published, archived, or back to published
  // for a rollback. Drafts change often during import and aren't audited.
  await sql`
    CREATE FUNCTION app.audit_version_status() RETURNS trigger
      LANGUAGE plpgsql
      SET search_path = pg_catalog, pg_temp
      AS $$
      DECLARE
        verb text;
      BEGIN
        IF NEW.status = 'draft' OR (TG_OP = 'UPDATE' AND NEW.status = OLD.status) THEN
          RETURN NULL;
        END IF;
        verb := CASE
          WHEN TG_OP = 'UPDATE' AND OLD.status = 'archived' AND NEW.status = 'published' THEN 'restored'
          ELSE NEW.status END;
        INSERT INTO public.audit_event
          (org_id, actor_id, action, target_type, target_id, curriculum_id, before, after, detail)
        VALUES (
          NEW.org_id, app.current_actor_id(), 'version.' || verb, 'curriculum_version', NEW.id,
          NEW.curriculum_id,
          CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('status', OLD.status) END,
          jsonb_build_object('status', NEW.status, 'published_at', NEW.published_at),
          jsonb_build_object('changed', '["status"]'::jsonb, 'key', jsonb_build_object('number', NEW.number)));
        RETURN NULL;
      END
      $$
  `.execute(db);
  await sql`
    CREATE TRIGGER audit AFTER INSERT OR UPDATE OF status ON curriculum_version
      FOR EACH ROW EXECUTE FUNCTION app.audit_version_status()
  `.execute(db);

  // 2. The retention role. NOLOGIN, no BYPASSRLS: it reaches other organizations'
  // rows only through the policies below, which show nothing that isn't due.
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${sql.lit(RETENTION_ROLE)}) THEN
        BEGIN
          CREATE ROLE ${sql.id(RETENTION_ROLE)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
        EXCEPTION WHEN duplicate_object OR unique_violation THEN
          NULL;
        END;
      END IF;
      IF EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = ${sql.lit(RETENTION_ROLE)}
          AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
      ) THEN
        ALTER ROLE ${sql.id(RETENTION_ROLE)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      END IF;
    END
    $$
  `.execute(db);
  const r = sql.id(RETENTION_ROLE);
  await sql`GRANT USAGE ON SCHEMA public, app TO ${r}`.execute(db);

  // The moment before which a row of this kind is due. Kept for N whole days: due
  // once it is N + 1 days old, so a row at exactly N days is never on the edge.
  await sql`
    CREATE FUNCTION app.retention_cutoff(org uuid, kind text) RETURNS timestamptz
      LANGUAGE sql STABLE PARALLEL SAFE
      SET search_path = pg_catalog, pg_temp
      AS $$
        SELECT now() - make_interval(days => 1 + CASE kind
          WHEN 'text' THEN o.text_retention_days
          WHEN 'ai' THEN o.ai_retention_days
          WHEN 'export' THEN o.export_retention_days
          WHEN 'session' THEN o.session_retention_days END)
        FROM public.organization o WHERE o.id = org
      $$
  `.execute(db);

  await sql`GRANT SELECT (id, text_retention_days, ai_retention_days, export_retention_days, session_retention_days) ON organization TO ${r}`.execute(
    db,
  );
  await sql`CREATE POLICY retention_read ON organization FOR SELECT TO ${r} USING (true)`.execute(
    db,
  );
  for (const [table, kind] of [
    ['interaction_text', 'text'],
    ['ai_interaction', 'ai'],
  ] as const) {
    const t = sql.table(table);
    await sql`GRANT SELECT (id, org_id, created_at), DELETE ON ${t} TO ${r}`.execute(db);
    for (const command of ['SELECT', 'DELETE']) {
      await sql`
        CREATE POLICY ${sql.id(`retention_${command.toLowerCase()}`)} ON ${t}
          FOR ${sql.raw(command)} TO ${r}
          USING (created_at < app.retention_cutoff(org_id, ${sql.lit(kind)}))
      `.execute(db);
    }
  }
  await sql`
    GRANT SELECT (id, org_id, kind, result_ref, created_at, finished_at), UPDATE (result_ref)
      ON export_job TO ${r}
  `.execute(db);
  const exportDue = sql`coalesce(finished_at, created_at) < app.retention_cutoff(org_id, 'export')`;
  await sql`CREATE POLICY retention_select ON export_job FOR SELECT TO ${r} USING (${exportDue})`.execute(
    db,
  );
  // It may only clear the file reference.
  await sql`
    CREATE POLICY retention_update ON export_job FOR UPDATE TO ${r}
      USING (${exportDue}) WITH CHECK (result_ref IS NULL)
  `.execute(db);

  // Sign-in sessions, once expired or revoked for the organization's session period.
  // No token hashes: the role sees only ids and dates.
  await sql`
    GRANT SELECT (id, org_id, expires_at, revoked_at), DELETE ON auth_session TO ${r}
  `.execute(db);
  const sessionDue = sql`coalesce(revoked_at, expires_at) < app.retention_cutoff(org_id, 'session')`;
  for (const command of ['SELECT', 'DELETE']) {
    await sql`
      CREATE POLICY ${sql.id(`retention_${command.toLowerCase()}`)} ON auth_session
        FOR ${sql.raw(command)} TO ${r} USING (${sessionDue})
    `.execute(db);
  }

  // Only the roles that need them may call the new functions.
  for (const fn of [
    'app.current_actor_id()',
    'app.redact_secrets(jsonb)',
    'app.audit_row_change()',
    'app.audit_version_status()',
    'app.retention_cutoff(uuid, text)',
  ]) {
    await sql`REVOKE ALL ON FUNCTION ${sql.raw(fn)} FROM PUBLIC`.execute(db);
  }
  await sql`GRANT EXECUTE ON FUNCTION app.current_actor_id(), app.redact_secrets(jsonb) TO ${sql.id(APP_ROLE)}`.execute(
    db,
  );
  await sql`GRANT EXECUTE ON FUNCTION app.retention_cutoff(uuid, text) TO ${r}`.execute(db);
  // The tenant policies apply to every role, so evaluating them needs this too.
  await sql`GRANT EXECUTE ON FUNCTION app.current_org_id() TO ${r}`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const r = sql.id(RETENTION_ROLE);
  for (const table of ['interaction_text', 'ai_interaction', 'export_job', 'auth_session']) {
    await sql`DROP POLICY IF EXISTS retention_select ON ${sql.table(table)}`.execute(db);
    await sql`DROP POLICY IF EXISTS retention_delete ON ${sql.table(table)}`.execute(db);
    await sql`DROP POLICY IF EXISTS retention_update ON ${sql.table(table)}`.execute(db);
    await sql`REVOKE ALL ON ${sql.table(table)} FROM ${r}`.execute(db);
  }
  await sql`DROP POLICY IF EXISTS retention_read ON organization`.execute(db);
  await sql`REVOKE ALL ON organization FROM ${r}`.execute(db);
  await sql`DROP FUNCTION IF EXISTS app.retention_cutoff(uuid, text)`.execute(db);
  await sql`REVOKE ALL ON FUNCTION app.current_org_id() FROM ${r}`.execute(db);
  await sql`REVOKE ALL ON SCHEMA public, app FROM ${r}`.execute(db);
  // The role is cluster-wide and may be used by other databases, so it stays.

  await sql`DROP TRIGGER IF EXISTS audit ON curriculum_version`.execute(db);
  for (const [table] of AUDITED) {
    await sql`DROP TRIGGER IF EXISTS audit ON ${sql.table(table)}`.execute(db);
  }
  await sql`DROP FUNCTION IF EXISTS app.audit_version_status()`.execute(db);
  await sql`DROP FUNCTION IF EXISTS app.audit_row_change()`.execute(db);
  await sql`DROP FUNCTION IF EXISTS app.redact_secrets(jsonb)`.execute(db);
  await sql`DROP FUNCTION IF EXISTS app.current_actor_id()`.execute(db);

  await sql`DROP TRIGGER IF EXISTS append_only_truncate ON audit_event`.execute(db);
  await sql`
    ALTER TABLE audit_event DROP COLUMN class_id, DROP COLUMN curriculum_id,
      DROP COLUMN before, DROP COLUMN after
  `.execute(db);

  await dropTables(db, ['export_subject']);
  await sql`ALTER TABLE export_job DROP CONSTRAINT export_job_org_id_id_key`.execute(db);
  await sql`ALTER TABLE export_job DROP CONSTRAINT export_job_kind_check`.execute(db);
  await sql`
    ALTER TABLE export_job ADD CONSTRAINT export_job_kind_check CHECK (kind IN (
      'template', 'data_checks', 'standards_alignment', 'drafted_rows', 'class_progress'))
  `.execute(db);

  await sql`ALTER TABLE organization DROP COLUMN ai_retention_days, DROP COLUMN export_retention_days, DROP COLUMN session_retention_days`.execute(
    db,
  );
}
