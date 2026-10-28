import { sql, type Kysely } from 'kysely';
import { APP_ROLE } from './helpers.js';

// Teaching materials are kept (ARCHITECTURE.md D31). A shared or class document is
// replaced by a new version or taken out of use (`archived_at`), never deleted, so the
// app role loses DELETE on both document tables. A new version is a new row that names
// the one it replaces (`replaces_id`); the old row is archived when the new one is
// indexed, so search never has a gap. Passages (`chunk`, `class_chunk`) keep DELETE:
// re-indexing a document replaces its own passages.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE library_doc
      ADD COLUMN archived_at timestamptz,
      ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
      ADD COLUMN replaces_id uuid,
      ADD FOREIGN KEY (curriculum_id, replaces_id) REFERENCES library_doc (curriculum_id, id)
  `.execute(db);
  await sql`
    ALTER TABLE class_library_doc
      ADD COLUMN archived_at timestamptz,
      ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
      ADD COLUMN replaces_id uuid,
      ADD FOREIGN KEY (class_id, replaces_id) REFERENCES class_library_doc (class_id, id)
  `.execute(db);
  for (const table of ['library_doc', 'class_library_doc']) {
    await sql`REVOKE DELETE ON ${sql.table(table)} FROM ${sql.id(APP_ROLE)}`.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of ['library_doc', 'class_library_doc']) {
    await sql`GRANT DELETE ON ${sql.table(table)} TO ${sql.id(APP_ROLE)}`.execute(db);
    await sql`
      ALTER TABLE ${sql.table(table)}
        DROP COLUMN replaces_id, DROP COLUMN version, DROP COLUMN archived_at
    `.execute(db);
  }
}
