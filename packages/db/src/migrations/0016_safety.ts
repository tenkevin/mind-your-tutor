import { sql, type Kysely } from 'kysely';
import { APP_ROLE, dropTables, tenantTable } from './helpers.js';

// Student safety (ARCHITECTURE.md §9, §10; task A2).
//
// 1. The district's flag policy, on the organization row so every change is audited by
//    the existing trigger: who is told when a student's message is concerning
//    (`flag_notify`), and the help text a student reads (`help_text`).
// 2. `safety_flag`: one row per concerning message. It holds no text: the teacher view
//    reads the redacted excerpt from the transcript (`ai_interaction`), so a flag is
//    deleted with its transcript (retention, FERPA delete) and never outlives it.
//    Raising and resolving a flag are written to `audit_event` by the gateway.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE organization
      ADD COLUMN flag_notify text NOT NULL DEFAULT 'teacher_and_admin'
        CHECK (flag_notify IN ('teacher_and_admin', 'teacher', 'admin')),
      ADD COLUMN help_text text CHECK (help_text IS NULL OR length(help_text) BETWEEN 1 AND 500)
  `.execute(db);

  await sql`ALTER TABLE ai_interaction ADD CONSTRAINT ai_interaction_org_id_id_key UNIQUE (org_id, id)`.execute(
    db,
  );
  await sql`
    CREATE TABLE safety_flag (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL,
      class_id uuid NOT NULL,
      interaction_id uuid NOT NULL,
      category text NOT NULL CHECK (category IN ('self_harm', 'abuse')),
      notify_teacher boolean NOT NULL,
      notify_admin boolean NOT NULL,
      status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
      created_at timestamptz NOT NULL DEFAULT now(),
      resolved_at timestamptz,
      resolved_by uuid,
      CHECK (notify_teacher OR notify_admin),
      CHECK ((status = 'resolved') = (resolved_at IS NOT NULL)),
      FOREIGN KEY (org_id, class_id) REFERENCES class (org_id, id) ON DELETE CASCADE,
      FOREIGN KEY (org_id, interaction_id) REFERENCES ai_interaction (org_id, id) ON DELETE CASCADE,
      FOREIGN KEY (org_id, resolved_by) REFERENCES app_user (org_id, id)
    )
  `.execute(db);
  await sql`CREATE UNIQUE INDEX safety_flag_interaction ON safety_flag (interaction_id)`.execute(
    db,
  );
  await sql`CREATE INDEX safety_flag_class ON safety_flag (class_id, status, created_at DESC)`.execute(
    db,
  );
  await sql`CREATE INDEX safety_flag_org ON safety_flag (org_id, status, created_at DESC)`.execute(
    db,
  );
  await tenantTable(db, 'safety_flag');
  // A flag is raised and resolved, never edited or removed by the app.
  await sql`GRANT SELECT, INSERT ON safety_flag TO ${sql.id(APP_ROLE)}`.execute(db);
  await sql`GRANT UPDATE (status, resolved_at, resolved_by) ON safety_flag TO ${sql.id(APP_ROLE)}`.execute(
    db,
  );
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await dropTables(db, ['safety_flag']);
  await sql`ALTER TABLE ai_interaction DROP CONSTRAINT ai_interaction_org_id_id_key`.execute(db);
  await sql`ALTER TABLE organization DROP COLUMN flag_notify, DROP COLUMN help_text`.execute(db);
}
