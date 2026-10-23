import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { json } from './client.js';
import { APP_ROLE } from './migrations/helpers.js';
import { CLASS_SCOPED_TABLES, OWNER_LOOKUP_TABLES, TENANT_TABLES } from './schema.js';
import {
  asApp,
  errorCode,
  freshDatabase,
  hasDatabase,
  PG,
  type TestDatabase,
} from './test/harness.js';
import { embedding, seedOrg, testUlid, type SeededOrg } from './test/seed.js';

// F4-S1 to F4-S5 and F4-F4: row-level security, the app role, append-only events
// and where student text lives.

describe.skipIf(!hasDatabase)('row-level security per org (F4-S1)', () => {
  let t: TestDatabase;
  let a: SeededOrg;
  let b: SeededOrg;
  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedOrg(t.db, 'a');
    b = await seedOrg(t.db, 'b');
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('is enabled and forced on every tenant table', async () => {
    const { rows } = await sql<{ relname: string; on: boolean; forced: boolean; policies: number }>`
      SELECT c.relname, c.relrowsecurity AS on, c.relforcerowsecurity AS forced,
        (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
      FROM pg_class c
      WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
        AND NOT c.relispartition AND c.relname NOT LIKE 'kysely_%'
      ORDER BY 1
    `.execute(t.db);
    expect(rows.map((r) => r.relname)).toEqual([...TENANT_TABLES].sort());
    const classScoped: readonly string[] = CLASS_SCOPED_TABLES;
    const ownerLookup: readonly string[] = OWNER_LOOKUP_TABLES;
    for (const row of rows) {
      const policies =
        classScoped.includes(row.relname) || ownerLookup.includes(row.relname) ? 2 : 1;
      expect(row, row.relname).toMatchObject({ on: true, forced: true, policies });
    }
  });

  it.each(TENANT_TABLES)('shows org A only its own rows in %s', async (table) => {
    const orgColumn = table === 'organization' ? 'id' : 'org_id';
    const classScoped: readonly string[] = CLASS_SCOPED_TABLES;
    const rows = await asApp(
      t.db,
      a.orgId,
      (trx) =>
        sql<{
          org: string;
        }>`SELECT ${sql.ref(orgColumn)}::text AS org FROM ${sql.table(table)}`.execute(trx),
      classScoped.includes(table) ? a.classId : null,
    );
    expect(rows.rows.length, `${table} has rows for org A`).toBeGreaterThan(0);
    expect(rows.rows.filter((r) => r.org !== a.orgId)).toEqual([]);
  });

  it.each(TENANT_TABLES)('shows nothing in %s when no org is set', async (table) => {
    const rows = await asApp(t.db, null, (trx) =>
      sql`SELECT 1 FROM ${sql.table(table)}`.execute(trx),
    );
    expect(rows.rows).toEqual([]);
  });

  it("refuses to write rows into another org's data", async () => {
    const insert = await errorCode(() =>
      asApp(t.db, a.orgId, (trx) =>
        trx.insertInto('curriculum').values({ org_id: b.orgId, title: 'Sneaky' }).execute(),
      ),
    );
    expect(insert).toBe(PG.rlsViolation);
    const update = await asApp(t.db, a.orgId, (trx) =>
      trx
        .updateTable('curriculum')
        .set({ title: 'Changed' })
        .where('id', '=', b.curriculumId)
        .executeTakeFirst(),
    );
    expect(update.numUpdatedRows).toBe(0n);
  });
});

