import {
  MeResponseSchema,
  safeReturnTo,
  type MeResponse,
  type ProvidersResponse,
  type SignInError,
} from '@ideamap/contracts';
import { sql } from 'kysely';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as oidc from 'openid-client';
import { audit, scoped, type Trx } from '../db.js';
import { FailureLimiter } from '../limiter.js';
import { ALL_ROLES, SESSION_COOKIE, type PolicyDeps } from '../policy.js';
import { SignInRefused, type Identity, type IdentityProvider } from '../providers.js';
import { createSession } from '../sessions.js';
import { csrfToken, seal, sessionCookieValue, sha256, unseal } from '../tokens.js';

// Sign-in with the authorization code flow and PKCE (F5-F1, F5-S1), sign-out and /me.

const LOGIN_COOKIE = '__Host-ideamap_login';
const LOGIN_TTL_MS = 10 * 60_000;
const COOKIE = { path: '/', httpOnly: true, secure: true, sameSite: 'lax' } as const;

interface LoginState {
  p: string; // provider
  s: string; // state
  n: string; // nonce
  v: string; // PKCE verifier
  r: string; // returnTo
  o: string; // origin the flow started on
  x: number; // expiry, ms
}

function isLoginState(value: unknown): value is LoginState {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    ['p', 's', 'n', 'v', 'r', 'o'].every((k) => typeof v[k] === 'string') && typeof v.x === 'number'
  );
}

export interface AuthRouteDeps extends PolicyDeps {
  providers: Map<string, IdentityProvider>;
}

