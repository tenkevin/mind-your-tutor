import {
  CSRF_HEADER,
  QUEUES,
  type ClassContent,
  type DraftList,
  type Pack,
} from '@ideamap/contracts';
import { json } from '@ideamap/db';
import { findDraftable } from '@ideamap/domain';
import { runDrafting, type Caller } from '@ideamap/worker';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { packA } from '../../../packages/contracts/src/testing/publish.js';
import {
  appScope,
  freshDatabase,
  hasDatabase,
  seedOrg,
  type Org,
  type TestDatabase,
} from '../../worker/src/testing/db.js';
import { gatewayDraftWriter } from './ai/drafter.js';
import { loadAiConfig } from './ai/config.js';
import { loadConfig } from './config.js';
import { buildServer } from './index.js';
import { SESSION_COOKIE } from './policy.js';
import { createSession } from './sessions.js';
import { mockModel } from './test/mock-model.js';
import { csrfToken, deriveKeys, sessionCookieValue } from './tokens.js';

// A6 (docs/qa/A6.md): drafts for the empty explanations, objectives and questions of an
// import, reviewed and approved by teachers, and the student route that serves approved
// text only. The model is A1's mock; there is no key and no network.

const ORIGIN = 'https://teacher.ideamap.test';
const config = loadConfig({
  IDEAMAP_APP_ORIGINS: ORIGIN,
  IDEAMAP_SESSION_SECRET: 'test-only-session-secret-0123456789abcdef',
});

/** The sample pack with exactly four gaps: two explanations, one objective, one question. */
function gappy(): Pack {
  const pack = packA();
  for (const i of pack.ideas) i.explanation ||= `Sheet explanation of ${i.title}.`;
  for (const u of pack.units) u.objective ||= `Sheet objective for ${u.name}.`;
  for (const a of pack.assessment) a.question ||= 'A sheet question?';
  pack.ideas[0]!.explanation = null;
  pack.ideas[1]!.explanation = '   ';
  pack.units[0]!.objective = null;
  pack.assessment[0]!.question = null;
  return pack;
}

