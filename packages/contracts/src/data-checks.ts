import { z } from 'zod';
import { TAB_NAMES } from './spec.js';

// Data checks run on a parsed pack, across rows (packages/domain). They are what a
// teacher reviews before publishing (ARCHITECTURE.md §7): errors block publishing,
// warnings and info don't. Per-cell problems found while parsing are `PackIssue`s.

/**
 * Stable names for each check. The UI and Atlas key on these, so never rename one;
 * add a new kind instead.
 */
export const DATA_CHECK_KINDS = [
  /** An idea's `requires` names an idea_id that isn't in Ideas. */
  'prereq',
  /** Prerequisites form a loop. */
  'cycle',
  /** Two or more Ideas rows share an idea_id. */
  'duplicate_id',
  /** An idea's unit isn't in Units. */
  'unknown_unit',
  /** An idea needs, directly or not, an idea that can never unlock. */
  'blocked',
  /** A Links row names an idea_id that isn't in Ideas; the row is skipped. */
  'link_unknown_idea',
  /** An idea's category isn't in Categories; it uses the first category. */
  'unknown_category',
  /** An Assessment row names an idea_id that isn't in Ideas; the row is skipped. */
  'assessment_unknown_idea',
  /** An idea is in no link, so it can only unlock through prerequisites. */
  'no_links',
  /** Ideas have no standard_codes, so they are missing from alignment reports. */
  'codes',
  /** Ideas have no media_url, so they show a placeholder card. */
  'media',
  /** A unit has ideas with no Assessment question. */
  'assessment_coverage',
  /** Ideas have no objective (optional; the tutor writes one from links). */
  'objective',
  /** A unit has no objective; Atlas can draft one for approval. */
  'unit_objective',
  /** An Assessment row has no question; Atlas can draft one for approval. */
  'assessment_question',
  /** The Categories tab has no rows, so every idea uses one category, "Idea". */
  'no_categories',
  /** An Assessment row names a unit that isn't in Units; the row is skipped. */
  'assessment_unknown_unit',
  /** An Assessment row's unit isn't its idea's unit, so it covers neither. */
  'assessment_unit_mismatch',
  /** A mechanism idea requires a process idea; mechanisms should underlie the process. */
  'layer_requires',
] as const;
export type DataCheckKind = (typeof DATA_CHECK_KINDS)[number];

export const DATA_CHECK_LEVELS = ['error', 'warning', 'info'] as const;
export type DataCheckLevel = (typeof DATA_CHECK_LEVELS)[number];

export const DataCheckIssueSchema = z.object({
  kind: z.enum(DATA_CHECK_KINDS),
  level: z.enum(DATA_CHECK_LEVELS),
  /** Plain text for teachers, naming idea titles. Not markup: the UI escapes it. */
  message: z.string(),
  /** The idea_ids or unit numbers the issue is about, in pack order where it applies. */
  items: z.array(z.string()),
  /** Atlas can offer a draft for this issue. */
  draftable: z.boolean().optional(),
  /** Where the teacher fixes it in the source sheet. */
  fix: z.object({
    tab: z.enum(TAB_NAMES),
    /** The column to fix, or the first of `columns`. */
    column: z.string(),
    /** Every column to fix, when there is more than one. */
    columns: z.array(z.string()).optional(),
  }),
});
export type DataCheckIssue = z.infer<typeof DataCheckIssueSchema>;
