import { sql, type Kysely } from 'kysely';
import { APP_ROLE } from './helpers.js';

// Library assets are tiered (ARCHITECTURE.md D31). Shared documents are the vault: replaced
// by a new version or taken out of use (`archived_at`), never deleted, so the app role
// loses DELETE on `library_doc`. A class's own uploads are disposable: they get the same
// columns (archive, versions) but keep DELETE, under their class row-level security, and
// go with their class. A new version is a new row that names
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
        ON DELETE SET NULL (replaces_id)
  `.execute(db);
  await sql`REVOKE DELETE ON library_doc FROM ${sql.id(APP_ROLE)}`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`GRANT DELETE ON library_doc TO ${sql.id(APP_ROLE)}`.execute(db);
  for (const table of ['library_doc', 'class_library_doc']) {
    await sql`
      ALTER TABLE ${sql.table(table)}
        DROP COLUMN replaces_id, DROP COLUMN version, DROP COLUMN archived_at
    `.execute(db);
  }
}
