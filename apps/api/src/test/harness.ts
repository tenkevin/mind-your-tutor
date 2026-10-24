import { CSRF_HEADER, MeResponseSchema } from '@ideamap/contracts';
import type { ExportStore } from '@ideamap/db';
import { freshDatabase, type TestDatabase } from '@ideamap/db/testing';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { expect } from 'vitest';
import { MemoryObjectStore } from '@ideamap/connectors';
import type { Sender } from '@ideamap/worker';
import { loadConfig, type AuthConfig } from '../config.js';
import { scoped, type Trx } from '../db.js';
import {
  mockProviders,
  seedSample,
  SAMPLE_PROVIDERS,
  type Sample,
  type SampleProvider,
} from '../dev/sample.js';
import { startMockIdp, type MockIdp } from '../dev/mock-idp.js';
import { buildServer } from '../index.js';
import { SESSION_COOKIE } from '../policy.js';
import { createSession } from '../sessions.js';
import { csrfToken, deriveKeys, sessionCookieValue } from '../tokens.js';

// An API wired to a fresh, migrated, seeded database and the local mock identity
// provider: the real sign-in flow, end to end, with nothing real involved.

export const ORIGIN = 'https://teacher.ideamap.test';
export const STUDENT_ORIGIN = 'https://student.ideamap.test';
const HOST = new URL(ORIGIN).host;

export interface TestApi {
  app: FastifyInstance;
  config: AuthConfig;
  t: TestDatabase;
  idp: MockIdp;
  sample: Sample;
  /** Move the API's clock forward. */
  advance(ms: number): void;
  close(): Promise<void>;
}

export async function startApi(
  overrides: Record<string, string> = {},
  options: { imports?: boolean; publish?: boolean; privacy?: ExportStore } = {},
): Promise<TestApi> {
  const t = await freshDatabase();
  const sample = await seedSample(t.db);
  const clientId = 'ideamap-test';
  const clientSecret = 'test-only-client-secret';
  const idp = await startMockIdp({ providers: mockProviders(), clientId, clientSecret });
  const env: Record<string, string> = {
    IDEAMAP_APP_ORIGINS: `${ORIGIN},${STUDENT_ORIGIN}`,
    IDEAMAP_SESSION_SECRET: 'test-only-session-secret-0123456789abcdef',
    IDEAMAP_SSO_PROVIDERS: Object.keys(SAMPLE_PROVIDERS).join(','),
    IDEAMAP_SSO_ALLOW_HTTP: '1',
    IDEAMAP_TRUST_PROXY: '1',
  };
  for (const id of Object.keys(SAMPLE_PROVIDERS)) {
    const key = `IDEAMAP_SSO_${id.toUpperCase()}_`;
    env[`${key}ISSUER`] = idp.issuer(id);
    env[`${key}CLIENT_ID`] = clientId;
    env[`${key}CLIENT_SECRET`] = clientSecret;
  }
  const config = loadConfig({ ...env, ...overrides });
  let offset = 0;
  // C4's import routes, with an in-memory store and a queue that only records jobs.
  const imports = options.imports
    ? {
        deps: {
          scope: <T>(orgId: string, fn: (trx: Trx) => Promise<T>) => scoped(t.db, { orgId }, fn),
          boss: { send: async () => 'queued' } as unknown as Sender,
          store: new MemoryObjectStore(),
        },
      }
    : undefined;
  // C5's publish routes.
  const publish = options.publish
    ? {
        deps: {
          scope: <T>(orgId: string, fn: (trx: Trx) => Promise<T>) => scoped(t.db, { orgId }, fn),
        },
      }
    : undefined;
  const app = buildServer({
    db: t.db,
    config,
    now: () => new Date(Date.now() + offset),
    imports,
    publish,
    privacy: options.privacy ? { store: options.privacy } : undefined,
  });
  await app.ready();
  return {
    app,
    config,
    t,
    idp,
    sample,
    advance: (ms) => {
      offset += ms;
    },
    close: async () => {
      await app.close();
      await idp.close();
      await t.drop();
    },
  };
}

