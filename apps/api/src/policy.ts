import { CSRF_HEADER, type Role } from '@ideamap/contracts';
import type { Db } from '@ideamap/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthConfig } from './config.js';
import { scoped, type Trx } from './db.js';
import { findSession, type Session } from './sessions.js';
import { csrfToken, parseSessionCookie, sameText, type Keys } from './tokens.js';

// The route-policy registry (F5-F4). Every route declares who may call it in
// `config.policy`; registering a route without one throws, so the server won't start
// and the route test fails. The policy is enforced here, before any handler runs:
//
//   signed out              → 401
//   wrong role              → 403
//   wrong org or wrong class → 403 (another org's ids aren't visible under RLS, so they
//                              look the same as ids the caller may not use)
//   unsafe method without a same-origin CSRF token → 403

export const SESSION_COOKIE = '__Host-ideamap_session';

export const ALL_ROLES: readonly Role[] = ['admin', 'author', 'teacher', 'student'];
export const STAFF: readonly Role[] = ['admin', 'author', 'teacher'];

/** What a signed-in route acts on, beyond the caller's own org. */
export type ScopeRule =
  /** Anything in the caller's org (row-level security already limits it to that org). */
  | { kind: 'org' }
  /** One class, named by a route param: its teacher, an admin, or (if allowed) an enrolled student. */
  | { kind: 'class'; param: string; students?: boolean }
  /** One curriculum: `edit` needs its author or an admin (D3); reading also allows its teachers. */
  | { kind: 'curriculum'; param: string; edit: boolean }
  /** One user in the caller's org, named by a route param. */
  | { kind: 'user'; param: string }
  /** One row of this table that row-level security shows the caller's org (C4 imports). */
  | { kind: 'visible'; table: 'curriculum' | 'import_job'; param: string };

export type RoutePolicy =
  { public: true; reason: string } | { public?: false; roles: readonly Role[]; scope: ScopeRule };

export interface RegisteredRoute {
  method: string;
  url: string;
  policy: RoutePolicy;
}

declare module 'fastify' {
  interface FastifyContextConfig {
    policy?: RoutePolicy;
  }
  interface FastifyInstance {
    /** Every route and its policy, in registration order (HEAD twins left out). */
    routePolicies: readonly RegisteredRoute[];
  }
  interface FastifyRequest {
    /** The caller's live session; set on every signed-in route. */
    session: Session | null;
    /** Run queries for the caller's org (and class, on class routes) under RLS. */
    withOrg<T>(fn: (trx: Trx) => Promise<T>): Promise<T>;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface PolicyDeps {
  db: Db;
  config: AuthConfig;
  keys: Keys;
  now: () => Date;
}

/** The origin a request came from, by Origin or else Referer; null if neither. */
function requestOrigin(req: FastifyRequest): string | null {
  const header = req.headers.origin ?? req.headers.referer;
  if (typeof header !== 'string') return null;
  try {
    return new URL(header).origin;
  } catch {
    return null;
  }
}

/** True if `scope` lets this session act; checked inside the session's org. */
async function inScope(
  trx: Trx,
  session: Session,
  scope: ScopeRule,
  params: Record<string, string>,
): Promise<boolean> {
  if (scope.kind === 'org') return true;
  const id = params[scope.param];
  if (!id || !UUID.test(id)) return false;
  const admin = session.role === 'admin';
  switch (scope.kind) {
    case 'class': {
      const klass = await trx
        .selectFrom('class')
        .select(['teacher_id'])
        .where('id', '=', id)
        .executeTakeFirst();
      if (!klass) return false;
      if (admin || klass.teacher_id === session.userId) return true;
      if (!scope.students || session.role !== 'student') return false;
      const enrolled = await trx
        .selectFrom('enrollment')
        .select('student_id')
        .where('class_id', '=', id)
        .where('student_id', '=', session.userId)
        .executeTakeFirst();
      return Boolean(enrolled);
    }
    case 'curriculum': {
      const curriculum = await trx
        .selectFrom('curriculum')
        .select(['created_by'])
        .where('id', '=', id)
        .executeTakeFirst();
      if (!curriculum) return false;
      if (admin || curriculum.created_by === session.userId) return true;
      if (scope.edit) return false;
      const teaches = await trx
        .selectFrom('class')
        .select('id')
        .where('curriculum_id', '=', id)
        .where('teacher_id', '=', session.userId)
        .executeTakeFirst();
      return Boolean(teaches);
    }
    case 'visible': {
      const row =
        scope.table === 'curriculum'
          ? await trx.selectFrom('curriculum').select('id').where('id', '=', id).executeTakeFirst()
          : await trx.selectFrom('import_job').select('id').where('id', '=', id).executeTakeFirst();
      return Boolean(row);
    }
    case 'user': {
      const user = await trx
        .selectFrom('app_user')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      return Boolean(user);
    }
  }
}

function deny(reply: FastifyReply, status: 401 | 403) {
  return reply.code(status).send({ error: status === 401 ? 'Sign in required' : 'Forbidden' });
}

export function registerPolicies(app: FastifyInstance, deps: PolicyDeps): void {
  app.decorateRequest('session', null);
  app.decorateRequest('withOrg', function (this: FastifyRequest) {
    // Replaced per request below; a route without a session never gets an org.
    throw new Error('withOrg is only available on signed-in routes.');
  });

  const registry: RegisteredRoute[] = [];
  app.decorate('routePolicies', registry);
  app.addHook('onRoute', (route) => {
    const policy = route.config?.policy;
    if (!policy) {
      throw new Error(`Route ${String(route.method)} ${route.url} declares no policy.`);
    }
    if (!policy.public && policy.roles.length === 0) {
      throw new Error(`Route ${String(route.method)} ${route.url} allows no roles.`);
    }
    for (const method of ([] as string[]).concat(route.method)) {
      if (method !== 'HEAD') registry.push({ method, url: route.url, policy });
    }
  });

  // onRequest, so a signed-out or forbidden caller's body is never read or parsed.
  app.addHook('onRequest', async (req, reply) => {
    const policy = req.routeOptions.config.policy;
    // Unmatched requests (the 404 handler) have no policy and no handler to protect.
    if (!policy || policy.public) return;

    const cookie = parseSessionCookie(req.cookies[SESSION_COOKIE]);
    const session = cookie ? await findSession(deps.db, deps.config, cookie, deps.now()) : null;
    if (!session) return deny(reply, 401);
    if (!policy.roles.includes(session.role)) return deny(reply, 403);

    if (!SAFE_METHODS.has(req.method)) {
      const origin = requestOrigin(req);
      const token = req.headers[CSRF_HEADER];
      if (
        !origin ||
        !deps.config.appOrigins.includes(origin) ||
        typeof token !== 'string' ||
        !sameText(token, csrfToken(deps.keys, session.token))
      ) {
        return deny(reply, 403);
      }
    }

    const params = req.params as Record<string, string>;
    const allowed =
      policy.scope.kind === 'org' ||
      (await scoped(deps.db, { orgId: session.orgId }, (trx) =>
        inScope(trx, session, policy.scope, params),
      ));
    if (!allowed) return deny(reply, 403);

    const classId = policy.scope.kind === 'class' ? params[policy.scope.param] : null;
    req.session = session;
    req.withOrg = (fn) =>
      scoped(deps.db, { orgId: session.orgId, classId, actorId: session.userId }, fn);
  });
}
