import { readFileSync } from 'node:fs';
import { CSRF_HEADER } from '@ideamap/contracts';
import type { ExportStore } from '@ideamap/db';
import { asApp, hasDatabase } from '@ideamap/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { STAFF_AI_POLICY, STUDENT_AI_POLICY } from './ai/gateway.js';
import { loadConfig } from './config.js';
import { buildServer } from './index.js';
import { SESSION_COOKIE } from './policy.js';
import { STUDENT_PRIVACY_POLICY } from './privacy.js';
import {
  as,
  fromApp,
  ORIGIN,
  sessionFor,
  signIn,
  startApi,
  type Signed,
  type TestApi,
} from './test/harness.js';
import { mockModel } from './test/mock-model.js';

// F5-F4 to F5-F6, F5-S3, F5-S4, F5-P1.

const offlineConfig = loadConfig({
  IDEAMAP_APP_ORIGINS: ORIGIN,
  IDEAMAP_SESSION_SECRET: 'test-only-session-secret-0123456789abcdef',
});

/** The API's routes. A route missing here fails the "lists every route" test below. */
const ROUTE_URLS = [
  '/health',
  '/auth/providers',
  '/auth/:provider/start',
  '/auth/:provider/callback',
  '/auth/sign-out',
  '/api/me',
  '/api/session',
  '/api/classes',
  '/api/classes/:classId/header',
  '/api/classes/:classId/config',
  '/api/classes/:classId/roster',
  '/api/classes/:classId/library',
  '/api/classes/:classId/library/:libraryDocId',
  '/api/curricula/:curriculumId/defaults',
  '/api/users/:userId/role',
  '/api/roster/import',
];

/** C4's routes, registered when the server is given import deps. */
const IMPORT_ROUTE_URLS = ['/curricula/:curriculumId/imports', '/imports/:jobId'];
/** F6's FERPA routes, registered when the server is given an export store. */
const PRIVACY_ROUTE_URLS = [
  '/api/privacy/students/:studentId/export',
  '/api/privacy/students/:studentId',
];
/** A1's AI gateway routes, registered when the server is given a model provider. */
const AI_ROUTE_URLS = [
  '/api/classes/:classId/ai/tutor',
  '/api/classes/:classId/ai/peer',
  '/api/classes/:classId/ai/agent',
];
/** The gateway with a mock provider and limits the sweep can't reach. */
const MOCK_AI = {
  provider: mockModel(),
  config: {
    model: 'test-model',
    maxTokens: 500,
    timeoutMs: 1000,
    limits: { perStudent: 1000, perClass: 1000, windowMs: 60_000 },
  },
};
/** An export store that keeps nothing, for sweeps that only check access. */
const NO_FILES: ExportStore = { put: async () => {}, remove: async () => {} };
const PACK = readFileSync(new URL('../../../fixtures/water-cycle/pack.json', import.meta.url));
const UPLOAD = { 'content-type': 'application/octet-stream', 'x-file-name': 'pack.json' };

const PUBLIC = new Set([
  '/health',
  '/auth/providers',
  '/auth/:provider/start',
  '/auth/:provider/callback',
]);

describe('route-policy registry (F5-F4)', () => {
  it('refuses to register a route without a policy', async () => {
    const app = buildServer({ db: undefined as never, config: offlineConfig });
    expect(() => app.get('/api/new-thing', () => ({}))).toThrow(/declares no policy/);
    expect(() =>
      app.get(
        '/api/empty',
        { config: { policy: { roles: [], scope: { kind: 'org' } } } },
        () => ({}),
      ),
    ).toThrow(/allows no roles/);
    await app.close();
  });

  it('lists every route, each with a policy; only /health and sign-in are public', async () => {
    const app = buildServer({ db: undefined as never, config: offlineConfig });
    await app.ready();
    const routes = app.routePolicies;
    await app.close();
    expect(new Set(routes.map((r) => r.url))).toEqual(new Set(ROUTE_URLS));
    for (const route of routes) {
      expect(Boolean(route.policy.public), `${route.method} ${route.url}`).toBe(
        PUBLIC.has(route.url),
      );
    }
  });
});

