import {
  TAB_NAMES,
  type ColumnMappingEntry,
  type ImportIssue,
  type ImportIssueCode,
  type PackIssue,
  type TabName,
} from '@ideamap/contracts';

/** Upload limits (C1-S2). Each one is checked before the work it bounds. */
export interface ImportLimits {
  /** Largest file accepted, in bytes. */
  maxFileBytes: number;
  /** Most bytes unpacked from all zips in one import, in bytes. */
  maxUnpackedBytes: number;
  /** Most data rows read from one tab. */
  maxRowsPerTab: number;
  /** Most columns read from one tab. */
  maxColumns: number;
  /** Most decoded characters in one CSV data cell. */
  maxCsvCellChars: number;
  /** Most decoded characters in one CSV header. */
  maxCsvHeaderChars: number;
  /** Most files in one upload, and most entries in one zip. */
  maxFiles: number;
  maxZipEntries: number;
}

export const DEFAULT_LIMITS: Readonly<ImportLimits> = Object.freeze({
  maxFileBytes: 10 * 1024 * 1024,
  maxUnpackedBytes: 100 * 1024 * 1024,
  maxRowsPerTab: 50_000,
  maxColumns: 200,
  maxCsvCellChars: 256_000,
  maxCsvHeaderChars: 1_024,
  maxFiles: 20,
  maxZipEntries: 2_000,
});

export function megabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024)).toLocaleString('en')} MB`;
}

export interface IssueFields {
  code: ImportIssueCode;
  message: string;
  source?: string | null;
  tab?: TabName | null;
  row?: number | null;
  column?: string | null;
  value?: PackIssue['value'];
  fallback?: string | null;
  effect?: ImportIssue['effect'];
  suggestion?: ColumnMappingEntry | null;
}

function cut(text: string | null | undefined, max: number): string | null {
  if (text === null || text === undefined) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function make(severity: ImportIssue['severity'], fields: IssueFields): ImportIssue {
  const value = typeof fields.value === 'string' ? cut(fields.value, 250) : (fields.value ?? null);
  return {
    severity,
    effect: fields.effect ?? (severity === 'error' ? 'blocks_import' : 'none'),
    code: fields.code,
    source: cut(fields.source, 300),
    tab: fields.tab ?? null,
    row: fields.row ?? null,
    column: cut(fields.column, 100),
    value,
    fallback: cut(fields.fallback, 200),
    message: cut(fields.message, 2000) ?? '',
    suggestion: fields.suggestion ?? null,
  };
}

export const error = (fields: IssueFields) => make('error', fields);
export const warning = (fields: IssueFields) => make('warning', fields);
export const info = (fields: IssueFields) => make('info', fields);

/** Thrown inside a connector to refuse a whole file; the importer turns it into an issue. */
export class FileRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileRefused';
  }
}

/** An F3 pack issue, placed in the upload. */
export function fromPackIssue(issue: PackIssue, source: string | null): ImportIssue {
  return make(issue.severity, {
    ...issue,
    code: issue.tab !== null && issue.row !== null ? 'cell' : 'pack',
    source,
  });
}

const SEVERITY_RANK = { error: 0, warning: 1, info: 2 } as const;
const tabRank = (tab: TabName | null) => (tab === null ? -1 : TAB_NAMES.indexOf(tab));

/**
 * Orders issues for the import screen: blocking errors first, then warnings, then
 * info; within each, by tab in pack order, then row, then column.
 */
export function sortIssues(issues: readonly ImportIssue[]): ImportIssue[] {
  return issues
    .map((issue, i) => ({ issue, i }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.issue.severity] - SEVERITY_RANK[b.issue.severity] ||
        tabRank(a.issue.tab) - tabRank(b.issue.tab) ||
        (a.issue.row ?? 0) - (b.issue.row ?? 0) ||
        a.i - b.i,
    )
    .map(({ issue }) => issue);
}

export interface IssueGroup {
  /** `null` for problems with the upload as a whole. */
  tab: TabName | null;
  issues: ImportIssue[];
}

/**
 * Groups issues by tab. Groups with blocking errors come first, and within a
 * group blocking errors come first.
 */
export function groupIssuesByTab(issues: readonly ImportIssue[]): IssueGroup[] {
  const groups = new Map<TabName | null, ImportIssue[]>();
  for (const issue of sortIssues(issues)) {
    const group = groups.get(issue.tab) ?? [];
    group.push(issue);
    groups.set(issue.tab, group);
  }
  const worst = (group: ImportIssue[]) => Math.min(...group.map((i) => SEVERITY_RANK[i.severity]));
  return [...groups.entries()]
    .map(([tab, list]) => ({ tab, issues: list }))
    .sort((a, b) => worst(a.issues) - worst(b.issues) || tabRank(a.tab) - tabRank(b.tab));
}

/** "Ideas.csv · Ideas, row 7, unit: unit must be a whole number of 1 or more, like 1 (got 'x')." */
export function formatImportIssue(issue: ImportIssue): string {
  const where = [
    issue.tab,
    issue.row === null ? null : `row ${issue.row}`,
    issue.column === null ? null : issue.column,
  ].filter((part) => part !== null);
  const place = [issue.source, where.length > 0 ? where.join(', ') : null]
    .filter((part) => part !== null)
    .join(' · ');
  return place ? `${place}: ${issue.message}` : issue.message;
}
