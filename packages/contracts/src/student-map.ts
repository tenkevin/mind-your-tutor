import { z } from 'zod';

// What the student app reads to draw a class's map and open an idea (S10). Only what a
// student may see: no notes, data-check issues, unapproved drafts or other students'
// data. Layout comes from the version's stored `derived.layout`; the browser lays
// nothing out again. Lock state is worked out on the server (§8.4).

export const IdeaStateSchema = z.enum(['open', 'locked']);

const NamedIdeaSchema = z.object({ id: z.string(), title: z.string() });

export const StudentMapIdeaSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  unit: z.number().int(),
  /** 0 is the centre, 1 the inner ring, 2 the outer ring (derived.layout). */
  ring: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  /** Position with the ring radius as the unit (derived.layout). */
  x: z.number(),
  y: z.number(),
  state: IdeaStateSchema,
  /** The prerequisite ideas still to master; empty when open. */
  unlocksAfter: z.array(NamedIdeaSchema),
});

export const StudentMapLinkSchema = z.object({
  from: z.string(),
  to: z.string(),
  relation: z.string(),
  importance: z.number().int(),
});

export const StudentMapSchema = z.object({
  versionNumber: z.number().int(),
  subject: z.string(),
  topic: z.string(),
  centre: z.string().nullable(),
  /** Every idea in reading order: the centre, then each ring in turn. */
  ideas: z.array(StudentMapIdeaSchema),
  /** Only kept links; hidden ones are never sent. */
  links: z.array(StudentMapLinkSchema),
  units: z.array(z.object({ unit: z.number().int(), name: z.string() })),
  categories: z.array(z.object({ category: z.string(), icon: z.string().nullable() })),
});

/** GET /api/classes/:classId/map. `map` is null until the teacher publishes (D2). */
export const StudentMapResponseSchema = z.object({
  classId: z.uuid(),
  className: z.string(),
  /** True only for a teacher or admin who asked for a preview; then every idea opens. */
  preview: z.boolean(),
  map: StudentMapSchema.nullable(),
});

const IdeaLinkSchema = z.object({
  id: z.string(),
  title: z.string(),
  relation: z.string(),
});

/** GET /api/classes/:classId/ideas/:ideaId: the read-only idea page. */
export const StudentIdeaResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  unit: z.number().int(),
  unitName: z.string().nullable(),
  objective: z.string().nullable(),
  /** Sheet text, or an AI draft a teacher approved (D9); null while none exists. */
  explanation: z.string().nullable(),
  keyTerms: z.array(z.string()),
  linksIn: z.array(IdeaLinkSchema),
  linksOut: z.array(IdeaLinkSchema),
});

/** The 403 body for a locked idea opened by URL: what unlocks it, as the map card says. */
export const LockedIdeaResponseSchema = z.object({
  error: z.literal('Locked'),
  title: z.string(),
  unlocksAfter: z.array(NamedIdeaSchema),
});

export type IdeaState = z.infer<typeof IdeaStateSchema>;
export type StudentMapIdea = z.infer<typeof StudentMapIdeaSchema>;
export type StudentMapLink = z.infer<typeof StudentMapLinkSchema>;
export type StudentMap = z.infer<typeof StudentMapSchema>;
export type StudentMapResponse = z.infer<typeof StudentMapResponseSchema>;
export type StudentIdeaResponse = z.infer<typeof StudentIdeaResponseSchema>;
