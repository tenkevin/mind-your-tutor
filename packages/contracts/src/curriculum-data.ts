import { z } from 'zod';
import { canPublishIssues, VersionSourceSchema, VERSION_STATUSES } from './curriculum-version.js';
import type { VersionIssue } from './curriculum-version.js';
import { DATA_CHECK_KINDS, DATA_CHECK_LEVELS, type DataCheckKind } from './data-checks.js';
import { IMPORT_ISSUE_CODES, type ImportIssueCode } from './import.js';
import { ImportJobViewSchema } from './import-job.js';
import { TAB_NAMES, type TabName } from './spec.js';

// Teacher Settings → Curriculum data (ARCHITECTURE.md §11, task T2): the latest import
// job, and the newest version's import and data-check issues grouped by cause, errors
// first. Grouping is here, beside `canPublishIssues`, so the API and the teacher app
// agree on what blocks publishing.

/** A short name for each cause, for the group's heading. */
export const CAUSE_LABELS: Record<DataCheckKind | ImportIssueCode, string> = {
  prereq: 'Unknown prerequisite',
  cycle: 'Prerequisite loop',
  duplicate_id: 'Duplicate idea_id',
  unknown_unit: 'Unknown unit',
  blocked: 'Idea that can never unlock',
  link_unknown_idea: 'Link to an unknown idea',
  unknown_category: 'Unknown category',
  assessment_unknown_idea: 'Question for an unknown idea',
  no_links: 'Idea with no links',
  codes: 'Missing standard codes',
  media: 'Missing media',
  assessment_coverage: 'Unit missing assessment questions',
  objective: 'Idea without an objective',
  unit_objective: 'Unit without an objective',
  assessment_question: 'Empty assessment question',
  no_categories: 'No categories',
  assessment_unknown_unit: 'Question for an unknown unit',
  assessment_unit_mismatch: 'Question in the wrong unit',
  practice_unknown_idea: 'Practice item for an unknown idea',
  practice_source: 'Practice item without a vetted source',
  practice_license: 'Practice item without an allowed licence',
  practice_attribution: 'Practice item missing its attribution',
  practice_choices: 'Multiple-choice problem without choices',
  practice_answer: 'Practice answer that can’t be used',
  practice_quiz: 'Quiz that can’t be built',
  practice_standard: 'Group with two standard codes',
  practice_exercise: 'Exercise rows that disagree',
  file_refused: 'File refused',
  no_tabs: 'No tabs found',
  tab_missing: 'Missing tab',
  tab_duplicate: 'Tab given twice',
  tab_ignored: 'Sheet left out',
  tab_default: 'Tab default used',
  column_missing: 'Missing column',
  column_ambiguous: 'Ambiguous column',
  column_ignored: 'Column left out',
  mapping_invalid: 'Column mapping unreadable',
  mapping_suggestion: 'Column mapping to confirm',
  cell: 'Cell value',
  pack: 'Pack problem',
  formula: 'Spreadsheet formula',
  formula_text: 'Text that looks like a formula',
  cell_error: 'Spreadsheet error value',
  pass_mark_fraction: 'Pass mark looks like a fraction',
  csv_quote: 'Unclosed CSV quote',
};

const CAUSES = [...DATA_CHECK_KINDS, ...IMPORT_ISSUE_CODES] as const;

/** Where in the sheet one issue is, when the importer knows the cell. */
export const IssueLocationSchema = z.object({
  tab: z.enum(TAB_NAMES).nullable(),
  row: z.number().int().min(1).nullable(),
  column: z.string().max(100).nullable(),
});

export const GroupedIssueSchema = z.object({
  /** Plain text for teachers. Not markup: the UI renders it as text. */
  message: z.string(),
  /** The idea_ids or unit numbers it is about (data checks). */
  items: z.array(z.string()),
  /**
   * Where each item is in the sheet, in step with `items`: its tab and row, or null
   * when the version doesn't record rows (T2-U3).
   */
  item_rows: z
    .array(z.object({ tab: z.enum(TAB_NAMES), row: z.number().int().min(1) }).nullable())
    .default([]),
  /** The cell, for import issues; null for data checks, which span rows. */
  at: IssueLocationSchema.nullable(),
});
export type GroupedIssue = z.infer<typeof GroupedIssueSchema>;

/** Every issue with one cause and level, and where the teacher fixes it. */
export const IssueGroupSchema = z.object({
  level: z.enum(DATA_CHECK_LEVELS),
  origin: z.enum(['import', 'data_check']),
  cause: z.enum(CAUSES),
  label: z.string(),
  /** The tab and column to fix in the source sheet, if one applies to the whole group. */
  fix: z
    .object({
      tab: z.enum(TAB_NAMES),
      column: z.string().nullable(),
      columns: z.array(z.string()).optional(),
    })
    .nullable(),
  /** True if this group stops the draft being published (§7). */
  blocks_publish: z.boolean(),
  /** Atlas can draft the missing text for approval (D12). */
  draftable: z.boolean(),
  issues: z.array(GroupedIssueSchema).min(1),
});
export type IssueGroup = z.infer<typeof IssueGroupSchema>;

const LEVEL_ORDER = { error: 0, warning: 1, info: 2 } as const;

/** The sheet tab and row of one data-check item (an idea_id or a unit number). */
export type ItemLocator = (fixTab: TabName, item: string) => { tab: TabName; row: number } | null;

type RowSource = {
  ideas: readonly { idea_id: string }[];
  units: readonly { unit: number }[];
  assessment: readonly { idea_id: string }[];
  practice?: readonly { exercise_id: string }[];
};

