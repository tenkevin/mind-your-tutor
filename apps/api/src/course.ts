import {
  COURSE_FIELDS,
  courseFieldRequestSchema,
  type ClassConfig,
  type Course,
  type CourseDetailsResponse,
  type CourseField,
  type CourseFieldError,
  type CurriculumCourseResponse,
  type Role,
} from '@ideamap/contracts';
import { courseValue, effectiveCourse, readingLevel, type CourseLayers } from '@ideamap/domain';
import { json, type JsonText } from '@ideamap/db';
import { sql } from 'kysely';
import type { Trx } from './db.js';

// Course details (T3; ARCHITECTURE.md §6, §11): reading a class's effective course
// fields with their origins, and writing one field at a time, as a class override or
// a curriculum default.
//
// Each write changes one key inside the jsonb config, in SQL, so two fields saved at
// once never overwrite each other. A reset removes the key (and an emptied `course`),
// so the field falls back to the curriculum; it never stores an empty value.
//
// Audit: the row-change trigger (0015, field paths from 0021) writes the one audit
// row for every save, `class_config.updated` or `curriculum_defaults.updated`, with
// the actor, the class or curriculum, the field path (`config.course.topic`) and its
// before and after values. The API writes no summary row of its own.

/** The course field a URL names, or null. */
export function courseField(name: string): CourseField | null {
  return (COURSE_FIELDS as readonly string[]).includes(name) ? (name as CourseField) : null;
}

/** How each field is named on the page (project/Teacher Settings.dc.html). */
export const COURSE_LABELS: Record<CourseField, string> = {
  subject: 'Subject',
  topic: 'Map title (topic)',
  grade: 'Grade level',
  framework: 'Standards framework',
  map_objective: 'Whole-map objective',
};

const REQUIRED = new Set<CourseField>(['subject', 'topic', 'grade']);

/** The new value from a write's body, or a plain, located sentence saying why not. */
export function parseCourseValue(
  field: CourseField,
  body: unknown,
): { value: string | null } | { refusal: CourseFieldError } {
  const label = COURSE_LABELS[field];
  const refuse = (error: string) => ({ refusal: { error, field } });
  const parsed = courseFieldRequestSchema(field).safeParse(body);
  const issue = parsed.error?.issues[0];
  if (issue?.code === 'unrecognized_keys') {
    return refuse(`Only a value can be saved for ${label}; ${issue.keys.join(', ')} isn't one.`);
  }
  const given = typeof body === 'object' ? (body as { value?: unknown } | null)?.value : undefined;
  const blank =
    given === undefined || given === null || (typeof given === 'string' && !given.trim());
  if (blank && REQUIRED.has(field)) {
    return refuse(`${label} can't be empty. To use the curriculum's value, reset it instead.`);
  }
  if (parsed.success) return { value: parsed.data.value };
  if (given === undefined) return refuse(`Send the new value for ${label}.`);
  if (issue?.code === 'too_big') {
    const max = Number(issue.maximum).toLocaleString('en');
    const got = typeof given === 'string' ? given.length.toLocaleString('en') : 'more';
    return refuse(`${label} can have at most ${max} characters (this has ${got}).`);
  }
  if (field === 'grade') return refuse('Grade level must be K or a grade from 1 to 12.');
  return refuse(`${label} must be text.`);
}

/** The Course tab a class uses: its pinned version, else the published, else the newest. */
async function packCourse(
  trx: Trx,
  curriculumId: string,
  pinnedVersionId: string | null,
): Promise<Course | null> {
  const row = await trx
    .selectFrom('curriculum_version')
    .select(sql<Course | null>`pack -> 'course'`.as('course'))
    .where('curriculum_id', '=', curriculumId)
    .orderBy(sql`coalesce(id = ${pinnedVersionId}::uuid, false)`, 'desc')
    .orderBy(sql`status = 'published'`, 'desc')
    .orderBy(sql`published_at is null`)
    .orderBy('number', 'desc')
    .limit(1)
    .executeTakeFirst();
  return row?.course ?? null;
}

export interface ClassCourse {
  className: string;
  details: CourseDetailsResponse;
}

