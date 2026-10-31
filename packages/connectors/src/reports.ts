import {
  PACK_SPEC,
  PIPE_LIST_COLUMNS,
  TAB_KEYS,
  type AssessmentItem,
  type DataCheckIssue,
  type DataCheckLevel,
  type Pack,
  type TabSpec,
} from '@ideamap/contracts';
import {
  ExportRefused,
  MAX_CELL_TEXT,
  type ExportCell,
  type ExportPayload,
  type ExportSheet,
} from './export.js';

// The reports a teacher downloads (ARCHITECTURE.md §7): the blank or sample
// template workbook, a pack as a workbook, the data-check report, the standards
// alignment report and Atlas-drafted Assessment rows. Each is built from
// curriculum data only; nothing here reads students, progress or transcripts.

export interface ReportOptions {
  /** The date in the file name, as YYYY-MM-DD. Defaults to today (UTC). */
  date?: string;
}

const today = () => new Date().toISOString().slice(0, 10);

function dateOf(options: ReportOptions): string {
  const date = options.date ?? today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`date must be YYYY-MM-DD, not ${date}`);
  return date;
}

/** "The water cycle" → "water-cycle": lowercase letters, digits and hyphens only. */
export function fileSlug(text: string | null | undefined, fallback = 'curriculum'): string {
  const slug = (text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(the|a|an)-(?=.)/, '')
    .slice(0, 48)
    .replace(/-+$/, '');
  return slug || fallback;
}

const stem = (topic: string | null | undefined, report: string, options: ReportOptions) =>
  `${fileSlug(topic)}-${report}-${dateOf(options)}`;

const specOf = (tab: TabSpec['tab']) => PACK_SPEC.find((t) => t.tab === tab)!;
const widthOf = (name: string) => Math.min(60, Math.max(12, name.length + 4));

// ---- Template and pack workbooks --------------------------------------------

/**
 * The prototype's sample rows (`templateCSV(tab, true)` in project/curriculum-pack.js),
 * by column name. `Ideas.explanation` is newer than the prototype (decision D9); its
 * sample is the spec's example.
 */
const SAMPLES: Record<TabSpec['tab'], Record<string, string>[]> = {
  Course: [
    {
      subject: 'Science',
      topic: 'The water cycle',
      grade: '6',
      framework: 'NGSS',
      map_objective:
        'Explain how water moves around the Earth in a never-ending cycle, and what powers it.',
      pass_mark: '70',
    },
  ],
  Units: [
    {
      unit: '1',
      name: 'Water goes up',
      objective: 'Describe how heat from the Sun turns liquid water into water vapour.',
      standard_codes: 'MS-ESS2-4, MS-PS1-4',
      due_date: '2026-10-30',
    },
  ],
  Ideas: [
    {
      idea_id: 'evap',
      title: 'Evaporation',
      category: 'Process',
      unit: '1',
      objective: 'Explain how heat turns liquid water into vapour.',
      explanation:
        'When the Sun warms water in oceans, lakes and puddles, some of it turns into an invisible gas and rises into the air.',
      standard_codes: 'MS-ESS2-4, MS-PS1-4',
      requires: '',
      media_url: 'evaporation.mp4',
      rarity: 'auto',
      notes: '',
    },
  ],
  Links: [
    { from_id: 'sun', to_id: 'evap', relation: 'heats water for', importance: '5', media_url: '' },
    {
      from_id: 'evap',
      to_id: 'vap',
      relation: 'turns liquid into',
      importance: '5',
      media_url: '',
    },
  ],
  Categories: [
    {
      category: 'Process',
      icon: 'arrows-clockwise',
      description: 'Something that happens or changes',
    },
  ],
  Assessment: [
    {
      unit: '1',
      idea_id: 'evap',
      question: 'Why does a puddle disappear on a sunny day?',
      key_points: 'heat, liquid to gas, vapour rises',
    },
  ],
  Personas: [
    {
      persona_id: 'tutor',
      name: 'Ms. Ivy',
      role: 'AI tutor',
      audience: 'Students',
      tone: 'warm',
      prompt_template:
        'You are {name}, a {tone} {subject} tutor for {grade} students (ages {age}) studying "{topic}". {style} Answer in {length}.',
    },
  ],
  Library: [{ title: 'Water cycle unit plan', file_url: 'unit-plan.pdf', use_for: 'agent' }],
  // The spec's example row (docs/spec), which is the prototype's Practice sample plus the
  // D40 source columns. The source is an example, not a real item.
  Practice: [
    {
      exercise_id: 'v4',
      idea_id: 'vel',
      group: 'Velocity as a rate of change',
      standard_code: 'HSF-IF.B.6',
      exercise_title: 'Velocity from position–time graphs',
      kind: 'exercise',
      quiz_from: '',
      problem_type: 'number',
      question: 'What is the velocity of this object?',
      choices: '',
      answer: '-5',
      answer_unit: 'm/s',
      explanation: 'Slope = (0 − 30) ÷ 6 = −5 m/s.',
      visual: 'graph: 0,30; 6,0',
      media_url: '',
      demo_video_url: 'v4-worked-example.mp4',
      demo_steps:
        'Velocity is the slope of a position–time graph | Rise 20 m, run 4 s | 20 ÷ 4 | 5 m/s',
      source_bank_id: 'OpenStax',
      license_type: 'CC-BY-4.0',
      attribution_string: 'Example Authors, Example Book, OpenStax, CC BY 4.0',
    },
  ],
};

