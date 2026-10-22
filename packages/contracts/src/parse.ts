import type { z } from 'zod';
import { displayValue } from './fields.js';
import type { PackIssue } from './issues.js';
import { PackSchema, TAB_ROW_SCHEMAS, type Pack } from './pack.js';
import {
  PROMPT_VARIABLES,
  TAB_KEYS,
  TAB_NAMES,
  columnSpec,
  missingEffect,
  tabSpec,
  type TabKey,
  type TabName,
} from './spec.js';

export type ParseResult<T> =
  { ok: true; value: T; issues: PackIssue[] } | { ok: false; value: null; issues: PackIssue[] };

export type TabRow<T extends TabName> = z.infer<(typeof TAB_ROW_SCHEMAS)[T]>;

const TAB_BY_KEY = Object.fromEntries(TAB_NAMES.map((t) => [TAB_KEYS[t], t])) as Record<
  TabKey,
  TabName
>;

function issueValue(value: unknown): PackIssue['value'] {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.length > 200 ? `${value.slice(0, 200)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return displayValue(value);
}

function issueAt(
  tab: TabName | null,
  row: number | null,
  column: string | null,
  zodIssue: z.core.$ZodIssue,
): PackIssue {
  const spec = tab && column ? columnSpec(tab, column) : undefined;
  const effect = spec ? missingEffect(spec) : 'blocks_import';
  return {
    severity: 'error',
    effect,
    tab,
    row,
    column,
    value: issueValue(zodIssue.input),
    fallback: effect === 'uses_fallback' && spec ? spec.missing : null,
    message: zodIssue.message,
  };
}

/** Warns about `{variables}` in a prompt template that the app doesn't fill. */
export function unknownPromptVariables(template: string): string[] {
  const known = new Set<string>(PROMPT_VARIABLES);
  const found = new Set<string>();
  for (const match of template.matchAll(/\{([^{}]{0,64})\}/g)) {
    const name = match[1]!.trim();
    if (!known.has(name)) found.add(name);
  }
  return [...found];
}

function promptWarnings(row: unknown, rowNumber: number | null): PackIssue[] {
  if (typeof row !== 'object' || row === null || !Object.hasOwn(row, 'prompt_template')) return [];
  const template = (row as { prompt_template?: unknown }).prompt_template;
  if (typeof template !== 'string') return [];
  const unknown = unknownPromptVariables(template);
  if (unknown.length === 0) return [];
  const shown = unknown.slice(0, 5).map((v) => `{${v}}`);
  const names =
    unknown.length > 5 ? `${shown.join(', ')} and ${unknown.length - 5} more` : shown.join(', ');
  return [
    {
      severity: 'warning',
      effect: 'none',
      tab: 'Personas',
      row: rowNumber,
      column: 'prompt_template',
      value: issueValue(names),
      fallback: null,
      message: `prompt_template uses ${names}, which the app can't fill in, so it will be sent as written. The variables you can use are ${PROMPT_VARIABLES.map((v) => `{${v}}`).join(' ')}.`,
    },
  ];
}

/**
 * Parses one row of a tab from CSV, XLSX or JSON. `rowNumber` is the sheet row
 * (the header is row 1). Every problem in the row is reported.
 */
export function parseTabRow<T extends TabName>(
  tab: T,
  row: unknown,
  rowNumber: number | null = null,
): ParseResult<TabRow<T>> {
  const result = TAB_ROW_SCHEMAS[tab].safeParse(row, { reportInput: true });
  const warnings = tab === 'Personas' ? promptWarnings(row, rowNumber) : [];
  if (result.success) return { ok: true, value: result.data as TabRow<T>, issues: warnings };
  const issues = result.error.issues.map((i) =>
    issueAt(tab, rowNumber, typeof i.path[0] === 'string' ? i.path[0] : null, i),
  );
  return { ok: false, value: null, issues: [...issues, ...warnings] };
}

export interface PackLocations {
  /** Sheet row of each Course key, when the Course tab came from key/value rows. */
  courseRows?: Readonly<Record<string, number>>;
  /** Sheet row of each item, by tab, when rows were skipped while reading the sheet. */
  rowNumbers?: Partial<Record<TabName, readonly number[]>>;
}

function locate(path: readonly PropertyKey[], where: PackLocations) {
  const [key, index, column] = path;
  if (key === 'course') {
    const name = typeof index === 'string' ? index : null;
    return {
      tab: 'Course' as const,
      row: name ? (where.courseRows?.[name] ?? null) : null,
      column: name,
    };
  }
  const tab = typeof key === 'string' ? TAB_BY_KEY[key as TabKey] : undefined;
  if (!tab) return { tab: null, row: null, column: typeof key === 'string' ? key : null };
  if (typeof index !== 'number') return { tab, row: null, column: null };
  return {
    tab,
    row: where.rowNumbers?.[tab]?.[index] ?? index + 2,
    column: typeof column === 'string' ? column : null,
  };
}

