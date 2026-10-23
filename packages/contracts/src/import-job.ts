import { z } from 'zod';
import { ImportIssueSchema } from './import.js';
import { VersionSourceSchema, VERSION_STATUSES } from './curriculum-version.js';

// An import of a curriculum file as a background job (ARCHITECTURE.md §7, task C4):
// the job's progress through the Teacher Settings pipeline, its failure if the file
// can't be imported, and the draft version it produced.

/** The pipeline steps shown in Teacher Settings → Curriculum data, in order. */
export const IMPORT_STEPS = [
  'Read sheet',
  'Check data',
  'Rank links',
  'Lay out map',
  'Make quizzes',
  'Index library',
] as const;
export type ImportStepName = (typeof IMPORT_STEPS)[number];

export const IMPORT_JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed'] as const;
export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number];

export const IMPORT_STEP_STATUSES = ['pending', 'running', 'done', 'failed'] as const;

export const ImportStepSchema = z.object({
  name: z.enum(IMPORT_STEPS),
  status: z.enum(IMPORT_STEP_STATUSES),
  /** A short result for the teacher: "18 ideas, 31 links", "3 notes". */
  result: z.string().max(200).nullable(),
  started_at: z.iso.datetime({ offset: true }).nullable(),
  finished_at: z.iso.datetime({ offset: true }).nullable(),
});
export type ImportStep = z.infer<typeof ImportStepSchema>;

export const ImportStepsSchema = z.array(ImportStepSchema).max(IMPORT_STEPS.length);

/** Every step, waiting to run. */
export function pendingSteps(): ImportStep[] {
  return IMPORT_STEPS.map((name) => ({
    name,
    status: 'pending',
    result: null,
    started_at: null,
    finished_at: null,
  }));
}

/**
 * Why an import produced no version: a plain-English summary, what to do next, and
 * the importer's problems (C1), cell by cell.
 */
export const ImportFailureSchema = z.object({
  message: z.string().min(1).max(2000),
  next_action: z.string().min(1).max(500),
  problems: z.array(ImportIssueSchema).max(1000),
});
export type ImportFailure = z.infer<typeof ImportFailureSchema>;

/** An import job as the API shows it. */
export const ImportJobViewSchema = z.object({
  id: z.uuid(),
  curriculum_id: z.uuid(),
  status: z.enum(IMPORT_JOB_STATUSES),
  steps: ImportStepsSchema,
  source: VersionSourceSchema.pick({ kind: true, file_name: true, checksum: true }),
  error: ImportFailureSchema.nullable(),
  /** The draft the job produced; null until it succeeds. */
  version: z
    .object({
      id: z.uuid(),
      number: z.number().int().min(1),
      status: z.enum(VERSION_STATUSES),
      /** False while an import blocker or an error-level data check remains (C2, §7). */
      can_publish: z.boolean(),
    })
    .nullable(),
  created_at: z.iso.datetime({ offset: true }),
  started_at: z.iso.datetime({ offset: true }).nullable(),
  finished_at: z.iso.datetime({ offset: true }).nullable(),
});
export type ImportJobView = z.infer<typeof ImportJobViewSchema>;

/** Most characters in an Idempotency-Key header. */
export const MAX_IDEMPOTENCY_KEY = 200;
export const IdempotencyKeySchema = z
  .string()
  .min(1)
  .max(MAX_IDEMPOTENCY_KEY)
  .regex(/^[\x21-\x7e]+$/, 'Use printable ASCII without spaces.');

/** pg-boss queue names (§3). */
export const QUEUES = {
  import: 'curriculum-import',
  indexLibrary: 'library-index',
} as const;

/**
 * Queue payloads carry ids only (0003: queue tables have no row-level security), and
 * the organization, so the worker can act for it.
 */
export const ImportJobPayloadSchema = z.object({
  org_id: z.uuid(),
  import_job_id: z.uuid(),
});
export type ImportJobPayload = z.infer<typeof ImportJobPayloadSchema>;

export const LibraryIndexPayloadSchema = z.object({
  org_id: z.uuid(),
  curriculum_id: z.uuid(),
  version_id: z.uuid(),
});
export type LibraryIndexPayload = z.infer<typeof LibraryIndexPayloadSchema>;