/**
 * A pack value as a sheet cell: lists joined with ", ", empty as blank. The importer
 * splits list cells on commas and semicolons, so an item holding either would come
 * back as two; that export is refused, naming the cell, rather than changed.
 */
function packCell(
  value: unknown,
  at: () => { sheet: string; row: number; column: string },
  separator: ',' | '|' = ',',
): ExportCell {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    const items = value.map(String);
    // Pipe lists (Practice choices and steps) may hold commas; only a pipe would split them.
    const bad = items.find((item) => (separator === '|' ? /\|/ : /[,;]/).test(item));
    if (bad !== undefined) {
      const where = at();
      throw new ExportRefused(
        separator === '|'
          ? `${where.sheet}, row ${where.row}, ${where.column}: the item "${bad}" has a | (vertical bar), ` +
              `which separates items in this list, so it would come back as more than one item. ` +
              `The export stopped; reword that item without it, then export again.`
          : `${where.sheet}, row ${where.row}, ${where.column}: the item "${bad}" has a comma or semicolon, ` +
              `which separate items in a spreadsheet list, so it would come back as more than one item. ` +
              `The export stopped; reword that item without them, then export again.`,
        where,
      );
    }
    return items.join(separator === '|' ? ' | ' : ', ');
  }
  if (typeof value === 'number') return value;
  return String(value as string);
}

/**
 * The blank template's Course values. Subject, topic and grade are required, so the
 * template carries the spec's examples, marked in the Read me, and imports as it is.
 */
const BLANK_COURSE: Record<string, string> = Object.fromEntries(
  ['subject', 'topic', 'grade'].map((name) => [name, SAMPLES.Course[0]![name]!]),
);

/** One tab as a sheet with exactly the spec's columns, in spec order. */
function tabSheet(spec: TabSpec, rows: readonly Record<string, unknown>[]): ExportSheet {
  if (spec.kind === 'keyvalue') {
    const [row] = rows;
    return {
      name: spec.tab,
      header: ['key', 'value'],
      rows: spec.cols.map((c, i) => [
        c.name,
        packCell(row?.[c.name], () => ({ sheet: spec.tab, row: i + 2, column: c.name })),
      ]),
      widths: [16, 60],
    };
  }
  return {
    name: spec.tab,
    header: spec.cols.map((c) => c.name),
    rows: rows.map((row, r) =>
      spec.cols.map((c) =>
        packCell(
          row[c.name],
          () => ({ sheet: spec.tab, row: r + 2, column: c.name }),
          PIPE_LIST_COLUMNS[spec.tab]?.includes(c.name) ? '|' : ',',
        ),
      ),
    ),
    widths: spec.cols.map((c) => widthOf(c.name)),
  };
}

const EDITED_IN = { sheet: 'Spreadsheet', app: 'Teacher Settings', both: 'Both' } as const;

/** The "Read me" sheet: every column's type, whether it's required and what happens when it's missing. */
function readMeSheet(): ExportSheet {
  return {
    name: 'Read me',
    header: ['Tab', 'Column', 'Type', 'Required', 'If missing', 'Edited in', 'Notes'],
    rows: PACK_SPEC.flatMap((spec) => [
      [spec.tab, null, null, null, null, null, spec.desc],
      ...spec.cols.map((c) => [
        spec.tab,
        c.name,
        c.type,
        c.req ? 'Yes' : 'No',
        c.missing,
        EDITED_IN[c.edit],
        [
          c.note,
          spec.tab === 'Course' && c.name in BLANK_COURSE
            ? `The blank template has the example "${BLANK_COURSE[c.name]}" here; replace it.`
            : '',
        ]
          .filter(Boolean)
          .join(' ') || null,
      ]),
    ]),
    widths: [12, 18, 30, 10, 40, 18, 60],
  };
}

