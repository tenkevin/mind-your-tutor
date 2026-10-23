import { pathToFileURL } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { importRoutes, type ImportRoutesOptions } from './imports.js';
import { privacyRoutes, type PrivacyRoutes } from './privacy.js';

export { importRoutes, type Authenticate, type ImportRoutesOptions } from './imports.js';
export { noSignIn, privacyRoutes, type PrivacyRoutes } from './privacy.js';

export interface ServerOptions {
  /** Curriculum imports (C4); left out, the routes aren't registered. */
  imports?: ImportRoutesOptions;
  /** FERPA export and delete (F6); left out, the routes aren't registered. */
  privacy?: PrivacyRoutes;
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get('/health', () => ({ ok: true }));
  if (options.imports) importRoutes(app, options.imports);
  if (options.privacy) privacyRoutes(app, options.privacy);
  // A fixed body, so unknown paths aren't echoed back.
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'Not found' }));
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = buildServer();
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
}
