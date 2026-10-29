import { z } from 'zod';
import { LIMITS } from './fields.js';
import { LAYERS, TAB_NAMES } from './spec.js';
import { VERSION_STATUSES } from './curriculum-version.js';

// Reviewing and publishing a draft (ARCHITECTURE.md §7, task C5): the diff against
// the published version, the preview's audience count (D14), and publishing, which
// moves the pinned version of the chosen classes (D2, D3). Rollback is re-pinning an
// earlier published version. Migrating progress is the tracker's rule (C7), not
// part of publishing.

const IdeaId = z.string().min(1).max(LIMITS.id);

/** A unit by number, with its display name (null when the pack has no such unit). */
export const DiffUnitSchema = z.object({
  unit: z.number().int(),
  name: z.string().max(LIMITS.title).nullable(),
});

/** An idea by id, with its display name. */
export const DiffIdeaRefSchema = z.object({
  idea_id: IdeaId,
  title: z.string().max(LIMITS.title),
});

const DiffIdeaSchema = DiffIdeaRefSchema.extend({ unit: DiffUnitSchema });

/**
 * What changes between two versions of a curriculum (§7 "The diff"). Ideas are
 * matched by `idea_id`, never by title, and every list is in `idea_id` order, so the
 * same content always gives the same JSON, whichever version it was imported as. A
 * change to an idea that is added or removed is part of that entry, not listed again.
 */
export const CurriculumDiffSchema = z.object({
  /** Nothing is published yet, so every idea is listed as added. */
  first_publish: z.boolean(),
  /** True when nothing on the lists below changed. */
  empty: z.boolean(),
  ideas_added: z.array(DiffIdeaSchema),
  ideas_removed: z.array(DiffIdeaSchema),
  /** Same `idea_id`, new title. */
  ideas_renamed: z.array(
    z.object({
      idea_id: IdeaId,
      before: z.string().max(LIMITS.title),
      after: z.string().max(LIMITS.title),
    }),
  ),
  /** `requires` changed. `before` and `after` are the full lists, sorted. */
  prerequisites_changed: z.array(
    DiffIdeaRefSchema.extend({
      before: z.array(IdeaId),
      after: z.array(IdeaId),
      added: z.array(DiffIdeaRefSchema),
      removed: z.array(DiffIdeaRefSchema),
    }),
  ),
  /** The idea moved to another unit. */
  units_changed: z.array(DiffIdeaRefSchema.extend({ from: DiffUnitSchema, to: DiffUnitSchema })),
  /** The idea moved between the process and mechanism layers (D41). */
  layers_changed: z
    .array(DiffIdeaRefSchema.extend({ from: z.enum(LAYERS), to: z.enum(LAYERS) }))
    .default([]),
  /**
   * The idea's accepted Assessment questions changed. `before` and `after` are all of
   * its accepted questions (the ones the data check keeps), sorted by code point, so
   * row order never matters; either is empty when the idea has none. `removed` and
   * `added` are the questions only in `before` and only in `after`: an edited question
   * shows as one removed and one added. `unit` is the idea's unit in the draft.
   */
  assessment_changed: z.array(
    DiffIdeaRefSchema.extend({
      unit: DiffUnitSchema,
      before: z.array(z.string().max(LIMITS.question)),
      after: z.array(z.string().max(LIMITS.question)),
      removed: z.array(z.string().max(LIMITS.question)),
      added: z.array(z.string().max(LIMITS.question)),
    }),
  ),
});
export type CurriculumDiff = z.infer<typeof CurriculumDiffSchema>;
export type DiffUnit = z.infer<typeof DiffUnitSchema>;
export type DiffIdeaRef = z.infer<typeof DiffIdeaRefSchema>;

const VersionNumberSchema = z.object({ id: z.uuid(), number: z.number().int().min(1) });

/** GET /api/versions/:versionId/diff */
export const DiffResponseSchema = z.object({
  /** The published version compared against; null on a first publish. */
  from_version: VersionNumberSchema.nullable(),
  to_version: VersionNumberSchema,
  diff: CurriculumDiffSchema,
});
export type DiffResponse = z.infer<typeof DiffResponseSchema>;

/** Most classes in one publish. */
export const MAX_PUBLISH_CLASSES = 200;

export const ClassIdsSchema = z
  .array(z.uuid())
  .max(MAX_PUBLISH_CLASSES)
  .refine((ids) => new Set(ids).size === ids.length, 'List each class once.');

/** POST /api/versions/:versionId/preview */
export const PublishPreviewRequestSchema = z.object({ class_ids: ClassIdsSchema });

/** POST /api/versions/:versionId/publish; at least one class. */
export const PublishRequestSchema = z.object({ class_ids: ClassIdsSchema.min(1) });

/** POST /api/classes/:classId/pin: re-pin an earlier published version (rollback, §7). */
export const RepinRequestSchema = z.object({ version_id: z.uuid() });

/** Something that blocks publishing, and where in the sheet to fix it (C2 `fix`). */
export const BlockingIssueSchema = z.object({
  message: z.string().max(2000),
  tab: z.enum(TAB_NAMES).nullable(),
  column: z.string().max(100).nullable(),
  row: z.number().int().min(1).nullable(),
  /** The idea_ids or unit numbers it is about. */
  items: z.array(z.string()),
});
export type BlockingIssue = z.infer<typeof BlockingIssueSchema>;

/**
 * "Students receiving this update" (D14): unique students enrolled in the selected
 * classes, each counted once, whether or not their progress changes. It is the
 * audience for the new content; a count of students whose progress changes would be
 * a separate, separately named figure.
 */
export const StudentsReceivingSchema = z.object({
  label: z.literal('Students receiving this update'),
  count: z.number().int().min(0),
  class_ids: z.array(z.uuid()),
});
export type StudentsReceiving = z.infer<typeof StudentsReceivingSchema>;

export const STUDENTS_RECEIVING_LABEL = 'Students receiving this update' as const;

const VersionRefSchema = z.object({
  id: z.uuid(),
  number: z.number().int().min(1),
  status: z.enum(VERSION_STATUSES),
  published_at: z.iso.datetime({ offset: true }).nullable(),
});

/** What the teacher reviews before publishing. */
export const PublishPreviewSchema = z.object({
  version: VersionRefSchema,
  /** The published version the diff is against; null on a first publish. */
  from_version: VersionNumberSchema.nullable(),
  diff: CurriculumDiffSchema,
  can_publish: z.boolean(),
  blocking: z.array(BlockingIssueSchema),
  students_receiving_this_update: StudentsReceivingSchema,
});
export type PublishPreview = z.infer<typeof PublishPreviewSchema>;

/** A class's pin before and after a publish or a re-pin. */
export const PinMoveSchema = z.object({
  class_id: z.uuid(),
  from_version_id: z.uuid().nullable(),
  to_version_id: z.uuid(),
});
export type PinMove = z.infer<typeof PinMoveSchema>;

export const PublishResultSchema = z.object({
  version: VersionRefSchema,
  /** In class id order. */
  classes: z.array(PinMoveSchema),
  students_receiving_this_update: StudentsReceivingSchema,
});
export type PublishResult = z.infer<typeof PublishResultSchema>;

export const RepinResultSchema = z.object({
  version: VersionRefSchema,
  class: PinMoveSchema,
});
export type RepinResult = z.infer<typeof RepinResultSchema>;