/**
 * The Curriculum Pack template: a "Read me" sheet, then the nine tabs with the
 * spec's columns. `sample` fills each tab with the prototype's sample rows; the blank
 * template has only the required Course values, as examples.
 */
export function templateReport(options: ReportOptions & { sample?: boolean } = {}): ExportPayload {
  const sample = options.sample ?? false;
  return {
    report: 'template',
    fileStem: `curriculum-pack-template${sample ? '-sample' : ''}-${dateOf(options)}`,
    sheets: [
      readMeSheet(),
      ...PACK_SPEC.map((spec) =>
        tabSheet(spec, sample ? SAMPLES[spec.tab] : spec.tab === 'Course' ? [BLANK_COURSE] : []),
      ),
    ],
  };
}

/** A parsed pack as the nine tabs, ready to edit and import again. */
export function packReport(pack: Pack, options: ReportOptions = {}): ExportPayload {
  return {
    report: 'pack',
    fileStem: stem(pack.course.topic, 'pack', options),
    sheets: PACK_SPEC.map((spec) => {
      const value = pack[TAB_KEYS[spec.tab]] as unknown;
      const rows = (Array.isArray(value) ? value : [value]) as Record<string, unknown>[];
      return tabSheet(spec, rows);
    }),
  };
}

// ---- Data-check report ------------------------------------------------------

const LEVEL_ORDER: Record<DataCheckLevel, number> = { error: 0, warning: 1, info: 2 };
const LEVEL_NAME: Record<DataCheckLevel, string> = {
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};

/** The part of a pack the reports name things from. */
export type ReportPack = Pick<Pack, 'course' | 'units' | 'ideas'>;

function namer(pack: ReportPack) {
  const ideas = new Map<string, string>();
  for (const idea of pack.ideas) if (!ideas.has(idea.idea_id)) ideas.set(idea.idea_id, idea.title);
  const units = new Map<number, string>();
  for (const unit of pack.units) if (!units.has(unit.unit)) units.set(unit.unit, unit.name);
  return {
    idea: (id: string) => ideas.get(id) ?? id,
    unit: (n: number) => (units.has(n) ? `Unit ${n}: ${units.get(n)}` : `Unit ${n}`),
  };
}

/** Room left in a cell for the joined list; the rest of the limit is headroom. */
const LIST_BUDGET = MAX_CELL_TEXT - 767;

/**
 * Joins a list into cells for several columns at once (titles and ids, say), starting
 * a new group before any cell would pass the spreadsheet limit, so nothing is cut.
 */
function joinInGroups<T>(
  items: readonly T[],
  columns: readonly { text: (item: T) => string; sep: string }[],
): string[][] {
  const groups: string[][] = [];
  let current: string[] | null = null;
  for (const item of items) {
    const texts = columns.map((c) => c.text(item));
    const fits =
      current !== null &&
      texts.every((t, i) => current![i]!.length + columns[i]!.sep.length + t.length <= LIST_BUDGET);
    if (current !== null && fits) {
      current = current.map((joined, i) => joined + columns[i]!.sep + texts[i]);
      groups[groups.length - 1] = current;
    } else {
      current = texts;
      groups.push(current);
    }
  }
  return groups;
}

/**
 * One report row, with its lists continued on the rows below when they don't fit in
 * one cell. `first` fills the row's other cells; continuation rows repeat `repeat`.
 */
function rowsWithLists(
  first: readonly ExportCell[],
  repeat: readonly ExportCell[],
  lists: readonly { at: number; groups: string[][] }[],
): ExportCell[][] {
  const count = Math.max(1, ...lists.map((l) => l.groups.length));
  return Array.from({ length: count }, (_, n) => {
    const row = [...(n === 0 ? first : repeat)];
    for (const list of lists) {
      const group = list.groups[n];
      group?.forEach((text, i) => (row[list.at + i] = text || null));
    }
    return row;
  });
}

/**
 * The data-check report: one row per issue, errors first, then warnings, then info,
 * with the ideas affected by title and the tab and column to fix. A long list of
 * ideas continues on the rows below, marked "(continued)".
 */
