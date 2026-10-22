import { z } from 'zod';
import { LIMITS } from './fields.js';

// Decision D9: an idea's explanation comes from the sheet; when the sheet leaves it
// empty, Ms. Ivy drafts one and a teacher approves (and may edit) it. The approved
// text is stored per curriculum and idea, shared by all its classes, and reused on
// re-import until the sheet supplies its own. Task A6 drafts and stores these;
// F3 only defines the shape.

export const EXPLANATION_SOURCES = ['sheet', 'ai'] as const;

export const ExplanationOverrideSchema = z.object({
  /** The approved, student-facing text. */
  text: z
    .string({ error: 'The explanation must be text.' })
    .trim()
    .min(1, { error: 'The explanation is empty.' })
    .max(LIMITS.explanation, {
      error: (iss) =>
        `The explanation is too long: it can have at most ${LIMITS.explanation.toLocaleString('en')} characters (got ${
          typeof iss.input === 'string' ? iss.input.length.toLocaleString('en') : 'more'
        }).`,
    }),
  /** `sheet` when the teacher approved text from the sheet, `ai` for an approved AI draft. */
  source: z.enum(EXPLANATION_SOURCES, { error: 'source must be sheet or ai.' }),
  /** The id of the teacher who approved it. */
  approvedBy: z.string().min(1).max(200),
  approvedAt: z.iso.datetime({ offset: true }),
});

export type ExplanationOverride = z.infer<typeof ExplanationOverrideSchema>;
export type ExplanationSource = ExplanationOverride['source'];
