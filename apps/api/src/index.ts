import { pathToFileURL } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { privacyRoutes, type PrivacyRoutes } from './privacy.js';

export { noSignIn, privacyRoutes, type Authenticate, type Caller } from './privacy.js';

export interface ServerOptions {
  /** FERPA export and delete (F6). Left out, those routes don't exist. */
  privacy?: PrivacyRoutes;
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get('/health', () => ({ ok: true }));
  if (options.privacy) privacyRoutes(app, options.privacy);
  // A fixed body, so unknown paths aren't echoed back.
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'Not found' }));
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = buildServer();
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
}
