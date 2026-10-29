import { TEST_PRACTICE_SOURCES, VersionIssuesSchema, type Pack } from '@ideamap/contracts';
import { json } from '@ideamap/db';
import { checkPack } from '@ideamap/domain';
import type { Caller } from '@ideamap/worker';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { packA, packB, packE, reordered } from '../../../packages/contracts/src/testing/publish.js';
import {
  appScope,
  freshDatabase,
  hasDatabase,
  seedOrg,
  type Org,
  type TestDatabase,
} from '../../worker/src/testing/db.js';
import { CSRF_HEADER } from '@ideamap/contracts';
import { loadConfig } from './config.js';
import { buildServer, studentsReceiving } from './index.js';
import { SESSION_COOKIE } from './policy.js';
import { createSession } from './sessions.js';
import { csrfToken, deriveKeys, sessionCookieValue } from './tokens.js';

// C5 over HTTP: diff, preview, publish and rollback (docs/qa/C5.md). Callers sign in
// with F5 sessions: a test names one, and the request carries that caller's session
// cookie and CSRF token. Ids the caller can't use get F5's uniform 403, whether they
// are missing or another organization's.

const ORIGIN = 'https://teacher.ideamap.test';
const config = loadConfig({
  IDEAMAP_APP_ORIGINS: ORIGIN,
  IDEAMAP_SESSION_SECRET: 'test-only-session-secret-0123456789abcdef',
});

