import { z } from 'zod';
import { LIMITS } from './fields.js';

// Drafts to approve (ARCHITECTURE.md D9, D12, §11; task A6). When an import leaves an
// idea's explanation, a unit's objective or an assessment row's question empty, the AI
// drafts one. A draft is staff-only until a teacher approves it (and may edit it); only
// approved text reaches students. Approvals are stored per curriculum, keyed by the
// row's own identity, so they survive re-import and are shared by all its classes.

export const DRAFT_KINDS = ['idea_explanation', 'unit_objective', 'assessment_question'] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export const DRAFT_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

/** The pack tab each kind of draft belongs to (the queue is grouped by it). */
export const DRAFT_TABS = {
  idea_explanation: 'Ideas',
  unit_objective: 'Units',
  assessment_question: 'Assessment',
} as const satisfies Record<DraftKind, string>;

/** The longest text a draft may have, by kind: the same limit as the sheet's own cell. */
export const DRAFT_MAX = {
  idea_explanation: LIMITS.explanation,
  unit_objective: LIMITS.objective,
  assessment_question: LIMITS.question,
} as const satisfies Record<DraftKind, number>;

/** The row a draft is for: an idea_id, a unit number, or `<unit>:<idea_id>`. */
export function draftKey(kind: DraftKind, row: { idea_id?: string; unit?: number }): string {
  if (kind === 'idea_explanation') return row.idea_id!;
  if (kind === 'unit_objective') return String(row.unit!);
  return `${row.unit!}:${row.idea_id!}`;
}

/** Queue payload: ids only, and the organization, as for the other jobs. */
export const DraftJobPayloadSchema = z.object({
  org_id: z.uuid(),
  curriculum_id: z.uuid(),
  version_id: z.uuid(),
});
export type DraftJobPayload = z.infer<typeof DraftJobPayloadSchema>;

export const DraftItemSchema = z.object({
  id: z.uuid(),
  kind: z.enum(DRAFT_KINDS),
  tab: z.enum(['Ideas', 'Units', 'Assessment']),
  key: z.string(),
  status: z.enum(DRAFT_STATUSES),
  /** The AI's draft. */
  draft: z.string(),
  /** What students see: set once approved (the draft as written, or the teacher's edit). */
  approved: z.string().nullable(),
  /** The row's context beside the draft, so a teacher can judge it. */
  context: z.object({
    title: z.string(),
    detail: z.array(z.object({ label: z.string(), value: z.string() })),
  }),
});
export type DraftItem = z.infer<typeof DraftItemSchema>;

export const DraftListSchema = z.object({
  items: z.array(DraftItemSchema),
  /** Rows still empty in the sheet with no draft yet (drafting is queued or running). */
  waiting: z.number().int().nonnegative(),
});
export type DraftList = z.infer<typeof DraftListSchema>;

export const ApproveDraftRequestSchema = z.object({
  /** The teacher's edit; left out, the draft is approved as written. */
  text: z.string().trim().min(1).max(LIMITS.explanation).optional(),
});
export type ApproveDraftRequest = z.infer<typeof ApproveDraftRequestSchema>;

/** What a student may read of a class's curriculum text: sheet values, else approved text. */
export const ClassContentSchema = z.object({
  version_id: z.uuid(),
  ideas: z.array(z.object({ idea_id: z.string(), explanation: z.string().nullable() })),
  units: z.array(z.object({ unit: z.number().int(), objective: z.string().nullable() })),
  assessment: z.array(
    z.object({ unit: z.number().int(), idea_id: z.string(), question: z.string().nullable() }),
  ),
});
export type ClassContent = z.infer<typeof ClassContentSchema>;
