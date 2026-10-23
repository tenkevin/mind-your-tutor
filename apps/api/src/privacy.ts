import { deleteStudent, exportStudent, PrivacyError, type Db, type ExportStore } from '@ideamap/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Authenticate } from './imports.js';

// FERPA export and delete for one student (ARCHITECTURE.md §10; task F6). Only an
// admin of the student's organization may call these: the caller's organization comes
// from their sign-in, never from the URL, and their role is read from the database
// (the caller's claimed role is not trusted).

/** Until sign-in exists (§10 SSO), nobody is signed in, so every privacy call is refused. */
export const noSignIn: Authenticate = async () => null;

export interface PrivacyRoutes {
  db: Db;
  store: ExportStore;
  authenticate?: Authenticate;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS = { forbidden: 403, not_found: 404 } as const;

export function privacyRoutes(app: FastifyInstance, options: PrivacyRoutes): void {
  const authenticate = options.authenticate ?? noSignIn;

  /** The request to act on, or null after replying with an error. */
  async function studentRequest(request: FastifyRequest, reply: FastifyReply) {
    const caller = await authenticate(request);
    if (!caller) {
      await reply.code(401).send({ error: 'Sign in required' });
      return null;
    }
    const { studentId } = request.params as { studentId: string };
    if (!UUID.test(studentId)) {
      await reply.code(404).send({ error: 'Not found' });
      return null;
    }
    return { orgId: caller.orgId, actorId: caller.userId, studentId };
  }

  async function refused(error: unknown, reply: FastifyReply) {
    if (error instanceof PrivacyError) {
      return reply.code(STATUS[error.code]).send({ error: error.message });
    }
    throw error;
  }

  app.post('/privacy/students/:studentId/export', async (request, reply) => {
    const req = await studentRequest(request, reply);
    if (!req) return reply;
    try {
      const result = await exportStudent(options.db, req, options.store);
      return await reply
        .code(201)
        .header('content-type', 'application/json; charset=utf-8')
        .header('content-disposition', `attachment; filename="student-${req.studentId}.json"`)
        .header('cache-control', 'no-store')
        .send(result.body);
    } catch (error) {
      return refused(error, reply);
    }
  });

  app.delete('/privacy/students/:studentId', async (request, reply) => {
    const req = await studentRequest(request, reply);
    if (!req) return reply;
    try {
      const deleted = await deleteStudent(options.db, req, options.store);
      return await reply.code(200).send({ deleted });
    } catch (error) {
      return refused(error, reply);
    }
  });
}
