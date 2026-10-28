import { z } from 'zod';
import { LIMITS, columns, documented } from './fields.js';
import { LibrarySettingSchema, MAX_LIBRARY_SETTINGS } from './library.js';
import { AUDIENCES, PERSONA_IDS, RARITIES, TONES, columnSpec, type TabName } from './spec.js';

// A class's overrides of its curriculum's defaults (ARCHITECTURE.md §2 and §6).
// It holds exactly the pack columns whose spec `edit` is `app` or `both`, except
// the Library tab, which §6 keeps as curriculum data (a class instead lists how it
// uses each shared document, `library`; D11), and Ideas.explanation, whose
// approved text D9 stores per curriculum (ExplanationOverride). Every field is optional:
// absent means "use the curriculum's value". For nullable columns, `null` means
// "this class clears it" (for example, no due date).

function columnsOf(tab: TabName) {
  const lookup = (name: string) => {
    const column = columnSpec(tab, name);
    if (!column) throw new Error(`${tab} has no column ${name} in the spec`);
    return column;
  };
  return { lookup, c: columns(lookup) };
}

const course = columnsOf('Course');
const units = columnsOf('Units');
const ideas = columnsOf('Ideas');
const personas = columnsOf('Personas');

export const CourseOverridesSchema = z.object(
  documented(course.lookup, {
    subject: course.c.text('subject', LIMITS.title).optional(),
    topic: course.c.text('topic', LIMITS.title).optional(),
    grade: course.c.grade('grade').optional(),
    framework: course.c.text('framework', LIMITS.shortText).nullable().optional(),
    map_objective: course.c.text('map_objective', LIMITS.objective).nullable().optional(),
    pass_mark: course.c.percent('pass_mark').optional(),
  }),
);

export const UnitOverrideSchema = z.object(
  documented(units.lookup, {
    unit: z.number().int().min(1).max(9999),
    due_date: units.c.date('due_date').nullable().optional(),
  }),
);

export const IdeaOverrideSchema = z.object(
  documented(ideas.lookup, {
    idea_id: ideas.c.slug('idea_id'),
    rarity: ideas.c.oneOf('rarity', RARITIES).optional(),
  }),
);

export const PersonaOverrideSchema = z.object(
  documented(personas.lookup, {
    persona_id: personas.c.oneOf('persona_id', PERSONA_IDS),
    name: personas.c.text('name', LIMITS.title).optional(),
    role: personas.c.text('role', LIMITS.title).nullable().optional(),
    audience: personas.c.oneOf('audience', AUDIENCES).optional(),
    tone: personas.c.oneOf('tone', TONES).optional(),
    prompt_template: personas.c
      .text('prompt_template', LIMITS.promptTemplate)
      .nullable()
      .optional(),
  }),
);

function uniqueBy<T>(key: (item: T) => string | number, what: string) {
  return (items: readonly T[], ctx: z.core.$RefinementCtx<T[]>) => {
    const seen = new Set<string | number>();
    items.forEach((item, i) => {
      const k = key(item);
      if (seen.has(k)) {
        ctx.addIssue({
          code: 'custom',
          path: [i],
          input: k,
          message: `${what} ${k} has more than one override; keep one.`,
        });
      }
      seen.add(k);
    });
  };
}

// Overrides keyed by unit, idea or persona are lists, not maps, so a key such as
// "__proto__" stays data and never becomes an object property.
export const ClassConfigSchema = z.object({
  course: CourseOverridesSchema.optional(),
  units: z
    .array(UnitOverrideSchema)
    .max(500)
    .superRefine(uniqueBy((u) => u.unit, 'Unit'))
    .optional(),
  ideas: z
    .array(IdeaOverrideSchema)
    .max(5000)
    .superRefine(uniqueBy((i) => i.idea_id, 'Idea'))
    .optional(),
  personas: z
    .array(PersonaOverrideSchema)
    .max(50)
    .superRefine(uniqueBy((p) => p.persona_id, 'Persona'))
    .optional(),
  // D11: how this class uses each shared library document. A document not listed keeps
  // the curriculum's default. Ids must name documents of the class's curriculum; the
  // schema checks their shape, and `unknownLibraryDocs` checks them against the library.
  library: z
    .array(LibrarySettingSchema)
    .max(MAX_LIBRARY_SETTINGS)
    .superRefine(uniqueBy((s) => s.library_doc_id, 'Library document'))
    .optional(),
});

export type ClassConfig = z.infer<typeof ClassConfigSchema>;
export type CourseOverrides = z.infer<typeof CourseOverridesSchema>;
export type UnitOverride = z.infer<typeof UnitOverrideSchema>;
export type IdeaOverride = z.infer<typeof IdeaOverrideSchema>;
export type PersonaOverride = z.infer<typeof PersonaOverrideSchema>;
