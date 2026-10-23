import { sql, type Kysely } from 'kysely';
import { dropTables, grantApp, tenantTable, touchUpdatedAt } from './helpers.js';

// Curriculum, CurriculumVersion, CurriculumDefaults and approved explanations
// (ARCHITECTURE.md §2, §5, §6, §7, D2, D9). Columns follow `@ideamap/contracts`:
// CurriculumVersionSchema, ClassConfigSchema and ExplanationOverrideSchema.

export async function up(db: Kysely<unknown>): Promise<void> {
  // Shared across classes (D3).
  await sql`
    CREATE TABLE curriculum (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL REFERENCES organization (id),
      title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
      created_by uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (org_id, id),
      FOREIGN KEY (org_id, created_by) REFERENCES app_user (org_id, id)
    )
  `.execute(db);
  await touchUpdatedAt(db, 'curriculum');
  await tenantTable(db, 'curriculum');
  await grantApp(db, 'curriculum', ['SELECT', 'INSERT', 'UPDATE']);

  // An immutable snapshot (§5, §7). The body is validated jsonb: `pack` is a
  // PackSchema value, `derived` a VersionDerivedSchema value (null until derived),
  // `issues` a PackIssue[] and `source` a VersionSourceSchema value.
  await sql`
    CREATE TABLE curriculum_version (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL,
      curriculum_id uuid NOT NULL,
      number integer NOT NULL CHECK (number >= 1),
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
      pack jsonb NOT NULL CHECK (jsonb_typeof(pack) = 'object'),
      derived jsonb CHECK (jsonb_typeof(derived) = 'object'),
      issues jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(issues) = 'array'),
      source jsonb NOT NULL CHECK (jsonb_typeof(source) = 'object'),
      created_by uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      published_at timestamptz,
      -- Also the index for listing a curriculum's versions in order.
      UNIQUE (curriculum_id, number),
      UNIQUE (org_id, id),
      UNIQUE (curriculum_id, id),
      -- Matches the contract: only drafts lack a publish time.
      CHECK ((status = 'draft') = (published_at IS NULL)),
      FOREIGN KEY (org_id, curriculum_id) REFERENCES curriculum (org_id, id),
      FOREIGN KEY (org_id, created_by) REFERENCES app_user (org_id, id)
    )
  `.execute(db);

  // Once published, a version's body never changes (§2 "immutable snapshots", D2).
  // A draft may still be re-derived. Status moves draft → published → archived, and
  // archived → published for a rollback (§7); never back to draft. Published and
  // archived versions can't be deleted.
  await sql`
    CREATE FUNCTION app.guard_curriculum_version() RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'curriculum_version %: a % version cannot be deleted', OLD.id, OLD.status
              USING ERRCODE = 'insufficient_privilege';
          END IF;
          RETURN OLD;
        END IF;
        IF NEW.id <> OLD.id OR NEW.org_id <> OLD.org_id OR NEW.curriculum_id <> OLD.curriculum_id
           OR NEW.number <> OLD.number OR NEW.created_at <> OLD.created_at
           OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
          RAISE EXCEPTION 'curriculum_version %: identity columns cannot change', OLD.id
            USING ERRCODE = 'insufficient_privilege';
        END IF;
        IF OLD.status <> 'draft' AND (
             NEW.pack IS DISTINCT FROM OLD.pack OR NEW.derived IS DISTINCT FROM OLD.derived
             OR NEW.issues IS DISTINCT FROM OLD.issues OR NEW.source IS DISTINCT FROM OLD.source
             OR NEW.published_at IS DISTINCT FROM OLD.published_at) THEN
          RAISE EXCEPTION 'curriculum_version %: a % version is immutable', OLD.id, OLD.status
            USING ERRCODE = 'insufficient_privilege';
        END IF;
        IF OLD.status <> 'draft' AND NEW.status = 'draft' THEN
          RAISE EXCEPTION 'curriculum_version %: a % version cannot return to draft', OLD.id, OLD.status
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END
      $$
  `.execute(db);
  await sql`
    CREATE TRIGGER guard BEFORE UPDATE OR DELETE ON curriculum_version
      FOR EACH ROW EXECUTE FUNCTION app.guard_curriculum_version()
  `.execute(db);
  await tenantTable(db, 'curriculum_version');
  await grantApp(db, 'curriculum_version', ['SELECT', 'INSERT', 'UPDATE', 'DELETE']);

  // Curriculum-level values that the author sets in the app (§5 "personas, framework,
  // grade, objective", §6 first column). `config` has the ClassConfigSchema shape and
  // overrides the published pack; `column_mapping` has the shape of
  // VersionSourceSchema.column_mapping and applies to the next import (§6).
  await sql`
    CREATE TABLE curriculum_defaults (
      curriculum_id uuid PRIMARY KEY,
      org_id uuid NOT NULL,
      config jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(config) = 'object'),
      column_mapping jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(column_mapping) = 'array'),
      updated_by uuid,
      updated_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (org_id, curriculum_id) REFERENCES curriculum (org_id, id) ON DELETE CASCADE,
      FOREIGN KEY (org_id, updated_by) REFERENCES app_user (org_id, id)
    )
  `.execute(db);
  await touchUpdatedAt(db, 'curriculum_defaults');
  await tenantTable(db, 'curriculum_defaults');
  await grantApp(db, 'curriculum_defaults', ['SELECT', 'INSERT', 'UPDATE']);

  // D9: a teacher-approved explanation per curriculum and idea, shared by all its
  // classes and reused on re-import until the sheet supplies its own. Columns follow
  // ExplanationOverrideSchema (text ≤ LIMITS.explanation, source sheet | ai).
  await sql`
    CREATE TABLE approved_explanation (
      curriculum_id uuid NOT NULL,
      idea_id text NOT NULL CHECK (idea_id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
      org_id uuid NOT NULL,
      text text NOT NULL CHECK (length(btrim(text)) BETWEEN 1 AND 2000),
      source text NOT NULL CHECK (source IN ('sheet', 'ai')),
      approved_by uuid NOT NULL,
      approved_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (curriculum_id, idea_id),
      FOREIGN KEY (org_id, curriculum_id) REFERENCES curriculum (org_id, id) ON DELETE CASCADE,
      FOREIGN KEY (org_id, approved_by) REFERENCES app_user (org_id, id)
    )
  `.execute(db);
  await tenantTable(db, 'approved_explanation');
  await grantApp(db, 'approved_explanation', ['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await dropTables(db, [
    'approved_explanation',
    'curriculum_defaults',
    'curriculum_version',
    'curriculum',
  ]);
  await sql`DROP FUNCTION IF EXISTS app.guard_curriculum_version()`.execute(db);
}
