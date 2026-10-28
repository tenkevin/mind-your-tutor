import { sql, type Kysely } from 'kysely';
import { dropTables, grantApp, tenantTable, touchUpdatedAt } from './helpers.js';

// Drafts to approve (ARCHITECTURE.md D9, D12, §11; task A6). One row per curriculum row
// the AI drafted text for: an idea's explanation, a unit's objective or an assessment
// row's question. It is keyed by the row's own identity (an idea_id, a unit number, or
// `<unit>:<idea_id>`), not by version, so an approval survives re-import and is shared
// by all the curriculum's classes. `draft_text` is staff-only; `approved_text` is what
// students may see, and is set only when a teacher approves.
//
// A rejected row stays, so the same gap isn't redrafted by the next import; a teacher
// asks for a redraft, which deletes it.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE content_draft (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL,
      curriculum_id uuid NOT NULL,
      kind text NOT NULL CHECK (kind IN ('idea_explanation', 'unit_objective', 'assessment_question')),
      row_key text NOT NULL CHECK (length(row_key) BETWEEN 1 AND 100),
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      draft_text text NOT NULL CHECK (length(btrim(draft_text)) BETWEEN 1 AND 2000),
      approved_text text CHECK (approved_text IS NULL OR length(btrim(approved_text)) BETWEEN 1 AND 2000),
      model text NOT NULL CHECK (length(model) BETWEEN 1 AND 100),
      source_version_id uuid,
      decided_by uuid,
      decided_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (curriculum_id, kind, row_key),
      -- Only an approved draft has student-facing text, and an approved one always does.
      CHECK ((status = 'approved') = (approved_text IS NOT NULL)),
      CHECK ((status = 'pending') = (decided_by IS NULL)),
      FOREIGN KEY (org_id, curriculum_id) REFERENCES curriculum (org_id, id) ON DELETE CASCADE,
      FOREIGN KEY (org_id, decided_by) REFERENCES app_user (org_id, id)
    )
  `.execute(db);
  await sql`CREATE INDEX content_draft_status ON content_draft (curriculum_id, status)`.execute(db);
  await touchUpdatedAt(db, 'content_draft');
  await tenantTable(db, 'content_draft');
  await grantApp(db, 'content_draft', ['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await dropTables(db, ['content_draft']);
}