describe('C4 import routes join the registry (F5-F4)', () => {
  it('declares a staff, org-scoped policy for each import route', async () => {
    const app = buildServer({
      db: undefined as never,
      config: offlineConfig,
      imports: { deps: {} as never },
    });
    await app.ready();
    const imports = app.routePolicies.filter((r) => !ROUTE_URLS.includes(r.url));
    expect(imports.map((r) => r.url).sort()).toEqual([...IMPORT_ROUTE_URLS].sort());
    await app.close();
    expect(imports.map((r) => `${r.method} ${r.url}`).sort()).toEqual([
      'GET /imports/:jobId',
      'POST /curricula/:curriculumId/imports',
    ]);
    expect(imports.map((r) => r.policy)).toEqual([
      {
        roles: ['admin', 'author', 'teacher'],
        scope: { kind: 'visible', table: 'curriculum', param: 'curriculumId' },
      },
      {
        roles: ['admin', 'author', 'teacher'],
        scope: { kind: 'visible', table: 'import_job', param: 'jobId' },
      },
    ]);
  });
});

describe('F6 privacy routes join the registry (F5-F4, F6-S1)', () => {
  it('declares an admin-only policy for the student in the caller org', async () => {
    const app = buildServer({
      db: undefined as never,
      config: offlineConfig,
      privacy: { store: NO_FILES },
    });
    await app.ready();
    const privacy = app.routePolicies.filter((r) => !ROUTE_URLS.includes(r.url));
    await app.close();
    expect(privacy.map((r) => `${r.method} ${r.url}`).sort()).toEqual([
      'DELETE /api/privacy/students/:studentId',
      'POST /api/privacy/students/:studentId/export',
    ]);
    for (const route of privacy) {
      expect(route.policy).toEqual(STUDENT_PRIVACY_POLICY);
      expect(route.policy).toEqual({
        roles: ['admin'],
        scope: { kind: 'user', param: 'studentId' },
      });
    }
  });
});

describe('A1 AI gateway routes join the registry (F5-F4, A1-S2)', () => {
  it('declares a class-scoped policy per persona: students for Ms. Ivy and Milo, staff for Atlas', async () => {
    const app = buildServer({ db: undefined as never, config: offlineConfig, ai: MOCK_AI });
    await app.ready();
    const ai = app.routePolicies.filter((r) => !ROUTE_URLS.includes(r.url));
    await app.close();
    expect(ai.map((r) => `${r.method} ${r.url}`)).toEqual(AI_ROUTE_URLS.map((u) => `POST ${u}`));
    expect(ai.map((r) => r.policy)).toEqual([
      STUDENT_AI_POLICY,
      STUDENT_AI_POLICY,
      STAFF_AI_POLICY,
    ]);
    expect(STUDENT_AI_POLICY).toEqual({
      roles: ['admin', 'author', 'teacher', 'student'],
      scope: { kind: 'class', param: 'classId', students: true },
    });
    expect(STAFF_AI_POLICY).toEqual({
      roles: ['admin', 'author', 'teacher'],
      scope: { kind: 'class', param: 'classId', students: false },
    });
  });
});