describe.skipIf(!hasDatabase)('class uploads and settings are scoped to their class (D11)', () => {
  let t: TestDatabase;
  let a: SeededOrg;
  let otherClassId: string;
  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedOrg(t.db, 'a');
    // A second class in the same organization, with a setting and an upload of its own.
    const other = await t.db
      .insertInto('class')
      .values({
        org_id: a.orgId,
        curriculum_id: a.curriculumId,
        pinned_version_id: a.publishedId,
        teacher_id: a.teacherId,
        name: 'Other class',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    otherClassId = other.id;
    await t.db
      .insertInto('class_library_setting')
      .values({
        org_id: a.orgId,
        class_id: otherClassId,
        curriculum_id: a.curriculumId,
        library_doc_id: a.libraryDocId,
        use_for: 'both',
      })
      .execute();
    const upload = await t.db
      .insertInto('class_library_doc')
      .values({
        org_id: a.orgId,
        class_id: otherClassId,
        title: 'Other notes',
        file_url: 'other.pdf',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await t.db
      .insertInto('class_chunk')
      .values({
        org_id: a.orgId,
        class_id: otherClassId,
        class_library_doc_id: upload.id,
        ordinal: 0,
        content: 'Other class only.',
        embedding: embedding(9),
      })
      .execute();
  });
  afterAll(async () => {
    await t?.drop();
  });

  it.each(CLASS_SCOPED_TABLES)('shows a class only its own rows in %s', async (table) => {
    const rows = await asApp(
      t.db,
      a.orgId,
      (trx) =>
        sql<{ class_id: string }>`SELECT class_id::text FROM ${sql.table(table)}`.execute(trx),
      a.classId,
    );
    expect(rows.rows.length).toBeGreaterThan(0);
    expect(rows.rows.filter((r) => r.class_id !== a.classId)).toEqual([]);
  });

  it.each(CLASS_SCOPED_TABLES)(
    'shows nothing in %s with an org but no class set',
    async (table) => {
      const rows = await asApp(t.db, a.orgId, (trx) =>
        sql`SELECT 1 FROM ${sql.table(table)}`.execute(trx),
      );
      expect(rows.rows).toEqual([]);
    },
  );

  it('refuses to add an upload to another class', async () => {
    const code = await errorCode(() =>
      asApp(
        t.db,
        a.orgId,
        (trx) =>
          trx
            .insertInto('class_library_doc')
            .values({ org_id: a.orgId, class_id: otherClassId, title: 'Sneaky', file_url: 's.pdf' })
            .execute(),
        a.classId,
      ),
    );
    expect(code).toBe(PG.rlsViolation);
  });
});

describe.skipIf(!hasDatabase)('the app role (F4-S2)', () => {
  let t: TestDatabase;
  let a: SeededOrg;
  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedOrg(t.db, 'a');
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('is not a superuser, cannot bypass RLS and owns nothing', async () => {
    const { rows } = await sql<Record<string, boolean>>`
      SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication
      FROM pg_roles WHERE rolname = ${APP_ROLE}
    `.execute(t.db);
    expect(rows).toEqual([
      {
        rolsuper: false,
        rolbypassrls: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
      },
    ]);
    const owned = await sql<{ n: number }>`
      SELECT count(*)::int AS n FROM pg_class WHERE relowner = ${APP_ROLE}::regrole
    `.execute(t.db);
    expect(owned.rows[0]!.n).toBe(0);
  });

  it.each([
    ['CREATE TABLE public.x (id int)'],
    ['CREATE TABLE app.x (id int)'],
    ['CREATE TABLE pgboss.x (id int)'],
    ['CREATE SCHEMA x'],
    ['ALTER TABLE interaction_event DISABLE ROW LEVEL SECURITY'],
    ['DROP TABLE audit_event'],
    ['TRUNCATE interaction_event'],
    ['SELECT * FROM kysely_migration'],
    ["SELECT app.create_interaction_event_partition('2040-01-01')"],
  ])('has no DDL or owner rights: %s', async (statement) => {
    const code = await errorCode(() =>
      asApp(t.db, a.orgId, (trx) => sql.raw(statement).execute(trx)),
    );
    expect(code).toBe(PG.insufficientPrivilege);
  });

  it('cannot read or write event partitions directly', async () => {
    const { rows } = await sql<{ relname: string }>`
      SELECT c.relname FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
      WHERE i.inhparent = 'interaction_event'::regclass LIMIT 1
    `.execute(t.db);
    const code = await errorCode(() =>
      asApp(t.db, a.orgId, (trx) => sql`SELECT * FROM ${sql.table(rows[0]!.relname)}`.execute(trx)),
    );
    expect(code).toBe(PG.insufficientPrivilege);
  });

  it('can use the job queue', async () => {
    const code = await errorCode(() =>
      asApp(t.db, a.orgId, (trx) => sql`SELECT count(*) FROM pgboss.queue`.execute(trx)),
    );
    expect(code).toBeNull();
  });
});

describe.skipIf(!hasDatabase)('append-only events (F4-F4)', () => {
  let t: TestDatabase;
  let a: SeededOrg;
  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedOrg(t.db, 'a');
  });
  afterAll(async () => {
    await t?.drop();
  });

  const event = (seq: number, id = testUlid(), recordedAt?: Date) => ({
    id,
    org_id: a.orgId,
    student_id: a.studentId,
    class_id: a.classId,
    version_id: a.publishedId,
    seq,
    at: new Date(),
    type: 'idea.opened',
    payload: json({ idea_id: 'rain' }),
    ...(recordedAt ? { recorded_at: recordedAt } : {}),
  });

  it('lets the app role insert', async () => {
    const code = await errorCode(() =>
      asApp(t.db, a.orgId, (trx) =>
        trx.insertInto('interaction_event').values(event(10)).execute(),
      ),
    );
    expect(code).toBeNull();
  });

  it.each([
    ['UPDATE', "UPDATE interaction_event SET type = 'changed'"],
    ['DELETE', 'DELETE FROM interaction_event'],
    ['UPDATE key', 'UPDATE interaction_event_key SET seq = seq + 1000'],
    ['DELETE key', 'DELETE FROM interaction_event_key'],
  ])('refuses %s as the app role', async (_name, statement) => {
    const code = await errorCode(() =>
      asApp(t.db, a.orgId, (trx) => sql.raw(statement).execute(trx)),
    );
    expect(code).toBe(PG.insufficientPrivilege);
  });

  it.each([
    ['UPDATE', "UPDATE interaction_event SET type = 'changed'"],
    ['DELETE', 'DELETE FROM interaction_event'],
  ])('refuses %s even for the owner, on every partition', async (_name, statement) => {
    expect(await errorCode(() => sql.raw(statement).execute(t.db))).toBe(PG.insufficientPrivilege);
    // Every partition carries the trigger, and one with rows refuses the change.
    const parts = await sql<{ relname: string; rows: number; guarded: boolean }>`
      SELECT c.relname,
        (SELECT count(*)::int FROM interaction_event e WHERE e.tableoid = c.oid) AS rows,
        EXISTS (SELECT 1 FROM pg_trigger g WHERE g.tgrelid = c.oid AND g.tgname = 'append_only') AS guarded
      FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
      WHERE i.inhparent = 'interaction_event'::regclass
    `.execute(t.db);
    expect(parts.rows.every((p) => p.guarded)).toBe(true);
    for (const { relname } of parts.rows.filter((p) => p.rows > 0)) {
      const direct = statement.replace('interaction_event', relname);
      expect(await errorCode(() => sql.raw(direct).execute(t.db)), relname).toBe(
        PG.insufficientPrivilege,
      );
    }
  });

  it('keeps (student_id, seq) unique, across months too', async () => {
    const nextMonth = new Date();
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1, 15);
    const code = await errorCode(() =>
      asApp(t.db, a.orgId, (trx) =>
        trx
          .insertInto('interaction_event')
          .values(event(10, testUlid(), nextMonth))
          .execute(),
      ),
    );
    expect(code).toBe(PG.unique);
  });

  it('keeps the event id unique, across months too', async () => {
    const id = testUlid();
    await asApp(t.db, a.orgId, (trx) =>
      trx.insertInto('interaction_event').values(event(20, id)).execute(),
    );
    const nextMonth = new Date();
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1, 15);
    const code = await errorCode(() =>
      asApp(t.db, a.orgId, (trx) =>
        trx
          .insertInto('interaction_event')
          .values(event(21, id, nextMonth))
          .execute(),
      ),
    );
    expect(code).toBe(PG.unique);
  });

  it('refuses ids that are not ULIDs', async () => {
    const code = await errorCode(() =>
      asApp(t.db, a.orgId, (trx) =>
        trx.insertInto('interaction_event').values(event(30, 'not-a-ulid')).execute(),
      ),
    );
    expect(code).toBe(PG.check);
  });

  it.each(['audit_event', 'generated_map_view', 'ai_output'])(
    'keeps %s append-only too',
    async (table) => {
      for (const statement of [`UPDATE ${table} SET org_id = org_id`, `DELETE FROM ${table}`]) {
        expect(await errorCode(() => sql.raw(statement).execute(t.db)), statement).toBe(
          PG.insufficientPrivilege,
        );
      }
    },
  );
});

