import { pathToFileURL } from 'node:url';
import cookie from '@fastify/cookie';
import { createDb, DirectoryExportStore, type Db } from '@ideamap/db';
import Fastify, {
  type FastifyInstance,
  type FastifyRequest,
  type FastifyServerOptions,
} from 'fastify';
import { anthropicProvider } from './ai/anthropic.js';
import { loadAiConfig } from './ai/config.js';
import { aiRoutes, type AiGatewayOptions } from './ai/gateway.js';
import { loadConfig, type AuthConfig } from './config.js';
import { importRoutes, type ImportRoutesOptions } from './imports.js';
import { registerPolicies } from './policy.js';
import { privacyRoutes, type PrivacyRoutes } from './privacy.js';
import { createProviders, type IdentityProvider } from './providers.js';
import { accessRoutes } from './routes/access.js';
import { authRoutes } from './routes/auth.js';
import { publishRoutes, type PublishRoutesOptions } from './publish.js';
import { deriveKeys } from './tokens.js';

export { loadConfig, type AuthConfig } from './config.js';
export { importRoutes, type Authenticate, type ImportRoutesOptions } from './imports.js';
export type { IdentityProvider } from './providers.js';
export { loadAiConfig, type AiConfig } from './ai/config.js';
export {
  AI_ROUTES,
  STAFF_AI_POLICY,
  STUDENT_AI_POLICY,
  type AiGatewayOptions,
} from './ai/gateway.js';
export type { ModelProvider, ModelReply, ModelRequest } from './ai/provider.js';
export { publishRoutes, type PublishRoutesOptions } from './publish.js';
export {
  PublishRequestError,
  blockingIssues,
  getDiff,
  previewPublish,
  publish,
  repin,
  studentsReceiving,
  type PublishDeps,
} from './publishing.js';
export { privacyRoutes, STUDENT_PRIVACY_POLICY, type PrivacyRoutes } from './privacy.js';

export interface ServerOptions {
  db: Db;
  config: AuthConfig;
  /** Defaults to one OIDC adapter per configured provider. */
  providers?: Map<string, IdentityProvider>;
  /** The clock, for session limits; tests move it forward. */
  now?: () => Date;
  /** Fastify's logger: true, or options such as a destination stream (tests read it). */
  logger?: FastifyServerOptions['logger'];
  /** Curriculum imports (C4); left out, the routes aren't registered. */
  imports?: Pick<ImportRoutesOptions, 'deps'>;
  /** Diff, preview, publish and rollback (C5); left out, the routes aren't registered. */
  publish?: Pick<PublishRoutesOptions, 'deps'>;
  /** FERPA student export and delete (F6); left out, the routes aren't registered. */
  privacy?: PrivacyRoutes;
  /** The AI gateway (A1); left out, its routes aren't registered. */
  ai?: AiGatewayOptions;
}

export function buildServer(options: ServerOptions): FastifyInstance {
  const { db, config } = options;
  const app = Fastify({ logger: options.logger ?? false, trustProxy: config.trustProxy });
  const deps = {
    db,
    config,
    keys: deriveKeys(config.sessionSecret),
    now: options.now ?? (() => new Date()),
  };
  const providers =
    options.providers ??
    createProviders(config.providers, { allowHttp: config.allowHttpProviders });

  app.register(cookie);
  // Every route below declares a policy; one without fails to register (F5-F4).
  registerPolicies(app, deps);

  app.get(
    '/health',
    { config: { policy: { public: true, reason: 'Load balancer health check.' } } },
    () => ({ ok: true }),
  );
  authRoutes(app, { ...deps, providers });
  accessRoutes(app, deps);
  // The caller of C4's and C5's routes is the signed-in session.
  const authenticate = (req: FastifyRequest) =>
    req.session
      ? { orgId: req.session.orgId, userId: req.session.userId, role: req.session.role }
      : null;
  const { imports, publish } = options;
  if (imports) {
    // Its own scope, for the upload body parser and error handler. The policy hooks
    // above still apply.
    app.register(async (scope) => importRoutes(scope, { deps: imports.deps, authenticate }));
  }
  if (publish) {
    // Its own scope, for its error handler; the policy hooks above still apply.
    app.register(async (scope) => publishRoutes(scope, { deps: publish.deps, authenticate }));
  }

  // Admin-only FERPA requests; the policy hooks above apply (STUDENT_PRIVACY_POLICY).
  if (options.privacy) privacyRoutes(app, options.privacy);

  // Every model call goes through the gateway; the policy hooks above apply.
  if (options.ai) {
    aiRoutes(app, { sessionSecret: config.sessionSecret, now: deps.now }, options.ai);
  }

  // Fixed bodies, so unknown paths and internal errors aren't echoed back.
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'Not found' }));
  app.setErrorHandler((error: { statusCode?: number }, req, reply) => {
    const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    if (status === 500) req.log.error({ err: error }, 'request failed');
    return reply
      .code(status)
      .send({ error: status === 500 ? 'Something went wrong' : 'Bad request' });
  });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL must be set.');
  // FERPA export files go to EXPORT_DIR; without it the privacy routes are left out.
  const exportDir = process.env.EXPORT_DIR;
  // The AI gateway needs a provider key from the environment; without one it is left out.
  const aiConfig = loadAiConfig();
  const app = buildServer({
    db: createDb(url),
    config,
    logger: true,
    privacy: exportDir ? { store: new DirectoryExportStore(exportDir) } : undefined,
    ai: aiConfig.apiKey
      ? {
          provider: anthropicProvider({ apiKey: aiConfig.apiKey, fallbacks: aiConfig.fallbacks }),
          config: aiConfig,
        }
      : undefined,
  });
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
}