/** Parses a whole pack (as JSON). Every problem in every tab is reported at once. */
export function parsePack(input: unknown, where: PackLocations = {}): ParseResult<Pack> {
  const result = PackSchema.safeParse(input, { reportInput: true });
  const warnings: PackIssue[] = [];
  const personas =
    typeof input === 'object' && input !== null && Object.hasOwn(input, 'personas')
      ? (input as { personas: unknown }).personas
      : undefined;
  if (Array.isArray(personas)) {
    personas.forEach((row, i) =>
      warnings.push(...promptWarnings(row, where.rowNumbers?.Personas?.[i] ?? i + 2)),
    );
  }
  if (result.success) return { ok: true, value: result.data, issues: warnings };
  const issues = result.error.issues.map((i) => {
    const at = locate(i.path, where);
    return issueAt(at.tab, at.row, at.column, i);
  });
  return { ok: false, value: null, issues: [...issues, ...warnings] };
}

/** A sheet read into rows: header names become keys; blank rows are dropped. */
export interface Table {
  rows: Record<string, unknown>[];
  /** Sheet row of each entry in `rows` (the header is row 1). */
  rowNumbers: number[];
}

const isBlank = (cell: unknown) =>
  cell === undefined || cell === null || (typeof cell === 'string' && cell.trim() === '');

/**
 * Turns a grid of cells (first row = header) into rows keyed by header name.
 * Column mapping is C1's job; this assumes headers already use the spec's names.
 */
export function tableFromGrid(grid: readonly (readonly unknown[])[]): Table {
  const [header = [], ...body] = grid;
  const names = header.map((cell) => (typeof cell === 'string' ? cell.trim() : String(cell ?? '')));
  const table: Table = { rows: [], rowNumbers: [] };
  body.forEach((cells, i) => {
    if (cells.every(isBlank)) return;
    // fromEntries defines own properties, so a "__proto__" header can't change the prototype.
    table.rows.push(
      Object.fromEntries(
        names.flatMap((name, c) => (name === '' ? [] : [[name, cells[c] ?? null] as const])),
      ),
    );
    table.rowNumbers.push(i + 2);
  });
  return table;
}

/**
 * Reads the Course tab's key/value rows (`{ key, value }`) into one Course row.
 * A key given twice keeps its first value; unknown keys are reported as warnings.
 */
export function courseFromKeyValueRows(
  rows: readonly unknown[],
  rowNumbers?: readonly number[],
): { course: Record<string, unknown>; courseRows: Record<string, number>; issues: PackIssue[] } {
  const known = new Set(tabSpec('Course').cols.map((c) => c.name));
  const course: Record<string, unknown> = {};
  const courseRows: Record<string, number> = {};
  const issues: PackIssue[] = [];
  const warn = (row: number, column: string | null, value: unknown, message: string) =>
    issues.push({
      severity: 'warning',
      effect: 'none',
      tab: 'Course',
      row,
      column,
      value: issueValue(value),
      fallback: null,
      message,
    });
  rows.forEach((entry, i) => {
    const row = rowNumbers?.[i] ?? i + 2;
    if (typeof entry !== 'object' || entry === null) return;
    const { key: rawKey, value } = entry as { key?: unknown; value?: unknown };
    const key = typeof rawKey === 'string' ? rawKey.trim() : '';
    if (key === '') return;
    if (!known.has(key)) {
      warn(
        row,
        null,
        key,
        `The Course tab has a key '${displayValue(key).slice(1, -1)}' that isn't used. The keys are ${[...known].join(', ')}.`,
      );
    } else if (Object.hasOwn(courseRows, key)) {
      warn(
        row,
        key,
        value,
        `${key} appears twice in the Course tab (rows ${courseRows[key]} and ${row}); the first one is used.`,
      );
    } else {
      course[key] = value;
      courseRows[key] = row;
    }
  });
  return { course, courseRows, issues };
}

/** The tabs of a pack read from CSV files or XLSX sheets, as rows keyed by column. */
export type PackTables = Partial<Record<TabName, readonly unknown[]>>;

/**
 * Parses a pack read from CSV or XLSX: Course as key/value rows, the other tabs
 * as rows keyed by column name, lists still as text. The result is the same as
 * `parsePack` on the equivalent JSON.
 */
export function parsePackTables(
  tables: PackTables,
  options: { rowNumbers?: Partial<Record<TabName, readonly number[]>> } = {},
): ParseResult<Pack> {
  const input: Record<string, unknown> = { version: 1 };
  let courseRows: Record<string, number> = {};
  const courseIssues: PackIssue[] = [];
  if (tables.Course) {
    const course = courseFromKeyValueRows(tables.Course, options.rowNumbers?.Course);
    input.course = course.course;
    courseRows = course.courseRows;
    courseIssues.push(...course.issues);
  }
  for (const tab of TAB_NAMES) {
    if (tab !== 'Course' && tables[tab]) input[TAB_KEYS[tab]] = tables[tab];
  }
  const result = parsePack(input, { courseRows, rowNumbers: options.rowNumbers });
  return { ...result, issues: [...courseIssues, ...result.issues] } as ParseResult<Pack>;
}
