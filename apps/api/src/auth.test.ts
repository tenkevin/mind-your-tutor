import { expectBestUnder } from '@ideamap/testing';
import { SIGN_IN_ERRORS } from '@ideamap/contracts';
import { hasDatabase } from '@ideamap/db/testing';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PII_CLAIMS } from './dev/sample.js';
import { SESSION_COOKIE } from './policy.js';
import {
  as,
  authorize,
  callback,
  cookieFrom,
  fromApp,
  ORIGIN,
  signIn,
  startApi,
  startSignIn,
  STUDENT_ORIGIN,
  type TestApi,
} from './test/harness.js';

// F5-F1, F5-F3, F5-F7, F5-S1, F5-S2, F5-S5 to F5-S7, F5-S9, F5-U2, F5-P2.

const HOUR = 3_600_000;

function errorOf(location: unknown): string | null {
  return new URL(String(location), ORIGIN).searchParams.get('error');
}

describe.skipIf(!hasDatabase)('sign-in with OIDC', () => {
  let api: TestApi;
  beforeAll(async () => {
    api = await startApi();
  });
  afterAll(async () => {
    await api?.close();
  });

  it('signs in a teacher and a student; /me returns id, role and org (F5-F1)', async () => {
    const teacher = await signIn(api, 'google', 'teacher-a1');
    const me = await as(api, teacher)('GET', '/api/me');
    expect(me.json()).toMatchObject({
      user: { id: api.sample.users['teacher-a1'], role: 'teacher', name: 'Terry Teacher' },
      org: { id: api.sample.orgs.a, name: 'Example District A' },
      session: { idleMinutes: 480 },
    });

    const student = await signIn(api, 'google', 'student-a1', { origin: STUDENT_ORIGIN });
    const meStudent = await as(api, student)('GET', '/api/me');
    expect(meStudent.json()).toMatchObject({
      user: { id: api.sample.users['student-a1'], role: 'student' },
      org: { id: api.sample.orgs.a },
      session: { idleMinutes: 120 },
    });
  });

  it('signs in through every configured provider with one adapter (F5-F2)', async () => {
    const providers = await api.app.inject({ method: 'GET', url: '/auth/providers' });
    expect(providers.json()).toEqual({
      providers: [
        { id: 'google', label: 'Google' },
        { id: 'clever', label: 'Clever' },
        { id: 'classlink', label: 'ClassLink' },
      ],
    });
    expect((await signIn(api, 'clever', 'teacher-a2')).userId).toBe(api.sample.users['teacher-a2']);
    expect((await signIn(api, 'classlink', 'student-a2')).userId).toBe(
      api.sample.users['student-a2'],
    );
  });

  it('sets a locked-down, host-only session cookie (F5-S2)', async () => {
    const started = await startSignIn(api, 'google');
    const res = await callback(api, await authorize(started, 'teacher-a1'), started.loginCookie);
    const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const session = setCookie.find((c) => c.startsWith(`${SESSION_COOKIE}=`))!;
    expect(session).toMatch(/; HttpOnly/);
    expect(session).toMatch(/; Secure/);
    expect(session).toMatch(/; SameSite=Lax/);
    expect(session).toMatch(/; Path=\//);
    expect(session).not.toMatch(/Domain=/i);
    // The __Host- prefix makes browsers enforce Secure, Path=/ and no Domain.
    expect(SESSION_COOKIE.startsWith('__Host-')).toBe(true);
    // The token itself is never in a response body (so it can't reach localStorage).
    const me = await as(api, {
      cookie: cookieFrom(res, SESSION_COOKIE)!,
      csrf: '',
      userId: '',
    })('GET', '/api/me');
    expect(me.body).not.toContain(cookieFrom(res, SESSION_COOKIE)!.split('.')[1]);
  });

  it('uses the code flow with PKCE S256 and a nonce, never the implicit flow (F5-S1)', async () => {
    const { authorizeUrl } = await startSignIn(api, 'google');
    const q = authorizeUrl.searchParams;
    expect(q.get('response_type')).toBe('code');
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(q.get('state')).toBeTruthy();
    expect(q.get('nonce')).toBeTruthy();
    expect(q.get('redirect_uri')).toBe(`${ORIGIN}/auth/google/callback`);
  });

  describe('refuses bad callbacks (F5-S1)', () => {
    const refused = async (res: { statusCode: number; headers: Record<string, unknown> }) => {
      expect(res.statusCode).toBe(303);
      expect(errorOf(res.headers.location)).toBe('failed');
      expect(res.headers['set-cookie']?.toString() ?? '').not.toContain(`${SESSION_COOKIE}=`);
    };
    const ip = () => `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

    it('a missing state', async () => {
      const started = await startSignIn(api, 'google');
      const path = (await authorize(started, 'teacher-a1')).replace(/state=[^&]+&?/, '');
      await refused(await callback(api, path, started.loginCookie, { ip: ip() }));
    });

    it('a state that differs from the one sent', async () => {
      const started = await startSignIn(api, 'google');
      const path = (await authorize(started, 'teacher-a1')).replace(/state=[^&]+/, 'state=forged');
      await refused(await callback(api, path, started.loginCookie, { ip: ip() }));
    });

    it('no sign-in cookie (another browser, or login CSRF)', async () => {
      const started = await startSignIn(api, 'google');
      await refused(await callback(api, await authorize(started, 'teacher-a1'), undefined));
    });

    it('a reused state, even with a fresh code', async () => {
      const started = await startSignIn(api, 'google');
      const first = await callback(
        api,
        await authorize(started, 'teacher-a1'),
        started.loginCookie,
      );
      expect(first.statusCode).toBe(303);
      expect(errorOf(first.headers.location)).toBeNull();
      await refused(
        await callback(api, await authorize(started, 'teacher-a1'), started.loginCookie, {
          ip: ip(),
        }),
      );
    });

    for (const [name, tamper] of [
      ['a mismatched nonce', { nonce: 'not-the-nonce' }],
      ['a token for another audience', { aud: 'someone-else' }],
      ['an expired token', { expired: true }],
      ['a token signed with an unknown key', { unknownKey: true }],
      ['a token from another issuer', { issuer: 'https://evil.example' }],
    ] as const) {
      it(name, async () => {
        const started = await startSignIn(api, 'google');
        const path = await authorize(started, 'teacher-a1');
        api.idp.tamperNext(tamper);
        await refused(await callback(api, path, started.loginCookie, { ip: ip() }));
      });
    }

    it('a callback for a different provider than the one started', async () => {
      const started = await startSignIn(api, 'google');
      const path = (await authorize(started, 'teacher-a1')).replace(
        '/auth/google/',
        '/auth/clever/',
      );
      await refused(await callback(api, path, started.loginCookie, { ip: ip() }));
    });

    it('a start from an origin the API does not serve', async () => {
      const res = await api.app.inject({
        method: 'GET',
        url: '/auth/google/start',
        headers: fromApp('https://evil.example'),
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('matching users (F5-F3)', () => {
    it('signs the same identity in twice as one user', async () => {
      const count = () =>
        api.t.db
          .selectFrom('app_user')
          .select((eb) => eb.fn.countAll<number>().as('n'))
          .executeTakeFirstOrThrow();
      const before = await count();
      const first = await signIn(api, 'google', 'teacher-a1');
      const second = await signIn(api, 'google', 'teacher-a1');
      expect(second.userId).toBe(first.userId);
      expect(await count()).toEqual(before);
    });

    it('links a rostered user on first sign-in by verified school email', async () => {
      const signed = await signIn(api, 'google', 'rostered-a');
      expect(signed.userId).toBe(api.sample.users['rostered-a']);
      const row = await api.t.db
        .selectFrom('app_user')
        .select(['sso_provider', 'sso_subject'])
        .where('id', '=', signed.userId)
        .executeTakeFirstOrThrow();
      expect(row).toEqual({ sso_provider: 'google', sso_subject: 'g-rostered-a' });
    });

    it('refuses the same email from a different provider, never a duplicate', async () => {
      const users = await api.t.db.selectFrom('app_user').select('id').execute();
      const started = await startSignIn(api, 'clever');
      const res = await callback(
        api,
        await authorize(started, 'teacher-a1-on-clever'),
        started.loginCookie,
      );
      expect(res.statusCode).toBe(303);
      expect(errorOf(res.headers.location)).toBe('linked_elsewhere');
      expect(await api.t.db.selectFrom('app_user').select('id').execute()).toHaveLength(
        users.length,
      );
    });
  });

  it('refuses users with no class, and unknown users, with the same plain message (F5-U2, F5-S7)', async () => {
    const refusals: (string | null)[] = [];
    for (const [provider, key] of [
      ['google', 'unenrolled-a'],
      ['google', 'stranger-a'],
      ['google', 'other-school'],
    ] as const) {
      const started = await startSignIn(api, provider);
      const res = await callback(api, await authorize(started, key), started.loginCookie, {
        ip: `10.2.0.${refusals.length}`,
      });
      expect(res.statusCode).toBe(303);
      expect(cookieFrom(res, SESSION_COOKIE)).toBeUndefined();
      refusals.push(errorOf(res.headers.location));
    }
    expect(refusals).toEqual(['not_linked', 'not_linked', 'not_linked']);
    expect(SIGN_IN_ERRORS.not_linked).toBe(
      "Your school account isn't linked to a class yet. Ask your teacher.",
    );
  });

  it('keeps only name, school email and roster ids for a student (F5-S5)', async () => {
    const student = await signIn(api, 'google', 'student-a1');
    const row = await api.t.db
      .selectFrom('app_user')
      .selectAll()
      .where('id', '=', student.userId)
      .executeTakeFirstOrThrow();
    expect(Object.keys(row).sort()).toEqual(
      [
        'created_at',
        'email',
        'id',
        'name',
        'org_id',
        'role',
        'roster_source_id',
        'sso_provider',
        'sso_subject',
        'updated_at',
      ].sort(),
    );
    // The provider sent a photo, birthday, phone and address; none is stored anywhere.
    const { rows } = await sql<{ dump: string }>`
      SELECT string_agg(t::text, ' ') AS dump FROM (
        SELECT row_to_json(u)::text AS t FROM app_user u
        UNION ALL SELECT row_to_json(a)::text FROM audit_event a
        UNION ALL SELECT row_to_json(s)::text FROM auth_session s
      ) x
    `.execute(api.t.db);
    for (const value of ['photos.example.org', '2015-04-01', '555 0100', 'Exampleton']) {
      expect(rows[0]!.dump).not.toContain(value);
    }
    expect(Object.keys(PII_CLAIMS)).toContain('birthdate');
  });

  describe('returnTo stays on this site (F5-S6)', () => {
    for (const evil of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      '/%0d%0aSet-Cookie:x=1',
    ]) {
      it(`ignores ${evil}`, async () => {
        const signed = await signIn(api, 'google', 'teacher-a1', { returnTo: evil });
        const target = new URL(signed.location, ORIGIN);
        expect(target.origin).toBe(ORIGIN);
        expect(signed.location.startsWith('/')).toBe(true);
        expect(signed.location.startsWith('//')).toBe(false);
      });
    }

    it('returns to a same-origin path', async () => {
      const signed = await signIn(api, 'google', 'teacher-a1', { returnTo: '/settings?tab=units' });
      expect(signed.location).toBe('/settings?tab=units');
    });
  });

  it('writes audit events for sign-in, role change and sign-out (F5-S9)', async () => {
    const admin = await signIn(api, 'google', 'admin-a');
    const author = await signIn(api, 'google', 'author-a');
    const target = api.sample.users['author-a'];
    const change = await as(api, admin)('PUT', `/api/users/${target}/role`, { role: 'teacher' });
    expect(change.statusCode).toBe(200);
    await as(api, admin)('PUT', `/api/users/${target}/role`, { role: 'author' });
    const out = await as(api, author)('POST', '/auth/sign-out');
    expect(out.statusCode).toBe(204);

    const events = await api.t.db
      .selectFrom('audit_event')
      .select(['actor_id', 'action', 'target_id', 'detail', 'at'])
      .where('org_id', '=', api.sample.orgs.a)
      .orderBy('at')
      .execute();
    const find = (action: string, actor: string) =>
      events.filter((e) => e.action === action && e.actor_id === actor);
    expect(find('auth.sign_in', admin.userId).length).toBeGreaterThan(0);
    expect(find('user.role_change', admin.userId)[0]).toMatchObject({
      target_id: target,
      detail: { from: 'author', to: 'teacher' },
    });
    expect(find('auth.sign_out', target)).toHaveLength(1);
    for (const e of events) expect(e.at).toBeInstanceOf(Date);
  });

  it('round-trips the mock sign-in to /me in under a second (F5-P2)', async () => {
    await expectBestUnder('mock sign-in round trip (F5-P2)', 1000, () =>
      signIn(api, 'google', 'teacher-a1'),
    );
  });
});

describe.skipIf(!hasDatabase)('sign-out and expiry (F5-F7)', () => {
  let api: TestApi;
  beforeAll(async () => {
    api = await startApi();
  });
  afterAll(async () => {
    await api?.close();
  });

  it('rejects a replayed cookie after sign-out', async () => {
    const teacher = await signIn(api, 'google', 'teacher-a1');
    const out = await as(api, teacher)('POST', '/auth/sign-out');
    expect(out.statusCode).toBe(204);
    const cleared = ([] as string[]).concat(out.headers['set-cookie'] ?? []).join();
    expect(cleared).toMatch(new RegExp(`${SESSION_COOKIE}=;`));
    expect((await as(api, teacher)('GET', '/api/me')).statusCode).toBe(401);
  });

  it('ends a teacher session after 8 idle hours, but not while in use', async () => {
    const active = await signIn(api, 'google', 'teacher-a1');
    const idle = await signIn(api, 'google', 'teacher-a1');
    api.advance(7 * HOUR);
    expect((await as(api, active)('GET', '/api/me')).statusCode).toBe(200);
    api.advance(HOUR + 60_000);
    // 8 hours and a minute since sign-in: the idle session ends, the active one doesn't.
    expect((await as(api, idle)('GET', '/api/me')).statusCode).toBe(401);
    expect((await as(api, active)('GET', '/api/me')).statusCode).toBe(200);
    api.advance(8 * HOUR + 60_000);
    expect((await as(api, active)('GET', '/api/me')).statusCode).toBe(401);
  });

  it('ends a student session after 2 idle hours', async () => {
    const student = await signIn(api, 'google', 'student-a1', { origin: STUDENT_ORIGIN });
    api.advance(HOUR + 59 * 60_000);
    expect((await as(api, student)('GET', '/api/me')).statusCode).toBe(200);
    api.advance(2 * HOUR + 60_000);
    expect((await as(api, student)('GET', '/api/me')).statusCode).toBe(401);
  });

  it('ends any session at the absolute limit, however active', async () => {
    const teacher = await signIn(api, 'google', 'teacher-a1');
    for (let h = 0; h < 11; h++) {
      api.advance(HOUR);
      expect((await as(api, teacher)('GET', '/api/session')).statusCode).toBe(200);
    }
    api.advance(HOUR + 60_000);
    expect((await as(api, teacher)('GET', '/api/session')).statusCode).toBe(401);
  });
});

describe.skipIf(!hasDatabase)('idle limits are configurable (F5-F7)', () => {
  let api: TestApi;
  beforeAll(async () => {
    api = await startApi({
      IDEAMAP_SESSION_IDLE_MINUTES_STAFF: '30',
      IDEAMAP_SESSION_IDLE_MINUTES_STUDENT: '10',
    });
  });
  afterAll(async () => {
    await api?.close();
  });

  it('uses the configured limits', async () => {
    const teacher = await signIn(api, 'google', 'teacher-a1');
    const student = await signIn(api, 'google', 'student-a1');
    api.advance(11 * 60_000);
    expect((await as(api, student)('GET', '/api/me')).statusCode).toBe(401);
    expect((await as(api, teacher)('GET', '/api/me')).statusCode).toBe(200);
    api.advance(31 * 60_000);
    expect((await as(api, teacher)('GET', '/api/me')).statusCode).toBe(401);
  });
});

describe.skipIf(!hasDatabase)('brute force (F5-S7)', () => {
  let api: TestApi;
  beforeAll(async () => {
    api = await startApi();
  });
  afterAll(async () => {
    await api?.close();
  });

  it('rate-limits 50 failed callbacks from one IP in a minute, not other IPs', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 50; i++) {
      const res = await api.app.inject({
        method: 'GET',
        url: `/auth/google/callback?code=x${i}&state=y${i}`,
        headers: fromApp(ORIGIN, '10.9.9.9'),
      });
      statuses.push(res.statusCode);
    }
    expect(statuses.slice(0, 20).every((s) => s === 303)).toBe(true);
    expect(statuses.slice(20).every((s) => s === 429)).toBe(true);
    // A real sign-in from that IP is refused too, until the minute passes.
    const started = await startSignIn(api, 'google', { ip: '10.9.9.9' });
    const blocked = await callback(
      api,
      await authorize(started, 'teacher-a1'),
      started.loginCookie,
      {
        ip: '10.9.9.9',
      },
    );
    expect(blocked.statusCode).toBe(429);
    expect(blocked.body).not.toMatch(/account|user|exist/i);
    // Other IPs (another school) are unaffected.
    expect((await signIn(api, 'google', 'teacher-a1')).userId).toBeTruthy();
    api.advance(61_000);
    const later = await startSignIn(api, 'google', { ip: '10.9.9.9' });
    const ok = await callback(api, await authorize(later, 'teacher-a1'), later.loginCookie, {
      ip: '10.9.9.9',
    });
    expect(ok.statusCode).toBe(303);
  });

  it("gives the same answer for any id probed on /me and users' routes", async () => {
    const teacher = await signIn(api, 'google', 'teacher-a1');
    const real = api.sample.users['student-b1'];
    const statuses = new Set<number>();
    const bodies = new Set<string>();
    for (const id of [real, '00000000-0000-4000-8000-000000000000', 'not-an-id']) {
      const res = await as(api, teacher)('PUT', `/api/users/${id}/role`, { role: 'admin' });
      statuses.add(res.statusCode);
      bodies.add(res.body);
      const me = await as(api, teacher)('GET', `/api/me?id=${id}`);
      expect(me.json().user.id).toBe(teacher.userId);
    }
    expect([...statuses]).toEqual([403]);
    expect(bodies.size).toBe(1);
  });
});