/** A class's effective course fields with origins; null if the caller's org can't see it. */
export async function loadClassCourse(
  trx: Trx,
  classId: string,
  caller: { role: Role; userId: string },
): Promise<ClassCourse | null> {
  const klass = await trx
    .selectFrom('class as c')
    .innerJoin('curriculum as cu', 'cu.id', 'c.curriculum_id')
    .leftJoin('class_config as cc', 'cc.class_id', 'c.id')
    .leftJoin('curriculum_defaults as d', 'd.curriculum_id', 'c.curriculum_id')
    .select([
      'c.name',
      'c.curriculum_id',
      'c.pinned_version_id',
      'cu.created_by',
      'cc.config as overrides',
      'd.config as defaults',
    ])
    .where('c.id', '=', classId)
    .executeTakeFirst();
  if (!klass) return null;
  const layers: CourseLayers = {
    pack: await packCourse(trx, klass.curriculum_id, klass.pinned_version_id),
    defaults: klass.defaults?.course,
    overrides: klass.overrides?.course,
  };
  const fields = effectiveCourse(layers);
  return {
    className: klass.name,
    details: {
      classId,
      curriculumId: klass.curriculum_id,
      canEditDefaults:
        caller.role === 'admin' || (caller.role === 'author' && klass.created_by === caller.userId),
      fields,
      readingLevel: readingLevel(courseValue(fields, 'grade')),
    },
  };
}

/** A curriculum's course values (defaults over its Course tab); null if not visible. */
export async function loadCurriculumCourse(
  trx: Trx,
  curriculumId: string,
): Promise<CurriculumCourseResponse | null> {
  const curriculum = await trx
    .selectFrom('curriculum as cu')
    .leftJoin('curriculum_defaults as d', 'd.curriculum_id', 'cu.id')
    .select(['d.config as defaults'])
    .where('cu.id', '=', curriculumId)
    .executeTakeFirst();
  if (!curriculum) return null;
  const fields = effectiveCourse({
    pack: await packCourse(trx, curriculumId, null),
    defaults: curriculum.defaults?.course,
  });
  return { curriculumId, fields, readingLevel: readingLevel(courseValue(fields, 'grade')) };
}

type ConfigTable = 'class_config' | 'curriculum_defaults';

/** `config` with `course.<field>` set to `value`. */
function withField(field: CourseField, value: string | null) {
  return sql<JsonText<ClassConfig>>`jsonb_set(config, '{course}',
    (CASE WHEN jsonb_typeof(config -> 'course') = 'object' THEN config -> 'course' ELSE '{}'::jsonb END)
      || jsonb_build_object(${field}::text, ${JSON.stringify(value)}::jsonb))`;
}

/** `config` without `course.<field>`, and without `course` once it is empty. */
function withoutField(field: CourseField) {
  return sql<JsonText<ClassConfig>>`CASE
    WHEN (config -> 'course') - ${field}::text = '{}'::jsonb THEN config - 'course'
    ELSE config #- ARRAY['course', ${field}::text] END`;
}

/** Set one course field of a class override or curriculum default. */
export async function setCourseField(
  trx: Trx,
  target: { table: ConfigTable; id: string; orgId: string },
  field: CourseField,
  value: string | null,
  actorId: string,
): Promise<void> {
  // A class or curriculum without a config row gets an empty one first, so the save
  // itself is an update and its audit row names the field (0021).
  if (target.table === 'class_config') {
    await trx
      .insertInto('class_config')
      .values({ class_id: target.id, org_id: target.orgId, config: json<ClassConfig>({}) })
      .onConflict((oc) => oc.column('class_id').doNothing())
      .execute();
    await trx
      .updateTable('class_config')
      .set({ config: withField(field, value), updated_by: actorId })
      .where('class_id', '=', target.id)
      .execute();
  } else {
    await trx
      .insertInto('curriculum_defaults')
      .values({
        curriculum_id: target.id,
        org_id: target.orgId,
        config: json<ClassConfig>({}),
      })
      .onConflict((oc) => oc.column('curriculum_id').doNothing())
      .execute();
    await trx
      .updateTable('curriculum_defaults')
      .set({ config: withField(field, value), updated_by: actorId })
      .where('curriculum_id', '=', target.id)
      .execute();
  }
}

/** Remove one course field from a class override or curriculum default (a reset). */
export async function resetCourseField(
  trx: Trx,
  target: { table: ConfigTable; id: string },
  field: CourseField,
  actorId: string,
): Promise<void> {
  const has = sql<boolean>`jsonb_typeof(config -> 'course') = 'object' AND (config -> 'course') ? ${field}::text`;
  if (target.table === 'class_config') {
    await trx
      .updateTable('class_config')
      .set({ config: withoutField(field), updated_by: actorId })
      .where('class_id', '=', target.id)
      .where(has)
      .execute();
  } else {
    await trx
      .updateTable('curriculum_defaults')
      .set({ config: withoutField(field), updated_by: actorId })
      .where('curriculum_id', '=', target.id)
      .where(has)
      .execute();
  }
}
