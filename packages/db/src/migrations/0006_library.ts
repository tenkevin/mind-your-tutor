import { sql, type Kysely } from 'kysely';
import { dropTables, grantApp, tenantTable, touchUpdatedAt } from './helpers.js';

// LibraryDoc and Chunk (ARCHITECTURE.md §5, §7 "Library indexing", §9 library passages).
// Library documents belong to the curriculum, not to a version: indexing runs when the
// documents change, independent of versions (§7).

/** Embedding width. Fixed by the embedding model; see Open questions in ARCHITECTURE.md. */
export const EMBEDDING_DIMENSIONS = 1024;

export async function up(db: Kysely<unknown>): Promise<void> {
  // Columns `title`, `file_url` and `use_for` follow the Library tab (LibraryDocSchema).
  await sql`
    CREATE TABLE library_doc (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL,
      curriculum_id uuid NOT NULL,
      title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
      file_url text NOT NULL CHECK (length(file_url) BETWEEN 1 AND 2048),
      use_for text NOT NULL DEFAULT 'agent' CHECK (use_for IN ('agent', 'tutor', 'both')),
      -- SHA-256 of the indexed bytes, lowercase hex; null until fetched.
      checksum text CHECK (checksum ~ '^[0-9a-f]{64}$'),
      index_status text NOT NULL DEFAULT 'pending'
        CHECK (index_status IN ('pending', 'indexing', 'indexed', 'failed')),
      indexed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (org_id, id),
      UNIQUE (curriculum_id, id),
      UNIQUE (curriculum_id, file_url),
      FOREIGN KEY (org_id, curriculum_id) REFERENCES curriculum (org_id, id)
    )
  `.execute(db);
  await touchUpdatedAt(db, 'library_doc');
  await tenantTable(db, 'library_doc');
  await grantApp(db, 'library_doc', ['SELECT', 'INSERT', 'UPDATE', 'DELETE']);

  // One passage of a document with its embedding. `curriculum_id` is copied from the
  // document (and kept equal by the foreign key) so search can filter on it directly.
  await sql`
    CREATE TABLE chunk (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id uuid NOT NULL,
      curriculum_id uuid NOT NULL,
      library_doc_id uuid NOT NULL,
      ordinal integer NOT NULL CHECK (ordinal >= 0),
      content text NOT NULL CHECK (length(content) BETWEEN 1 AND 20000),
      embedding vector(${sql.raw(String(EMBEDDING_DIMENSIONS))}) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (library_doc_id, ordinal),
      FOREIGN KEY (org_id, library_doc_id) REFERENCES library_doc (org_id, id) ON DELETE CASCADE,
      FOREIGN KEY (curriculum_id, library_doc_id) REFERENCES library_doc (curriculum_id, id)
        ON DELETE CASCADE
    )
  `.execute(db);
  await sql`CREATE INDEX chunk_curriculum ON chunk (curriculum_id)`.execute(db);
  await sql`CREATE INDEX chunk_embedding ON chunk USING hnsw (embedding vector_cosine_ops)`.execute(
    db,
  );
  await tenantTable(db, 'chunk');
  await grantApp(db, 'chunk', ['SELECT', 'INSERT', 'DELETE']);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await dropTables(db, ['chunk', 'library_doc']);
}
