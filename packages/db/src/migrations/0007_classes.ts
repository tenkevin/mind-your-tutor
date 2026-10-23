import { sql, type Kysely } from 'kysely';
import { dropTables, grantApp, tenantTable, touchUpdatedAt } from './helpers.js';

// Class, ClassConfig and Enrollment (ARCHITECTURE.md §2, §5, §6, §7 publish and rollback).

export async function up(db: Kysely<unknown>): Promise<void> {
  // A teacher's class on one curriculum. `pinned_version_id` is the version its
  // students see: null until the first publish, then always a published (or, after
  // later publishes, archived) version of the same curriculum. Rollback is re-pinning.
  await sql`
    CREATE TABLE class (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL,
      curriculum_id uuid NOT NULL,
      pinned_version_id uuid,
      teacher_id uuid NOT NULL,
      name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
      -- IANA zone; day streaks are counted in the class time zone (§8.3).
      time_zone text NOT NULL DEFAULT 'UTC' CHECK (length(time_zone) BETWEEN 1 AND 64),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (org_id, id),
      FOREIGN KEY (org_id, curriculum_id) REFERENCES curriculum (org_id, id),
      FOREIGN KEY (curriculum_id, pinned_version_id) REFERENCES curriculum_version (curriculum_id, id),
      FOREIGN KEY (org_id, teacher_id) REFERENCES app_user (org_id, id)
    )
  `.execute(db);
  await sql`CREATE INDEX class_pinned_version ON class (pinned_version_id)`.execute(db);
  await sql`CREATE INDEX class_curriculum ON class (curriculum_id)`.execute(db);
  await sql`CREATE INDEX class_teacher ON class (teacher_id)`.execute(db);

  // Students only ever see a published version (D2), so a draft can't be pinned.
  await sql`
    CREATE FUNCTION app.guard_class_pin() RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.pinned_version_id IS NOT NULL
           AND (TG_OP = 'INSERT' OR NEW.pinned_version_id IS DISTINCT FROM OLD.pinned_version_id)
           AND (SELECT status FROM curriculum_version WHERE id = NEW.pinned_version_id) = 'draft' THEN
          RAISE EXCEPTION 'class %: a draft version cannot be pinned', NEW.id
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END
      $$
  `.execute(db);
  await sql`
    CREATE TRIGGER guard_pin BEFORE INSERT OR UPDATE OF pinned_version_id ON class
      FOR EACH ROW EXECUTE FUNCTION app.guard_class_pin()
  `.execute(db);
  await touchUpdatedAt(db, 'class');
  await tenantTable(db, 'class');
  await grantApp(db, 'class', ['SELECT', 'INSERT', 'UPDATE', 'DELETE']);

  // The class's overrides of its curriculum's values (§6), a ClassConfigSchema value.
  // Mutable; every change is also written to audit_event (§2, §10).
  await sql`
    CREATE TABLE class_config (
      class_id uuid PRIMARY KEY,
      org_id uuid NOT NULL,
      config jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(config) = 'object'),
      updated_by uuid,
      updated_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (org_id, class_id) REFERENCES class (org_id, id) ON DELETE CASCADE,
      FOREIGN KEY (org_id, updated_by) REFERENCES app_user (org_id, id)
    )
  `.execute(db);
  await touchUpdatedAt(db, 'class_config');
  await tenantTable(db, 'class_config');
  await grantApp(db, 'class_config', ['SELECT', 'INSERT', 'UPDATE', 'DELETE']);

  await sql`
    CREATE TABLE enrollment (
      class_id uuid NOT NULL,
      student_id uuid NOT NULL,
      org_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (class_id, student_id),
      FOREIGN KEY (org_id, class_id) REFERENCES class (org_id, id) ON DELETE CASCADE,
      FOREIGN KEY (org_id, student_id) REFERENCES app_user (org_id, id) ON DELETE CASCADE
    )
  `.execute(db);
  await sql`CREATE INDEX enrollment_student ON enrollment (student_id)`.execute(db);
  await tenantTable(db, 'enrollment');
  await grantApp(db, 'enrollment', ['SELECT', 'INSERT', 'DELETE']);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await dropTables(db, ['enrollment', 'class_config', 'class']);
  await sql`DROP FUNCTION IF EXISTS app.guard_class_pin()`.execute(db);
}
