// The Curriculum Pack field spec, mirrored from docs/spec/curriculum-pack.fields.json.
// spec.test.ts keeps the two in step; edit the JSON spec first, then this file.

export const TAB_NAMES = [
  'Course',
  'Units',
  'Ideas',
  'Links',
  'Categories',
  'Assessment',
  'Personas',
  'Library',
] as const;
export type TabName = (typeof TAB_NAMES)[number];

/** Key of each tab in a pack as JSON. */
export const TAB_KEYS = {
  Course: 'course',
  Units: 'units',
  Ideas: 'ideas',
  Links: 'links',
  Categories: 'categories',
  Assessment: 'assessment',
  Personas: 'personas',
  Library: 'library',
} as const satisfies Record<TabName, string>;
export type TabKey = (typeof TAB_KEYS)[TabName];

/** sheet: source data only; app: Teacher Settings only; both: the sheet seeds it, a class can override it. */
export type EditedIn = 'sheet' | 'app' | 'both';

export interface ColumnSpec {
  readonly name: string;
  readonly type: string;
  readonly req: boolean;
  readonly edit: EditedIn;
  /** What happens when the value is missing, in the spec's words. */
  readonly missing: string;
  readonly note: string;
}

export interface TabSpec {
  readonly tab: TabName;
  readonly kind: 'keyvalue' | 'rows';
  readonly desc: string;
  readonly cols: readonly ColumnSpec[];
}

const col = (
  name: string,
  type: string,
  req: boolean,
  edit: EditedIn,
  missing: string,
  note = '',
): ColumnSpec => ({ name, type, req, edit, missing, note });

export const PACK_SPEC: readonly TabSpec[] = [
  {
    tab: 'Course',
    kind: 'keyvalue',
    desc: 'One row of key/value pairs that names the map and sets the reading level.',
    cols: [
      col('subject', 'text', true, 'both', 'Blocks import'),
      col('topic', 'text', true, 'both', 'Blocks import', 'Map title shown to students'),
      col(
        'grade',
        'K | 1–12',
        true,
        'both',
        'Blocks import',
        "Sets every persona's {age}, {style} and {length}",
      ),
      col('framework', 'text', false, 'both', 'Custom', 'Labels the standards codes'),
      col('map_objective', 'text', false, 'both', 'Hidden on the map'),
      col('pass_mark', 'percent', false, 'app', '70', 'Quiz and teach-back threshold'),
    ],
  },
  {
    tab: 'Units',
    kind: 'rows',
    desc: 'Groups ideas into missions. Each unit ends in a teach-back with Milo.',
    cols: [
      col('unit', 'integer', true, 'sheet', 'Blocks import'),
      col('name', 'text', true, 'sheet', 'Shows “Unit n”'),
      col('objective', 'text', false, 'sheet', 'Flagged in data checks; Atlas can draft one'),
      col('standard_codes', 'list', false, 'sheet', 'No codes shown'),
      col('due_date', 'date', false, 'both', 'No due date'),
    ],
  },
  {
    tab: 'Ideas',
    kind: 'rows',
    desc: 'One row per node on the map. The most connected idea becomes the centre.',
    cols: [
      col('idea_id', 'slug', true, 'sheet', 'Blocks import', 'Unique, lowercase, no spaces'),
      col('title', 'text', true, 'sheet', 'Blocks import'),
      col('category', 'Categories.category', true, 'sheet', 'Uses first category'),
      col('unit', 'Units.unit', true, 'sheet', 'Blocks import'),
      col('objective', 'text', false, 'sheet', 'Tutor writes one from links'),
      // Decision D9 (ARCHITECTURE.md).
      col(
        'explanation',
        'text',
        false,
        'both',
        'Tutor drafts one from the objective and links; shown to students only after a teacher approves it',
        'Student-facing explanation on the idea page. Also given to Ms. Ivy and Milo as context',
      ),
      col('standard_codes', 'list', false, 'sheet', 'Flagged in data checks'),
      col('requires', 'list of idea_id', false, 'sheet', 'Unlocks from a mastered neighbour'),
      // Decision D41 (ARCHITECTURE.md).
      col(
        'layer',
        'process | mechanism',
        false,
        'sheet',
        'process',
        'Conceptual domains only: process is the surface loop, mechanism is the cause underneath (with NGSS or CCSS standard_codes). Trace-back goes to the mechanism layer',
      ),
      col('media_url', 'url or file', false, 'sheet', 'Placeholder card', 'Video or image'),
      col(
        'rarity',
        'auto | Common | Rare | Legendary',
        false,
        'both',
        'auto',
        'Auto: most connected = Legendary, inner ring = Rare',
      ),
      col('notes', 'text', false, 'sheet', '—', 'Teacher-only; Atlas can read it'),
    ],
  },
  {
    tab: 'Links',
    kind: 'rows',
    desc: 'Directed connections between ideas. Each idea shows its 3 strongest links in and out.',
    cols: [
      col('from_id', 'Ideas.idea_id', true, 'sheet', 'Row skipped'),
      col('to_id', 'Ideas.idea_id', true, 'sheet', 'Row skipped'),
      col('relation', 'short verb phrase', true, 'sheet', 'Row skipped', 'Becomes quiz questions'),
      col('importance', '1–5', false, 'sheet', '3', 'Ranks which links are shown'),
      col('media_url', 'url or file', false, 'sheet', 'Opens the AI tutor'),
    ],
  },
  {
    tab: 'Categories',
    kind: 'rows',
    desc: 'Kinds of idea. Used for card icons, map labels and “what kind of idea is it?” questions.',
    cols: [
      col('category', 'text', true, 'sheet', 'One category “Idea”'),
      col('icon', 'Phosphor icon name', false, 'sheet', 'circle'),
      col('description', 'text', false, 'sheet', 'Quiz skips category questions'),
    ],
  },
  {
    tab: 'Assessment',
    kind: 'rows',
    desc: 'Fixed teach-back questions. Milo asks one per lesson objective.',
    cols: [
      col('unit', 'Units.unit', true, 'sheet', 'Row skipped'),
      col('idea_id', 'Ideas.idea_id', true, 'sheet', 'Row skipped'),
      col(
        'question',
        'text',
        false,
        'sheet',
        'Atlas can draft one; the empty question is never asked',
      ),
      col('key_points', 'list', false, 'sheet', 'Milo checks against the objective'),
    ],
  },
  {
    tab: 'Personas',
    kind: 'rows',
    desc: 'AI prompt templates. Variables in braces are filled from the Course tab.',
    cols: [
      col('persona_id', 'tutor | peer | agent | custom', true, 'both', 'Built-in default'),
      col('name', 'text', false, 'both', 'Built-in default'),
      col('role', 'text', false, 'both', 'Built-in default'),
      col('audience', 'Students | Teachers', false, 'both', 'Students'),
      col('tone', 'warm | calm | playful | socratic', false, 'both', 'warm'),
      col(
        'prompt_template',
        'text with {vars}',
        false,
        'both',
        'Built-in default',
        'Vars: {name} {tone} {subject} {topic} {grade} {age} {peerAge} {style} {length}',
      ),
    ],
  },
  {
    tab: 'Library',
    kind: 'rows',
    desc: 'Documents Atlas indexes for retrieval: unit plans, standards, labs, pacing guides.',
    cols: [
      col('title', 'text', true, 'both', 'File name'),
      col('file_url', 'url or file', true, 'both', 'Row skipped'),
      col('use_for', 'agent | tutor | both', false, 'both', 'agent', 'Who can retrieve it'),
    ],
  },
];

