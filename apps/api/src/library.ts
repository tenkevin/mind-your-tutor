import {
  LibrarySearchRequestSchema,
  QUEUES,
  USE_FOR,
  type ClassLibraryIndexPayload,
  type SharedLibraryIndexPayload,
} from '@ideamap/contracts';
import type { Embedder } from '@ideamap/ai';
import {
  DEFAULT_LIBRARY_LIMITS,
  megabytes,
  screenLibraryFile,
  uploadKey,
  type LibraryLimits,
  type ObjectStore,
} from '@ideamap/connectors';
import { searchLibrary } from '@ideamap/db';
import { inTransaction, type Sender } from '@ideamap/worker';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { audit } from './db.js';
import { FailureLimiter } from './limiter.js';
import type { RoutePolicy } from './policy.js';

// The resource library over HTTP (ARCHITECTURE.md D11, §7, §9; task A3):
//
//   POST   /api/curricula/:curriculumId/library        upload a shared document (author, admin)
//   GET    /api/curricula/:curriculumId/library        the shared documents and their indexing status
//   DELETE /api/curricula/:curriculumId/library/:docId remove a shared document and its passages
//   POST   /api/classes/:classId/library/uploads       upload a document for this class only
//   PUT    /api/classes/:classId/library/uploads/:docId   change how the AI uses an upload
//   DELETE /api/classes/:classId/library/uploads/:docId   remove an upload and its passages
//   POST   /api/classes/:classId/library/search        ranked passages for Atlas or Ms. Ivy
//
// (Listing a class's knowledge sources and setting how a class uses a shared document
// are in routes/access.ts.) An upload's body is the file (application/octet-stream),
// X-File-Name its name and X-Title an optional title, both percent-encoded. The upload is
// screened by its bytes (a program or a mislabelled file is refused), stored under a
// random key, and indexed by its own job, so the request returns 202 straight away and
// the document's `index_status` shows progress. The search route embeds the query and
// looks only at the class's shared documents and its own uploads (D11).

export interface LibraryRoutesOptions {
  store: ObjectStore;
  /** Queues the indexing job, in the same transaction as the row it indexes. */
  boss: Sender;
  /** Embeds search queries. The vendor is an open question (§12 q6). */
  embedder: Embedder;
  limits?: Partial<LibraryLimits>;
  /** Documents one class may upload. Default 100. */
  maxUploadsPerClass?: number;
  /** Shared documents one curriculum may hold. Default 500. */
  maxSharedDocs?: number;
  /** Searches one user may make per minute. Default 60. */
  searchesPerMinute?: number;
  now?: () => number;
}

const STAFF_AUTHORS = ['admin', 'author'] as const;
const CLASS_STAFF = ['admin', 'teacher'] as const;

const curriculumPolicy = (edit: boolean): { policy: RoutePolicy } => ({
  policy: {
    roles: edit ? STAFF_AUTHORS : ['admin', 'author', 'teacher'],
    scope: { kind: 'curriculum', param: 'curriculumId', edit },
  },
});
const classPolicy: { policy: RoutePolicy } = {
  policy: { roles: CLASS_STAFF, scope: { kind: 'class', param: 'classId' } },
};

const UseForBody = z.strictObject({ use_for: z.enum(USE_FOR) });

