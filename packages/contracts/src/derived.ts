import { z } from 'zod';
import { LIMITS } from './fields.js';

// What `derive()` in packages/domain (task C3) works out from a pack: which links the
// map shows, where each idea sits, and a quiz bank per idea (ARCHITECTURE.md §7).
// C4 stores it on the draft version. Generation may vary with its seed (D6), so the
// seed is stored with the result and the result is what students see.

const ideaId = z.string().min(1).max(LIMITS.id);

/** Why a pack link is not drawn on the map. */
export const HIDDEN_LINK_REASONS = [
  /** Its from idea already has the most outgoing links the map allows. */
  'too_many_out',
  /** Its to idea already has the most incoming links the map allows. */
  'too_many_in',
  /** An earlier row links the same two ideas in the same direction. */
  'duplicate',
  /** It links an idea to itself. */
  'self_link',
  /** Its from_id or to_id is not an idea in the pack. */
  'unknown_idea',
] as const;

export const DerivedLinkSchema = z.object({
  from_id: ideaId,
  to_id: ideaId,
  relation: z.string().min(1).max(LIMITS.title),
  importance: z.number().int().min(1).max(5),
  media_url: z.string().nullable(),
  /** Position of the link in the pack's Links tab, from 0. */
  row: z.number().int().min(0),
});

export const HiddenLinkSchema = DerivedLinkSchema.extend({
  reason: z.enum(HIDDEN_LINK_REASONS),
});

export const RankedLinksSchema = z.object({
  /** The most kept links an idea may have in each direction. */
  max_links: z.number().int().min(1),
  /** Links drawn on the map, strongest first (importance, then row order). */
  kept: z.array(DerivedLinkSchema),
  hidden: z.array(HiddenLinkSchema),
});

export const IdeaPositionSchema = z.object({
  idea_id: ideaId,
  /** 0 is the centre, 1 the inner ring, 2 the outer ring. */
  ring: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  /** Radians, clockwise from the right with y pointing down; null for the centre. */
  angle: z.number().nullable(),
  /** Cartesian position with ring radius as the unit: ring 1 at distance 1, ring 2 at 2. */
  x: z.number(),
  y: z.number(),
});

export const LayoutSchema = z.object({
  /** The centre idea; null only when the pack has no ideas. */
  centre: ideaId.nullable(),
  /** Every idea, most kept links first (ties: higher importance sum, then row order). */
  rank: z.array(ideaId),
  /** One per idea, in rank order. */
  positions: z.array(IdeaPositionSchema),
});

export const QUESTION_KINDS = ['complete_link', 'true_false', 'category'] as const;

export const QuizQuestionSchema = z
  .object({
    /** Stable within the bank, for tracker events. */
    id: z.string().min(1).max(300),
    kind: z.enum(QUESTION_KINDS),
    prompt: z.string().min(1),
    text: z.string().min(1),
    options: z.array(z.string().min(1)).min(2),
    answer: z.string().min(1),
    /** States the true link (or category) from the map. */
    explanation: z.string().min(1),
    /** The kept link the question tests; null for category questions. */
    link: z.object({ from_id: ideaId, to_id: ideaId }).nullable(),
  })
  .superRefine((q, ctx) => {
    if (q.options.filter((o) => o === q.answer).length !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'The answer must appear exactly once among the options.',
      });
    }
    if (new Set(q.options).size !== q.options.length) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Options must be different.' });
    }
  });

export const QuizBankSchema = z.object({
  idea_id: ideaId,
  questions: z.array(QuizQuestionSchema),
  /**
   * True when the bank has fewer questions than the quiz length, for example an idea
   * with no kept links. Data checks and the teacher's review can show it.
   */
  short: z.boolean(),
});

export const QuizzesSchema = z.object({
  /** The seed the banks were generated with (D6). */
  seed: z.number().int(),
  /** Questions in one attempt; each bank aims for at least this many. */
  quiz_length: z.number().int().min(1),
  /** One per idea, in pack order. */
  banks: z.array(QuizBankSchema),
});

export type HiddenLinkReason = (typeof HIDDEN_LINK_REASONS)[number];
export type DerivedLink = z.infer<typeof DerivedLinkSchema>;
export type HiddenLink = z.infer<typeof HiddenLinkSchema>;
export type RankedLinks = z.infer<typeof RankedLinksSchema>;
export type IdeaPosition = z.infer<typeof IdeaPositionSchema>;
export type Layout = z.infer<typeof LayoutSchema>;
export type QuestionKind = (typeof QUESTION_KINDS)[number];
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;
export type QuizBank = z.infer<typeof QuizBankSchema>;
export type Quizzes = z.infer<typeof QuizzesSchema>;
