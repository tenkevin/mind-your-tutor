import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { json } from './client.js';
import { APP_ROLE, ORG_SETTING } from './migrations/helpers.js';
import {
  asApp,
  errorCode,
  freshDatabase,
  hasDatabase,
  PG,
  type TestDatabase,
} from './test/harness.js';
import { seedOrg, testUlid, type SeededOrg } from './test/seed.js';

// F4b: the isolation gaps F4's QA found (docs/qa/reports/F4.md items 1, 2 and 4),
// closed by migration 0011.

describe.skipIf(!hasDatabase)('the event key ledger (F4b-F1, F4b-F2, F4b-S2)', () => {
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

  const event = (org: SeededOrg, seq: number, id = testUlid(), student = org.studentId) => ({
    id,
    org_id: org.orgId,
    student_id: student,
    class_id: org.classId,
    version_id: org.publishedId,
    seq,
    at: new Date(),
    type: 'idea.opened',
    payload: json({ idea_id: 'rain' }),
  });

  it('gives the app role SELECT on the ledger and nothing else', async () => {
    const { rows } = await sql<{ privilege_type: string }>`
      SELECT privilege_type FROM information_schema.role_table_grants
      WHERE grantee = ${APP_ROLE} AND table_name = 'interaction_event_key'
    `.execute(t.db);
    expect(rows.map((r) => r.privilege_type)).toEqual(['SELECT']);
  });

  it("refuses a direct insert, even for the org's own student", async () => {
    const code = await errorCode(() =>
      asApp(t.db, a.orgId, (trx) =>
        trx
          .insertInto('interaction_event_key')
          .values({
            id: testUlid(),
            org_id: a.orgId,
            student_id: a.studentId,
            seq: 900,
            recorded_at: new Date(),
          })
          .execute(),
      ),
    );
    expect(code).toBe(PG.insufficientPrivilege);
  });

  it("references the student by (org_id, student_id), so no key can name another org's student", async () => {
    const code = await errorCode(() =>
      sql`
        INSERT INTO interaction_event_key (id, org_id, student_id, seq, recorded_at)
        VALUES (${testUlid()}, ${a.orgId}, ${b.studentId}, 900, now())
      `.execute(t.db),
    );
    expect(code).toBe(PG.foreignKey);
  });

  it("stops org A blocking or probing org B's events (the F4 report's sequence)", async () => {
    // Org B's student already has seq 100; seq 101 is still free.
    await asApp(t.db, b.orgId, (trx) =>
      trx.insertInto('interaction_event').values(event(b, 100)).execute(),
    );
    // Org A tries to record both for org B's student. Both fail the same way, so the
    // failure says nothing about which seq org B holds, and neither is a unique error.
    const taken = await errorCode(() =>
      asApp(t.db, a.orgId, (trx) =>
        trx
          .insertInto('interaction_event')
          .values({ ...event(a, 100), student_id: b.studentId })
          .execute(),
      ),
    );
    const free = await errorCode(() =>
      asApp(t.db, a.orgId, (trx) =>
        trx
          .insertInto('interaction_event')
          .values({ ...event(a, 101), student_id: b.studentId })
          .execute(),
      ),
    );
    expect(taken).not.toBeNull();
    expect(taken).not.toBe(PG.unique);
    expect(free).toBe(taken);
    // Org A sees none of org B's keys.
    const seen = await asApp(t.db, a.orgId, (trx) =>
      trx.selectFrom('interaction_event_key').select('org_id').execute(),
    );
    expect(seen.filter((r) => r.org_id !== a.orgId)).toEqual([]);
    // Org B's genuine next event goes in.
    const code = await errorCode(() =>
      asApp(t.db, b.orgId, (trx) =>
        trx.insertInto('interaction_event').values(event(b, 101)).execute(),
      ),
    );
    expect(code).toBeNull();
  });

  it("keeps event ids unique per org, so one org can't probe another's ids", async () => {
    const id = testUlid();
    await asApp(t.db, a.orgId, (trx) =>
      trx
        .insertInto('interaction_event')
        .values(event(a, 200, id))
        .execute(),
    );
    const otherOrg = await errorCode(() =>
      asApp(t.db, b.orgId, (trx) =>
        trx
          .insertInto('interaction_event')
          .values(event(b, 200, id))
          .execute(),
      ),
    );
    expect(otherOrg).toBeNull();
    const sameOrg = await errorCode(() =>
      asApp(t.db, a.orgId, (trx) =>
        trx
          .insertInto('interaction_event')
          .values(event(a, 201, id))
          .execute(),
      ),
    );
    expect(sameOrg).toBe(PG.unique);
  });

  it('records keys through a SECURITY DEFINER function with a pinned search_path', async () => {
    const { rows } = await sql<{
      definer: boolean;
      owner: string;
      config: string[] | null;
      app_can_execute: boolean;
    }>`
      SELECT p.prosecdef AS definer, pg_get_userbyid(p.proowner) AS owner, p.proconfig AS config,
        has_function_privilege(${APP_ROLE}, p.oid, 'EXECUTE') AS app_can_execute
      FROM pg_proc p WHERE p.oid = 'app.record_interaction_event_keys()'::regprocedure
    `.execute(t.db);
    const owner = await sql<{ me: string }>`SELECT current_user AS me`.execute(t.db);
    expect(rows).toEqual([
      {
        definer: true,
        owner: owner.rows[0]!.me,
        config: ['search_path=pg_catalog, pg_temp'],
        app_can_execute: false,
      },
    ]);
  });

  it("checks each row against the caller's org itself, not only through row-level security", async () => {
    // The migration role bypasses row-level security on interaction_event, so this
    // row reaches the trigger; acting for org A, the function refuses org B's row.
    const code = await errorCode(() =>
      t.db.transaction().execute(async (trx) => {
        await sql`SELECT set_config(${ORG_SETTING}, ${a.orgId}, true)`.execute(trx);
        await trx.insertInto('interaction_event').values(event(b, 300)).execute();
      }),
    );
    expect(code).toBe(PG.insufficientPrivilege);
  });
});

