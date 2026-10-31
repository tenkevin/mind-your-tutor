import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  courseField,
  COURSE_LABELS,
  loadClassCourse,
  loadCurriculumCourse,
  parseCourseValue,
  resetCourseField,
  setCourseField,
} from '../course.js';
import type { CourseField, CourseFieldError } from '@ideamap/contracts';

// Course details routes (T3). A class's teacher or an admin reads and overrides the
// class's course fields; the curriculum's author or an admin edits its defaults (D3).
// Each write answers with the section's new state, so the page shows exactly what was
// saved.

type ClassParams = { Params: { classId: string } };
type ClassFieldParams = { Params: { classId: string; field: string } };
type CurriculumParams = { Params: { curriculumId: string } };
type CurriculumFieldParams = { Params: { curriculumId: string; field: string } };

const classPolicy = {
  policy: {
    roles: ['admin', 'author', 'teacher'] as const,
    scope: { kind: 'class' as const, param: 'classId' },
  },
};
const curriculumPolicy = (edit: boolean) => ({
  policy: {
    roles: edit ? (['admin', 'author'] as const) : (['admin', 'author', 'teacher'] as const),
    scope: { kind: 'curriculum' as const, param: 'curriculumId', edit },
  },
});

/** The field a URL names, or a 400 saying there is no such field. */
function fieldOr400(name: string, reply: FastifyReply): CourseField | null {
  const field = courseField(name);
  if (!field) {
    const known = Object.values(COURSE_LABELS).join(', ');
    void reply.code(400).send({
      error: `There is no course detail called "${name.slice(0, 64)}". Course details are ${known}.`,
      field: null,
    } satisfies CourseFieldError);
  }
  return field;
}

export function courseRoutes(app: FastifyInstance): void {
  app.get<ClassParams>('/api/classes/:classId/course', { config: classPolicy }, async (req) => {
    const { role, userId } = req.session!;
    const course = await req.withOrg((trx) =>
      loadClassCourse(trx, req.params.classId, { role, userId }),
    );
    // The policy has already found the class in the caller's org.
    return course!.details;
  });

  app.put<ClassFieldParams>(
    '/api/classes/:classId/course/:field',
    { config: classPolicy },
    async (req, reply) => {
      const field = fieldOr400(req.params.field, reply);
      if (!field) return reply;
      const parsed = parseCourseValue(field, req.body);
      if ('refusal' in parsed) return reply.code(400).send(parsed.refusal);
      const { orgId, userId, role } = req.session!;
      const classId = req.params.classId;
      const course = await req.withOrg(async (trx) => {
        await setCourseField(
          trx,
          { table: 'class_config', id: classId, orgId },
          field,
          parsed.value,
          userId,
        );
        return loadClassCourse(trx, classId, { role, userId });
      });
      return course!.details;
    },
  );

  // Reset to curriculum: the override is removed, not emptied (§6).
  app.delete<ClassFieldParams>(
    '/api/classes/:classId/course/:field',
    { config: classPolicy },
    async (req, reply) => {
      const field = fieldOr400(req.params.field, reply);
      if (!field) return reply;
      const { userId, role } = req.session!;
      const classId = req.params.classId;
      const course = await req.withOrg(async (trx) => {
        await resetCourseField(trx, { table: 'class_config', id: classId }, field, userId);
        return loadClassCourse(trx, classId, { role, userId });
      });
      return course!.details;
    },
  );

  app.get<CurriculumParams>(
    '/api/curricula/:curriculumId/course',
    { config: curriculumPolicy(false) },
    async (req) => {
      const course = await req.withOrg((trx) => loadCurriculumCourse(trx, req.params.curriculumId));
      return course!;
    },
  );

  app.put<CurriculumFieldParams>(
    '/api/curricula/:curriculumId/course/:field',
    { config: curriculumPolicy(true) },
    async (req, reply) => {
      const field = fieldOr400(req.params.field, reply);
      if (!field) return reply;
      const parsed = parseCourseValue(field, req.body);
      if ('refusal' in parsed) return reply.code(400).send(parsed.refusal);
      const { orgId, userId } = req.session!;
      const curriculumId = req.params.curriculumId;
      const course = await req.withOrg(async (trx) => {
        await setCourseField(
          trx,
          { table: 'curriculum_defaults', id: curriculumId, orgId },
          field,
          parsed.value,
          userId,
        );
        return loadCurriculumCourse(trx, curriculumId);
      });
      return course!;
    },
  );

  // Back to the value in the curriculum's spreadsheet.
  app.delete<CurriculumFieldParams>(
    '/api/curricula/:curriculumId/course/:field',
    { config: curriculumPolicy(true) },
    async (req, reply) => {
      const field = fieldOr400(req.params.field, reply);
      if (!field) return reply;
      const { userId } = req.session!;
      const curriculumId = req.params.curriculumId;
      const course = await req.withOrg(async (trx) => {
        await resetCourseField(
          trx,
          { table: 'curriculum_defaults', id: curriculumId },
          field,
          userId,
        );
        return loadCurriculumCourse(trx, curriculumId);
      });
      return course!;
    },
  );
}
