import { EVENT_LEVELS } from '@ideamap/contracts';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { actAs, json, type Db } from './client.js';
import type { ExportStore } from './export-store.js';
import { CATALOGUE_AT_0016 } from './migrations/0016_event_ingest.js';
import { APP_ROLE } from './migrations/helpers.js';
import { PrivacyError, setTracingOptOut, unenrolStudent } from './privacy.js';
import {
  asApp,
  errorCode,
  freshDatabase,
  hasDatabase,
  PG,
  type TestDatabase,
} from './test/harness.js';
import { seedOrg, testUlid, type SeededOrg } from './test/seed.js';

// M2 storage (0016): only catalogue types, a level generated from the type, append-only
// for every path but the D22 purge, the D24 opt-out and the D22 unenrolment.

const NO_FILES: ExportStore = { put: async () => {}, remove: async () => {} };

describe('the 0016 catalogue', () => {
  it('is M1’s catalogue: a change to what is traced needs a new migration (D19)', () => {
    expect(CATALOGUE_AT_0016).toEqual(EVENT_LEVELS);
  });
});

describe.skipIf(!hasDatabase)('event storage (M2-S2, D22, D24)', () => {
  let t: TestDatabase;
  let app: Db;
  let a: SeededOrg & { adminId: string };
  let b: SeededOrg & { adminId: string };
  let seq = 100;

  const admin = async (org: SeededOrg, label: string) => {
    const row = await t.db
      .insertInto('app_user')
      .values({ org_id: org.orgId, role: 'admin', name: `Admin ${label}` })
      .returning('id')
      .executeTakeFirstOrThrow();
    return { ...org, adminId: row.id };
  };

  beforeAll(async () => {
    t = await freshDatabase();
    a = await admin(await seedOrg(t.db, 'ingest-a'), 'a');
    b = await admin(await seedOrg(t.db, 'ingest-b'), 'b');
    app = await t.loginAs(APP_ROLE);
  });
  afterAll(async () => {
    await t?.drop();
  });

  const event = (org: SeededOrg, type: string, payload: unknown = {}) => ({
    id: testUlid(),
    org_id: org.orgId,
    student_id: org.studentId,
    class_id: org.classId,
    version_id: org.publishedId,
    seq: ++seq,
    at: new Date(),
    type,
    payload: json(payload),
  });

  it('generates each event’s level from its type', async () => {
    const rows = [
      event(a, 'quiz.answered'),
      event(a, 'teachback.judged'),
      event(a, 'feedback.ruled'),
    ];
    await asApp(t.db, a.orgId, (trx) => trx.insertInto('interaction_event').values(rows).execute());
    const stored = await t.db
      .selectFrom('interaction_event')
      .select(['type', 'level', 'tracing_opted_out'])
      .where(
        'id',
        'in',
        rows.map((r) => r.id),
      )
      .orderBy('seq')
      .execute();
    expect(stored).toEqual([
      { type: 'quiz.answered', level: 'participating', tracing_opted_out: false },
      { type: 'teachback.judged', level: 'other', tracing_opted_out: false },
      { type: 'feedback.ruled', level: 'teaching', tracing_opted_out: false },
    ]);
  });

  it('refuses a type outside the catalogue, and a level set by hand', async () => {
    for (const type of ['page.scrolled', 'mouse.moved', 'session.started']) {
      const code = await errorCode(() =>
        asApp(t.db, a.orgId, (trx) =>
          trx.insertInto('interaction_event').values(event(a, type)).execute(),
        ),
      );
      expect(code, type).toBe(PG.check);
    }
    const e = event(a, 'idea.opened');
    const code = await errorCode(() =>
      asApp(t.db, a.orgId, (trx) =>
        sql`
          INSERT INTO interaction_event (id, org_id, student_id, class_id, version_id, seq, at, type, level)
          VALUES (${e.id}, ${e.org_id}, ${e.student_id}, ${e.class_id}, ${e.version_id}, ${e.seq}, now(), 'idea.opened', 'teaching')
        `.execute(trx),
      ),
    );
    expect(code).toBe('428C9'); // generated_always
  });

  it('refuses UPDATE and DELETE on tracker tables to the app role, even with the purge setting (M2-S2)', async () => {
    for (const table of [
      'interaction_event',
      'interaction_event_key',
      'generated_map_view',
      'ai_output',
    ]) {
      for (const statement of [
        sql`UPDATE ${sql.table(table)} SET org_id = org_id`,
        sql`DELETE FROM ${sql.table(table)}`,
      ]) {
        const code = await errorCode(() =>
          app.transaction().execute(async (trx) => {
            await sql`SELECT set_config('app.org_id', ${a.orgId}, true),
              set_config('app.purge_student_id', ${a.studentId}, true)`.execute(trx);
            await statement.execute(trx);
          }),
        );
        expect(code, `${table}`).toBe(PG.insufficientPrivilege);
      }
    }
  });

  it('refuses UPDATE and DELETE to the owner too, outside the purge', async () => {
    for (const table of ['interaction_event', 'interaction_event_key']) {
      expect(await errorCode(() => sql`DELETE FROM ${sql.table(table)}`.execute(t.db)), table).toBe(
        PG.insufficientPrivilege,
      );
      expect(
        await errorCode(() =>
          sql`UPDATE ${sql.table(table)} SET recorded_at = recorded_at`.execute(t.db),
        ),
        table,
      ).toBe(PG.insufficientPrivilege);
    }
    // A purge setting naming another student lets nothing through.
    const code = await errorCode(() =>
      t.db.transaction().execute(async (trx) => {
        await sql`SELECT set_config('app.purge_student_id', ${b.studentId}, true)`.execute(trx);
        await sql`DELETE FROM interaction_event WHERE student_id = ${a.studentId}`.execute(trx);
      }),
    );
    expect(code).toBe(PG.insufficientPrivilege);
  });

  it('lets only an admin of the student’s org call the purge', async () => {
    const purge = (orgId: string, actorId: string, studentId: string) =>
      errorCode(() =>
        asApp(t.db, orgId, async (trx) => {
          await actAs(trx, actorId);
          await sql`SELECT app.purge_student_events(${studentId}::uuid)`.execute(trx);
        }),
      );
    expect(await purge(a.orgId, a.teacherId, a.studentId)).toBe(PG.insufficientPrivilege);
    expect(await purge(a.orgId, a.studentId, a.studentId)).toBe(PG.insufficientPrivilege);
    // B's admin acting in A's org isn't an admin there; acting in B, A's student isn't found.
    expect(await purge(a.orgId, b.adminId, a.studentId)).toBe(PG.insufficientPrivilege);
    expect(await purge(b.orgId, b.adminId, a.studentId)).toBe('P0002');
    // A teacher isn't a student.
    expect(await purge(a.orgId, a.adminId, a.teacherId)).toBe('P0002');
    const left = await t.db
      .selectFrom('interaction_event')
      .select('id')
      .where('student_id', '=', a.studentId)
      .execute();
    expect(left.length).toBeGreaterThan(0);
  });

  it('records and clears a D24 opt-out, admin only, audited', async () => {
    const req = { orgId: b.orgId, actorId: b.adminId, studentId: b.studentId };
    expect(await setTracingOptOut(app, { ...req, optedOut: false })).toBe(false);
    expect(
      await t.db
        .selectFrom('tracing_opt_out')
        .select('student_id')
        .where('student_id', '=', b.studentId)
        .execute(),
    ).toEqual([]);
    expect(await setTracingOptOut(app, { ...req, optedOut: true })).toBe(true);
    // Repeating it changes nothing and writes no second audit row.
    expect(await setTracingOptOut(app, { ...req, optedOut: true })).toBe(true);
    const row = await t.db
      .selectFrom('tracing_opt_out')
      .selectAll()
      .where('student_id', '=', b.studentId)
      .executeTakeFirstOrThrow();
    expect(row.set_by).toBe(b.adminId);
    const audits = await t.db
      .selectFrom('audit_event')
      .select(['action', 'actor_id', 'target_id'])
      .where('org_id', '=', b.orgId)
      .where('action', 'like', 'student.tracing%')
      .orderBy('at')
      .execute();
    expect(audits.map((x) => x.action)).toEqual([
      'student.tracing_opted_in',
      'student.tracing_opted_out',
    ]);
    expect(audits.every((x) => x.actor_id === b.adminId && x.target_id === b.studentId)).toBe(true);

    const teacher = await setTracingOptOut(app, {
      ...req,
      actorId: b.teacherId,
      optedOut: false,
    }).catch((e: unknown) => e);
    expect(teacher).toBeInstanceOf(PrivacyError);
  });

  it('deletes a student’s events, map views and AI outputs when they leave the district (D22)', async () => {
    const before = await t.db
      .selectFrom('interaction_event')
      .select(['id', 'seq'])
      .where('student_id', '=', b.studentId)
      .orderBy('seq')
      .execute();
    const result = await unenrolStudent(
      app,
      { orgId: a.orgId, actorId: a.adminId, studentId: a.studentId },
      NO_FILES,
    );
    expect(result.interactionEvents).toBeGreaterThanOrEqual(5);
    expect(result).toMatchObject({ generatedMapViews: 1, aiOutputs: 1, interactionText: 1 });
    for (const table of [
      'interaction_event',
      'interaction_event_key',
      'generated_map_view',
      'ai_output',
    ] as const) {
      expect(
        await t.db
          .selectFrom(table)
          .select('student_id')
          .where('student_id', '=', a.studentId)
          .execute(),
        table,
      ).toEqual([]);
    }
    const audit = await t.db
      .selectFrom('audit_event')
      .select(['actor_id', 'target_id'])
      .where('action', '=', 'student.unenrolled')
      .executeTakeFirstOrThrow();
    expect(audit).toEqual({ actor_id: a.adminId, target_id: a.studentId });
    // Another org's student is untouched; the purge setting didn't outlive the call.
    expect(
      await t.db
        .selectFrom('interaction_event')
        .select(['id', 'seq'])
        .where('student_id', '=', b.studentId)
        .orderBy('seq')
        .execute(),
    ).toEqual(before);
  });
});
