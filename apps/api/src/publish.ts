import type { FastifyInstance } from 'fastify';
import type { Authenticate } from './imports.js';
import {
  PublishRequestError,
  getDiff,
  previewPublish,
  publish,
  repin,
  type PublishDeps,
} from './publishing.js';

// Reviewing and publishing over HTTP (ARCHITECTURE.md §7, task C5):
//
//   GET  /versions/:versionId/diff[?against=<versionId>]
//        The diff against the latest published version (or `against`).
//   POST /versions/:versionId/preview   { class_ids }
//        The diff, what blocks publishing, and "Students receiving this update".
//   POST /versions/:versionId/publish   { class_ids }, Idempotency-Key: optional
//        201 with the pins moved, or 200 with the first result for a repeated key.
//   POST /classes/:classId/pin          { version_id }
//        Rollback: back to an earlier published version.
//
// Who is asking comes from `authenticate`; F5's sign-in provides it.

export interface PublishRoutesOptions {
  deps: PublishDeps;
  authenticate: Authenticate;
}

export function publishRoutes(app: FastifyInstance, options: PublishRoutesOptions): void {
  // Its own scope, so its error handler doesn't replace the import routes'.
  void app.register(async (scope) => {
    const caller = async (request: Parameters<Authenticate>[0]) => {
      const who = await options.authenticate(request);
      if (!who) throw Object.assign(new Error('Sign in to continue.'), { statusCode: 401 });
      return who;
    };

    scope.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
      if (error instanceof PublishRequestError) {
        return reply
          .code(error.status)
          .send(
            error.blocking
              ? { error: error.message, blocking: error.blocking }
              : { error: error.message },
          );
      }
      const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
      // Only our own messages reach the client; anything unexpected gets a fixed one.
      const message =
        status === 401
          ? error.message
          : status === 415
            ? 'Send the request as application/json.'
            : status < 500
              ? 'The request could not be read.'
              : 'Something went wrong. Try again.';
      if (status >= 500) request.log.error(error);
      return reply.code(status).send({ error: message });
    });

    scope.get<{ Params: { versionId: string }; Querystring: { against?: string } }>(
      '/versions/:versionId/diff',
      async (request) => {
        const who = await caller(request);
        const against = request.query.against;
        return getDiff(
          options.deps,
          who,
          request.params.versionId,
          typeof against === 'string' ? against : undefined,
        );
      },
    );

    scope.post<{ Params: { versionId: string } }>(
      '/versions/:versionId/preview',
      async (request) => {
        const who = await caller(request);
        return {
          preview: await previewPublish(options.deps, who, request.params.versionId, request.body),
        };
      },
    );

    scope.post<{ Params: { versionId: string } }>(
      '/versions/:versionId/publish',
      async (request, reply) => {
        const who = await caller(request);
        const key = request.headers['idempotency-key'];
        const { result, repeated } = await publish(
          options.deps,
          who,
          request.params.versionId,
          request.body,
          Array.isArray(key) ? key[0] : key,
        );
        return reply.code(repeated ? 200 : 201).send({ publish: result });
      },
    );

    scope.post<{ Params: { classId: string } }>('/classes/:classId/pin', async (request) => {
      const who = await caller(request);
      return { pin: await repin(options.deps, who, request.params.classId, request.body) };
    });
  });
}
