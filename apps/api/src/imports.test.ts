import { QUEUES } from '@ideamap/contracts';
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
import { buildServer } from './index.js';

// C4 over HTTP: upload a file, poll the job, get a draft. Callers are picked by a
// test header until F5's sign-in supplies them.

describe.skipIf(!hasDatabase)('POST /curricula/:id/imports (C4)', () => {
  let t: TestDatabase;
  let boss: PgBoss;
  let app: FastifyInstance;
  let a: Org;
  let b: Org;
  const callers = new Map<string, Caller>();

  const post = (
    as: string,
    curriculumId: string,
    body: Buffer,
    headers: Record<string, string> = {},
  ) =>
    app.inject({
      method: 'POST',
      url: `/curricula/${curriculumId}/imports`,
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
    const deps: ImportDeps = { scope: appScope(t.db), boss, store: store() };
    await registerWorkers({ ...deps, boss, pollingIntervalSeconds: 0.5 });
    a = await seedOrg(t.db, 'A');
    b = await seedOrg(t.db, 'B');
    callers.set('a-teacher', a.teacher).set('a-student', a.student).set('b-teacher', b.teacher);
    app = buildServer({
      imports: {
        deps,
        authenticate: (request) => callers.get(String(request.headers['x-test-user'])) ?? null,
      },
    });
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
      const poll = await app.inject({
        method: 'GET',
        url: `/imports/${job.id}`,
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
    expect(other.json()).toEqual({ error: "You can't import into this curriculum." });
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
    const res = await app.inject({
      method: 'POST',
      url: `/curricula/${a.curriculumId}/imports`,
      headers: { 'content-type': 'text/html', 'x-test-user': 'a-teacher' },
      payload: '<x>',
    });
    expect(res.statusCode).toBe(415);
    const missing = await app.inject({
      method: 'GET',
      url: '/imports/<script>',
      headers: { 'x-test-user': 'a-teacher' },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.body).not.toContain('script');
  });
});