describe.skipIf(!hasDatabase)('class library settings are class-scoped (F4b-F3)', () => {
  let t: TestDatabase;
  let a: SeededOrg;
  let otherClassId: string;
  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedOrg(t.db, 'a');
    const other = await t.db
      .insertInto('class')
      .values({
        org_id: a.orgId,
        curriculum_id: a.curriculumId,
        pinned_version_id: a.publishedId,
        teacher_id: a.teacherId,
        name: 'Class A2',
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
  });
  afterAll(async () => {
    await t?.drop();
  });

  const asClass = <T>(fn: Parameters<typeof asApp<T>>[2]) => asApp(t.db, a.orgId, fn, a.classId);

  it("reads none of another class's settings", async () => {
    const rows = await asClass((trx) =>
      trx.selectFrom('class_library_setting').select('class_id').execute(),
    );
    expect(rows.map((r) => r.class_id)).toEqual([a.classId]);
  });

  it("can't change or delete another class's settings", async () => {
    const updated = await asClass((trx) =>
      trx
        .updateTable('class_library_setting')
        .set({ use_for: 'off' })
        .where('class_id', '=', otherClassId)
        .executeTakeFirst(),
    );
    expect(updated.numUpdatedRows).toBe(0n);
    const deleted = await asClass((trx) =>
      trx
        .deleteFrom('class_library_setting')
        .where('class_id', '=', otherClassId)
        .executeTakeFirst(),
    );
    expect(deleted.numDeletedRows).toBe(0n);
    const { rows } = await sql<{ use_for: string }>`
      SELECT use_for FROM class_library_setting WHERE class_id = ${otherClassId}
    `.execute(t.db);
    expect(rows).toEqual([{ use_for: 'both' }]);
  });

  it('refuses a setting written for another class, or moved to one', async () => {
    await sql`DELETE FROM class_library_setting WHERE class_id = ${otherClassId}`.execute(t.db);
    const insert = await errorCode(() =>
      asClass((trx) =>
        trx
          .insertInto('class_library_setting')
          .values({
            org_id: a.orgId,
            class_id: otherClassId,
            curriculum_id: a.curriculumId,
            library_doc_id: a.libraryDocId,
            use_for: 'off',
          })
          .execute(),
      ),
    );
    expect(insert).toBe(PG.rlsViolation);
    const move = await errorCode(() =>
      asClass((trx) =>
        trx
          .updateTable('class_library_setting')
          .set({ class_id: otherClassId })
          .where('class_id', '=', a.classId)
          .execute(),
      ),
    );
    expect(move).toBe(PG.rlsViolation);
  });

  it('lets a class change its own settings', async () => {
    const updated = await asClass((trx) =>
      trx
        .updateTable('class_library_setting')
        .set({ use_for: 'tutor' })
        .where('class_id', '=', a.classId)
        .executeTakeFirst(),
    );
    expect(updated.numUpdatedRows).toBe(1n);
  });
});

