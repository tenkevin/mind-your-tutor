import { readFileSync } from 'node:fs';
import {
  CurriculumDataResponseSchema,
  QUEUES,
  TEST_PRACTICE_SOURCES,
  countIssues,
} from '@ideamap/contracts';
import { registerWorkers, type Caller, type ImportDeps } from '@ideamap/worker';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { zip } from '../../../packages/connectors/src/testing/build.js';
import {
  appScope,
  fixture,
  freshDatabase,
  hasDatabase,
  seedOrg,
  startBoss,
  store,
  type Org,
  type TestDatabase,
} from '../../worker/src/testing/db.js';
import { CSRF_HEADER } from '@ideamap/contracts';
import type { InjectOptions } from 'fastify';
import { loadConfig } from './config.js';
import { buildServer } from './index.js';
import { SESSION_COOKIE } from './policy.js';
import { createSession } from './sessions.js';
import { csrfToken, deriveKeys, sessionCookieValue } from './tokens.js';

// C4 over HTTP: upload a file, poll the job, get a draft. Callers sign in with F5
// sessions; a test names one with the x-test-user header, which `inject` turns into
// that caller's session cookie and CSRF token.

const ORIGIN = 'https://teacher.ideamap.test';
const config = loadConfig({
  IDEAMAP_APP_ORIGINS: ORIGIN,
  IDEAMAP_SESSION_SECRET: 'test-only-session-secret-0123456789abcdef',
});