function decoded(header: string | string[] | undefined): string {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** A title from the X-Title header, else the file's name without its extension. */
function titleFor(request: FastifyRequest, fileName: string): string {
  const given = decoded(request.headers['x-title']).trim();
  const base = given || fileName.replace(/\.[^.]*$/, '');
  return (
    base
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .trim()
      .slice(0, 200)
  );
}

type Screen =
  | { ok: true; bytes: Uint8Array; title: string; useFor: (typeof USE_FOR)[number] }
  | { ok: false; status: number; error: string };

export function libraryRoutes(app: FastifyInstance, options: LibraryRoutesOptions): void {
  const limits = { ...DEFAULT_LIBRARY_LIMITS, ...options.limits };
  const maxUploads = options.maxUploadsPerClass ?? 100;
  const maxShared = options.maxSharedDocs ?? 500;
  const searches = new FailureLimiter(options.searchesPerMinute ?? 60, options.now ?? Date.now);

  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer', bodyLimit: limits.maxFileBytes },
    (_request, body, done) => done(null, body),
  );

  app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, request, reply) => {
    if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      const name = decoded(request.headers['x-file-name']) || 'The file';
      return reply.code(413).send({
        error: `${name} is too big; the most a library document can be is ${megabytes(limits.maxFileBytes)}.`,
      });
    }
    const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    if (status >= 500) request.log.error(error);
    return reply.code(status).send({
      error:
        status === 415
          ? 'Upload the file as application/octet-stream.'
          : status < 500
            ? 'The request could not be read.'
            : 'Something went wrong. Try again.',
    });
  });

  /** Checks the upload's body and headers; nothing is stored yet. */
  function screen(request: FastifyRequest): Screen {
    if (!Buffer.isBuffer(request.body)) {
      return { ok: false, status: 400, error: 'Send the file as the request body.' };
    }
    const name = decoded(request.headers['x-file-name']);
    if (!name) return { ok: false, status: 400, error: 'Name the file in the X-File-Name header.' };
    const screened = screenLibraryFile(name, request.body, limits);
    if (!screened.ok) {
      return {
        ok: false,
        status: screened.message.includes('the most') ? 413 : 400,
        error: screened.message,
      };
    }
    const title = titleFor(request, name);
    if (!title) return { ok: false, status: 400, error: 'The document needs a title.' };
    const raw = decoded(request.headers['x-use-for']) || 'agent';
    const useFor = UseForBody.shape.use_for.safeParse(raw);
    if (!useFor.success) {
      return { ok: false, status: 400, error: `Set X-Use-For to ${USE_FOR.join(', ')}.` };
    }
    return { ok: true, bytes: request.body, title, useFor: useFor.data };
  }

  const refuse = (reply: FastifyReply, s: { status: number; error: string }) =>
    reply.code(s.status).send({ error: s.error });

  // --- Shared library (a curriculum's author) -----------------------------------------

  app.post<{ Params: { curriculumId: string } }>(
    '/api/curricula/:curriculumId/library',
    { bodyLimit: limits.maxFileBytes, config: curriculumPolicy(true) },
    async (req, reply) => {
      const upload = screen(req);
      if (!upload.ok) return refuse(reply, upload);
      const { orgId, userId } = req.session!;
      const { curriculumId } = req.params;
      const key = uploadKey(orgId);
      await options.store.put(key, upload.bytes);
      try {
        const doc = await req.withOrg(async (trx) => {
          const count = await trx
            .selectFrom('library_doc')
            .select((eb) => eb.fn.countAll<number>().as('n'))
            .where('curriculum_id', '=', curriculumId)
            .executeTakeFirstOrThrow();
          if (Number(count.n) >= maxShared) return null;
          const row = await trx
            .insertInto('library_doc')
            .values({
              org_id: orgId,
              curriculum_id: curriculumId,
              title: upload.title,
              file_url: key,
              use_for: upload.useFor,
            })
            .returning(['id', 'title', 'use_for', 'index_status'])
            .executeTakeFirstOrThrow();
          const payload: SharedLibraryIndexPayload = {
            org_id: orgId,
            curriculum_id: curriculumId,
            library_doc_id: row.id,
          };
          await options.boss.send(QUEUES.indexLibrary, payload, {
            singletonKey: row.id,
            db: inTransaction(trx),
          });
          await audit(trx, {
            orgId,
            actorId: userId,
            action: 'library_doc.added',
            targetType: 'library_doc',
            targetId: row.id,
            at: new Date(),
          });
          return row;
        });
        if (!doc) {
          await options.store.delete(key);
          return reply.code(409).send({
            error: `The shared library has ${maxShared} documents, the most it can hold. Remove one first.`,
          });
        }
        return reply.code(202).send({
          doc: { id: doc.id, title: doc.title, useFor: doc.use_for, indexStatus: doc.index_status },
        });
      } catch (error) {
        await options.store.delete(key).catch(() => undefined);
        throw error;
      }
    },
  );

  app.get<{ Params: { curriculumId: string } }>(
    '/api/curricula/:curriculumId/library',
    { config: curriculumPolicy(false) },
    async (req) => {
      const docs = await req.withOrg((trx) =>
        trx
          .selectFrom('library_doc')
          .select(['id', 'title', 'use_for', 'index_status', 'indexed_at'])
          .where('curriculum_id', '=', req.params.curriculumId)
          .orderBy('title')
          .orderBy('id')
          .execute(),
      );
      return {
        docs: docs.map((d) => ({
          id: d.id,
          title: d.title,
          useFor: d.use_for,
          indexStatus: d.index_status,
          indexedAt: d.indexed_at?.toISOString() ?? null,
        })),
      };
    },
  );

  app.delete<{ Params: { curriculumId: string; docId: string } }>(
    '/api/curricula/:curriculumId/library/:docId',
    { config: curriculumPolicy(true) },
    async (req, reply) => {
      const { orgId, userId } = req.session!;
      const { curriculumId, docId } = req.params;
      const removed = await req.withOrg(async (trx) => {
        const row = await trx
          .deleteFrom('library_doc')
          .where('id', '=', docId)
          .where('curriculum_id', '=', curriculumId)
          .returning(['id', 'file_url'])
          .executeTakeFirst();
        if (!row) return null;
        await audit(trx, {
          orgId,
          actorId: userId,
          action: 'library_doc.removed',
          targetType: 'library_doc',
          targetId: row.id,
          at: new Date(),
        });
        return row;
      });
      if (!removed) return reply.code(404).send({ error: 'Not found' });
      await options.store.delete(removed.file_url).catch(() => undefined);
      return reply.code(204).send();
    },
  );

  // --- A class's own uploads (D11) -----------------------------------------------------

  app.post<{ Params: { classId: string } }>(
    '/api/classes/:classId/library/uploads',
    { bodyLimit: limits.maxFileBytes, config: classPolicy },
    async (req, reply) => {
      const upload = screen(req);
      if (!upload.ok) return refuse(reply, upload);
      const { orgId, userId } = req.session!;
      const { classId } = req.params;
      const key = uploadKey(orgId);
      await options.store.put(key, upload.bytes);
      try {
        const doc = await req.withOrg(async (trx) => {
          const count = await trx
            .selectFrom('class_library_doc')
            .select((eb) => eb.fn.countAll<number>().as('n'))
            .where('class_id', '=', classId)
            .executeTakeFirstOrThrow();
          if (Number(count.n) >= maxUploads) return null;
          const row = await trx
            .insertInto('class_library_doc')
            .values({
              org_id: orgId,
              class_id: classId,
              title: upload.title,
              file_url: key,
              use_for: upload.useFor,
              uploaded_by: userId,
            })
            .returning(['id', 'title', 'use_for', 'index_status'])
            .executeTakeFirstOrThrow();
          const payload: ClassLibraryIndexPayload = {
            org_id: orgId,
            class_id: classId,
            class_library_doc_id: row.id,
          };
          await options.boss.send(QUEUES.indexLibrary, payload, {
            singletonKey: row.id,
            db: inTransaction(trx),
          });
          return row;
        });
        if (!doc) {
          await options.store.delete(key);
          return reply.code(409).send({
            error: `This class has ${maxUploads} uploads, the most it can hold. Remove one first.`,
          });
        }
        return reply.code(202).send({
          doc: { id: doc.id, title: doc.title, useFor: doc.use_for, indexStatus: doc.index_status },
        });
      } catch (error) {
        await options.store.delete(key).catch(() => undefined);
        throw error;
      }
    },
  );

  app.put<{ Params: { classId: string; docId: string } }>(
    '/api/classes/:classId/library/uploads/:docId',
    { config: classPolicy },
    async (req, reply) => {
      const parsed = UseForBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid setting' });
      const { classId, docId } = req.params;
      const row = await req.withOrg((trx) =>
        trx
          .updateTable('class_library_doc')
          .set({ use_for: parsed.data.use_for })
          .where('id', '=', docId)
          .where('class_id', '=', classId)
          .returning('id')
          .executeTakeFirst(),
      );
      if (!row) return reply.code(404).send({ error: 'Not found' });
      return { useFor: parsed.data.use_for };
    },
  );

  app.delete<{ Params: { classId: string; docId: string } }>(
    '/api/classes/:classId/library/uploads/:docId',
    { config: classPolicy },
    async (req, reply) => {
      const { classId, docId } = req.params;
      // The foreign keys remove the document's passages and their embeddings with it.
      const removed = await req.withOrg((trx) =>
        trx
          .deleteFrom('class_library_doc')
          .where('id', '=', docId)
          .where('class_id', '=', classId)
          .returning('file_url')
          .executeTakeFirst(),
      );
      if (!removed) return reply.code(404).send({ error: 'Not found' });
      await options.store.delete(removed.file_url).catch(() => undefined);
      return reply.code(204).send();
    },
  );

  // --- Search ---------------------------------------------------------------------------

  app.post<{ Params: { classId: string } }>(
    '/api/classes/:classId/library/search',
    { config: classPolicy },
    async (req, reply) => {
      const parsed = LibrarySearchRequestSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid search' });
      const { userId } = req.session!;
      if (searches.blocked(userId)) {
        return reply.code(429).send({ error: 'Too many searches. Wait a moment and try again.' });
      }
      searches.fail(userId);
      const { query, audience, k } = parsed.data;
      const [embedding] = await options.embedder.embed([query]);
      if (!embedding) throw new Error('The embedder returned no vector.');
      const passages = await req.withOrg((trx) =>
        searchLibrary(trx, { classId: req.params.classId, audience, embedding, k }),
      );
      return { passages };
    },
  );
}
