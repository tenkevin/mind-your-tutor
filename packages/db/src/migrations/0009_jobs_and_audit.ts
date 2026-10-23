import { sql, type Kysely } from 'kysely';
import { appendOnly, dropTables, grantApp, tenantTable, touchUpdatedAt } from './helpers.js';

// ImportJob, ExportJob, AuditEvent and AiInteraction (ARCHITECTURE.md §5, §7, §9, §10).
// Job rows are the app's record of the work; pg-boss (0003) only schedules it.

const JOB_STATUS = sql.raw(`('queued', 'running', 'succeeded', 'failed')`);

export async function up(db: Kysely<unknown>): Promise<void> {
  // One import of a curriculum file (§7): parse, map columns, validate, derive. On
  // success it points at the draft version it produced. `source` has the shape of
  // VersionSourceSchema; `error` is a short summary, with cell-level problems on the
  // version's `issues`.
  await sql`
    CREATE TABLE import_job (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL,
      curriculum_id uuid NOT NULL,
      status text NOT NULL DEFAULT 'queued' CHECK (status IN ${JOB_STATUS}),
      source jsonb NOT NULL CHECK (jsonb_typeof(source) = 'object'),
      version_id uuid,
      error jsonb,
      created_by uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      started_at timestamptz,
      finished_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (org_id, curriculum_id) REFERENCES curriculum (org_id, id),
      FOREIGN KEY (curriculum_id, version_id) REFERENCES curriculum_version (curriculum_id, id),
      FOREIGN KEY (org_id, created_by) REFERENCES app_user (org_id, id)
    )
  `.execute(db);
  await sql`CREATE INDEX import_job_curriculum ON import_job (curriculum_id, created_at DESC)`.execute(
    db,
  );
  await touchUpdatedAt(db, 'import_job');
  await tenantTable(db, 'import_job');
  await grantApp(db, 'import_job', ['SELECT', 'INSERT', 'UPDATE']);

  // One export (§7 "Exports"). `result_ref` is the object storage key of the file.
  await sql`
    CREATE TABLE export_job (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL,
      kind text NOT NULL CHECK (kind IN (
        'template', 'data_checks', 'standards_alignment', 'drafted_rows', 'class_progress')),
      curriculum_id uuid,
      class_id uuid,
      status text NOT NULL DEFAULT 'queued' CHECK (status IN ${JOB_STATUS}),
      params jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(params) = 'object'),
      result_ref text CHECK (length(result_ref) BETWEEN 1 AND 1024),
      error jsonb,
      created_by uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      finished_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (org_id, curriculum_id) REFERENCES curriculum (org_id, id),
      FOREIGN KEY (org_id, class_id) REFERENCES class (org_id, id),
      FOREIGN KEY (org_id, created_by) REFERENCES app_user (org_id, id)
    )
  `.execute(db);
  await sql`CREATE INDEX export_job_org ON export_job (org_id, created_at DESC)`.execute(db);
  await touchUpdatedAt(db, 'export_job');
  await tenantTable(db, 'export_job');
  await grantApp(db, 'export_job', ['SELECT', 'INSERT', 'UPDATE']);

  // Every config change and publish (§2, §10 "Access"). Append-only.
  await sql`
    CREATE TABLE audit_event (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organization (id),
      actor_id uuid,
      action text NOT NULL CHECK (length(action) BETWEEN 1 AND 100),
      target_type text NOT NULL CHECK (length(target_type) BETWEEN 1 AND 64),
      target_id uuid,
      detail jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(detail) = 'object'),
      at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (org_id, actor_id) REFERENCES app_user (org_id, id)
    )
  `.execute(db);
  await sql`CREATE INDEX audit_event_target ON audit_event (target_type, target_id, at)`.execute(
    db,
  );
  await sql`CREATE INDEX audit_event_org ON audit_event (org_id, at)`.execute(db);
  await appendOnly(db, 'audit_event');
  await tenantTable(db, 'audit_event');
  await grantApp(db, 'audit_event', ['SELECT', 'INSERT']);

  // A logged model call through the AI gateway (§9, §10 "AI transcripts"). Stored
  // redacted, with pseudonymous ids only, and deleted after the organization's
  // retention period; `created_at` is indexed for those deletes.
  await sql`
    CREATE TABLE ai_interaction (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL,
      class_id uuid,
      user_id uuid,
      persona text NOT NULL CHECK (persona IN ('tutor', 'peer', 'agent', 'custom')),
      model text NOT NULL CHECK (length(model) BETWEEN 1 AND 100),
      request jsonb NOT NULL,
      response jsonb,
      flagged boolean NOT NULL DEFAULT false,
      input_tokens integer CHECK (input_tokens >= 0),
      output_tokens integer CHECK (output_tokens >= 0),
      redacted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (org_id, class_id) REFERENCES class (org_id, id) ON DELETE CASCADE,
      FOREIGN KEY (org_id, user_id) REFERENCES app_user (org_id, id) ON DELETE CASCADE
    )
  `.execute(db);
  await sql`CREATE INDEX ai_interaction_retention ON ai_interaction (org_id, created_at)`.execute(
    db,
  );
  await sql`CREATE INDEX ai_interaction_class ON ai_interaction (class_id, created_at)`.execute(db);
  await tenantTable(db, 'ai_interaction');
  await grantApp(db, 'ai_interaction', ['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await dropTables(db, ['ai_interaction', 'audit_event', 'export_job', 'import_job']);
}
