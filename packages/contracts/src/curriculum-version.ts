import { z } from 'zod';
import { LayoutSchema, QuizzesSchema, RankedLinksSchema } from './derived.js';
import { ColumnMappingSchema } from './import.js';
import { PackIssueSchema } from './issues.js';
import { PackSchema } from './pack.js';

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
  column_mapping: ColumnMappingSchema.default([]),
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

export const CurriculumVersionSchema = z
  .object({
    id: z.uuid(),
    curriculum_id: z.uuid(),
    /** 1, 2, 3… within the curriculum. */
    number: z.number().int().min(1),
    status: z.enum(VERSION_STATUSES),
    pack: PackSchema,
    derived: VersionDerivedSchema.nullable().default(null),
    issues: z.array(PackIssueSchema).default([]),
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
    if (
      version.status !== 'draft' &&
      version.issues.some((i) => i.severity === 'error' && i.effect === 'blocks_import')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['issues'],
        message: 'A version with problems that block the import cannot be published.',
      });
    }
  });

export type CurriculumVersion = z.infer<typeof CurriculumVersionSchema>;
export type VersionStatus = CurriculumVersion['status'];
export type VersionSource = z.infer<typeof VersionSourceSchema>;
export type VersionDerived = z.infer<typeof VersionDerivedSchema>;