describe.skipIf(!hasDatabase)('every route checks role and org (F5-F4)', () => {
  let api: TestApi;
  let who: Record<
    'admin' | 'student' | 'otherClassTeacher' | 'otherOrgTeacher' | 'otherOrgAdmin',
    Signed
  >;
  let jobId = '';
  beforeAll(async () => {
    // With C4's import routes, F6's privacy routes and A1's AI gateway registered, so
    // the sweep covers them too.
    api = await startApi({}, { imports: true, privacy: NO_FILES, ai: MOCK_AI });
    const { users, orgs } = api.sample;
    who = {
      admin: await sessionFor(api, users['admin-a'], orgs.a),
      student: await sessionFor(api, users['student-a1'], orgs.a),
      otherClassTeacher: await sessionFor(api, users['teacher-a2'], orgs.a),
      otherOrgTeacher: await sessionFor(api, users['teacher-b1'], orgs.b),
      otherOrgAdmin: await sessionFor(api, users['admin-b'], orgs.b),
    };
    const started = await as(api, who.admin)(
      'POST',
      `/curricula/${api.sample.curricula.a}/imports`,
      PACK,
      UPLOAD,
    );
    expect(started.statusCode, started.body).toBe(202);
    jobId = started.json<{ job: { id: string } }>().job.id;
  });
  afterAll(async () => {
    await api?.close();
  });

  /** Concrete requests for each protected route, aimed at org A's class A1. */
  function requests(): {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    url: string;
    body?: unknown;
    headers?: Record<string, string>;
    route: string;
  }[] {
    const { classes, curricula, users, libraryDocs } = api.sample;
    return [
      { route: '/api/me', method: 'GET', url: '/api/me' },
      { route: '/api/session', method: 'GET', url: '/api/session' },
      { route: '/api/classes', method: 'GET', url: '/api/classes' },
      {
        route: '/api/classes/:classId/header',
        method: 'GET',
        url: `/api/classes/${classes.a1}/header`,
      },
      {
        route: '/api/classes/:classId/config',
        method: 'GET',
        url: `/api/classes/${classes.a1}/config`,
      },
      {
        route: '/api/classes/:classId/config',
        method: 'PUT',
        url: `/api/classes/${classes.a1}/config`,
        body: { course: { pass_mark: 70 } },
      },
      {
        route: '/api/classes/:classId/roster',
        method: 'GET',
        url: `/api/classes/${classes.a1}/roster`,
      },
      {
        route: '/api/classes/:classId/library',
        method: 'GET',
        url: `/api/classes/${classes.a1}/library`,
      },
      {
        route: '/api/classes/:classId/library/:libraryDocId',
        method: 'PUT',
        url: `/api/classes/${classes.a1}/library/${libraryDocs.a}`,
        body: { use_for: 'tutor' },
      },
      {
        route: '/api/curricula/:curriculumId/defaults',
        method: 'GET',
        url: `/api/curricula/${curricula.a}/defaults`,
      },
      {
        route: '/api/curricula/:curriculumId/defaults',
        method: 'PUT',
        url: `/api/curricula/${curricula.a}/defaults`,
        body: { course: { grade: '6' } },
      },
      {
        route: '/api/users/:userId/role',
        method: 'PUT',
        url: `/api/users/${users['student-a1']}/role`,
        body: { role: 'student' },
      },
      {
        route: '/api/roster/import',
        method: 'POST',
        url: '/api/roster/import',
        body: {
          curriculumId: curricula.a,
          users: 'sourcedId,role,givenName,familyName\n',
          classes: 'sourcedId,title\n',
          enrollments: 'classSourcedId,userSourcedId,role\n',
        },
      },
      {
        route: '/curricula/:curriculumId/imports',
        method: 'POST',
        url: `/curricula/${curricula.a}/imports`,
        body: PACK,
        headers: UPLOAD,
      },
      { route: '/imports/:jobId', method: 'GET', url: `/imports/${jobId}` },
      // F6: aimed at another student of org A, so deleting them leaves the sweep's
      // student session alone.
      {
        route: '/api/privacy/students/:studentId/export',
        method: 'POST',
        url: `/api/privacy/students/${users['student-a2']}/export`,
      },
      {
        route: '/api/privacy/students/:studentId',
        method: 'DELETE',
        url: `/api/privacy/students/${users['student-a2']}`,
      },
      // A1: one call per persona, aimed at class A1.
      ...['tutor', 'peer', 'agent'].map((persona) => ({
        route: `/api/classes/:classId/ai/${persona}`,
        method: 'POST' as const,
        url: `/api/classes/${classes.a1}/ai/${persona}`,
        body: { message: 'Hello' },
      })),
      // Last, as it ends the caller's session.
      { route: '/auth/sign-out', method: 'POST', url: '/auth/sign-out' },
    ];
  }

  it('covers every protected route', () => {
    const covered = new Set(requests().map((r) => r.route));
    expect(covered).toEqual(
      new Set([
        ...ROUTE_URLS.filter((u) => !PUBLIC.has(u)),
        ...IMPORT_ROUTE_URLS,
        ...PRIVACY_ROUTE_URLS,
        ...AI_ROUTE_URLS,
      ]),
    );
  });

  it('answers 401 to a signed-out caller on every protected route', async () => {
    for (const r of requests()) {
      const res = await as(api, null)(r.method, r.url, r.body, r.headers);
      expect(res.statusCode, `${r.method} ${r.url}`).toBe(401);
    }
  });

  it('checks access before reading a request body', async () => {
    const res = await api.app.inject({
      method: 'POST',
      url: '/api/roster/import',
      headers: { ...fromApp(), origin: ORIGIN, 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect(res.statusCode).toBe(401);
  });

  // Who may call what, for a request aimed at org A's class A1 and curriculum A.
  const ALLOWED: Record<string, (keyof typeof who)[]> = {
    'GET /api/me': ['admin', 'student', 'otherClassTeacher', 'otherOrgTeacher', 'otherOrgAdmin'],
    'GET /api/session': [
      'admin',
      'student',
      'otherClassTeacher',
      'otherOrgTeacher',
      'otherOrgAdmin',
    ],
    'GET /api/classes': [
      'admin',
      'student',
      'otherClassTeacher',
      'otherOrgTeacher',
      'otherOrgAdmin',
    ],
    'POST /auth/sign-out': [
      'admin',
      'student',
      'otherClassTeacher',
      'otherOrgTeacher',
      'otherOrgAdmin',
    ],
    // A teacher reads the defaults of a curriculum they teach (A2 also uses curriculum A).
    'GET /api/curricula/:curriculumId/defaults': ['admin', 'otherClassTeacher'],
    // C4: staff in the curriculum's org may import into it and read its jobs.
    'POST /curricula/:curriculumId/imports': ['admin', 'otherClassTeacher'],
    'GET /imports/:jobId': ['admin', 'otherClassTeacher'],
    // A1: Ms. Ivy and Milo for the class's students; Atlas for its staff only.
    'POST /api/classes/:classId/ai/tutor': ['admin', 'student'],
    'POST /api/classes/:classId/ai/peer': ['admin', 'student'],
  };

  it('answers 403 to the wrong role, class or org, and lets the admin through', async () => {
    for (const r of requests()) {
      const key = `${r.method} ${r.route}`;
      const allowed = ALLOWED[key] ?? ['admin'];
      for (const caller of Object.keys(who) as (keyof typeof who)[]) {
        const fresh = r.route === '/auth/sign-out';
        const signed = fresh
          ? await sessionFor(
              api,
              who[caller].userId,
              caller.startsWith('otherOrg') ? api.sample.orgs.b : api.sample.orgs.a,
            )
          : who[caller];
        const res = await as(api, signed)(r.method, r.url, r.body, r.headers);
        const label = `${caller}: ${r.method} ${r.url} → ${res.statusCode} ${res.body}`;
        if (allowed.includes(caller)) {
          expect(res.statusCode, label).toBeLessThan(300);
        } else {
          expect(res.statusCode, label).toBe(403);
        }
      }
    }
  });

  it('shows each caller only their own org', async () => {
    const mine = await as(api, who.otherOrgAdmin)('GET', '/api/classes');
    expect(mine.json().classes.map((c: { id: string }) => c.id)).toEqual([api.sample.classes.b1]);
    const me = await as(api, who.otherOrgAdmin)('GET', '/api/me');
    expect(me.json().org.id).toBe(api.sample.orgs.b);
  });
});

describe.skipIf(!hasDatabase)('class and curriculum scoping (F5-F5, F5-F6)', () => {
  let api: TestApi;
  beforeAll(async () => {
    api = await startApi();
  });
  afterAll(async () => {
    await api?.close();
  });

  it("refuses a teacher another class's config, roster and library in the same org", async () => {
    const tess = await signIn(api, 'clever', 'teacher-a2');
    const { a1, a2 } = api.sample.classes;
    for (const path of ['config', 'roster', 'library']) {
      expect((await as(api, tess)('GET', `/api/classes/${a1}/${path}`)).statusCode, path).toBe(403);
      expect((await as(api, tess)('GET', `/api/classes/${a2}/${path}`)).statusCode, path).toBe(200);
    }
    const put = await as(api, tess)(
      'PUT',
      `/api/classes/${a1}/library/${api.sample.libraryDocs.a}`,
      {
        use_for: 'off',
      },
    );
    expect(put.statusCode).toBe(403);
  });

  it('allows it once they also teach that class', async () => {
    const tess = await signIn(api, 'clever', 'teacher-a2');
    const { a1 } = api.sample.classes;
    await api.t.db
      .updateTable('class')
      .set({ teacher_id: api.sample.users['teacher-a2'] })
      .where('id', '=', a1)
      .execute();
    try {
      for (const path of ['config', 'roster', 'library']) {
        expect((await as(api, tess)('GET', `/api/classes/${a1}/${path}`)).statusCode, path).toBe(
          200,
        );
      }
    } finally {
      await api.t.db
        .updateTable('class')
        .set({ teacher_id: api.sample.users['teacher-a1'] })
        .where('id', '=', a1)
        .execute();
    }
  });

  it('shows a class only its own uploads (D11)', async () => {
    const terry = await signIn(api, 'google', 'teacher-a1');
    const library = await as(api, terry)('GET', `/api/classes/${api.sample.classes.a1}/library`);
    expect(library.json().uploads.map((u: { title: string }) => u.title)).toEqual([
      'Science 6A lab sheet',
    ]);
    expect(library.json().shared).toHaveLength(1);
  });

  it('lets the author edit curriculum defaults, not a teacher who uses it (D3)', async () => {
    const author = await signIn(api, 'google', 'author-a');
    const teacher = await signIn(api, 'google', 'teacher-a1');
    const url = `/api/curricula/${api.sample.curricula.a}/defaults`;
    const body = { course: { grade: '7' } };
    expect((await as(api, author)('PUT', url, body)).statusCode).toBe(200);
    expect((await as(api, teacher)('PUT', url, body)).statusCode).toBe(403);
    expect((await as(api, teacher)('GET', url)).json()).toEqual({
      config: { course: { grade: '7' } },
    });
  });

  it("refuses an author another author's curriculum", async () => {
    const author = await signIn(api, 'google', 'author-a');
    const other = await api.t.db
      .insertInto('curriculum')
      .values({
        org_id: api.sample.orgs.a,
        title: 'Rocks',
        created_by: api.sample.users['admin-a'],
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const res = await as(api, author)('PUT', `/api/curricula/${other.id}/defaults`, {});
    expect(res.statusCode).toBe(403);
  });
});

describe.skipIf(!hasDatabase)('CSRF and the database guard (F5-S3, F5-S4)', () => {
  let api: TestApi;
  let teacher: Signed;
  beforeAll(async () => {
    api = await startApi();
    teacher = await signIn(api, 'google', 'teacher-a1');
  });
  afterAll(async () => {
    await api?.close();
  });

  const url = () => `/api/classes/${api.sample.classes.a1}/config`;
  const send = (method: 'POST' | 'PUT' | 'DELETE', path: string, headers: Record<string, string>) =>
    api.app.inject({
      method,
      url: path,
      headers: { ...fromApp(), ...headers },
      cookies: { [SESSION_COOKIE]: teacher.cookie },
      payload: method === 'DELETE' ? undefined : {},
    });

  it('refuses state-changing requests from a foreign origin or without the token', async () => {
    for (const method of ['POST', 'PUT', 'DELETE'] as const) {
      for (const path of [url(), '/auth/sign-out']) {
        for (const headers of [
          { origin: 'https://evil.example' },
          { origin: 'https://evil.example', [CSRF_HEADER]: teacher.csrf },
          { origin: ORIGIN },
          { origin: ORIGIN, [CSRF_HEADER]: 'wrong' },
          { [CSRF_HEADER]: teacher.csrf },
          { referer: 'https://evil.example/page', [CSRF_HEADER]: teacher.csrf },
        ] as Record<string, string>[]) {
          const res = await send(method, path, headers);
          // A method a route doesn't have is 404, never a success.
          expect([403, 404], `${method} ${path} ${JSON.stringify(headers)}`).toContain(
            res.statusCode,
          );
          if (res.statusCode === 404) expect(api.app.hasRoute({ method, url: path })).toBe(false);
        }
      }
    }
    // The session still works: none of those signed it out.
    expect((await as(api, teacher)('GET', '/api/me')).statusCode).toBe(200);
  });

  it('accepts the same request from the app with the token', async () => {
    const res = await send('PUT', url(), { origin: ORIGIN, [CSRF_HEADER]: teacher.csrf });
    expect(res.statusCode).toBe(200);
  });

  it("sees zero rows of org B with org A's context, as the app role (F5-S4)", async () => {
    const { orgs, classes, users, curricula } = api.sample;
    const rows = await asApp(api.t.db, orgs.a, async (trx) => ({
      classes: await trx.selectFrom('class').select('id').where('id', '=', classes.b1).execute(),
      users: await trx
        .selectFrom('app_user')
        .select('id')
        .where('id', '=', users['student-b1'])
        .execute(),
      curricula: await trx
        .selectFrom('curriculum')
        .select('id')
        .where('id', '=', curricula.b)
        .execute(),
      sessions: await trx
        .selectFrom('auth_session')
        .select('id')
        .where('org_id', '=', orgs.b)
        .execute(),
      tenants: await trx
        .selectFrom('sso_tenant')
        .select('org_id')
        .where('org_id', '=', orgs.b)
        .execute(),
    }));
    expect(rows).toEqual({ classes: [], users: [], curricula: [], sessions: [], tenants: [] });
  });

  it("answers an org A admin's request for org B's ids with 403, not B's data", async () => {
    const admin = await signIn(api, 'google', 'admin-a');
    const { classes, curricula } = api.sample;
    for (const path of [
      `/api/classes/${classes.b1}/config`,
      `/api/classes/${classes.b1}/roster`,
      `/api/curricula/${curricula.b}/defaults`,
    ]) {
      expect((await as(api, admin)('GET', path)).statusCode, path).toBe(403);
    }
  });

  it('refuses a session cookie naming another org', async () => {
    const [, token] = teacher.cookie.split('.');
    const forged = `${api.sample.orgs.b}.${token}`;
    expect((await as(api, { ...teacher, cookie: forged })('GET', '/api/me')).statusCode).toBe(401);
  });
});

// F5-P1 and A1-P1 share one file, so these timings run one after the other, never
// alongside each other.
describe.skipIf(!hasDatabase)('performance (F5-P1, A1-P1)', () => {
  let api: TestApi;
  beforeAll(async () => {
    api = await startApi({}, { ai: { ...MOCK_AI, provider: mockModel() } });
  });
  afterAll(async () => {
    await api?.close();
  });

  it('adds under 5 ms p95 of auth to a protected no-op route', async () => {
    const teacher = await signIn(api, 'google', 'teacher-a1');
    const time = async (signed: boolean) => {
      const out: number[] = [];
      for (let i = 0; i < 1000; i++) {
        const started = performance.now();
        const res = await api.app.inject({
          method: 'GET',
          url: signed ? '/api/session' : '/health',
          headers: fromApp(),
          cookies: signed ? { [SESSION_COOKIE]: teacher.cookie } : {},
        });
        out.push(performance.now() - started);
        expect(res.statusCode).toBe(200);
      }
      return out.sort((a, b) => a - b);
    };
    await time(true); // warm up
    const base = await time(false);
    const authed = await time(true);
    const p95 = (xs: number[]) => xs[Math.floor(xs.length * 0.95)]!;
    const overhead = p95(authed) - p95(base);
    if (process.env.IDEAMAP_PERF_VERBOSE) {
      console.log(`auth p95 ${p95(authed).toFixed(2)} ms, base ${p95(base).toFixed(2)} ms`);
    }
    expect(overhead).toBeLessThan(5);
  });

  it('adds under 30 ms p95 of gateway work over a signed-in no-op, with an instant provider (A1-P1)', async () => {
    const student = await sessionFor(api, api.sample.users['student-a1'], api.sample.orgs.a);
    const gateway = `/api/classes/${api.sample.classes.a1}/ai/tutor`;
    const time = async (path: string, body?: unknown) => {
      const out: number[] = [];
      for (let i = 0; i < 200; i++) {
        const started = performance.now();
        const res = await as(api, student)(body ? 'POST' : 'GET', path, body);
        out.push(performance.now() - started);
        expect(res.statusCode).toBe(200);
      }
      return out.sort((a, b) => a - b);
    };
    await time(gateway, { message: 'warm up' });
    const base = await time('/api/session');
    const calls = await time(gateway, { message: 'What is condensation, Sam?' });
    const p95 = (xs: number[]) => xs[Math.floor(xs.length * 0.95)]!;
    if (process.env.IDEAMAP_PERF_VERBOSE) {
      console.log(`gateway p95 ${p95(calls).toFixed(2)} ms, base ${p95(base).toFixed(2)} ms`);
    }
    expect(p95(calls) - p95(base)).toBeLessThan(30);
  });
});