describe.skipIf(!hasDatabase)('drafts to approve (A6)', () => {
  let t: TestDatabase;
  let app: FastifyInstance;
  let a: Org;
  let b: Org;
  let classId: string;
  let versionId: string;
  const model = mockModel();
  const sent: unknown[] = [];
  const sessions = new Map<string, { cookie: string; csrf: string }>();
  const ids: Record<string, string> = {};
  let n = 0;
  model.behaviour = { kind: 'reply', text: 'A drafted line about the idea.' };
  const write = () =>
    gatewayDraftWriter({ provider: model, config: loadAiConfig({}) }, appScope(t.db));

  const addVersion = async (org: Org, pack: Pack, status: 'draft' | 'published' = 'draft') => {
    n += 1;
    const row = await t.db
      .insertInto('curriculum_version')
      .values({
        org_id: org.orgId,
        curriculum_id: org.curriculumId,
        number: n,
        pack: json(pack),
        issues: json([]),
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
    if (status === 'published') {
      await t.db
        .updateTable('curriculum_version')
        .set({ status: 'published', published_at: new Date() })
        .where('id', '=', row.id)
        .execute();
    }
    return row.id;
  };
  const draftJob = (org: Org, version: string) =>
    runDrafting(
      { scope: appScope(t.db), write: write() },
      { org_id: org.orgId, curriculum_id: org.curriculumId, version_id: version },
    );
  const call = (as: string | null, method: 'GET' | 'POST', url: string, payload?: object) => {
    const signed = as ? sessions.get(as) : undefined;
    return app.inject({
      method,
      url,
      headers: {
        host: new URL(ORIGIN).host,
        'x-forwarded-proto': 'https',
        origin: ORIGIN,
        ...(signed ? { [CSRF_HEADER]: signed.csrf } : {}),
      },
      cookies: signed ? { [SESSION_COOKIE]: signed.cookie } : {},
      ...(payload ? { payload } : {}),
    });
  };
  const queue = async (as = 'teacher') =>
    (await call(as, 'GET', `/api/curricula/${a.curriculumId}/drafts`)).json<DraftList>();
  const content = async (as = 'student') =>
    (await call(as, 'GET', `/api/classes/${classId}/content`)).json<ClassContent>();
  const action = (as: string, draftId: string, verb: string, payload?: object) =>
    call(as, 'POST', `/api/curricula/${a.curriculumId}/drafts/${draftId}/${verb}`, payload ?? {});
  const audits = async (action: string) =>
    t.db.selectFrom('audit_event').selectAll().where('action', '=', action).execute();

  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedOrg(t.db, 'A');
    b = await seedOrg(t.db, 'B');
    const user = async (org: Org, role: Caller['role'], name: string) =>
      (
        await t.db
          .insertInto('app_user')
          .values({ org_id: org.orgId, role, name })
          .returning('id')
          .executeTakeFirstOrThrow()
      ).id;
    ids.other = await user(a, 'teacher', 'Test teacher elsewhere');
    const callers = new Map<string, Caller>([
      ['teacher', a.teacher],
      ['student', a.student],
      ['b-teacher', b.teacher],
      ['other', { orgId: a.orgId, userId: ids.other, role: 'teacher' }],
    ]);
    classId = (
      await t.db
        .insertInto('class')
        .values({
          org_id: a.orgId,
          curriculum_id: a.curriculumId,
          teacher_id: a.teacher.userId,
          name: 'Class 1',
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;
    await t.db
      .insertInto('enrollment')
      .values({ org_id: a.orgId, class_id: classId, student_id: a.student.userId })
      .execute();
    // The other teacher has a class on a different curriculum, so can't review ours.
    const elsewhere = await t.db
      .insertInto('curriculum')
      .values({ org_id: a.orgId, title: 'Elsewhere' })
      .returning('id')
      .executeTakeFirstOrThrow();
    await t.db
      .insertInto('class')
      .values({
        org_id: a.orgId,
        curriculum_id: elsewhere.id,
        teacher_id: ids.other,
        name: 'Elsewhere class',
      })
      .execute();
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
    app = buildServer({
      db: t.db,
      config,
      drafts: { boss: { send: async (...args: unknown[]) => void sent.push(args) } as never },
    });
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
    await t?.drop();
  });

  it('A6-F1: drafts exactly the four gaps, each tied to its row, through the gateway', async () => {
    versionId = await addVersion(a, gappy(), 'published');
    await t.db
      .updateTable('class')
      .set({ pinned_version_id: versionId })
      .where('id', '=', classId)
      .execute();
    const out = await draftJob(a, versionId);
    expect(out).toEqual({ drafted: 4, failed: 0 });
    expect(model.requests).toHaveLength(4);
    // Ms. Ivy for the explanations, Atlas for the unit objective and the question.
    const rows = await t.db.selectFrom('content_draft').selectAll().orderBy('kind').execute();
    expect(rows.map((r) => [r.kind, r.row_key, r.status])).toEqual(
      findDraftable(gappy())
        .map((g) => [g.kind, g.key, 'pending'])
        .sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
    );
    const ai = await t.db.selectFrom('ai_interaction').select('persona').execute();
    expect(ai.map((r) => r.persona).sort()).toEqual(['agent', 'agent', 'tutor', 'tutor']);
    // Curriculum material only: no student name or id reaches the model.
    for (const request of model.requests) {
      expect(JSON.stringify(request)).not.toContain('Test student');
      expect(request.system).toContain('Task:');
    }
    // Running it again drafts nothing new.
    expect(await draftJob(a, versionId)).toEqual({ drafted: 0, failed: 0 });
    expect(model.requests).toHaveLength(4);
  });

  it('A6-F2: before approval, students see no draft text', async () => {
    const body = await content();
    expect(JSON.stringify(body)).not.toContain('A drafted line');
    const pack = gappy();
    expect(body.ideas.find((i) => i.idea_id === pack.ideas[0]!.idea_id)!.explanation).toBeNull();
    expect(body.units.find((u) => u.unit === pack.units[0]!.unit)!.objective).toBeNull();
    expect(body.assessment[0]!.question).toBeNull();
    // Sheet values still reach students.
    expect(body.ideas[2]!.explanation).toBe(gappy().ideas[2]!.explanation);
  });

  it('A6-U1: the queue carries the row context beside each draft', async () => {
    const q = await queue();
    expect(q.waiting).toBe(0);
    expect(q.items).toHaveLength(4);
    expect([...new Set(q.items.map((i) => i.tab))].sort()).toEqual([
      'Assessment',
      'Ideas',
      'Units',
    ]);
    for (const item of q.items) {
      expect(item.status).toBe('pending');
      expect(item.context.title).toBeTruthy();
      expect(item.approved).toBeNull();
    }
  });

  it('A6-F3: approve, edit then approve, and reject', async () => {
    const q = await queue();
    const [idea1, idea2] = q.items.filter((i) => i.kind === 'idea_explanation');
    const unit = q.items.find((i) => i.kind === 'unit_objective')!;
    const pack = gappy();

    expect((await action('teacher', idea1!.id, 'approve')).statusCode).toBe(200);
    const edited = await action('teacher', idea2!.id, 'approve', {
      text: 'The teacher’s version.',
    });
    expect(edited.statusCode).toBe(200);
    expect((await action('teacher', unit.id, 'reject')).statusCode).toBe(200);

    const body = await content();
    const text = (id: string) => body.ideas.find((i) => i.idea_id === id)!.explanation;
    expect(text(idea1!.key)).toBe('A drafted line about the idea.');
    expect(text(idea2!.key)).toBe('The teacher’s version.');
    expect(body.units.find((u) => u.unit === pack.units[0]!.unit)!.objective).toBeNull();
    // D9's per-curriculum store holds the approved explanations.
    const stored = await t.db
      .selectFrom('approved_explanation')
      .select(['idea_id', 'text'])
      .execute();
    expect(stored.map((s) => s.text).sort()).toEqual([
      'A drafted line about the idea.',
      'The teacher’s version.',
    ]);

    // A rejected draft can be redrafted: its row goes and a job is queued.
    const redraft = await action('teacher', unit.id, 'redraft');
    expect(redraft.statusCode).toBe(202);
    expect((sent.at(-1) as unknown[])[0]).toBe(QUEUES.draftMissing);
    expect((sent.at(-1) as unknown[])[1]).toMatchObject({ version_id: versionId });
    expect(await draftJob(a, versionId)).toEqual({ drafted: 1, failed: 0 });
    const again = (await queue()).items.find((i) => i.kind === 'unit_objective')!;
    expect(again.status).toBe('pending');
    // Only a rejected draft can be redrafted.
    expect((await action('teacher', again.id, 'redraft')).statusCode).toBe(404);
  });

  it('A6-S2: approvals, edits and rejections are audited', async () => {
    expect(await audits('draft.approve')).toHaveLength(2);
    const edits = await audits('draft.edit');
    expect(edits).toHaveLength(1);
    expect(edits[0]!.actor_id).toBe(a.teacher.userId);
    expect(edits[0]!.curriculum_id).toBe(a.curriculumId);
    expect(await audits('draft.reject')).toHaveLength(1);
    expect(await audits('draft.redraft')).toHaveLength(1);
  });

  it('A6-F4: approvals survive re-import; a sheet value takes precedence', async () => {
    const before = model.requests.length;
    const next = gappy();
    const v2 = await addVersion(a, next, 'draft');
    // The same gaps again: nothing is drafted for approved rows or the pending one.
    expect(await draftJob(a, v2)).toEqual({ drafted: 0, failed: 0 });
    expect(model.requests).toHaveLength(before);
    const q = await queue();
    expect(q.items.filter((i) => i.status === 'approved')).toHaveLength(2);

    // The sheet now supplies idea 1's explanation: it wins over the approved text.
    next.ideas[0]!.explanation = 'The sheet’s own words.';
    const v3 = await addVersion(a, next, 'published');
    await t.db
      .updateTable('class')
      .set({ pinned_version_id: v3 })
      .where('id', '=', classId)
      .execute();
    const body = await content();
    expect(body.ideas[0]!.explanation).toBe('The sheet’s own words.');
    expect(body.ideas[1]!.explanation).toBe('The teacher’s version.');
    // And the queue no longer shows the superseded row.
    expect((await queue()).items.map((i) => i.key)).not.toContain(next.ideas[0]!.idea_id);
  });

  it('A6-F3: a withdrawn approval stops reaching students', async () => {
    const approved = (await queue()).items.find((i) => i.status === 'approved')!;
    expect((await action('teacher', approved.id, 'reject')).statusCode).toBe(200);
    const body = await content();
    expect(body.ideas[1]!.explanation).toBeNull();
    // Only the superseded idea’s approval is left in the store.
    expect(await t.db.selectFrom('approved_explanation').selectAll().execute()).toHaveLength(1);
  });

  it('A6-S1: another class’s teacher, a student and another org get 403', async () => {
    const q = await queue();
    const id = q.items[0]!.id;
    for (const as of ['other', 'student', 'b-teacher']) {
      const url = `/api/curricula/${a.curriculumId}`;
      expect((await call(as, 'GET', `${url}/drafts`)).statusCode, as).toBe(403);
      for (const verb of ['approve', 'reject', 'redraft']) {
        expect((await action(as, id, verb)).statusCode, `${as} ${verb}`).toBe(403);
      }
    }
    // Signed out: 401. A student of another class can't read this class's content.
    expect((await call(null, 'GET', `/api/curricula/${a.curriculumId}/drafts`)).statusCode).toBe(
      401,
    );
    expect((await call('b-teacher', 'GET', `/api/classes/${classId}/content`)).statusCode).toBe(
      403,
    );
    // Nothing changed.
    expect((await queue()).items[0]!.status).toBe(q.items[0]!.status);
  });

  it('rejects text over the field’s limit and ids that are not drafts of this curriculum', async () => {
    const pending = (await queue()).items.find((i) => i.status === 'pending')!;
    expect(
      (await action('teacher', pending.id, 'approve', { text: 'x'.repeat(2001) })).statusCode,
    ).toBe(400);
    expect((await action('teacher', pending.id, 'approve', { text: '   ' })).statusCode).toBe(400);
    const ghost = '00000000-0000-4000-8000-000000000000';
    expect((await action('teacher', ghost, 'approve')).statusCode).toBe(404);
    expect((await action('teacher', 'not-a-uuid', 'approve')).statusCode).toBe(400);
  });
});

describe.skipIf(!hasDatabase)('drafting a failing model (A6)', () => {
  it('stores what it could and throws so the queue retries the rest', async () => {
    const t = await freshDatabase();
    try {
      const a = await seedOrg(t.db, 'A');
      const v = await t.db
        .insertInto('curriculum_version')
        .values({
          org_id: a.orgId,
          curriculum_id: a.curriculumId,
          number: 1,
          pack: json(gappy()),
          issues: json([]),
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
      const model = mockModel();
      let calls = 0;
      const provider = {
        ...model,
        complete: (r: Parameters<typeof model.complete>[0]) => {
          calls += 1;
          if (calls === 2) throw new Error('boom sk-test');
          return model.complete(r);
        },
      };
      const write = gatewayDraftWriter({ provider, config: loadAiConfig({}) }, appScope(t.db));
      const payload = { org_id: a.orgId, curriculum_id: a.curriculumId, version_id: v.id };
      await expect(
        runDrafting({ scope: appScope(t.db), write, concurrency: 1 }, payload),
      ).rejects.toThrow(/1 of 4/);
      expect(await t.db.selectFrom('content_draft').selectAll().execute()).toHaveLength(3);
      // The retry drafts only the missing one.
      expect(await runDrafting({ scope: appScope(t.db), write }, payload)).toEqual({
        drafted: 1,
        failed: 0,
      });
    } finally {
      await t.drop();
    }
  });
});