export function tabSpec(tab: TabName): TabSpec {
  const spec = PACK_SPEC.find((t) => t.tab === tab);
  if (!spec) throw new Error(`Unknown tab ${tab}`);
  return spec;
}

export function columnSpec(tab: TabName, column: string): ColumnSpec | undefined {
  return tabSpec(tab).cols.find((c) => c.name === column);
}

/**
 * What a missing or unreadable value does to the import, from the spec's `missing` text:
 * `blocks_import` stops the whole import, `skips_row` drops the row, and `uses_fallback`
 * means the app carries on with the behaviour the spec describes.
 */
export type MissingEffect = 'blocks_import' | 'skips_row' | 'uses_fallback';

export function missingEffect(column: ColumnSpec): MissingEffect {
  if (column.missing === 'Blocks import') return 'blocks_import';
  if (column.missing === 'Row skipped') return 'skips_row';
  return 'uses_fallback';
}

/** D41: `process` is the surface idea, `mechanism` the causal idea beneath it. */
export const LAYERS = ['process', 'mechanism'] as const;
export type Layer = (typeof LAYERS)[number];
export const RARITIES = ['auto', 'Common', 'Rare', 'Legendary'] as const;
export const TONES = ['warm', 'calm', 'playful', 'socratic'] as const;
export const PERSONA_IDS = ['tutor', 'peer', 'agent', 'custom'] as const;
export const AUDIENCES = ['Students', 'Teachers'] as const;
export const USE_FOR = ['agent', 'tutor', 'both'] as const;
export const GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] as const;

/** Variables a persona prompt template may use, from the Personas.prompt_template note. */
export const PROMPT_VARIABLES = [
  'name',
  'tone',
  'subject',
  'topic',
  'grade',
  'age',
  'peerAge',
  'style',
  'length',
] as const;
