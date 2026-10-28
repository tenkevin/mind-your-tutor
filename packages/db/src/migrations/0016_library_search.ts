import { sql, type Kysely } from 'kysely';

// Library search (A3, ARCHITECTURE.md §9): a passage says where in its document it came
// from, so an answer can cite "page 3" or "Evaporation". `page` is a PDF page (from 1);
// `section` is a heading in a Word or Markdown file. Both are null when unknown.

const TABLES = ['chunk', 'class_chunk'] as const;

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const table of TABLES) {
    await sql`
      ALTER TABLE ${sql.table(table)}
        ADD COLUMN page integer CHECK (page >= 1),
        ADD COLUMN section text CHECK (length(section) BETWEEN 1 AND 200)
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of TABLES) {
    await sql`ALTER TABLE ${sql.table(table)} DROP COLUMN section, DROP COLUMN page`.execute(db);
  }
}
