import type { FastifyInstance } from 'fastify';
import type { Authenticate } from './imports.js';
import { STAFF, type RoutePolicy } from './policy.js';
import {
  PublishRequestError,
  getDiff,
  getPublishingOptions,
  previewPublish,
  publish,
  repin,
  type PublishDeps,
} from './publishing.js';

// Reviewing and publishing over HTTP (ARCHITECTURE.md §7, task C5):
//
//   GET  /api/versions/:versionId/diff[?against=<versionId>]
//        The diff against the latest published version (or `against`).
//   POST /api/versions/:versionId/preview   { class_ids }
//        The diff, what blocks publishing, and "Students receiving this update".
//   POST /api/versions/:versionId/publish   { class_ids }, Idempotency-Key: optional
//        201 with the pins moved, or 200 with the first result for a repeated key.
//   POST /api/classes/:classId/pin          { version_id }
//   GET  /api/curricula/:curriculumId/publishing
//        T8: the classes the caller may publish to (with their pins) and the published versions.
//        Rollback: back to an earlier published version.
//
// The server registers these under the /api prefix, beside every other app route (the
// apps proxy /api).
//
// Who is asking comes from `authenticate`: the signed-in F5 session. Each route's
// policy (F5-F4) admits the roles and checks the version or class is in the caller's
// organization before the handler runs; the handlers then check each selected class
// (its teacher or an org admin) and the version's curriculum.

export interface PublishRoutesOptions {
  deps: PublishDeps;
  authenticate: Authenticate;
}

/** Admins, authors and teachers of the organization may read a version's diff. */
const REVIEW: RoutePolicy = {
  roles: STAFF,
  scope: { kind: 'visible', table: 'curriculum_version', param: 'versionId' },
};
/** Only teachers and admins publish; each selected class is checked in the handler. */
const PUBLISH: RoutePolicy = {
  roles: ['admin', 'teacher'],
  scope: { kind: 'visible', table: 'curriculum_version', param: 'versionId' },
};
/** Rollback: the class's own teacher or an org admin. */
const REPIN: RoutePolicy = {
  roles: ['admin', 'teacher'],
  scope: { kind: 'class', param: 'classId' },
};

/** The publish screen's classes and version history; the handler limits it to the caller's classes. */
const OPTIONS: RoutePolicy = {
  roles: ['admin', 'teacher'],
  scope: { kind: 'visible', table: 'curriculum', param: 'curriculumId' },
};

/** Register in a scope of its own (buildServer does), so its error handler stays local. */
export function publishRoutes(scope: FastifyInstance, options: PublishRoutesOptions): void {
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
    { config: { policy: REVIEW } },
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
    { config: { policy: PUBLISH } },
    async (request) => {
      const who = await caller(request);
      return {
        preview: await previewPublish(options.deps, who, request.params.versionId, request.body),
      };
    },
  );

  scope.post<{ Params: { versionId: string } }>(
    '/versions/:versionId/publish',
    { config: { policy: PUBLISH } },
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

  scope.post<{ Params: { classId: string } }>(
    '/classes/:classId/pin',
    { config: { policy: REPIN } },
    async (request) => {
      const who = await caller(request);
      return { pin: await repin(options.deps, who, request.params.classId, request.body) };
    },
  );

  scope.get<{ Params: { curriculumId: string } }>(
    '/curricula/:curriculumId/publishing',
    { config: { policy: OPTIONS } },
    async (request, reply) => {
      const who = await caller(request);
      // Pins move when anyone publishes; never served from a cache.
      reply.header('cache-control', 'no-store');
      return getPublishingOptions(options.deps, who, request.params.curriculumId);
    },
  );
}
