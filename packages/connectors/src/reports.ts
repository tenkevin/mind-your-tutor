import {
  PACK_SPEC,
  TAB_KEYS,
  type AssessmentItem,
  type DataCheckIssue,
  type DataCheckLevel,
  type Pack,
  type TabSpec,
} from '@ideamap/contracts';
import type { ExportCell, ExportPayload, ExportSheet } from './export.js';

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
};

/** A pack value as a sheet cell: lists joined with commas, empty as blank. */
function packCell(value: unknown): ExportCell {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (typeof value === 'number') return value;
  return String(value as string);
}

/** One tab as a sheet with exactly the spec's columns, in spec order. */
function tabSheet(spec: TabSpec, rows: readonly Record<string, unknown>[]): ExportSheet {
  if (spec.kind === 'keyvalue') {
    const [row] = rows;
    return {
      name: spec.tab,
      header: ['key', 'value'],
      rows: spec.cols.map((c) => [c.name, packCell(row?.[c.name])]),
      widths: [16, 60],
    };
  }
  return {
    name: spec.tab,
    header: spec.cols.map((c) => c.name),
    rows: rows.map((row) => spec.cols.map((c) => packCell(row[c.name]))),
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
        c.note || null,
      ]),
    ]),
    widths: [12, 18, 30, 10, 40, 18, 60],
  };
}

/**
 * The Curriculum Pack template: a "Read me" sheet, then the eight tabs with the
 * spec's columns. `sample` fills each tab with the prototype's sample rows.
 */
export function templateReport(options: ReportOptions & { sample?: boolean } = {}): ExportPayload {
  const sample = options.sample ?? false;
  return {
    report: 'template',
    fileStem: `curriculum-pack-template${sample ? '-sample' : ''}-${dateOf(options)}`,
    sheets: [
      readMeSheet(),
      ...PACK_SPEC.map((spec) => tabSheet(spec, sample ? SAMPLES[spec.tab] : [])),
    ],
  };
}

/** A parsed pack as the eight tabs, ready to edit and import again. */
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

/**
 * The data-check report: one row per issue, errors first, then warnings, then info,
 * with the ideas affected by title and the tab and column to fix.
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
        rows: sorted.map((issue) => {
          const units = issue.fix.tab === 'Units';
          const affected = issue.items.map((item) =>
            units && /^\d+$/.test(item) ? name.unit(Number(item)) : name.idea(item),
          );
          return [
            LEVEL_NAME[issue.level],
            issue.kind,
            issue.message,
            affected.join('; ') || null,
            issue.items.join(', ') || null,
            issue.fix.tab,
            (issue.fix.columns ?? [issue.fix.column]).join(', '),
          ];
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
  const rows: ExportCell[][] = [...codes.keys()].sort(byCode.compare).map((code) => {
    const { ideas, units } = codes.get(code)!;
    return [
      code,
      ideas.length,
      ideas.map((i) => i.title).join('; ') || null,
      ideas.map((i) => i.idea_id).join(', ') || null,
      [...units]
        .sort((a, b) => a - b)
        .map(name.unit)
        .join('; ') || null,
    ];
  });
  if (uncoded.length > 0) {
    rows.push([
      'No standards code',
      uncoded.length,
      uncoded.map((i) => i.title).join('; '),
      uncoded.map((i) => i.idea_id).join(', '),
      [...new Set(uncoded.map((i) => i.unit))]
        .sort((a, b) => a - b)
        .map(name.unit)
        .join('; '),
    ]);
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