export function dataCheckReport(
  pack: ReportPack,
  issues: readonly DataCheckIssue[],
  options: ReportOptions = {},
): ExportPayload {
  const name = namer(pack);
  const sorted = issues
    .map((issue, i) => ({ issue, i }))
    .sort((a, b) => LEVEL_ORDER[a.issue.level] - LEVEL_ORDER[b.issue.level] || a.i - b.i)
    .map(({ issue }) => issue);
  return {
    report: 'data-checks',
    fileStem: stem(pack.course.topic, 'data-checks', options),
    sheets: [
      {
        name: 'Data checks',
        header: [
          'Level',
          'Check',
          'Message',
          'Ideas affected',
          'Ids',
          'Tab to fix',
          'Column to fix',
        ],
        rows: sorted.flatMap((issue) => {
          const units = issue.fix.tab === 'Units';
          const fix = [issue.fix.tab, (issue.fix.columns ?? [issue.fix.column]).join(', ')];
          return rowsWithLists(
            [LEVEL_NAME[issue.level], issue.kind, issue.message, null, null, ...fix],
            [LEVEL_NAME[issue.level], issue.kind, '(continued)', null, null, ...fix],
            [
              {
                at: 3,
                groups: joinInGroups(issue.items, [
                  {
                    text: (item) =>
                      units && /^\d+$/.test(item) ? name.unit(Number(item)) : name.idea(item),
                    sep: '; ',
                  },
                  { text: (item) => item, sep: ', ' },
                ]),
              },
            ],
          );
        }),
        widths: [10, 22, 80, 40, 24, 14, 18],
      },
    ],
  };
}

// ---- Standards alignment report --------------------------------------------

const byCode = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/**
 * The standards alignment report: for each standards code, the ideas and units that
 * cover it (a unit covers a code it lists, or that one of its ideas lists), then the
 * ideas with no codes. The Course framework labels it ("Custom" when there's none).
 * When a code's ideas or units don't fit in one cell, they continue on the rows
 * below, which repeat the code; the number of ideas is on its first row.
 */
export function alignmentReport(pack: ReportPack, options: ReportOptions = {}): ExportPayload {
  const framework = pack.course.framework?.trim() || 'Custom';
  const name = namer(pack);
  const codes = new Map<string, { ideas: Pack['ideas']; units: Set<number> }>();
  const entry = (code: string) => {
    let found = codes.get(code);
    if (!found) codes.set(code, (found = { ideas: [], units: new Set() }));
    return found;
  };
  for (const unit of pack.units)
    for (const code of unit.standard_codes) entry(code).units.add(unit.unit);
  for (const idea of pack.ideas) {
    for (const code of new Set(idea.standard_codes)) {
      const found = entry(code);
      found.ideas.push(idea);
      found.units.add(idea.unit);
    }
  }
  const uncoded = pack.ideas.filter((idea) => idea.standard_codes.length === 0);
  const ideaColumns = [
    { text: (i: Pack['ideas'][number]) => i.title, sep: '; ' },
    { text: (i: Pack['ideas'][number]) => i.idea_id, sep: ', ' },
  ];
  const unitGroups = (units: Iterable<number>) =>
    joinInGroups(
      [...units].sort((a, b) => a - b),
      [{ text: name.unit, sep: '; ' }],
    );
  const line = (label: string, ideas: Pack['ideas'], units: Iterable<number>) =>
    rowsWithLists(
      [label, ideas.length, null, null, null],
      [label, null, null, null, null],
      [
        { at: 2, groups: joinInGroups(ideas, ideaColumns) },
        { at: 4, groups: unitGroups(units) },
      ],
    );
  const rows: ExportCell[][] = [...codes.keys()]
    .sort(byCode.compare)
    .flatMap((code) => line(code, codes.get(code)!.ideas, codes.get(code)!.units));
  if (uncoded.length > 0) {
    rows.push(...line('No standards code', uncoded, new Set(uncoded.map((i) => i.unit))));
  }
  return {
    report: 'alignment',
    fileStem: stem(pack.course.topic, 'alignment', options),
    sheets: [
      {
        name: `${framework} alignment`,
        header: [`${framework} code`, 'Number of ideas', 'Ideas', 'Idea ids', 'Units'],
        rows,
        widths: [18, 16, 70, 40, 50],
      },
    ],
  };
}

// ---- Atlas-drafted rows -----------------------------------------------------

/** Atlas-drafted Assessment rows, with exactly the Assessment tab's columns, to paste in. */
export function assessmentDraftsReport(
  topic: string | null,
  rows: readonly AssessmentItem[],
  options: ReportOptions = {},
): ExportPayload {
  const sheet = tabSheet(specOf('Assessment'), rows as unknown as Record<string, unknown>[]);
  return {
    report: 'assessment-drafts',
    fileStem: stem(topic, 'assessment-drafts', options),
    sheets: [sheet],
  };
}