describe.skipIf(!hasDatabase)("the app role's privileges (F4b-S1)", () => {
  let t: TestDatabase;
  let a: SeededOrg;
  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedOrg(t.db, 'a');
  });
  afterAll(async () => {
    await t?.drop();
  });

  it('has no TEMP on the database and cannot create temporary tables', async () => {
    const { rows } = await sql<{ temp: boolean }>`
      SELECT has_database_privilege(${APP_ROLE}, current_database(), 'TEMP') AS temp
    `.execute(t.db);
    expect(rows).toEqual([{ temp: false }]);
    const code = await errorCode(() =>
      asApp(t.db, a.orgId, (trx) => sql`CREATE TEMP TABLE scratch (id int)`.execute(trx)),
    );
    expect(code).toBe(PG.insufficientPrivilege);
  });

  it('may execute only the functions its policies and audit triggers call, in the app schema', async () => {
    const { rows } = await sql<{ fn: string }>`
      SELECT p.oid::regprocedure::text AS fn FROM pg_proc p
      WHERE p.pronamespace = 'app'::regnamespace
        AND has_function_privilege(${APP_ROLE}, p.oid, 'EXECUTE')
      ORDER BY 1
    `.execute(t.db);
    // The audit triggers (F6) run as the caller and call current_actor_id and
    // redact_secrets. A FERPA delete or unenrolment (M2, D22) calls
    // purge_student_events, which checks the caller is an admin of the org itself.
    expect(rows.map((r) => r.fn)).toEqual([
      'app.current_actor_id()',
      'app.current_class_id()',
      'app.current_org_id()',
      'app.purge_student_events(uuid)',
      'app.redact_secrets(jsonb)',
      'app.sso_tenant_org(text,text)',
    ]);
  });

  it('has no UPDATE or DELETE on an append-only table, and no table-owner rights anywhere', async () => {
    const { rows } = await sql<{ table_name: string; privilege_type: string }>`
      SELECT table_name, privilege_type FROM information_schema.role_table_grants
      WHERE grantee = ${APP_ROLE} AND table_schema = 'public'
    `.execute(t.db);
    const appendOnly = [
      'interaction_event',
      'interaction_event_key',
      'generated_map_view',
      'ai_output',
      'audit_event',
    ];
    const writes = rows.filter(
      (r) => appendOnly.includes(r.table_name) && ['UPDATE', 'DELETE'].includes(r.privilege_type),
    );
    expect(writes).toEqual([]);
    const ownerRights = rows.filter((r) =>
      ['TRUNCATE', 'REFERENCES', 'TRIGGER'].includes(r.privilege_type),
    );
    expect(ownerRights).toEqual([]);
  });

  it('still records events, keeps updated_at current and uses the job queue', async () => {
    const insert = await errorCode(() =>
      asApp(t.db, a.orgId, (trx) =>
        trx
          .insertInto('interaction_event')
          .values({
            id: testUlid(),
            org_id: a.orgId,
            student_id: a.studentId,
            class_id: a.classId,
            version_id: a.publishedId,
            seq: 500,
            at: new Date(),
            type: 'idea.opened',
            payload: json({}),
          })
          .execute(),
      ),
    );
    expect(insert).toBeNull();
    const touched = await asApp(t.db, a.orgId, (trx) =>
      trx
        .updateTable('organization')
        .set({ name: 'Renamed District' })
        .returning('updated_at')
        .executeTakeFirstOrThrow(),
    );
    expect(touched.updated_at).toBeInstanceOf(Date);
    const queue = await errorCode(() =>
      asApp(t.db, a.orgId, (trx) => sql`SELECT count(*) FROM pgboss.queue`.execute(trx)),
    );
    expect(queue).toBeNull();
  });
});
