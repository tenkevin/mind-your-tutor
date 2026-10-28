import {
  deleteStudentIn,
  deleteTeacherUploadsIn,
  exportStudentIn,
  PrivacyError,
  type ExportStore,
  type StudentRequest,
} from '@ideamap/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { RoutePolicy } from './policy.js';

// FERPA export and delete for one student (ARCHITECTURE.md §10; task F6). Only an
// admin of the student's organization may call these (F6-S1). The route policy checks
// the signed-in session's role, read from the database, and that the student is in
// the caller's org; the privacy functions check both again inside the transaction.

export interface PrivacyRoutes {
  /** Where student-record export files are written (and removed from on deletion). */
  store: ExportStore;
  /** Removes an upload's original file from object storage (A3), if the library is wired. */
  removeUpload?: (key: string) => Promise<void>;
}

/** Deleting a teacher's uploads (D11): the admin of the teacher's organization. */
export const TEACHER_UPLOADS_POLICY: RoutePolicy = {
  roles: ['admin'],
  scope: { kind: 'user', param: 'teacherId' },
};

/** The district owns the data (FERPA), so its admin makes these requests, no one else. */
export const STUDENT_PRIVACY_POLICY: RoutePolicy = {
  roles: ['admin'],
  scope: { kind: 'user', param: 'studentId' },
};

const STATUS = { forbidden: 403, not_found: 404 } as const;

type StudentParams = { Params: { studentId: string } };

/** The signed-in admin's request; the org always comes from their session. */
function studentRequest(req: FastifyRequest<StudentParams>): StudentRequest {
  const { orgId, userId } = req.session!;
  return { orgId, actorId: userId, studentId: req.params.studentId };
}

function refused(error: unknown, reply: FastifyReply) {
  if (error instanceof PrivacyError) {
    return reply.code(STATUS[error.code]).send({ error: error.message });
  }
  throw error;
}

export function privacyRoutes(app: FastifyInstance, options: PrivacyRoutes): void {
  app.post<StudentParams>(
    '/api/privacy/students/:studentId/export',
    { config: { policy: STUDENT_PRIVACY_POLICY } },
    async (req, reply) => {
      const request = studentRequest(req);
      try {
        const result = await exportStudentIn(req.withOrg, request, options.store);
        return await reply
          .code(201)
          .header('content-type', 'application/json; charset=utf-8')
          .header('content-disposition', `attachment; filename="student-${request.studentId}.json"`)
          .header('cache-control', 'no-store')
          .send(result.body);
      } catch (error) {
        return refused(error, reply);
      }
    },
  );

  app.delete<StudentParams>(
    '/api/privacy/students/:studentId',
    { config: { policy: STUDENT_PRIVACY_POLICY } },
    async (req, reply) => {
      try {
        const deleted = await deleteStudentIn(req.withOrg, studentRequest(req), options.store);
        return await reply.code(200).send({ deleted });
      } catch (error) {
        return refused(error, reply);
      }
    },
  );

  // Extends F6's FERPA delete to the documents a teacher uploaded to their classes.
  app.delete<{ Params: { teacherId: string } }>(
    '/api/privacy/teachers/:teacherId/uploads',
    { config: { policy: TEACHER_UPLOADS_POLICY } },
    async (req, reply) => {
      const { orgId, userId } = req.session!;
      try {
        const deleted = await deleteTeacherUploadsIn(
          req.withOrg,
          { orgId, actorId: userId, teacherId: req.params.teacherId },
          options.removeUpload,
        );
        return await reply.code(200).send({ deleted });
      } catch (error) {
        return refused(error, reply);
      }
    },
  );
}