describe.skipIf(!hasDatabase)('student text and personal data (F4-S3, F4-S5)', () => {
  let t: TestDatabase;
  let a: SeededOrg;
  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedOrg(t.db, 'a');
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('keeps only name, school email and roster ids on User', async () => {
    const { rows } = await sql<{ column_name: string }>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'app_user' ORDER BY ordinal_position
    `.execute(t.db);
    expect(rows.map((r) => r.column_name)).toEqual([
      'id',
      'org_id',
      'role',
      'name',
      'email',
      'sso_provider',
      'sso_subject',
      'roster_source_id',
      'created_at',
      'updated_at',
    ]);
  });

  it('stores typed text only in interaction_text', async () => {
    // No other table has a free-text column for what a student typed: event
    // payloads and AI logs are jsonb holding ids and redacted content.
    const { rows } = await sql<{ table_name: string; column_name: string }>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name IN ('body', 'text', 'message', 'transcript', 'answer')
      ORDER BY 1
    `.execute(t.db);
    expect(rows).toEqual([
      // D9's approved explanations are teacher-approved curriculum text, not student input.
      { table_name: 'approved_explanation', column_name: 'text' },
      { table_name: 'interaction_text', column_name: 'body' },
    ]);
  });

  it('indexes created_at for retention deletes', async () => {
    const { rows } = await sql<{ tablename: string; indexdef: string }>`
      SELECT tablename, indexdef FROM pg_indexes
      WHERE tablename IN ('interaction_text', 'ai_interaction') AND indexdef LIKE '%created_at%'
    `.execute(t.db);
    const tables = new Set(rows.map((r) => r.tablename));
    expect(tables).toEqual(new Set(['interaction_text', 'ai_interaction']));
    const plan = await asApp(t.db, a.orgId, async (trx) => {
      await sql`SET LOCAL enable_seqscan = off`.execute(trx);
      return sql<{ 'QUERY PLAN': string }>`
        EXPLAIN DELETE FROM interaction_text WHERE org_id = ${a.orgId} AND created_at < now() - interval '90 days'
      `.execute(trx);
    });
    expect(plan.rows.map((r) => r['QUERY PLAN']).join('\n')).toContain(
      'interaction_text_retention',
    );
  });

  it('lets text be deleted without touching the events that refer to it', async () => {
    const before = await t.db
      .selectFrom('interaction_event')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .executeTakeFirstOrThrow();
    const deleted = await asApp(t.db, a.orgId, (trx) =>
      trx.deleteFrom('interaction_text').where('id', '=', a.textId).executeTakeFirst(),
    );
    expect(deleted.numDeletedRows).toBe(1n);
    const after = await t.db
      .selectFrom('interaction_event')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .executeTakeFirstOrThrow();
    expect(after.n).toEqual(before.n);
  });
});
