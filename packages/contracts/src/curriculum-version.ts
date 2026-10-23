import { z } from 'zod';
import { LayoutSchema, QuizzesSchema, RankedLinksSchema } from './derived.js';
import { DataCheckIssueSchema } from './data-checks.js';
import { PackIssueSchema } from './issues.js';
import { PackSchema } from './pack.js';
import { TAB_NAMES } from './spec.js';

// An immutable snapshot of a curriculum (ARCHITECTURE.md §5 and §7): the validated
// pack body, what was derived from it, the issues found and where it came from.

export const VERSION_STATUSES = ['draft', 'published', 'archived'] as const;

/** Where a version's data came from (§5 "source: file ref, column mapping, checksum"). */
export const VersionSourceSchema = z.object({
  kind: z.enum(['csv', 'xlsx', 'json', 'google_sheets']),
  /** Storage key or external id of the uploaded file or sheet. */
  file_ref: z.string().min(1).max(1024).nullable(),
  file_name: z.string().max(255).nullable().default(null),
  /** SHA-256 of the source bytes, lowercase hex. */
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
  /** How source columns were mapped onto pack columns (C1). */
  column_mapping: z
    .array(
      z.object({
        tab: z.enum(TAB_NAMES),
        column: z.string().min(1).max(100),
        source_column: z.string().min(1).max(200),
      }),
    )
    .max(500)
    .default([]),
});

/**
 * Data derived from the pack (§5 "derived: ranked links, layout, quizzes"), as
 * `derive()` in packages/domain returns it. `null` until derived.
 */
export const VersionDerivedSchema = z.object({
  ranked_links: RankedLinksSchema,
  layout: LayoutSchema,
  quizzes: QuizzesSchema,
});

/** Maximum serialized issue bytes in one version's jsonb issue field. */
export const MAX_VERSION_ISSUES_BYTES = 1_000_000;

/**
 * Issues stored on a version retain their original fields and gain an explicit
 * origin. The schemas also accept the raw outputs of parsePack and checkPack, so
 * callers can store both without reshaping or losing details. Existing stored
 * PackIssues are recognized as import issues when read from older rows.
 */
const StoredImportIssueSchema = PackIssueSchema.extend({
  origin: z.literal('import'),
  level: z.enum(['error', 'warning']),
});
const StoredDataCheckIssueSchema = DataCheckIssueSchema.extend({ origin: z.literal('data_check') });

const TaggedVersionIssueSchema = z.discriminatedUnion('origin', [
  StoredImportIssueSchema,
  StoredDataCheckIssueSchema,
]);

/** Normalize new raw parser/checker results and older import-only rows. */
export const VersionIssueSchema = z.preprocess((value: unknown) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const issue = value as Record<string, unknown>;
  if (issue.origin === 'data_check' || (issue.origin === undefined && 'kind' in issue)) {
    return { ...issue, origin: 'data_check' };
  }
  if (issue.origin === 'import' || (issue.origin === undefined && 'severity' in issue)) {
    return {
      ...issue,
      origin: 'import',
      level: issue.level ?? issue.severity,
    };
  }
  return value;
}, TaggedVersionIssueSchema);
export type VersionIssue = z.output<typeof VersionIssueSchema>;

export const VersionIssuesSchema = z.array(VersionIssueSchema).superRefine((issues, ctx) => {
  const size = new TextEncoder().encode(JSON.stringify(issues)).byteLength;
  if (size >= MAX_VERSION_ISSUES_BYTES) {
    ctx.addIssue({
      code: 'custom',
      message: `Version issues exceed the ${MAX_VERSION_ISSUES_BYTES.toLocaleString('en')} byte storage limit.`,
    });
  }
});

export const CurriculumVersionSchema = z
  .object({
    id: z.uuid(),
    curriculum_id: z.uuid(),
    /** 1, 2, 3… within the curriculum. */
    number: z.number().int().min(1),
    status: z.enum(VERSION_STATUSES),
    pack: PackSchema,
    derived: VersionDerivedSchema.nullable().default(null),
    issues: VersionIssuesSchema.default([]),
    source: VersionSourceSchema,
    created_at: z.iso.datetime({ offset: true }),
    published_at: z.iso.datetime({ offset: true }).nullable().default(null),
  })
  .superRefine((version, ctx) => {
    if (version.status !== 'draft' && version.published_at === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['published_at'],
        message: `A ${version.status} version must have a published_at time.`,
      });
    }
    if (version.status === 'draft' && version.published_at !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['published_at'],
        message: 'A draft version has not been published, so published_at must be empty.',
      });
    }
    const publishBlocked = version.issues.some((issue) =>
      issue.origin === 'import'
        ? issue.severity === 'error' && issue.effect === 'blocks_import'
        : issue.level === 'error',
    );
    if (version.status !== 'draft' && publishBlocked) {
      ctx.addIssue({
        code: 'custom',
        path: ['issues'],
        message: 'A version with import blockers or error-level data checks cannot be published.',
      });
    }
  });

export type CurriculumVersion = z.infer<typeof CurriculumVersionSchema>;
export type VersionStatus = CurriculumVersion['status'];
export type VersionSource = z.infer<typeof VersionSourceSchema>;
export type VersionDerived = z.infer<typeof VersionDerivedSchema>;
