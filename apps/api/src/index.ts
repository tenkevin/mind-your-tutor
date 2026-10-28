import { pathToFileURL } from 'node:url';
import cookie from '@fastify/cookie';
import { FileObjectStore } from '@ideamap/connectors';
import { createDb, DirectoryExportStore, type Db } from '@ideamap/db';
import { createBoss, ensureQueues, orgScope } from '@ideamap/worker';
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
    // Its own scope, for the upload body parser and error handler, under /api like the
    // other app routes (the apps proxy /api). The policy hooks above still apply.
    app.register(async (scope) => importRoutes(scope, { deps: imports.deps, authenticate }), {
      prefix: '/api',
    });
  }
  if (publish) {
    // Its own scope, for its error handler, also under /api; the policy hooks above apply.
    app.register(async (scope) => publishRoutes(scope, { deps: publish.deps, authenticate }), {
      prefix: '/api',
    });
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

/**
 * C4's imports for a running API: jobs go to pg-boss in the same database (its schema
 * comes from migration 0003), uploads to a directory the worker reads too.
 */
export async function startImports(
  db: Db,
  databaseUrl: string,
  uploadDir: string,
): Promise<{ imports: NonNullable<ServerOptions['imports']>; stop: () => Promise<void> }> {
  // The API only sends jobs; the worker supervises the queues.
  const boss = createBoss(databaseUrl, { supervise: false });
  boss.on('error', (error) => console.error(error));
  await boss.start();
  await ensureQueues(boss);
  return {
    imports: { deps: { scope: orgScope(db), boss, store: new FileObjectStore(uploadDir) } },
    stop: () => boss.stop({ graceful: true }),
  };
}

/**
 * The API as deployed (T2-F8): sign-in, every app route, C4's imports and, with
 * EXPORT_DIR, F6's privacy routes. Needs DATABASE_URL, UPLOAD_DIR and F5's settings.
 */
export async function startServer(
  env: Record<string, string | undefined> = process.env,
  options: { logger?: boolean } = {},
): Promise<{ app: FastifyInstance; close: () => Promise<void> }> {
  const config = loadConfig(env);
  const url = env.DATABASE_URL;
  const uploads = env.UPLOAD_DIR;
  if (!url || !uploads) throw new Error('Set DATABASE_URL and UPLOAD_DIR.');
  const db = createDb(url);
  const { imports, stop } = await startImports(db, url, uploads);
  // FERPA export files go to EXPORT_DIR; without it the privacy routes are left out.
  const exportDir = env.EXPORT_DIR;
  // The AI gateway needs a provider key from the environment; without one it is left out.
  const aiConfig = loadAiConfig(env);
  const app = buildServer({
    db,
    config,
    logger: options.logger ?? true,
    imports,
    privacy: exportDir ? { store: new DirectoryExportStore(exportDir) } : undefined,
    ai: aiConfig.apiKey
      ? {
          provider: anthropicProvider({ apiKey: aiConfig.apiKey, fallbacks: aiConfig.fallbacks }),
          config: aiConfig,
        }
      : undefined,
  });
  return {
    app,
    close: async () => {
      await app.close();
      await stop();
      await db.destroy();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { app } = await startServer();
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
}
