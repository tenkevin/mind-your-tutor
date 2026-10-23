import { DEFAULT_LIMITS, megabytes } from '@ideamap/connectors';
import {
  ImportRequestError,
  getImportJob,
  startImport,
  type Caller,
  type ImportDeps,
} from '@ideamap/worker';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { STAFF } from './policy.js';

// Curriculum imports over HTTP (ARCHITECTURE.md §7, §11 "Curriculum data"):
//
//   POST /curricula/:curriculumId/imports   the file as the body (application/octet-stream),
//        X-File-Name: its name, percent-encoded; Idempotency-Key: optional.
//        202 with the queued job, or 200 with the first job for a repeated key.
//   GET  /imports/:jobId                    the job's status, steps and draft.
//
// Who is asking comes from `authenticate`; F5's sign-in provides it. The route
// policies (F5-F4) refuse signed-out callers, students, and curricula or jobs the
// caller's org can't see (403, as for any other route) before the body is read; the
// worker repeats its own checks.

export type Authenticate = (request: FastifyRequest) => Caller | null | Promise<Caller | null>;

export interface ImportRoutesOptions {
  deps: ImportDeps;
  authenticate: Authenticate;
}

function fileName(header: string | string[] | undefined): string {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function importRoutes(app: FastifyInstance, options: ImportRoutesOptions): void {
  const maxFileBytes = options.deps.limits?.maxFileBytes ?? DEFAULT_LIMITS.maxFileBytes;

  const caller = async (request: FastifyRequest) => {
    const who = await options.authenticate(request);
    if (!who) throw Object.assign(new Error('Sign in to continue.'), { statusCode: 401 });
    return who;
  };

  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: maxFileBytes },
    (_request, body, done) => done(null, body),
  );

  app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, request, reply) => {
    if (error instanceof ImportRequestError) {
      return reply.code(error.status).send({ error: error.message });
    }
    if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      const size = Number(request.headers['content-length']);
      const name = fileName(request.headers['x-file-name']) || 'The file';
      const what = Number.isFinite(size) ? `${name} is ${megabytes(size)}` : `${name} is too big`;
      return reply.code(413).send({
        error: `${what}; the most an import accepts is ${megabytes(maxFileBytes)} per file. Nothing was imported.`,
      });
    }
    const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    // Only our own messages reach the client; anything unexpected gets a fixed one.
    const message =
      status === 401
        ? error.message
        : status === 415
          ? 'Upload the file as application/octet-stream.'
          : status < 500
            ? 'The request could not be read.'
            : 'Something went wrong. Try again.';
    if (status >= 500) request.log.error(error);
    return reply.code(status).send({ error: message });
  });

  app.post<{ Params: { curriculumId: string } }>(
    '/curricula/:curriculumId/imports',
    {
      bodyLimit: maxFileBytes,
      config: {
        policy: {
          roles: STAFF,
          scope: { kind: 'visible', table: 'curriculum', param: 'curriculumId' },
        },
      },
    },
    async (request, reply) => {
      const who = await caller(request);
      if (!Buffer.isBuffer(request.body)) {
        throw new ImportRequestError(400, 'Send the file as the request body.');
      }
      const key = request.headers['idempotency-key'];
      const { job, created } = await startImport(options.deps, who, {
        curriculumId: request.params.curriculumId,
        file: new File([request.body], fileName(request.headers['x-file-name'])),
        idempotencyKey: Array.isArray(key) ? key[0] : key,
      });
      return reply.code(created ? 202 : 200).send({ job });
    },
  );

  app.get<{ Params: { jobId: string } }>(
    '/imports/:jobId',
    {
      config: {
        policy: { roles: STAFF, scope: { kind: 'visible', table: 'import_job', param: 'jobId' } },
      },
    },
    async (request) => {
      const who = await caller(request);
      return { job: await getImportJob(options.deps, who, request.params.jobId) };
    },
  );
}
