import { sql, type Kysely } from 'kysely';
import { EMBEDDING_DIMENSIONS } from './0006_library.js';
import { dropTables, grantApp, tenantTable, touchUpdatedAt } from './helpers.js';

// Each class shapes its own library (ARCHITECTURE.md D11, §5 ClassLibraryDoc and
// ClassLibrarySetting). A teacher can, for their class only, change how the AI uses
// each shared document (or hide it with `off`) and upload their own documents. Search
// covers the shared chunks plus the class's own, after its settings are applied.
// Nothing here affects other classes on the same curriculum.

export async function up(db: Kysely<unknown>): Promise<void> {
  // Lets a row name a class and its curriculum together, so a setting can only point
  // at a shared document of that class's curriculum.
  await sql`ALTER TABLE class ADD CONSTRAINT class_id_curriculum UNIQUE (id, curriculum_id)`.execute(
    db,
  );

  // How one class uses one shared document: a LibraryDoc `use_for`, or `off` to hide
  // it. No row means the curriculum's default.
  await sql`
    CREATE TABLE class_library_setting (
      class_id uuid NOT NULL,
      library_doc_id uuid NOT NULL,
      org_id uuid NOT NULL,
      curriculum_id uuid NOT NULL,
      use_for text NOT NULL CHECK (use_for IN ('agent', 'tutor', 'both', 'off')),
      updated_by uuid,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (class_id, library_doc_id),
      FOREIGN KEY (org_id, class_id) REFERENCES class (org_id, id) ON DELETE CASCADE,
      FOREIGN KEY (class_id, curriculum_id) REFERENCES class (id, curriculum_id) ON DELETE CASCADE,
      FOREIGN KEY (curriculum_id, library_doc_id) REFERENCES library_doc (curriculum_id, id)
        ON DELETE CASCADE,
      FOREIGN KEY (org_id, updated_by) REFERENCES app_user (org_id, id)
    )
  `.execute(db);
  await touchUpdatedAt(db, 'class_library_setting');
  await tenantTable(db, 'class_library_setting');
  await grantApp(db, 'class_library_setting', ['SELECT', 'INSERT', 'UPDATE', 'DELETE']);

  // A document a teacher uploaded for their class only. Columns as library_doc.
  await sql`
    CREATE TABLE class_library_doc (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL,
      class_id uuid NOT NULL,
      title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
      file_url text NOT NULL CHECK (length(file_url) BETWEEN 1 AND 2048),
      use_for text NOT NULL DEFAULT 'agent' CHECK (use_for IN ('agent', 'tutor', 'both')),
      checksum text CHECK (checksum ~ '^[0-9a-f]{64}$'),
      index_status text NOT NULL DEFAULT 'pending'
        CHECK (index_status IN ('pending', 'indexing', 'indexed', 'failed')),
      indexed_at timestamptz,
      uploaded_by uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (org_id, id),
      UNIQUE (class_id, id),
      UNIQUE (class_id, file_url),
      FOREIGN KEY (org_id, class_id) REFERENCES class (org_id, id) ON DELETE CASCADE,
      FOREIGN KEY (org_id, uploaded_by) REFERENCES app_user (org_id, id)
    )
  `.execute(db);
  await touchUpdatedAt(db, 'class_library_doc');
  await tenantTable(db, 'class_library_doc');
  await grantApp(db, 'class_library_doc', ['SELECT', 'INSERT', 'UPDATE', 'DELETE']);

  // Passages of a class upload, as chunk is for shared documents. `class_id` is copied
  // from the document (kept equal by the foreign key) so search can filter on it.
  await sql`
    CREATE TABLE class_chunk (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL,
      class_id uuid NOT NULL,
      class_library_doc_id uuid NOT NULL,
      ordinal integer NOT NULL CHECK (ordinal >= 0),
      content text NOT NULL CHECK (length(content) BETWEEN 1 AND 20000),
      embedding vector(${sql.raw(String(EMBEDDING_DIMENSIONS))}) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (class_library_doc_id, ordinal),
      FOREIGN KEY (org_id, class_library_doc_id) REFERENCES class_library_doc (org_id, id)
        ON DELETE CASCADE,
      FOREIGN KEY (class_id, class_library_doc_id) REFERENCES class_library_doc (class_id, id)
        ON DELETE CASCADE
    )
  `.execute(db);
  await sql`CREATE INDEX class_chunk_class ON class_chunk (class_id)`.execute(db);
  await sql`
    CREATE INDEX class_chunk_embedding ON class_chunk USING hnsw (embedding vector_cosine_ops)
  `.execute(db);
  await tenantTable(db, 'class_chunk');
  await grantApp(db, 'class_chunk', ['SELECT', 'INSERT', 'DELETE']);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await dropTables(db, ['class_chunk', 'class_library_doc', 'class_library_setting']);
  await sql`ALTER TABLE class DROP CONSTRAINT IF EXISTS class_id_curriculum`.execute(db);
}
