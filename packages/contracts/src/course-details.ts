import { z } from 'zod';
import { CourseOverridesSchema } from './class-config.js';
import { GRADES } from './spec.js';

// Course details (T3; ARCHITECTURE.md §6, §11): the course fields a class can override,
// in the order the Teacher Settings design shows them, each with its effective value
// and where that value comes from.

export const COURSE_FIELDS = ['subject', 'topic', 'grade', 'framework', 'map_objective'] as const;
export type CourseField = (typeof COURSE_FIELDS)[number];

/** Where an effective value comes from (§6): the curriculum, or this class's override. */
export const ORIGINS = ['curriculum', 'class'] as const;
export type Origin = (typeof ORIGINS)[number];

/** The value schema for one course field, as a class override or curriculum default. */
export function courseFieldSchema(field: CourseField) {
  return CourseOverridesSchema.shape[field].unwrap();
}

/**
 * PUT /api/classes/:classId/course/:field and PUT /api/curricula/:curriculumId/course/:field.
 * Exactly `{ value }`; a reset is a DELETE of the same URL, which removes the override.
 */
export function courseFieldRequestSchema(field: CourseField) {
  return z.strictObject({ value: courseFieldSchema(field) });
}

const value = z.string().nullable();

export const CourseFieldDetailSchema = z.object({
  field: z.enum(COURSE_FIELDS),
  /** What students and the AI gateway use. */
  value,
  origin: z.enum(ORIGINS),
  /** What a reset to curriculum would show. */
  curriculumValue: value,
});
export type CourseFieldDetail = z.infer<typeof CourseFieldDetailSchema>;

/** How the grade sets every persona's reading level (§6). */
export const ReadingLevelSchema = z.object({
  grade: z.enum(GRADES),
  gradeLabel: z.string(),
  level: z.string(),
  style: z.string(),
  length: z.string(),
});
export type ReadingLevel = z.infer<typeof ReadingLevelSchema>;

/** GET /api/classes/:classId/course, and the reply to each class write. */
export const CourseDetailsResponseSchema = z.object({
  classId: z.uuid(),
  curriculumId: z.uuid(),
  /** The caller may edit the curriculum defaults too (its author, or an admin; D3). */
  canEditDefaults: z.boolean(),
  fields: z.array(CourseFieldDetailSchema),
  readingLevel: ReadingLevelSchema.nullable(),
});
export type CourseDetailsResponse = z.infer<typeof CourseDetailsResponseSchema>;

/** GET /api/curricula/:curriculumId/course, and the reply to each default write. */
export const CurriculumCourseResponseSchema = z.object({
  curriculumId: z.uuid(),
  fields: z.array(CourseFieldDetailSchema),
  readingLevel: ReadingLevelSchema.nullable(),
});
export type CurriculumCourseResponse = z.infer<typeof CurriculumCourseResponseSchema>;

/** A refused write: a plain sentence, and the field it is about. */
export const CourseFieldErrorSchema = z.object({
  error: z.string(),
  field: z.string().nullable(),
});
export type CourseFieldError = z.infer<typeof CourseFieldErrorSchema>;
