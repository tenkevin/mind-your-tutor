import { z } from 'zod';
import { LIMITS, columns, documented, normalizeRow } from './fields.js';
import {
  AUDIENCES,
  LAYERS,
  PERSONA_IDS,
  RARITIES,
  TONES,
  USE_FOR,
  columnSpec,
  type ColumnSpec,
  type TabName,
} from './spec.js';

// One schema per Curriculum Pack tab (docs/spec/curriculum-pack.fields.json).
//
// `<Tab>Schema` validates a row that is already in pack shape (a pack as JSON).
// `<Tab>RowSchema` accepts a raw row from CSV, XLSX or JSON: it trims text, turns
// empty cells into defaults, reads numbers and splits lists, then applies `<Tab>Schema`.
// Checks that need the whole pack (unknown ids, loops, duplicates) belong to C2.

function lookupIn(tab: TabName) {
  return (name: string): ColumnSpec => {
    const column = columnSpec(tab, name);
    if (!column) throw new Error(`${tab} has no column ${name} in the spec`);
    return column;
  };
}

function rowError(tab: TabName) {
  if (tab === 'Course') {
    return (iss: { input?: unknown }) =>
      iss.input === undefined || iss.input === null
        ? "The Course tab is missing. The import can't go ahead without it."
        : 'The Course tab must be a set of keys and values.';
  }
  return (iss: { input?: unknown }) =>
    iss.input === undefined || iss.input === null
      ? `This ${tab} row is empty.`
      : `This ${tab} row isn't a row of named columns.`;
}

function tab<T extends z.ZodRawShape>(name: TabName, build: (c: ReturnType<typeof columns>) => T) {
  const lookup = lookupIn(name);
  const c = columns(lookup);
  const schema = z.object(documented(lookup, build(c)), { error: rowError(name) });
  const row = z.preprocess((input) => normalizeRow(c.cells, input), schema);
  return { schema, row };
}

const course = tab('Course', (c) => ({
  subject: c.text('subject', LIMITS.title),
  topic: c.text('topic', LIMITS.title),
  grade: c.grade('grade'),
  framework: c.text('framework', LIMITS.shortText).nullable().default(null),
  map_objective: c.text('map_objective', LIMITS.objective).nullable().default(null),
  pass_mark: c.percent('pass_mark').default(70),
}));
export const CourseSchema = course.schema;
export const CourseRowSchema = course.row;

const units = tab('Units', (c) => ({
  unit: c.integer('unit'),
  name: c.text('name', LIMITS.title),
  objective: c.text('objective', LIMITS.objective).nullable().default(null),
  standard_codes: c.list('standard_codes', LIMITS.code).default([]),
  due_date: c.date('due_date').nullable().default(null),
}));
export const UnitSchema = units.schema;
export const UnitRowSchema = units.row;

const ideas = tab('Ideas', (c) => ({
  idea_id: c.slug('idea_id'),
  title: c.text('title', LIMITS.title),
  category: c.text('category', LIMITS.shortText),
  unit: c.integer('unit'),
  objective: c.text('objective', LIMITS.objective).nullable().default(null),
  explanation: c.text('explanation', LIMITS.explanation).nullable().default(null),
  standard_codes: c.list('standard_codes', LIMITS.code).default([]),
  requires: c.slugList('requires').default([]),
  layer: c.oneOf('layer', LAYERS).default('process'),
  media_url: c.url('media_url').nullable().default(null),
  rarity: c.oneOf('rarity', RARITIES).default('auto'),
  notes: c.text('notes', LIMITS.longText).nullable().default(null),
}));
export const IdeaSchema = ideas.schema;
export const IdeaRowSchema = ideas.row;

const links = tab('Links', (c) => ({
  from_id: c.slug('from_id'),
  to_id: c.slug('to_id'),
  relation: c.text('relation', LIMITS.title),
  importance: c.importance('importance').default(3),
  media_url: c.url('media_url').nullable().default(null),
}));
export const LinkSchema = links.schema;
export const LinkRowSchema = links.row;

const categories = tab('Categories', (c) => ({
  category: c.text('category', LIMITS.shortText),
  icon: c.slug('icon').nullable().default(null),
  description: c.text('description', LIMITS.description).nullable().default(null),
}));
export const CategorySchema = categories.schema;
export const CategoryRowSchema = categories.row;

const assessment = tab('Assessment', (c) => ({
  unit: c.integer('unit'),
  idea_id: c.slug('idea_id'),
  question: c.text('question', LIMITS.question).nullable().default(null),
  key_points: c.list('key_points', LIMITS.keyPoint).default([]),
}));
export const AssessmentItemSchema = assessment.schema;
export const AssessmentItemRowSchema = assessment.row;

