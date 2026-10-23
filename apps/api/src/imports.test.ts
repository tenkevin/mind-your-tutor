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
      url: `/curricula/${a.curriculumId}/imports`,
      headers: { 'content-type': 'text/html', 'x-test-user': 'a-teacher' },
      payload: '<x>',
    });
    expect(res.statusCode).toBe(415);
    const missing = await inject({
      method: 'GET',
      url: '/imports/<script>',
      headers: { 'x-test-user': 'a-teacher' },
    });
    // F5's route policy answers ids the caller can't see, real or not, with 403.
    expect(missing.statusCode).toBe(403);
    expect(missing.body).not.toContain('script');
  });
});