/** Headers for a request made by the browser on an app origin, via the proxy. */
export function fromApp(origin = ORIGIN, ip = '10.0.0.1') {
  const url = new URL(origin);
  return { host: url.host, 'x-forwarded-proto': url.protocol.slice(0, -1), 'x-forwarded-for': ip };
}

export function cookieFrom(res: LightMyRequestResponse, name: string): string | undefined {
  return res.cookies.find((c) => c.name === name)?.value;
}

export interface Started {
  loginCookie: string;
  authorizeUrl: URL;
}

export async function startSignIn(
  api: TestApi,
  provider: SampleProvider,
  options: { returnTo?: string; origin?: string; ip?: string } = {},
): Promise<Started> {
  const query = options.returnTo ? `?returnTo=${encodeURIComponent(options.returnTo)}` : '';
  const res = await api.app.inject({
    method: 'GET',
    url: `/auth/${provider}/start${query}`,
    headers: fromApp(options.origin, options.ip),
  });
  expect(res.statusCode, res.body).toBe(302);
  const loginCookie = cookieFrom(res, '__Host-ideamap_login');
  expect(loginCookie).toBeTruthy();
  return { loginCookie: loginCookie!, authorizeUrl: new URL(res.headers.location as string) };
}

/** Ask the mock provider to sign in `userKey`; returns the callback path and query. */
export async function authorize(started: Started, userKey: string): Promise<string> {
  const url = new URL(started.authorizeUrl);
  url.searchParams.set('login_hint', userKey);
  const res = await fetch(url, { redirect: 'manual' });
  expect(res.status, await res.clone().text()).toBe(302);
  const back = new URL(res.headers.get('location')!);
  return back.pathname + back.search;
}

export async function callback(
  api: TestApi,
  path: string,
  loginCookie: string | undefined,
  options: { origin?: string; ip?: string } = {},
) {
  return api.app.inject({
    method: 'GET',
    url: path,
    headers: fromApp(options.origin, options.ip),
    cookies: loginCookie ? { '__Host-ideamap_login': loginCookie } : {},
  });
}

export interface Signed {
  cookie: string;
  csrf: string;
  userId: string;
}

/** The full sign-in round trip through the mock provider. */
export async function signIn(
  api: TestApi,
  provider: SampleProvider,
  userKey: string,
  options: { origin?: string; returnTo?: string } = {},
): Promise<Signed & { location: string }> {
  const started = await startSignIn(api, provider, options);
  const res = await callback(api, await authorize(started, userKey), started.loginCookie, options);
  expect(res.statusCode, res.headers.location as string).toBe(303);
  const cookie = cookieFrom(res, SESSION_COOKIE);
  expect(cookie, `no session for ${userKey}: ${String(res.headers.location)}`).toBeTruthy();
  const me = await api.app.inject({
    method: 'GET',
    url: '/api/me',
    headers: fromApp(options.origin),
    cookies: { [SESSION_COOKIE]: cookie! },
  });
  expect(me.statusCode).toBe(200);
  const body = MeResponseSchema.parse(me.json());
  return {
    cookie: cookie!,
    csrf: body.csrfToken,
    userId: body.user.id,
    location: res.headers.location as string,
  };
}

/** A session made directly, skipping the provider round trip (for wide route sweeps). */
export async function sessionFor(api: TestApi, userId: string, orgId: string): Promise<Signed> {
  const { token } = await createSession(api.t.db, api.config, {
    orgId,
    userId,
    provider: 'google',
    now: new Date(),
  });
  return {
    cookie: sessionCookieValue(orgId, token),
    csrf: csrfToken(deriveKeys(api.config.sessionSecret), token),
    userId,
  };
}

/** A request as a signed-in browser on the teacher app, with the CSRF header. */
export function as(api: TestApi, who: Signed | null) {
  return (
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    payload?: unknown,
    extra: Record<string, string> = {},
  ) =>
    api.app.inject({
      method,
      url,
      headers: {
        ...fromApp(),
        origin: ORIGIN,
        ...(who && method !== 'GET' ? { [CSRF_HEADER]: who.csrf } : {}),
        ...extra,
      },
      cookies: who ? { [SESSION_COOKIE]: who.cookie } : {},
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
}

export { HOST };
