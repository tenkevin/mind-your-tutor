import { readFileSync } from 'node:fs';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshDatabase, hasDatabase, type TestDatabase } from './test/harness.js';

// F6-F1: docs/privacy/data-inventory.md names every column of every table, with each
// question answered. Fails when a migration adds a column the inventory doesn't list,
// or the inventory lists one that doesn't exist.

const INVENTORY = new URL('../../../docs/privacy/data-inventory.md', import.meta.url);

const HEADER = [
  'Field',
  'What it is for',
  'Student personal data?',
  'Comes from',
  'Who can see it',
  'Kept for',
  'How it is deleted',
];
const PERSONAL = ['Identifying', 'Student record', 'Staff', 'No'];
/** `table.column` (public schema) or `schema.table.column`. */
const FIELD = /`([a-z_]+(?:\.[a-z_]+){1,2})`/g;

interface Row {
  line: number;
  fields: string[];
  cells: string[];
}

/** Every row of every inventory table (those with the standard header). */
function inventoryRows(markdown: string): Row[] {
  const rows: Row[] = [];
  let inTable = false;
  markdown.split('\n').forEach((text, i) => {
    if (!text.startsWith('|')) {
      inTable = false;
      return;
    }
    const cells = text
      .slice(1, -1)
      .split('|')
      .map((c) => c.trim());
    if (cells[0] === 'Field') {
      inTable = cells.join('|') === HEADER.join('|');
      return;
    }
    if (!inTable || cells.every((c) => /^-+$/.test(c))) return;
    const fields = [...cells[0]!.matchAll(FIELD)].map((m) =>
      m[1]!.split('.').length === 2 ? `public.${m[1]}` : m[1]!,
    );
    rows.push({ line: i + 1, fields, cells });
  });
  return rows;
}

describe('data inventory format', () => {
  const rows = inventoryRows(readFileSync(INVENTORY, 'utf8'));

  it('has rows', () => {
    expect(rows.length).toBeGreaterThan(50);
  });

  it('answers every question for every row', () => {
    for (const row of rows) {
      expect(row.cells, `line ${row.line}`).toHaveLength(HEADER.length);
      for (const [i, cell] of row.cells.entries()) {
        expect(cell.length, `line ${row.line}: ${HEADER[i]}`).toBeGreaterThan(1);
      }
      expect(PERSONAL, `line ${row.line}`).toContain(row.cells[2]);
    }
  });

  it('lists each field once', () => {
    const fields = rows.flatMap((r) => r.fields);
    expect(fields.filter((f, i) => fields.indexOf(f) !== i)).toEqual([]);
  });
});

describe.skipIf(!hasDatabase)('data inventory covers the schema (F6-F1)', () => {
  let t: TestDatabase;
  beforeAll(async () => {
    t = await freshDatabase();
  });
  afterAll(async () => {
    await t?.drop();
  });

  /** Fields in the database and in the inventory, each missing from the other. */
  async function compare() {
    // Partitions share their parent's columns, so only parents are listed.
    const { rows } = await sql<{ field: string }>`
      SELECT n.nspname || '.' || c.relname || '.' || a.attname AS field
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      WHERE c.relkind IN ('r', 'p') AND NOT c.relispartition
        AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY 1
    `.execute(t.db);
    const live = rows.map((r) => r.field);
    const documented = inventoryRows(readFileSync(INVENTORY, 'utf8')).flatMap((r) => r.fields);
    return {
      undocumented: live.filter((f) => !documented.includes(f)),
      stale: documented.filter((f) => !live.includes(f)),
    };
  }

  it('names every column of every table, and nothing else', async () => {
    expect(await compare()).toEqual({ undocumented: [], stale: [] });
  });

  it('fails when a column is added without an entry', async () => {
    await sql`ALTER TABLE class ADD COLUMN nickname text`.execute(t.db);
    await sql`CREATE TABLE pgboss.extra (note text)`.execute(t.db);
    try {
      expect((await compare()).undocumented).toEqual([
        'pgboss.extra.note',
        'public.class.nickname',
      ]);
    } finally {
      await sql`ALTER TABLE class DROP COLUMN nickname`.execute(t.db);
      await sql`DROP TABLE pgboss.extra`.execute(t.db);
    }
  });
});