describe.skipIf(!hasDatabase)('POST /curricula/:id/imports (C4)', () => {
  let t: TestDatabase;
  let boss: PgBoss;
  let app: FastifyInstance;
  let a: Org;
  let b: Org;
  const callers = new Map<string, Caller>();
  const sessions = new Map<string, { cookie: string; csrf: string }>();

  /** app.inject, signed in as the caller named by x-test-user (if any). */
  const inject = (options: InjectOptions) => {
    const headers = { ...(options.headers as Record<string, string>) };
    const signed = sessions.get(headers['x-test-user'] ?? '');
    delete headers['x-test-user'];
    const url = new URL(ORIGIN);
    return app.inject({
      ...options,
      headers: {
        ...headers,
        host: url.host,
        'x-forwarded-proto': 'https',
        origin: ORIGIN,
        ...(signed ? { [CSRF_HEADER]: signed.csrf } : {}),
      },
      cookies: signed ? { [SESSION_COOKIE]: signed.cookie } : {},
    });
  };

  const post = (
    as: string,
    curriculumId: string,
    body: Buffer,
    headers: Record<string, string> = {},
  ) =>
    inject({
      method: 'POST',
      url: `/api/curricula/${curriculumId}/imports`,
      headers: { 'content-type': 'application/octet-stream', 'x-test-user': as, ...headers },
      payload: body,
    });
  const queued = async () =>
    Number(
      (
        await sql<{
          n: string;
        }>`SELECT count(*) AS n FROM pgboss.job WHERE name = ${QUEUES.import}`.execute(t.db)
      ).rows[0]!.n,
    );

  beforeAll(async () => {
    t = await freshDatabase();
    boss = await startBoss(t.url);
    // The fixture's Practice rows name the test-only `fixture` bank (C10).
    const deps: ImportDeps = {
      scope: appScope(t.db),
      boss,
      store: store(),
      practiceSources: TEST_PRACTICE_SOURCES,
    };
    await registerWorkers({ ...deps, boss, pollingIntervalSeconds: 0.5 });
    a = await seedOrg(t.db, 'A');
    b = await seedOrg(t.db, 'B');
    callers.set('a-teacher', a.teacher).set('a-student', a.student).set('b-teacher', b.teacher);
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
    app = buildServer({ db: t.db, config, imports: { deps } });
  });
  afterAll(async () => {
    await app?.close();
    await boss?.stop({ graceful: false, timeout: 1000 });
    await t?.drop();
  });

  it('C4-F1, F3: upload, poll, and a draft that can’t be published yet', async () => {
    const res = await post('a-teacher', a.curriculumId, fixture('water-cycle.xlsx'), {
      'x-file-name': encodeURIComponent('Water cycle (v2).xlsx'),
    });
    expect(res.statusCode).toBe(202);
    const { job } = res.json<{ job: { id: string; status: string } }>();
    expect(job.status).toBe('queued');

    let body: { job: { status: string; version: unknown; source: { file_name: string } } };
    const until = Date.now() + 20_000;
    do {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const poll = await inject({
        method: 'GET',
        url: `/api/imports/${job.id}`,
        headers: { 'x-test-user': 'a-teacher' },
      });
      expect(poll.statusCode).toBe(200);
      body = poll.json();
    } while (body.job.status !== 'succeeded' && Date.now() < until);
    expect(body.job.status).toBe('succeeded');
    expect(body.job.source.file_name).toBe('Water cycle (v2).xlsx');
    expect(body.job.version).toMatchObject({ number: 1, status: 'draft', can_publish: false });
  });

  it('C4-F7: a repeated Idempotency-Key returns the first job', async () => {
    const headers = { 'idempotency-key': 'retry-me' };
    const first = await post('a-teacher', a.curriculumId, fixture('pack.json'), headers);
    const second = await post('a-teacher', a.curriculumId, fixture('pack.json'), headers);
    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(200);
    expect(second.json<{ job: { id: string } }>().job.id).toBe(
      first.json<{ job: { id: string } }>().job.id,
    );
  });

  it('C4-S1: no caller, a student, or another organization is refused', async () => {
    const before = await queued();
    const body = fixture('pack.json');
    expect((await post('nobody', a.curriculumId, body)).statusCode).toBe(401);
    const student = await post('a-student', a.curriculumId, body);
    expect(student.statusCode).toBe(403);
    const other = await post('b-teacher', a.curriculumId, body);
    expect(other.statusCode).toBe(403);
    // F5's route policy refuses another org's curriculum before the worker sees it.
    expect(other.json()).toEqual({ error: 'Forbidden' });
    expect(await queued()).toBe(before);
  });

  it('C4-S2: a 60 MB file and a zip bomb are refused at upload; nothing is queued', async () => {
    const before = await queued();
    const big = await post('a-teacher', a.curriculumId, Buffer.alloc(60 * 1024 * 1024, 'a'), {
      'x-file-name': 'Ideas.csv',
    });
    expect(big.statusCode).toBe(413);
    expect(big.json()).toEqual({
      error:
        'Ideas.csv is 60 MB; the most an import accepts is 10 MB per file. Nothing was imported.',
    });
    // Honest headers, and headers that understate the unpacked size.
    for (const claimedSize of [undefined, 1000]) {
      const bomb = Buffer.from(
        zip([{ name: 'Ideas.csv', data: Buffer.alloc(120 * 1024 * 1024), claimedSize }]),
      );
      const refused = await post('a-teacher', a.curriculumId, bomb, { 'x-file-name': 'bomb.zip' });
      expect(refused.statusCode).toBe(422);
      expect(refused.json<{ error: string }>().error).toMatch(
        /^bomb\.zip.* unpacks to more than 100 MB.*Nothing was imported\.$/,
      );
    }
    expect(await queued()).toBe(before);
  });

  it('refuses other content types and unknown jobs without echoing input', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/curricula/${a.curriculumId}/imports`,
      headers: { 'content-type': 'text/html', 'x-test-user': 'a-teacher' },
      payload: '<x>',
    });
    expect(res.statusCode).toBe(415);
    const missing = await inject({
      method: 'GET',
      url: '/api/imports/<script>',
      headers: { 'x-test-user': 'a-teacher' },
    });
    // F5's route policy answers ids the caller can't see, real or not, with 403.
    expect(missing.statusCode).toBe(403);
    expect(missing.body).not.toContain('script');
  });

  // T2: Teacher Settings → Curriculum data reads the newest job and version.
  describe('GET /api/curricula/:id/imports/latest (T2)', () => {
    const latest = async (as: string, curriculumId: string) => {
      const res = await inject({
        method: 'GET',
        url: `/api/curricula/${curriculumId}/imports/latest`,
        headers: { 'x-test-user': as },
      });
      return res;
    };
    /** Uploads to org B's curriculum and waits for the job to finish. */
    const importB = async (body: Buffer, name: string) => {
      const res = await post('b-teacher', b.curriculumId, body, { 'x-file-name': name });
      expect(res.statusCode, res.body).toBe(202);
      const until = Date.now() + 20_000;
      for (;;) {
        const data = CurriculumDataResponseSchema.parse(
          (await latest('b-teacher', b.curriculumId)).json(),
        );
        if (data.job?.status === 'succeeded' || data.job?.status === 'failed') return data;
        if (Date.now() > until) throw new Error('import did not finish');
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    };
    const csv = (name: string) =>
      readFileSync(new URL(`../../../fixtures/water-cycle/${name}`, import.meta.url), 'utf8');
    const TABS = [
      'Course',
      'Units',
      'Ideas',
      'Links',
      'Categories',
      'Assessment',
      'Personas',
      'Library',
    ];

    it('is empty before the first import', async () => {
      const res = await latest('b-teacher', b.curriculumId);
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.json()).toEqual({ job: null, unchanged: false, version: null });
    });

    it('T2-F2, F3, F4, F7: steps, the sample’s three checks by cause, and the source', async () => {
      const data = await importB(fixture('water-cycle.xlsx'), 'water-cycle.xlsx');
      expect(data.job!.steps.map((s) => [s.name, s.status])).toEqual([
        ['Read sheet', 'done'],
        ['Check data', 'done'],
        ['Rank links', 'done'],
        ['Lay out map', 'done'],
        ['Make quizzes', 'done'],
        ['Index library', 'done'],
      ]);
      const version = data.version!;
      expect(version).toMatchObject({ number: 1, status: 'draft', can_publish: false });
      expect(version.source).toMatchObject({ kind: 'xlsx', file_name: 'water-cycle.xlsx' });
      expect(version.source.checksum).toBe(data.job!.source.checksum);
      expect(data.unchanged).toBe(false);
      expect(version.tabs.find((t) => t.tab === 'Ideas')).toEqual({ tab: 'Ideas', rows: 18 });
      expect(version.tabs.find((t) => t.tab === 'Links')).toEqual({ tab: 'Links', rows: 31 });
      expect(countIssues(version.groups)).toEqual({ error: 1, warning: 1, info: 1 });
      expect(
        version.groups.map((g) => [
          g.level,
          g.cause,
          g.fix,
          g.blocks_publish,
          g.issues[0]!.items.length,
        ]),
      ).toEqual([
        ['error', 'prereq', { tab: 'Ideas', column: 'requires' }, true, 1],
        ['warning', 'codes', { tab: 'Ideas', column: 'standard_codes' }, false, 1],
        ['info', 'media', { tab: 'Ideas', column: 'media_url' }, false, 11],
      ]);
      expect(version.groups[0]!.issues[0]!.items).toEqual(['ground']);
      // T2-U3: ids resolve to their sheet rows in the workbook.
      expect(version.groups[0]!.issues[0]!.item_rows).toEqual([{ tab: 'Ideas', row: 19 }]);
      expect(version.groups[1]!.issues[0]!.item_rows).toEqual([{ tab: 'Ideas', row: 14 }]);
      expect(version.groups[1]!.issues[0]!.items).toEqual(['rain']);
    });

    it('T2-F7: re-importing the same file says it is unchanged', async () => {
      const data = await importB(fixture('water-cycle.xlsx'), 'water-cycle.xlsx');
      expect(data.version!.number).toBe(2);
      expect(data.unchanged).toBe(true);
    });

    it('T2-F5: an empty unit objective is a draftable warning that doesn’t block', async () => {
      const pack = JSON.parse(fixture('pack.json').toString('utf8'));
      const ground = pack.ideas.find((i: { idea_id: string }) => i.idea_id === 'ground');
      ground.requires = ground.requires.filter((id: string) => id !== 'aquifer');
      pack.units[0].objective = '';
      const data = await importB(Buffer.from(JSON.stringify(pack)), 'pack.json');
      expect(data.unchanged).toBe(false);
      expect(data.version).toMatchObject({ number: 3, can_publish: true });
      const unit = data.version!.groups.find((g) => g.cause === 'unit_objective')!;
      expect(unit).toMatchObject({
        level: 'warning',
        draftable: true,
        blocks_publish: false,
        fix: { tab: 'Units', column: 'objective' },
      });
      expect(unit.issues[0]!.items).toEqual(['1']);
    });

    it('T2-F6: a file missing a required column fails with located problems, and no new draft', async () => {
      const files = TABS.map((tab) => {
        let text = csv(`${tab}.csv`);
        if (tab === 'Ideas') {
          // Drop the title column.
          text = text
            .replace(/^idea_id,title,/, 'idea_id,')
            .replace(/^([^,\n]+),(?:"[^"]*"|[^,\n]*),/gm, (line, id: string) =>
              id === 'idea_id' ? line : `${id},`,
            );
        }
        return { name: `${tab}.csv`, data: Buffer.from(text) };
      });
      const data = await importB(Buffer.from(zip(files)), 'pack.zip');
      expect(data.job!.status).toBe('failed');
      expect(data.job!.version).toBeNull();
      expect(data.job!.steps[0]).toMatchObject({ name: 'Read sheet', status: 'failed' });
      const problem = data.job!.error!.problems.find((p) => p.code === 'column_missing')!;
      expect(problem).toMatchObject({ severity: 'error', tab: 'Ideas', column: 'title' });
      // The newest version is still the last good one.
      expect(data.version!.number).toBe(3);
    });

    it('T2-S1: a student and another org are refused', async () => {
      expect((await latest('nobody', b.curriculumId)).statusCode).toBe(401);
      expect((await latest('a-student', a.curriculumId)).statusCode).toBe(403);
      const other = await latest('a-teacher', b.curriculumId);
      expect(other.statusCode).toBe(403);
      expect(other.body).not.toContain('water');
    });
  });
});
