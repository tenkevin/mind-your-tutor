import { z } from 'zod';
import { canPublishIssues, VersionSourceSchema, VERSION_STATUSES } from './curriculum-version.js';
import type { VersionIssue } from './curriculum-version.js';
import { DATA_CHECK_KINDS, DATA_CHECK_LEVELS, type DataCheckKind } from './data-checks.js';
import { IMPORT_ISSUE_CODES, type ImportIssueCode } from './import.js';
import { ImportJobViewSchema } from './import-job.js';
import { TAB_NAMES } from './spec.js';

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

/**
 * Groups a version's issues by cause (data-check kind or import code), level and fix
 * column; errors first, then warnings, then info, each in the order first found.
 */
export function groupVersionIssues(issues: readonly VersionIssue[]): IssueGroup[] {
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
      entry = { message: issue.message, items: issue.items, at: null };
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