/** Each state is accepted once, even if the sign-in cookie is replayed (F5-S1). */
class UsedStates {
  #used = new Map<string, number>();
  constructor(private readonly now: () => number) {}
  use(state: string, expires: number): boolean {
    const now = this.now();
    for (const [key, until] of this.#used) if (until <= now) this.#used.delete(key);
    const key = sha256(state).toString('base64url');
    if (this.#used.has(key)) return false;
    this.#used.set(key, expires);
    return true;
  }
}

type Match = { userId: string; role: string; linked: boolean } | { error: SignInError };

/**
 * Find the user for an identity in one org: by provider and subject, else by verified
 * school email for a user not yet linked to any provider (a rostered user's first
 * sign-in). Never creates a user, and never links one account to two providers
 * (F5-F3): a user already linked elsewhere is refused.
 */
async function matchUser(trx: Trx, provider: string, identity: Identity): Promise<Match> {
  const bySubject = await trx
    .selectFrom('app_user')
    .select(['id', 'role'])
    .where('sso_provider', '=', provider)
    .where('sso_subject', '=', identity.subject)
    .executeTakeFirst();
  if (bySubject) return { userId: bySubject.id, role: bySubject.role, linked: false };
  if (!identity.email) return { error: 'not_linked' };
  const byEmail = await trx
    .selectFrom('app_user')
    .select(['id', 'role', 'sso_provider'])
    .where('email', '=', identity.email)
    .executeTakeFirst();
  if (!byEmail) return { error: 'not_linked' };
  if (byEmail.sso_provider !== null) return { error: 'linked_elsewhere' };
  await trx
    .updateTable('app_user')
    .set({ sso_provider: provider, sso_subject: identity.subject })
    .where('id', '=', byEmail.id)
    .execute();
  return { userId: byEmail.id, role: byEmail.role, linked: true };
}

export function authRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  const { db, config, keys, providers } = deps;
  const nowMs = () => deps.now().getTime();
  const used = new UsedStates(nowMs);
  const failures = new FailureLimiter(config.signInFailuresPerMinute, nowMs);

  /** The app origin this request was made on, if it's one we serve. */
  const appOrigin = (req: FastifyRequest): string | null => {
    const origin = `${req.protocol}://${req.host}`;
    return config.appOrigins.includes(origin) ? origin : null;
  };

  const toSignIn = (reply: FastifyReply, error: SignInError, returnTo = '/') => {
    reply.clearCookie(LOGIN_COOKIE, COOKIE);
    const query = new URLSearchParams({ error });
    if (returnTo !== '/') query.set('returnTo', returnTo);
    return reply.redirect(`/sign-in?${query.toString()}`, 303);
  };

  app.get(
    '/auth/providers',
    { config: { policy: { public: true, reason: 'The sign-in page lists its buttons.' } } },
    (): ProvidersResponse => ({
      providers: [...providers.values()].map((p) => ({ id: p.id, label: p.label })),
    }),
  );

  app.get<{ Params: { provider: string }; Querystring: { returnTo?: string } }>(
    '/auth/:provider/start',
    { config: { policy: { public: true, reason: 'Begins sign-in.' } } },
    async (req, reply) => {
      const provider = providers.get(req.params.provider);
      if (!provider) return reply.code(404).send({ error: 'Not found' });
      const origin = appOrigin(req);
      if (!origin) return reply.code(400).send({ error: 'Unknown origin' });
      const returnTo = safeReturnTo(req.query.returnTo);
      const state: LoginState = {
        p: provider.id,
        s: oidc.randomState(),
        n: oidc.randomNonce(),
        v: oidc.randomPKCECodeVerifier(),
        r: returnTo,
        o: origin,
        x: nowMs() + LOGIN_TTL_MS,
      };
      let url: URL;
      try {
        url = await provider.authorizationUrl({
          redirectUri: `${origin}/auth/${provider.id}/callback`,
          state: state.s,
          nonce: state.n,
          codeChallenge: await oidc.calculatePKCECodeChallenge(state.v),
        });
      } catch (error) {
        req.log.error({ err: error, provider: provider.id }, 'identity provider unavailable');
        return toSignIn(reply, 'failed', returnTo);
      }
      reply.setCookie(LOGIN_COOKIE, seal(keys.login, state), {
        ...COOKIE,
        maxAge: LOGIN_TTL_MS / 1000,
      });
      return reply.redirect(url.href, 302);
    },
  );

  app.get<{ Params: { provider: string }; Querystring: Record<string, string | undefined> }>(
    '/auth/:provider/callback',
    { config: { policy: { public: true, reason: 'The identity provider returns here.' } } },
    async (req, reply) => {
      const ip = req.ip;
      if (failures.blocked(ip)) {
        reply.clearCookie(LOGIN_COOKIE, COOKIE);
        return reply
          .code(429)
          .header('retry-after', '60')
          .type('text/html; charset=utf-8')
          .send(
            '<!doctype html><meta charset="utf-8"><title>Sign in</title>' +
              '<p>Too many sign-in attempts. Please wait a minute and ' +
              '<a href="/sign-in">try again</a>.</p>',
          );
      }
      const login = unseal(keys.login, req.cookies[LOGIN_COOKIE]);
      const returnTo = isLoginState(login) ? safeReturnTo(login.r) : '/';
      const fail = (error: SignInError, reason: string) => {
        failures.fail(ip);
        req.log.info({ provider: req.params.provider, reason }, 'sign-in refused');
        return toSignIn(reply, error, returnTo);
      };

      const provider = providers.get(req.params.provider);
      if (!provider) return fail('failed', 'unknown provider');
      if (!isLoginState(login)) return fail('failed', 'no sign-in cookie');
      if (login.p !== provider.id || login.x <= nowMs()) return fail('failed', 'stale sign-in');
      if (appOrigin(req) !== login.o) return fail('failed', 'origin changed');
      if (req.query.state !== login.s) return fail('failed', 'state mismatch');
      if (!used.use(login.s, login.x)) return fail('failed', 'state reused');
      if (req.query.error) return fail('failed', 'provider returned an error');

      let identity: Identity;
      try {
        identity = await provider.identify(new URL(req.url, login.o), {
          redirectUri: `${login.o}/auth/${provider.id}/callback`,
          state: login.s,
          nonce: login.n,
          codeVerifier: login.v,
        });
      } catch (error) {
        const reason = error instanceof SignInRefused ? error.message : 'token checks failed';
        req.log.info({ err: error }, 'identity token refused');
        return fail('failed', reason);
      }

      const tenantOrg = await scoped(db, { orgId: null }, async (trx) => {
        const { rows } = await sql<{ org: string | null }>`
          SELECT app.sso_tenant_org(${provider.id}, ${identity.tenant}) AS org
        `.execute(trx);
        return rows[0]?.org ?? null;
      });
      if (!tenantOrg) return fail('not_linked', 'unknown tenant');
      const orgId = tenantOrg;

      const now = deps.now();
      const match = await scoped(db, { orgId }, async (trx): Promise<Match> => {
        const found = await matchUser(trx, provider.id, identity);
        if ('error' in found) return found;
        if (found.role === 'student') {
          const enrolled = await trx
            .selectFrom('enrollment')
            .select('class_id')
            .where('student_id', '=', found.userId)
            .executeTakeFirst();
          if (!enrolled) return { error: 'not_linked' };
        }
        return found;
      });
      if ('error' in match) return fail(match.error, match.error);

      const session = await createSession(db, config, {
        orgId,
        userId: match.userId,
        provider: provider.id,
        now,
      });
      await scoped(db, { orgId }, (trx) =>
        audit(trx, {
          orgId,
          actorId: match.userId,
          action: 'auth.sign_in',
          targetType: 'app_user',
          targetId: match.userId,
          detail: { provider: provider.id, session_id: session.id, linked: match.linked },
          at: now,
        }),
      );
      reply.clearCookie(LOGIN_COOKIE, COOKIE);
      reply.setCookie(SESSION_COOKIE, sessionCookieValue(orgId, session.token), COOKIE);
      return reply.redirect(returnTo, 303);
    },
  );

  app.post(
    '/auth/sign-out',
    { config: { policy: { roles: ALL_ROLES, scope: { kind: 'org' } } } },
    async (req, reply) => {
      const session = req.session!;
      const now = deps.now();
      await req.withOrg(async (trx) => {
        await trx
          .updateTable('auth_session')
          .set({ revoked_at: now })
          .where('id', '=', session.id)
          .execute();
        await audit(trx, {
          orgId: session.orgId,
          actorId: session.userId,
          action: 'auth.sign_out',
          targetType: 'app_user',
          targetId: session.userId,
          detail: { session_id: session.id },
          at: now,
        });
      });
      reply.clearCookie(SESSION_COOKIE, COOKIE);
      return reply.code(204).send();
    },
  );

  app.get(
    '/api/me',
    { config: { policy: { roles: ALL_ROLES, scope: { kind: 'org' } } } },
    async (req): Promise<MeResponse> => {
      const session = req.session!;
      const org = await req.withOrg((trx) =>
        trx
          .selectFrom('organization')
          .select(['id', 'name'])
          .where('id', '=', session.orgId)
          .executeTakeFirstOrThrow(),
      );
      return MeResponseSchema.parse({
        user: { id: session.userId, role: session.role, name: session.name },
        org,
        csrfToken: csrfToken(keys, session.token),
        session: { idleMinutes: session.idleMinutes, expiresAt: session.expiresAt.toISOString() },
      });
    },
  );
}
