import { pathToFileURL } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { importRoutes, type ImportRoutesOptions } from './imports.js';
import { publishRoutes, type PublishRoutesOptions } from './publish.js';

export { importRoutes, type Authenticate, type ImportRoutesOptions } from './imports.js';
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

export interface ServerOptions {
  /** Curriculum imports (C4); left out, the routes aren't registered. */
  imports?: ImportRoutesOptions;
  /** Diff, preview, publish and rollback (C5); left out, the routes aren't registered. */
  publish?: PublishRoutesOptions;
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get('/health', () => ({ ok: true }));
  if (options.imports) importRoutes(app, options.imports);
  if (options.publish) publishRoutes(app, options.publish);
  // A fixed body, so unknown paths aren't echoed back.
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'Not found' }));
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = buildServer();
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
}
