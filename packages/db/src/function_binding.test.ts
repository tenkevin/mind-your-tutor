import { sql, type Transaction } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { json } from './client.js';
import { APP_ROLE } from './migrations/helpers.js';
import {
  asApp,
  errorCode,
  freshDatabase,
  hasDatabase,
  PG,
  type TestDatabase,
} from './test/harness.js';
import { seedOrg, testUlid, type SeededOrg } from './test/seed.js';
import type { Database } from './schema.js';

// F4cx1: run the shadow-table reproductions only in fresh test databases created by
// the harness. TEMP grants, synthetic rows and disposable databases never touch the
// configured server's shared/developer/QA databases.

const APP_FUNCTION_INVENTORY = [
  'app.create_interaction_event_partition(date)',
  'app.current_class_id()',
  'app.current_org_id()',
  'app.ensure_interaction_event_partitions(integer)',
  'app.guard_class_pin()',
  'app.guard_curriculum_version()',
  'app.record_interaction_event_keys()',
  'app.refuse_change()',
  'app.touch_updated_at()',
];

describe.skipIf(!hasDatabase)('database function name binding (F4cx1)', () => {
  let t: TestDatabase;
  let a: SeededOrg;
  let b: SeededOrg;

  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedOrg(t.db, 'guard-a');
    b = await seedOrg(t.db, 'guard-b');
  });

  afterAll(async () => {
    await t?.drop();
  });

  const event = (org: SeededOrg, seq: number, id = testUlid(), recordedAt = new Date()) => ({
    id,
    org_id: org.orgId,
    student_id: org.studentId,
    class_id: org.classId,
    version_id: org.publishedId,
    seq,
    at: recordedAt,
    type: 'idea.opened',
    payload: json({}),
    recorded_at: recordedAt,
  });

  const savepointError = async (
    trx: Transaction<Database>,
    name: string,
    run: () => Promise<unknown>,
  ): Promise<string | null> => {
    await sql.raw(`SAVEPOINT ${name}`).execute(trx);
    const code = await errorCode(run);
    await sql.raw(`ROLLBACK TO SAVEPOINT ${name}`).execute(trx);
    await sql.raw(`RELEASE SAVEPOINT ${name}`).execute(trx);
    return code;
  };

  it('revokes TEMP from the app role and duplicate event keys still fail without it (F4cx1-F1, S1)', async () => {
    const { rows } = await sql<{ can_temp: boolean }>`
      SELECT has_database_privilege(${APP_ROLE}, current_database(), 'TEMP') AS can_temp
    `.execute(t.db);
    expect(rows).toEqual([{ can_temp: false }]);

    const temp = await errorCode(() =>
      asApp(t.db, a.orgId, (trx) =>
        sql`CREATE TEMP TABLE interaction_event_key (id text)`.execute(trx),
      ),
    );
    expect(temp).toBe(PG.insufficientPrivilege);

    const id = testUlid();
    await asApp(t.db, a.orgId, (trx) =>
      trx
        .insertInto('interaction_event')
        .values(event(a, 501, id))
        .execute(),
    );
    const duplicateId = await errorCode(() =>
      asApp(t.db, a.orgId, (trx) =>
        trx
          .insertInto('interaction_event')
          .values(event(a, 502, id))
          .execute(),
      ),
    );
    const duplicateSeq = await errorCode(() =>
      asApp(t.db, a.orgId, (trx) =>
        trx.insertInto('interaction_event').values(event(a, 501)).execute(),
      ),
    );
    expect(duplicateId).toBe(PG.unique);
    expect(duplicateSeq).toBe(PG.unique);
  });

  it('keeps event id and student/seq uniqueness in the public ledger with same-name TEMP tables (F4cx1-F1)', async () => {
    await sql`GRANT TEMPORARY ON DATABASE ${sql.id(t.name)} TO ${sql.id(APP_ROLE)}`.execute(t.db);
    try {
      const { rows } = await sql<{ can_temp: boolean }>`
        SELECT has_database_privilege(${APP_ROLE}, current_database(), 'TEMP') AS can_temp
      `.execute(t.db);
      expect(rows).toEqual([{ can_temp: true }]);

      const firstId = testUlid();
      const secondId = testUlid();
      const secondSeq = 601;
      const current = new Date();
      const nextMonth = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 10));
      const result = await asApp(t.db, a.orgId, async (trx) => {
        await sql`
          CREATE TEMP TABLE interaction_event_key (
            id text, org_id uuid, student_id uuid, seq bigint, recorded_at timestamptz
          )
        `.execute(trx);
        await sql`
          CREATE TEMP TABLE inserted (
            id text, org_id uuid, student_id uuid, seq bigint, recorded_at timestamptz
          )
        `.execute(trx);
        await sql`
          INSERT INTO pg_temp.inserted (id, org_id, student_id, seq, recorded_at)
          VALUES (${testUlid()}, ${b.orgId}, ${b.studentId}, 999, ${current})
        `.execute(trx);
        await trx
          .insertInto('interaction_event')
          .values(event(a, 600, firstId, current))
          .execute();
        const duplicateId = await savepointError(trx, 'dup_id', () =>
          trx
            .insertInto('interaction_event')
            .values(event(a, 602, firstId, nextMonth))
            .execute(),
        );
        await trx
          .insertInto('interaction_event')
          .values(event(a, secondSeq, secondId, current))
          .execute();
        const duplicateStudentSeq = await savepointError(trx, 'dup_seq', () =>
          trx
            .insertInto('interaction_event')
            .values(event(a, secondSeq, testUlid(), nextMonth))
            .execute(),
        );
        const ledger = await sql<{ id: string; seq: string; recorded_at: Date }>`
          SELECT id, seq::text, recorded_at FROM public.interaction_event_key
          WHERE org_id = ${a.orgId} AND id IN (${firstId}, ${secondId}) ORDER BY seq
        `.execute(trx);
        return { duplicateId, duplicateStudentSeq, ledger: ledger.rows };
      });

      expect(result.duplicateId).toBe(PG.unique);
      expect(result.duplicateStudentSeq).toBe(PG.unique);
      expect(result.ledger.map(({ id, seq }) => [id, seq])).toEqual([
        [firstId, '600'],
        [secondId, '601'],
      ]);
      expect(result.ledger.every((row) => row.recorded_at instanceof Date)).toBe(true);
      const publicCount = await sql<{ n: number }>`
        SELECT count(*)::int AS n FROM public.interaction_event_key
        WHERE org_id = ${a.orgId} AND id = ${firstId}
      `.execute(t.db);
      expect(publicCount.rows[0]!.n).toBe(1);
    } finally {
      await sql`REVOKE TEMPORARY ON DATABASE ${sql.id(t.name)} FROM ${sql.id(APP_ROLE)}`.execute(
        t.db,
      );
    }
  });

  it('fails closed for empty and fake-published TEMP curriculum_version tables, preserving published and archived pins (F4cx1-F2)', async () => {
    await sql`GRANT TEMPORARY ON DATABASE ${sql.id(t.name)} TO ${sql.id(APP_ROLE)}`.execute(t.db);
    try {
      const emptyShadow = await errorCode(() =>
        asApp(t.db, a.orgId, async (trx) => {
          await sql`CREATE TEMP TABLE curriculum_version (id uuid, status text)`.execute(trx);
          await sql`UPDATE public.class SET pinned_version_id = ${a.draftId} WHERE id = ${a.classId}`.execute(
            trx,
          );
        }),
      );
      expect(emptyShadow).toBe(PG.check);

      const fakePublishedShadow = await errorCode(() =>
        asApp(t.db, a.orgId, async (trx) => {
          await sql`CREATE TEMP TABLE curriculum_version (id uuid, status text)`.execute(trx);
          await sql`INSERT INTO pg_temp.curriculum_version (id, status) VALUES (${a.draftId}, 'published')`.execute(
            trx,
          );
          await sql`UPDATE public.class SET pinned_version_id = ${a.draftId} WHERE id = ${a.classId}`.execute(
            trx,
          );
        }),
      );
      expect(fakePublishedShadow).toBe(PG.check);
    } finally {
      await sql`REVOKE TEMPORARY ON DATABASE ${sql.id(t.name)} FROM ${sql.id(APP_ROLE)}`.execute(
        t.db,
      );
    }

    await asApp(t.db, a.orgId, async (trx) => {
      await sql`UPDATE public.class SET pinned_version_id = NULL WHERE id = ${a.classId}`.execute(
        trx,
      );
      await sql`UPDATE public.class SET pinned_version_id = ${a.publishedId} WHERE id = ${a.classId}`.execute(
        trx,
      );
    });
    await sql`UPDATE public.curriculum_version SET status = 'archived' WHERE id = ${a.publishedId}`.execute(
      t.db,
    );
    await asApp(t.db, a.orgId, async (trx) => {
      await sql`UPDATE public.class SET pinned_version_id = NULL WHERE id = ${a.classId}`.execute(
        trx,
      );
      await sql`UPDATE public.class SET pinned_version_id = ${a.publishedId} WHERE id = ${a.classId}`.execute(
        trx,
      );
    });

    const crossCurriculum = await errorCode(() =>
      asApp(t.db, a.orgId, (trx) =>
        sql`UPDATE public.class SET pinned_version_id = ${b.publishedId} WHERE id = ${a.classId}`.execute(
          trx,
        ),
      ),
    );
    expect(crossCurriculum).toBe(PG.check);
  });

  it('enumerates every app function, trigger function and SECURITY DEFINER function and pins trusted search_path (F4cx1-F3)', async () => {
    const { rows } = await sql<{
      signature: string;
      config: string[] | null;
      definer: boolean;
      trigger_function: boolean;
      source: string;
    }>`
      SELECT p.oid::regprocedure::text AS signature, p.proconfig AS config,
        p.prosecdef AS definer, p.prorettype = 'trigger'::regtype AS trigger_function,
        p.prosrc AS source
      FROM pg_catalog.pg_proc AS p
      JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
      ORDER BY signature
    `.execute(t.db);

    expect(rows.map((row) => row.signature)).toEqual(APP_FUNCTION_INVENTORY);
    for (const fn of rows) {
      expect(fn.config, fn.signature).toEqual(['search_path=pg_catalog, pg_temp']);
    }
    expect(rows.filter((fn) => fn.trigger_function).map((fn) => fn.signature)).toEqual([
      'app.guard_class_pin()',
      'app.guard_curriculum_version()',
      'app.record_interaction_event_keys()',
      'app.refuse_change()',
      'app.touch_updated_at()',
    ]);
    expect(rows.filter((fn) => fn.definer).map((fn) => fn.signature)).toEqual([
      'app.record_interaction_event_keys()',
    ]);

    const source = new Map(rows.map(({ signature, source: body }) => [signature, body]));
    expect(source.get('app.guard_class_pin()')).toContain('FROM public.curriculum_version');
    expect(source.get('app.record_interaction_event_keys()')).toContain('FROM public.app_user');
    expect(source.get('app.record_interaction_event_keys()')).toContain(
      'INSERT INTO public.interaction_event_key',
    );
    expect(source.get('app.create_interaction_event_partition(date)')).toContain(
      'public.%I PARTITION OF public.interaction_event',
    );
    expect(source.get('app.ensure_interaction_event_partitions(integer)')).toContain(
      'pg_catalog.generate_series',
    );
  });
});
