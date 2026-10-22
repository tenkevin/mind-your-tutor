import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrateDownAll, migrateUp, resetDatabase } from './migrate.js';
import { migrations } from './migrations/index.js';
import { COLUMNS } from './schema.js';
import { freshDatabase, hasDatabase, type TestDatabase } from './test/harness.js';

// The ARCHITECTURE.md §5 entities, by table name.
const ENTITIES = {
  Organization: 'organization',
  User: 'app_user',
  Curriculum: 'curriculum',
  CurriculumVersion: 'curriculum_version',
  CurriculumDefaults: 'curriculum_defaults',
  'Approved explanation (D9)': 'approved_explanation',
  LibraryDoc: 'library_doc',
  Chunk: 'chunk',
  Class: 'class',
  ClassConfig: 'class_config',
  Enrollment: 'enrollment',
  InteractionEvent: 'interaction_event',
  InteractionText: 'interaction_text',
  GeneratedMapView: 'generated_map_view',
  AiOutput: 'ai_output',
  ProgressSnapshot: 'progress_snapshot',
  ImportJob: 'import_job',
  ExportJob: 'export_job',
  AuditEvent: 'audit_event',
  AiInteraction: 'ai_interaction',
} as const;

async function tables(t: TestDatabase): Promise<string[]> {
  const rows = await sql<{ relname: string }>`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
    ORDER BY 1
  `.execute(t.db);
  return rows.rows.map((r) => r.relname);
}

describe.skipIf(!hasDatabase)('migrations', () => {
  let t: TestDatabase;
  beforeAll(async () => {
    t = await freshDatabase();
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('create every §5 entity (F4-F1)', async () => {
    const present = await tables(t);
    for (const [entity, table] of Object.entries(ENTITIES)) {
      expect(present, entity).toContain(table);
    }
    // Plus only the event key ledger and the migrator's own tables.
    expect(present.sort()).toEqual(
      [...Object.keys(COLUMNS), 'kysely_migration', 'kysely_migration_lock'].sort(),
    );
  });

  it('give Chunk a pgvector column and Class a pinned version (F4-F1)', async () => {
    const { rows } = await sql<{ table_name: string; column_name: string; udt_name: string }>`
      SELECT table_name, column_name, udt_name FROM information_schema.columns
      WHERE (table_name, column_name) IN (('chunk', 'embedding'), ('class', 'pinned_version_id'))
      ORDER BY 1
    `.execute(t.db);
    expect(rows).toEqual([
      { table_name: 'chunk', column_name: 'embedding', udt_name: 'vector' },
      { table_name: 'class', column_name: 'pinned_version_id', udt_name: 'uuid' },
    ]);
  });

  it('install pgvector and the pg-boss schema (F4-F6)', async () => {
    const ext = await sql<{ extname: string }>`SELECT extname FROM pg_extension`.execute(t.db);
    expect(ext.rows.map((r) => r.extname)).toContain('vector');
    const boss = await sql<{ version: number }>`SELECT version FROM pgboss.version`.execute(t.db);
    expect(boss.rows).toHaveLength(1);
    const queue = await sql<{ n: number }>`
      SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'pgboss' AND table_name IN ('queue', 'job')
    `.execute(t.db);
    expect(queue.rows[0]!.n).toBe(2);
  });

  it('partition interaction_event by month, with a function for new months (F4-F5)', async () => {
    const { rows } = await sql<{ strategy: string; key: string }>`
      SELECT partstrat AS strategy, pg_get_partkeydef('interaction_event'::regclass) AS key
      FROM pg_partitioned_table WHERE partrelid = 'interaction_event'::regclass
    `.execute(t.db);
    expect(rows).toEqual([{ strategy: 'r', key: 'RANGE (recorded_at)' }]);

    const parts = await sql<{ name: string; bound: string }>`
      SELECT c.relname AS name, pg_get_expr(c.relpartbound, c.oid) AS bound
      FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
      WHERE i.inhparent = 'interaction_event'::regclass ORDER BY 1
    `.execute(t.db);
    // This month and the two after it.
    expect(parts.rows).toHaveLength(3);

    const created = await sql<{ name: string }>`
      SELECT app.create_interaction_event_partition('2031-02-14') AS name
    `.execute(t.db);
    expect(created.rows[0]!.name).toBe('interaction_event_y2031m02');
    // Month boundaries are midnight UTC, whatever the session's time zone.
    const bound = await t.db.transaction().execute(async (trx) => {
      await sql`SET LOCAL timezone = 'UTC'`.execute(trx);
      return sql<{ bound: string }>`
        SELECT pg_get_expr(relpartbound, oid) AS bound FROM pg_class
        WHERE relname = 'interaction_event_y2031m02'
      `.execute(trx);
    });
    expect(bound.rows[0]!.bound).toBe(
      "FOR VALUES FROM ('2031-02-01 00:00:00+00') TO ('2031-03-01 00:00:00+00')",
    );
    // Calling it again for the same month is a no-op.
    await sql`SELECT app.create_interaction_event_partition('2031-02-01')`.execute(t.db);
    await sql`SELECT app.ensure_interaction_event_partitions(3)`.execute(t.db);
    const after = await sql<{ n: number }>`
      SELECT count(*)::int AS n FROM pg_inherits WHERE inhparent = 'interaction_event'::regclass
    `.execute(t.db);
    expect(after.rows[0]!.n).toBe(5);
  });

  it('run in under 30 seconds (F4-P1)', () => {
    expect(t.migrateMs).toBeLessThan(30_000);
  });

  it('are a no-op when run again (F4-F7)', async () => {
    const again = await migrateUp(t.db);
    expect(again.results).toEqual([]);
  });
});

describe.skipIf(!hasDatabase)('migrations down and up', () => {
  let t: TestDatabase;
  beforeAll(async () => {
    t = await freshDatabase();
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('undo everything and apply again cleanly (F4-F7)', async () => {
    const down = await migrateDownAll(t.db);
    expect(down.results?.map((r) => r.migrationName)).toEqual(Object.keys(migrations).reverse());
    expect(await tables(t)).toEqual(['kysely_migration', 'kysely_migration_lock']);
    const schemas = await sql<{ nspname: string }>`
      SELECT nspname FROM pg_namespace WHERE nspname IN ('app', 'pgboss')
    `.execute(t.db);
    expect(schemas.rows).toEqual([]);

    const up = await migrateUp(t.db);
    expect(up.results?.map((r) => r.migrationName)).toEqual(Object.keys(migrations));
  });

  it('reset to a clean database in under 10 seconds (F4-U3)', async () => {
    await sql`INSERT INTO organization (name) VALUES ('Leftover District')`.execute(t.db);
    const started = performance.now();
    await resetDatabase(t.db);
    expect(performance.now() - started).toBeLessThan(10_000);
    const orgs = await sql<{ n: number }>`SELECT count(*)::int AS n FROM organization`.execute(
      t.db,
    );
    expect(orgs.rows[0]!.n).toBe(0);
  });
});