describe.skipIf(!hasDatabase)('publishing a curriculum version (C5)', () => {
  let t: TestDatabase;
  let app: FastifyInstance;
  let a: Org;
  let b: Org;
  const callers = new Map<string, Caller>();
  const sessions = new Map<string, { cookie: string; csrf: string }>();
  const ids: Record<string, string> = {};
  let versionA: string;
  let versionB: string;

  const user = async (org: Org, role: Caller['role'], name: string) => {
    const row = await t.db
      .insertInto('app_user')
      .values({ org_id: org.orgId, role, name })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  };
  const makeClass = async (org: Org, curriculumId: string, teacherId: string, name: string) =>
    (
      await t.db
        .insertInto('class')
        .values({ org_id: org.orgId, curriculum_id: curriculumId, teacher_id: teacherId, name })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
  /** A draft as C4's import stores it: the pack and its data-check issues. */
  const draft = async (org: Org, curriculumId: string, pack: Pack) => {
    const last = await t.db
      .selectFrom('curriculum_version')
      .select((eb) => eb.fn.max<number>('number').as('n'))
      .where('curriculum_id', '=', curriculumId)
      .executeTakeFirst();
    const row = await t.db
      .insertInto('curriculum_version')
      .values({
        org_id: org.orgId,
        curriculum_id: curriculumId,
        number: (last?.n ?? 0) + 1,
        pack: json(pack),
        issues: json(
          VersionIssuesSchema.parse(checkPack(pack, { practiceSources: TEST_PRACTICE_SOURCES })),
        ),
        source: json({
          kind: 'json',
          file_ref: null,
          file_name: null,
          checksum: '0'.repeat(64),
          column_mapping: [],
        }),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  };
  const pins = async () =>
    Object.fromEntries(
      (await t.db.selectFrom('class').select(['id', 'pinned_version_id']).execute()).map((c) => [
        c.id,
        c.pinned_version_id,
      ]),
    );
  const version = (id: string) =>
    t.db
      .selectFrom('curriculum_version')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
  /** C5's own audit records (F6's triggers also log the row changes underneath). */
  const audits = () =>
    t.db
      .selectFrom('audit_event')
      .selectAll()
      .where('action', 'in', ['curriculum_version.publish', 'class.repin'])
      .orderBy('at')
      .orderBy('id')
      .execute();
  const allAudits = () =>
    t.db.selectFrom('audit_event').selectAll().orderBy('at').orderBy('id').execute();

  const call = (
    as: string,
    method: 'GET' | 'POST',
    url: string,
    payload?: unknown,
    headers: Record<string, string> = {},
  ) => {
    const signed = sessions.get(as);
    return app.inject({
      method,
      url,
      headers: {
        host: new URL(ORIGIN).host,
        'x-forwarded-proto': 'https',
        origin: ORIGIN,
        ...(signed ? { [CSRF_HEADER]: signed.csrf } : {}),
        ...headers,
      },
      cookies: signed ? { [SESSION_COOKIE]: signed.cookie } : {},
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
  };
  const publishTo = (as: string, versionId: string, classIds: string[], key?: string) =>
    call(
      as,
      'POST',
      `/api/versions/${versionId}/publish`,
      { class_ids: classIds },
      key ? { 'idempotency-key': key } : {},
    );
  const preview = (as: string, versionId: string, classIds: string[]) =>
    call(as, 'POST', `/api/versions/${versionId}/preview`, { class_ids: classIds });

  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedOrg(t.db, 'A');
    b = await seedOrg(t.db, 'B');
    callers.set('teacher', a.teacher).set('student', a.student).set('b-teacher', b.teacher);
    ids.admin = await user(a, 'admin', 'Test admin A');
    ids.author = await user(a, 'author', 'Test author A');
    ids.teacher2 = await user(a, 'teacher', 'Test teacher two A');
    ids.bAdmin = await user(b, 'admin', 'Test admin B');
    callers
      .set('admin', { orgId: a.orgId, userId: ids.admin, role: 'admin' })
      .set('author', { orgId: a.orgId, userId: ids.author, role: 'author' })
      .set('teacher2', { orgId: a.orgId, userId: ids.teacher2, role: 'teacher' })
      .set('b-admin', { orgId: b.orgId, userId: ids.bAdmin, role: 'admin' });

    ids.c1 = await makeClass(a, a.curriculumId, a.teacher.userId, 'Class 1');
    ids.c2 = await makeClass(a, a.curriculumId, a.teacher.userId, 'Class 2');
    ids.c3 = await makeClass(a, a.curriculumId, a.teacher.userId, 'Class 3');
    ids.other = await makeClass(a, a.curriculumId, ids.teacher2, 'Another teacher’s class');
    ids.curriculumY = (
      await t.db
        .insertInto('curriculum')
        .values({ org_id: a.orgId, title: 'Curriculum Y' })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
    ids.classY = await makeClass(a, ids.curriculumY, a.teacher.userId, 'Class on Y');
    ids.bClass = await makeClass(b, b.curriculumId, b.teacher.userId, 'Class B');

    // C5-F6: class 1 has s1, s2, s3; class 2 has s3, s4; class 3 (not selected) has s5.
    // Org B's class has its own students.
    for (const n of [1, 2, 3, 4, 5]) ids[`s${n}`] = await user(a, 'student', `Test student s${n}`);
    const enroll = (classId: string, students: string[], org = a) =>
      t.db
        .insertInto('enrollment')
        .values(students.map((s) => ({ org_id: org.orgId, class_id: classId, student_id: s })))
        .execute();
    await enroll(ids.c1, [ids.s1!, ids.s2!, ids.s3!]);
    await enroll(ids.c2, [ids.s3!, ids.s4!]);
    await enroll(ids.c3, [ids.s5!]);
    await enroll(ids.bClass, [b.student.userId], b);

    const keys = deriveKeys(config.sessionSecret);
    for (const [name, who] of callers) {
      const { token } = await createSession(t.db, config, {
        orgId: who.orgId,
        userId: who.userId,
        provider: 'google',
        now: new Date(),
      });
      sessions.set(name, {
        cookie: sessionCookieValue(who.orgId, token),
        csrf: csrfToken(keys, token),
      });
    }
    app = buildServer({ db: t.db, config, publish: { deps: { scope: appScope(t.db) } } });
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  it('C5-F2: before anything is published, every idea is listed as added', async () => {
    versionA = await draft(a, a.curriculumId, packA());
    const res = await call('teacher', 'GET', `/api/versions/${versionA}/diff`);
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      from_version: unknown;
      to_version: { id: string };
      diff: { first_publish: boolean; ideas_added: unknown[] };
    }>();
    expect(body.from_version).toBeNull();
    expect(body.to_version.id).toBe(versionA);
    expect(body.diff.first_publish).toBe(true);
    expect(body.diff.ideas_added).toHaveLength(18);
  });

  it('C5-F5, U2: errors block publishing, naming the tab and column to fix', async () => {
    const versionE = await draft(a, a.curriculumId, packE());
    const before = await pins();
    const pre = await preview('teacher', versionE, [ids.c1!]);
    expect(pre.statusCode).toBe(200);
    expect(pre.json()).toMatchObject({ preview: { can_publish: false } });

    const res = await publishTo('teacher', versionE, [ids.c1!]);
    expect(res.statusCode).toBe(422);
    const body = res.json<{ error: string; blocking: unknown[] }>();
    expect(body.error).toMatch(/can’t be published until this error is fixed/);
    expect(body.error).toContain('Ideas → requires');
    expect(body.blocking).toEqual([
      {
        message: expect.stringContaining('requires "aquifer"') as string,
        tab: 'Ideas',
        column: 'requires',
        row: null,
        items: ['ground'],
      },
    ]);
    expect(await pins()).toEqual(before);
    expect((await version(versionE)).status).toBe('draft');
    expect(await audits()).toEqual([]);
  });

  it('warnings and info alone, including D12 draftable gaps, do not block', async () => {
    const pack = packA();
    pack.units[0]!.objective = null;
    pack.assessment[0]!.question = null;
    const gaps = await draft(a, ids.curriculumY!, pack);
    const { issues } = await version(gaps);
    expect(issues.some((i) => i.origin === 'data_check' && i.draftable)).toBe(true);
    const res = await publishTo('teacher', gaps, [ids.classY!]);
    expect(res.statusCode).toBe(201);
  });

  it('C5-F4 setup: publishing A moves both classes’ pins and marks it published', async () => {
    const res = await publishTo('teacher', versionA, [ids.c2!, ids.c1!]);
    expect(res.statusCode).toBe(201);
    const { publish } = res.json<{
      publish: {
        version: { status: string; published_at: string };
        classes: { class_id: string; from_version_id: string | null; to_version_id: string }[];
      };
    }>();
    expect(publish.version.status).toBe('published');
    expect(publish.classes).toEqual(
      [ids.c1!, ids.c2!].sort().map((id) => ({
        class_id: id,
        from_version_id: null,
        to_version_id: versionA,
      })),
    );
    const now = await pins();
    expect([now[ids.c1!], now[ids.c2!], now[ids.c3!]]).toEqual([versionA, versionA, null]);
  });

  it('C5-F1, F3, U1, S4: B’s diff against A, stable across requests and re-imports', async () => {
    versionB = await draft(a, a.curriculumId, packB());
    const get = async (id: string) => {
      const res = await call('teacher', 'GET', `/api/versions/${id}/diff`);
      expect(res.statusCode).toBe(200);
      return res.json<{ from_version: { id: string }; diff: Record<string, unknown[]> }>();
    };
    const first = await get(versionB);
    expect(first.from_version.id).toBe(versionA);
    const counts = Object.fromEntries(
      Object.entries(first.diff)
        .filter(([, v]) => Array.isArray(v))
        .map(([k, v]) => [k, v.length]),
    );
    expect(counts).toEqual({
      ideas_added: 1,
      ideas_removed: 1,
      ideas_renamed: 1,
      prerequisites_changed: 1,
      units_changed: 1,
      assessment_changed: 1,
      practice_changed: 0,
    });
    expect(first.diff.ideas_renamed).toEqual([
      { idea_id: 'vap', before: 'Water vapour', after: 'Vapour' },
    ]);
    expect(first.diff.units_changed).toEqual([
      {
        idea_id: 'ocean',
        title: 'Oceans',
        from: { unit: 1, name: 'Water goes up' },
        to: { unit: 3, name: 'Water comes back' },
      },
    ]);

    const text = JSON.stringify(first.diff);
    for (let i = 0; i < 3; i++) expect(JSON.stringify((await get(versionB)).diff)).toBe(text);
    const again = await draft(a, a.curriculumId, reordered(packB()));
    expect(JSON.stringify((await get(again)).diff)).toBe(text);
    await t.db.deleteFrom('curriculum_version').where('id', '=', again).execute();

    // A against itself is empty, not an error.
    const self = await call('teacher', 'GET', `/api/versions/${versionA}/diff`);
    expect(self.json()).toMatchObject({ from_version: { id: versionA }, diff: { empty: true } });
    const against = await call(
      'teacher',
      'GET',
      `/api/versions/${versionB}/diff?against=${versionA}`,
    );
    expect(JSON.stringify(against.json<{ diff: unknown }>().diff)).toBe(text);

    // No student identifiers anywhere in the payload.
    for (const n of [1, 2, 3, 4, 5]) expect(text).not.toContain(ids[`s${n}`]);
  });

  it('C5-F6, P2: Students receiving this update counts unique enrolled students', async () => {
    const count = async (classIds: string[]) => {
      const res = await preview('teacher', versionB, classIds);
      expect(res.statusCode).toBe(200);
      const { students_receiving_this_update: s } = res.json<{
        preview: { students_receiving_this_update: { label: string; count: number } };
      }>().preview;
      expect(s.label).toBe('Students receiving this update');
      return s.count;
    };
    // s1 has no history and s2's progress won't change: both still count; s3 once.
    expect(await count([ids.c1!, ids.c2!])).toBe(4);
    expect(await count([ids.c2!])).toBe(2);
    expect(await count([])).toBe(0);
    // Another organization's class can't be selected at all.
    expect((await preview('teacher', versionB, [ids.c1!, ids.bClass!])).statusCode).toBe(403);
  });

  it('C5-F4: publishing B to class 1 moves only class 1; A stays as it was', async () => {
    const aBefore = await version(versionA);
    const res = await publishTo('teacher', versionB, [ids.c1!]);
    expect(res.statusCode).toBe(201);
    const now = await pins();
    expect(now[ids.c1!]).toBe(versionB);
    expect(now[ids.c2!]).toBe(versionA);
    const published = await version(versionB);
    expect(published.status).toBe('published');
    expect(published.published_at).toBeInstanceOf(Date);
    expect(await version(versionA)).toEqual(aBefore);
  });

  it('C5-F7: rollback re-pins an earlier published version; drafts and archived are refused', async () => {
    const res = await call('teacher', 'POST', `/api/classes/${ids.c1}/pin`, {
      version_id: versionA,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      pin: { class: { class_id: ids.c1, from_version_id: versionB, to_version_id: versionA } },
    });
    expect((await pins())[ids.c1!]).toBe(versionA);
    expect((await version(versionB)).status).toBe('published');

    const aDraft = await draft(a, a.curriculumId, packA());
    const toDraft = await call('teacher', 'POST', `/api/classes/${ids.c1}/pin`, {
      version_id: aDraft,
    });
    expect(toDraft.statusCode).toBe(422);
    expect(toDraft.json<{ error: string }>().error).toMatch(/draft; a class can only go back/);

    const old = await draft(a, a.curriculumId, packA());
    expect((await publishTo('teacher', old, [ids.c3!])).statusCode).toBe(201);
    await t.db
      .updateTable('curriculum_version')
      .set({ status: 'archived' })
      .where('id', '=', old)
      .execute();
    const toArchived = await call('teacher', 'POST', `/api/classes/${ids.c3}/pin`, {
      version_id: old,
    });
    expect(toArchived.statusCode).toBe(422);
    expect((await publishTo('teacher', old, [ids.c1!])).statusCode).toBe(422);
    expect((await pins())[ids.c1!]).toBe(versionA);
  });

  it('C5-F8: all or nothing when a class fails part-way, or is missing', async () => {
    const versionC = await draft(a, a.curriculumId, packB());
    const before = await pins();
    const auditCount = (await allAudits()).length;
    // Make the update of class 2 fail inside the publish's transaction.
    await sql`
      CREATE FUNCTION public.fail_for_class() RETURNS trigger LANGUAGE plpgsql
        SET search_path = pg_catalog, pg_temp AS $$
        BEGIN
          IF NEW.id = ${sql.lit(ids.c2!)}::uuid THEN RAISE EXCEPTION 'test failure'; END IF;
          RETURN NEW;
        END $$
    `.execute(t.db);
    await sql`
      CREATE TRIGGER fail_for_class BEFORE UPDATE ON public.class
        FOR EACH ROW EXECUTE FUNCTION public.fail_for_class()
    `.execute(t.db);
    try {
      const res = await publishTo('teacher', versionC, [ids.c1!, ids.c2!]);
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: 'Something went wrong. Try again.' });
    } finally {
      await sql`DROP TRIGGER fail_for_class ON public.class`.execute(t.db);
      await sql`DROP FUNCTION public.fail_for_class()`.execute(t.db);
    }
    expect(await pins()).toEqual(before);
    expect((await version(versionC)).status).toBe('draft');

    const missing = await publishTo('teacher', versionC, [ids.c1!, crypto.randomUUID()]);
    expect(missing.statusCode).toBe(403);
    expect(await pins()).toEqual(before);
    expect((await version(versionC)).status).toBe('draft');
    expect((await allAudits()).length).toBe(auditCount);
  });

  it('C5-F8: a repeated Idempotency-Key is a no-op with the same result and one audit record', async () => {
    const versionD = await draft(a, a.curriculumId, packB());
    const first = await publishTo('teacher', versionD, [ids.c1!, ids.c2!], 'publish-d');
    expect(first.statusCode).toBe(201);
    const pinned = await pins();
    const second = await publishTo('teacher', versionD, [ids.c2!, ids.c1!], 'publish-d');
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(await pins()).toEqual(pinned);
    const records = (await audits()).filter((e) => e.target_id === versionD);
    expect(records).toHaveLength(1);
    // F6's trigger logged the publish and the two pins once, as this caller.
    const rows = (await allAudits()).filter(
      (e) =>
        e.target_id === versionD ||
        (e.after as { pinned_version_id?: string } | null)?.pinned_version_id === versionD,
    );
    expect(rows.map((e) => e.action).sort()).toEqual([
      'class.updated',
      'class.updated',
      'curriculum_version.publish',
      'version.published',
    ]);
    expect(rows.every((e) => e.actor_id === a.teacher.userId)).toBe(true);
    // The key itself isn't stored.
    expect(JSON.stringify(records[0]!.detail)).not.toContain('publish-d');

    const other = await publishTo('teacher', versionD, [ids.c3!], 'publish-d');
    expect(other.statusCode).toBe(409);
    // Put class 1 and 2 back on A for the tests below.
    for (const c of [ids.c1!, ids.c2!]) {
      await call('teacher', 'POST', `/api/classes/${c}/pin`, { version_id: versionA });
    }
  });

  it('C5-F9: publishing rewrites no progress or events', async () => {
    const recordedAt = new Date();
    await t.db
      .insertInto('interaction_event')
      .values({
        id: '01HZZZZZZZZZZZZZZZZZZZZZZ1',
        org_id: a.orgId,
        student_id: ids.s1!,
        class_id: ids.c1!,
        version_id: versionA,
        seq: 1,
        at: recordedAt,
        type: 'idea.opened',
        payload: json({ idea_id: 'glacier' }),
        recorded_at: recordedAt,
      })
      .execute();
    await t.db
      .insertInto('progress_snapshot')
      .values({
        class_id: ids.c1!,
        student_id: ids.s1!,
        org_id: a.orgId,
        rules_version: 'test',
        state: json({ glacier: 'mastered' }),
        last_seq: 1,
      })
      .execute();
    const snapshot = async () =>
      (
        await sql<{ events: string; snapshots: string }>`
          SELECT
            (SELECT count(*) || ':' || md5(coalesce(string_agg(e::text, ',' ORDER BY e.id), ''))
               FROM public.interaction_event e) AS events,
            (SELECT count(*) || ':' || md5(coalesce(string_agg(p::text, ',' ORDER BY p.student_id), ''))
               FROM public.progress_snapshot p) AS snapshots
        `.execute(t.db)
      ).rows[0];
    const before = await snapshot();
    expect((await publishTo('teacher', versionB, [ids.c1!, ids.c2!])).statusCode).toBe(201);
    expect(await snapshot()).toEqual(before);
  });

  it('C5-S1: only the class’s teacher or an org admin can publish', async () => {
    const versionF = await draft(a, a.curriculumId, packA());
    const before = await pins();
    const tries = {
      nobody: 401,
      student: 403,
      author: 403,
      teacher2: 403,
      'b-admin': 403,
      'b-teacher': 403,
    };
    for (const [who, status] of Object.entries(tries)) {
      const res = await publishTo(who, versionF, [ids.c1!]);
      expect(res.statusCode, who).toBe(status);
    }
    // Cross-org: the same answer as for an id that doesn't exist.
    const unknown = await publishTo('b-admin', crypto.randomUUID(), [ids.c1!]);
    const real = await publishTo('b-admin', versionF, [ids.c1!]);
    expect(real.json()).toEqual(unknown.json());
    expect(await pins()).toEqual(before);
    expect((await version(versionF)).status).toBe('draft');

    // Diffs: staff of the organization can read; students and other orgs can't.
    expect((await call('nobody', 'GET', `/api/versions/${versionF}/diff`)).statusCode).toBe(401);
    expect((await call('student', 'GET', `/api/versions/${versionF}/diff`)).statusCode).toBe(403);
    expect((await call('b-admin', 'GET', `/api/versions/${versionF}/diff`)).statusCode).toBe(403);
    expect((await call('author', 'GET', `/api/versions/${versionF}/diff`)).statusCode).toBe(200);
    // Rollback follows the same rule.
    const pin = (as: string) =>
      call(as, 'POST', `/api/classes/${ids.c1}/pin`, { version_id: versionA });
    expect((await pin('teacher2')).statusCode).toBe(403);
    expect((await pin('b-admin')).statusCode).toBe(403);

    // An org admin may publish to any class of the organization, the teacher to theirs.
    expect((await publishTo('admin', versionF, [ids.other!])).statusCode).toBe(201);
    expect((await publishTo('teacher2', versionF, [ids.other!])).statusCode).toBe(201);
    expect((await publishTo('teacher', versionF, [ids.c1!])).statusCode).toBe(201);
  });

  it('C5-S2: a class and the version pinned to it must share organization and curriculum', async () => {
    const before = await pins();
    // Org A's version to org B's class: B's class can't be seen.
    const bClass = await publishTo('teacher', versionA, [ids.bClass!]);
    expect(bClass.statusCode).toBe(403);
    // The same answer as for a class that doesn't exist, so nothing leaks.
    expect(bClass.json()).toEqual(
      (await publishTo('teacher', versionA, [crypto.randomUUID()])).json(),
    );
    // Curriculum X's version to a class on curriculum Y.
    const wrong = await publishTo('teacher', versionA, [ids.classY!]);
    expect(wrong.statusCode).toBe(422);
    expect(
      (await call('teacher', 'POST', `/api/classes/${ids.classY}/pin`, { version_id: versionA }))
        .statusCode,
    ).toBe(422);
    expect(await pins()).toEqual(before);

    // The database refuses both on its own (F4 foreign keys and guard_class_pin).
    const scope = appScope(t.db);
    const crossOrg = scope(a.orgId, (trx) =>
      trx
        .updateTable('class')
        .set({ pinned_version_id: versionA })
        .where('id', '=', ids.bClass!)
        .execute(),
    );
    expect((await crossOrg).every((r) => r.numUpdatedRows === 0n)).toBe(true);
    await expect(
      scope(b.orgId, (trx) =>
        trx
          .updateTable('class')
          .set({ pinned_version_id: versionA })
          .where('id', '=', ids.bClass!)
          .execute(),
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      scope(a.orgId, (trx) =>
        trx
          .updateTable('class')
          .set({ pinned_version_id: versionA })
          .where('id', '=', ids.classY!)
          .execute(),
      ),
    ).rejects.toMatchObject({ code: '23503' });
    expect(await pins()).toEqual(before);
  });

  it('C5-S3: publish and rollback each write an audit event without names or secrets', async () => {
    const events = await audits();
    const publishes = events.filter((e) => e.action === 'curriculum_version.publish');
    const repins = events.filter((e) => e.action === 'class.repin');
    expect(publishes.length).toBeGreaterThan(0);
    expect(repins.length).toBeGreaterThan(0);
    const onB = publishes.find(
      (e) =>
        e.target_id === versionB &&
        (e.detail.result as { classes: unknown[] }).classes.length === 1,
    )!;
    expect(onB).toMatchObject({
      org_id: a.orgId,
      actor_id: a.teacher.userId,
      target_type: 'curriculum_version',
      detail: {
        curriculum_id: a.curriculumId,
        result: {
          classes: [{ class_id: ids.c1, from_version_id: versionA, to_version_id: versionB }],
        },
      },
    });
    expect(repins[0]).toMatchObject({
      actor_id: a.teacher.userId,
      target_type: 'class',
      target_id: ids.c1,
      detail: {
        classes: [{ class_id: ids.c1, from_version_id: versionB, to_version_id: versionA }],
      },
    });
    // With the pin and status rows F6's triggers wrote underneath.
    const underneath = (await allAudits()).filter(
      (e) => e.action === 'class.updated' || e.action.startsWith('version.'),
    );
    expect(underneath.length).toBeGreaterThan(0);
    const text = JSON.stringify([...events, ...underneath]);
    expect(text).not.toMatch(/Test (student|teacher|admin)/);
    for (const n of [1, 2, 3, 4, 5]) expect(text).not.toContain(ids[`s${n}`]);
  });

  it('C5-P2: 30 classes and 3,000 overlapping enrollments count in one query under 200 ms', async () => {
    const org = await seedOrg(t.db, 'P2');
    await sql`
      INSERT INTO public.class (org_id, curriculum_id, teacher_id, name)
      SELECT ${org.orgId}::uuid, ${org.curriculumId}::uuid, ${org.teacher.userId}::uuid, 'P2 class ' || n
      FROM generate_series(1, 30) AS n
    `.execute(t.db);
    await sql`
      INSERT INTO public.app_user (org_id, role, name)
      SELECT ${org.orgId}::uuid, 'student', 'P2 student ' || n FROM generate_series(1, 2100) AS n
    `.execute(t.db);
    // 100 students per class, each window overlapping the next by a third.
    await sql`
      INSERT INTO public.enrollment (org_id, class_id, student_id)
      SELECT ${org.orgId}::uuid, c.id, s.id
      FROM (SELECT id, row_number() OVER (ORDER BY id) - 1 AS i FROM public.class
              WHERE org_id = ${org.orgId}::uuid) AS c
      JOIN (SELECT id, row_number() OVER (ORDER BY id) - 1 AS j FROM public.app_user
              WHERE org_id = ${org.orgId}::uuid AND role = 'student' AND name LIKE 'P2 student %') AS s
        ON s.j >= c.i * 66 AND s.j < c.i * 66 + 100
    `.execute(t.db);
    const classIds = (
      await t.db.selectFrom('class').select('id').where('org_id', '=', org.orgId).execute()
    ).map((c) => c.id);
    const expected = await t.db
      .selectFrom('enrollment')
      .select((eb) => eb.fn.count<string>('student_id').distinct().as('n'))
      .where('org_id', '=', org.orgId)
      .executeTakeFirstOrThrow();
    const rows = await t.db
      .selectFrom('enrollment')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('org_id', '=', org.orgId)
      .executeTakeFirstOrThrow();
    expect(Number(rows.n)).toBe(3000);

    const scope = appScope(t.db);
    await scope(org.orgId, (trx) => studentsReceiving(trx, classIds));
    const runs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const { ms, count } = await scope(org.orgId, async (trx) => {
        const started = performance.now();
        const result = await studentsReceiving(trx, classIds);
        return { ms: performance.now() - started, count: result.count };
      });
      expect(count).toBe(Number(expected.n));
      runs.push(ms);
    }
    runs.sort((x, y) => x - y);
    expect(runs[2]).toBeLessThan(200);
  });
});