const personas = tab('Personas', (c) => ({
  persona_id: c.oneOf('persona_id', PERSONA_IDS),
  name: c.text('name', LIMITS.title).nullable().default(null),
  role: c.text('role', LIMITS.title).nullable().default(null),
  audience: c.oneOf('audience', AUDIENCES).default('Students'),
  tone: c.oneOf('tone', TONES).default('warm'),
  prompt_template: c.text('prompt_template', LIMITS.promptTemplate).nullable().default(null),
}));
export const PersonaSchema = personas.schema;
export const PersonaRowSchema = personas.row;

const library = tab('Library', (c) => ({
  title: c.text('title', LIMITS.title),
  file_url: c.url('file_url'),
  use_for: c.oneOf('use_for', USE_FOR).default('agent'),
}));
export const LibraryDocSchema = library.schema;
export const LibraryDocRowSchema = library.row;

/** Row schemas by tab, accepting raw CSV, XLSX or JSON rows. */
export const TAB_ROW_SCHEMAS = {
  Course: CourseRowSchema,
  Units: UnitRowSchema,
  Ideas: IdeaRowSchema,
  Links: LinkRowSchema,
  Categories: CategoryRowSchema,
  Assessment: AssessmentItemRowSchema,
  Personas: PersonaRowSchema,
  Library: LibraryDocRowSchema,
} as const satisfies Record<TabName, z.ZodType>;

/** Strict schemas by tab, for values already in pack shape. */
export const TAB_SCHEMAS = {
  Course: CourseSchema,
  Units: UnitSchema,
  Ideas: IdeaSchema,
  Links: LinkSchema,
  Categories: CategorySchema,
  Assessment: AssessmentItemSchema,
  Personas: PersonaSchema,
  Library: LibraryDocSchema,
} as const satisfies Record<TabName, z.ZodType>;

/** Upper bounds on rows per tab, well above any real course, to keep imports bounded. */
export const MAX_ROWS = {
  Units: 500,
  Ideas: 5000,
  Links: 20000,
  Categories: 200,
  Assessment: 10000,
  Personas: 50,
  Library: 2000,
} as const satisfies Record<Exclude<TabName, 'Course'>, number>;

function rows<T extends z.ZodType>(name: Exclude<TabName, 'Course'>, row: T) {
  return z
    .array(row, {
      error: (iss) =>
        iss.input === undefined || iss.input === null
          ? `The ${name} tab is missing. The import can't go ahead without it.`
          : `The ${name} tab must be a list of rows.`,
    })
    .max(MAX_ROWS[name], {
      error: () => `The ${name} tab can have at most ${MAX_ROWS[name].toLocaleString('en')} rows.`,
    });
}

function packSchema<S extends z.ZodRawShape>(tabs: S) {
  return z.object(
    { version: z.literal(1, { error: () => 'version must be 1.' }), ...tabs },
    { error: () => 'A curriculum pack must be a set of named tabs.' },
  );
}

/** A whole pack. Accepts raw rows (as `<Tab>RowSchema` does) in every tab. */
export const PackSchema = packSchema({
  course: CourseRowSchema,
  units: rows('Units', UnitRowSchema),
  ideas: rows('Ideas', IdeaRowSchema),
  links: rows('Links', LinkRowSchema),
  categories: rows('Categories', CategoryRowSchema).default([]),
  assessment: rows('Assessment', AssessmentItemRowSchema).default([]),
  personas: rows('Personas', PersonaRowSchema).default([]),
  library: rows('Library', LibraryDocRowSchema).default([]),
});

/** A whole pack already in pack shape; the source for the generated JSON Schema. */
export const PackStrictSchema = packSchema({
  course: CourseSchema,
  units: rows('Units', UnitSchema),
  ideas: rows('Ideas', IdeaSchema),
  links: rows('Links', LinkSchema),
  categories: rows('Categories', CategorySchema).default([]),
  assessment: rows('Assessment', AssessmentItemSchema).default([]),
  personas: rows('Personas', PersonaSchema).default([]),
  library: rows('Library', LibraryDocSchema).default([]),
});

export type Course = z.infer<typeof CourseSchema>;
export type Unit = z.infer<typeof UnitSchema>;
export type Idea = z.infer<typeof IdeaSchema>;
export type Link = z.infer<typeof LinkSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type AssessmentItem = z.infer<typeof AssessmentItemSchema>;
export type Persona = z.infer<typeof PersonaSchema>;
export type LibraryDoc = z.infer<typeof LibraryDocSchema>;
export type Pack = z.infer<typeof PackSchema>;
/** A pack as it may be written in JSON, with defaults left out. */
export type PackInput = z.input<typeof PackStrictSchema>;
export type Rarity = Idea['rarity'];
export type Tone = Persona['tone'];
export type PersonaId = Persona['persona_id'];
export type Audience = Persona['audience'];
export type UseFor = LibraryDoc['use_for'];
export type Grade = Course['grade'];