/**
 * Finds data-check items in the sheet from a version's pack and the sheet row of each
 * pack item (`VersionSource.rows`). Unit items are Units rows; Assessment items are
 * the idea's Assessment row, if it has one; Practice items are `exercise_id#n`, the
 * exercise's nth problem, which is its nth Practice row; every other item is the idea's Ideas row.
 */
export function rowLocator(
  pack: RowSource,
  rows: Partial<Record<TabName, readonly number[]>> | undefined,
): ItemLocator {
  if (!rows) return () => null;
  const first = <T>(list: readonly T[], key: (t: T) => string) => {
    const index = new Map<string, number>();
    list.forEach((t, i) => {
      if (!index.has(key(t))) index.set(key(t), i);
    });
    return index;
  };
  const ideas = first(pack.ideas, (i) => i.idea_id);
  const units = first(pack.units, (u) => String(u.unit));
  const assessment = first(pack.assessment, (a) => a.idea_id);
  const practice = new Map<string, number>();
  const seen = new Map<string, number>();
  (pack.practice ?? []).forEach((p, i) => {
    const n = (seen.get(p.exercise_id) ?? 0) + 1;
    seen.set(p.exercise_id, n);
    practice.set(`${p.exercise_id}#${n}`, i);
  });
  const at = (tab: TabName, index: number | undefined) => {
    const row = index === undefined ? undefined : rows[tab]?.[index];
    return row === undefined ? null : { tab, row };
  };
  return (fixTab, item) => {
    if (fixTab === 'Units') return at('Units', units.get(item));
    if (fixTab === 'Practice') return at('Practice', practice.get(item));
    // An idea with no question yet has no Assessment row; its Ideas row names it.
    if (fixTab === 'Assessment')
      return at('Assessment', assessment.get(item)) ?? at('Ideas', ideas.get(item));
    return at('Ideas', ideas.get(item));
  };
}

/**
 * Groups a version's issues by cause (data-check kind or import code), level and fix
 * column; errors first, then warnings, then info, each in the order first found.
 */
export function groupVersionIssues(
  issues: readonly VersionIssue[],
  locate: ItemLocator = () => null,
): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  issues.forEach((issue) => {
    const blocks = !canPublishIssues([issue]);
    let key: string;
    let start: Omit<IssueGroup, 'issues'>;
    let entry: GroupedIssue;
    if (issue.origin === 'data_check') {
      key = `d|${issue.kind}|${issue.level}|${issue.fix.tab}|${issue.fix.column}`;
      start = {
        level: issue.level,
        origin: 'data_check',
        cause: issue.kind,
        label: CAUSE_LABELS[issue.kind],
        fix: {
          tab: issue.fix.tab,
          column: issue.fix.column,
          ...(issue.fix.columns ? { columns: issue.fix.columns } : {}),
        },
        blocks_publish: blocks,
        draftable: issue.draftable === true,
      };
      const fixTab = issue.fix.tab;
      const itemRows = issue.items.map((item) => locate(fixTab, item));
      entry = {
        message: issue.message,
        items: issue.items,
        item_rows: itemRows.some((r) => r !== null) ? itemRows : [],
        at: null,
      };
    } else {
      const code: ImportIssueCode = issue.code ?? (issue.tab ? 'cell' : 'pack');
      key = `i|${code}|${issue.severity}|${issue.tab ?? ''}|${issue.column ?? ''}|${blocks}`;
      start = {
        level: issue.severity,
        origin: 'import',
        cause: code,
        label: CAUSE_LABELS[code],
        fix: issue.tab ? { tab: issue.tab, column: issue.column } : null,
        blocks_publish: blocks,
        draftable: false,
      };
      entry = {
        message: issue.message,
        items: [],
        item_rows: [],
        at: { tab: issue.tab, row: issue.row, column: issue.column },
      };
    }
    const group = groups.get(key);
    if (group) group.issues.push(entry);
    else groups.set(key, { ...start, issues: [entry] });
  });
  return [...groups.values()].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

/** How many issues there are at each level. */
export function countIssues(groups: readonly IssueGroup[]): Record<IssueGroup['level'], number> {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const g of groups) counts[g.level] += g.issues.length;
  return counts;
}

/** The newest version of a curriculum, as the Curriculum data section shows it. */
export const CurriculumDataVersionSchema = z.object({
  id: z.uuid(),
  number: z.number().int().min(1),
  status: z.enum(VERSION_STATUSES),
  can_publish: z.boolean(),
  created_at: z.iso.datetime({ offset: true }),
  source: VersionSourceSchema.pick({ kind: true, file_name: true, checksum: true }),
  /** Rows in each tab of the pack, in tab order. */
  tabs: z.array(z.object({ tab: z.enum(TAB_NAMES), rows: z.number().int().min(0) })),
  groups: z.array(IssueGroupSchema),
});
export type CurriculumDataVersion = z.infer<typeof CurriculumDataVersionSchema>;

/** `GET /api/curricula/:curriculumId/imports/latest`. */
export const CurriculumDataResponseSchema = z.object({
  /** The newest import job, or null before the first import. */
  job: ImportJobViewSchema.nullable(),
  /** The job's file has the same checksum as the version before it. */
  unchanged: z.boolean(),
  /** The newest version, whichever job made it; null before the first draft. */
  version: CurriculumDataVersionSchema.nullable(),
});
export type CurriculumDataResponse = z.infer<typeof CurriculumDataResponseSchema>;
