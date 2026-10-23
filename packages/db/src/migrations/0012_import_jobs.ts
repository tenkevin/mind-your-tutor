import { sql, type Kysely } from 'kysely';

// What C4's import jobs need beyond 0009 (ARCHITECTURE.md §7, §11):
// - `steps`: progress through the Teacher Settings pipeline, an ImportStep[] from
//   `@ideamap/contracts`, so the page can show each step and its result.
// - `idempotency_key`: the client's Idempotency-Key, so the same upload sent twice
//   makes one job (C4-F7). Unique per curriculum when given.

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE import_job
      ADD COLUMN steps jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(steps) = 'array'),
      ADD COLUMN idempotency_key text CHECK (length(idempotency_key) BETWEEN 1 AND 200)
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX import_job_idempotency ON import_job (org_id, curriculum_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS import_job_idempotency`.execute(db);
  await sql`ALTER TABLE import_job DROP COLUMN IF EXISTS idempotency_key, DROP COLUMN IF EXISTS steps`.execute(
    db,
  );
}
