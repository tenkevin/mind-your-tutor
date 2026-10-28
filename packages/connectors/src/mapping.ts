import {
  tabSpec,
  type ColumnMappingEntry,
  type ImportIssue,
  type TabName,
} from '@ideamap/contracts';
import { serialToIsoDate } from './dates.js';
import { error, info, warning } from './issues.js';
import { looseName } from './tabs.js';
import type { RawCell, RawSheet } from './types.js';

// Column mapping: which source column holds each pack column. A saved mapping
// (Teacher Settings → Column mapping) wins; otherwise a header matches a column
// when they're equal ignoring case, spaces, underscores and hyphens. Two
// candidates for one column is reported, never guessed. Near misses become
// suggestions the teacher confirms; they are never applied on their own.

/** Line endings are canonical (LF) once text is accepted: CRLF pairs become LF (docs/spec/README.md). */
export const canonicalLineEndings = (text: string): string => text.replace(/\r\n/g, '\n');

const isBlank = (cell: unknown) =>
  cell === undefined || cell === null || (typeof cell === 'string' && cell.trim() === '');

const headerText = (cell: unknown) =>
  typeof cell === 'string' ? cell.trim() : typeof cell === 'number' ? String(cell) : '';

/** "A", "B"… "AA": the column letter a teacher sees. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * True for text a spreadsheet would run as a formula if it were exported as is:
 * it starts with =, +, - or @ (or a tab or carriage return), and isn't just a
 * number such as -5. C6 exports must escape these values.
 */
export function needsFormulaEscape(value: string): boolean {
  if (/^[\t\r]/.test(value)) return true;
  const text = value.trim();
  return /^[=+\-@]/.test(text) && !/^[+-]?\d+(\.\d+)?%?$/.test(text);
}

// Other names teachers use for a column; used only for suggestions.
const SYNONYMS: Record<string, readonly string[]> = {
  idea_id: ['id', 'ideaname', 'slug', 'nodeid'],
  requires: [
    'prereq',
    'prereqs',
    'prerequisite',
    'prerequisites',
    'dependson',
    'requirement',
    'requirements',
  ],
  standard_codes: ['standard', 'standards', 'codes', 'ngss', 'standardcode'],
  media_url: ['media', 'video', 'image', 'mediafile'],
  from_id: ['from', 'source', 'fromidea'],
  to_id: ['to', 'target', 'toidea'],
  relation: ['verb', 'relationship', 'label'],
  importance: ['weight', 'strength', 'priority'],
  file_url: ['file', 'filename', 'path', 'url'],
  key_points: ['keypoint', 'points', 'answers'],
  due_date: ['due', 'deadline', 'duedate', 'date'],
  prompt_template: ['prompt', 'template', 'systemprompt'],
};

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j]!;
      prev[j] = Math.min(
        prev[j]! + 1,
        prev[j - 1]! + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return prev[b.length]!;
}

/** How likely a header is to mean a column: 0 (no) to 3 (a known synonym). */
export function similarity(header: string, column: string): number {
  const h = looseName(header);
  const c = looseName(column);
  if (h.length === 0 || h.length > 60) return 0;
  if (SYNONYMS[column]?.includes(h)) return 3;
  let prefix = 0;
  while (prefix < h.length && prefix < c.length && h[prefix] === c[prefix]) prefix++;
  if (prefix >= 5 || (prefix >= 4 && (h.length === prefix || c.length === prefix))) return 2;
  if (h.length >= 4 && distance(h, c) <= 2) return 2;
  return 0;
}

interface Candidate {
  column: string;
  header: string;
  score: number;
}

/** Pairs unmatched columns with unmatched headers that look like them, best first, each used once. */
function suggest(columns: readonly string[], headers: readonly string[]): Candidate[] {
  const all: Candidate[] = [];
  for (const column of columns) {
    for (const header of headers) {
      const score = similarity(header, column);
      if (score > 0) all.push({ column, header, score });
    }
  }
  all.sort((a, b) => b.score - a.score);
  const usedColumns = new Set<string>();
  const usedHeaders = new Set<string>();
  const out: Candidate[] = [];
  for (const c of all) {
    if (usedColumns.has(c.column) || usedHeaders.has(c.header)) continue;
    usedColumns.add(c.column);
    usedHeaders.add(c.header);
    out.push(c);
  }
  return out;
}

export interface MappedTab {
  /** Rows keyed by pack column name; only mapped columns are present. */
  rows: Record<string, RawCell>[];
  rowNumbers: number[];
  /** The mapping that was applied, to store with the version. */
  used: ColumnMappingEntry[];
  issues: ImportIssue[];
  /** Required columns that couldn't be found, or had more than one candidate. */
  missingRequired: string[];
  /** The tab has no cells at all. */
  empty: boolean;
}

function cellIssues(
  sheet: RawSheet,
  tab: TabName,
  row: number,
  column: string,
  sourceColumn: number,
  value: RawCell,
): ImportIssue[] {
  const at = { source: sheet.source, tab, row, column };
  const mark = sheet.marks?.get(`${row}:${sourceColumn}`);
  const shown = typeof value === 'string' || typeof value === 'number' ? value : null;
  if (mark === 'error') {
    return [
      warning({
        ...at,
        code: 'cell_error',
        value: shown,
        message: `${column} shows the spreadsheet error ${String(value)}, which was read as text. Fix the formula or type the value in.`,
      }),
    ];
  }
  if (mark === 'formula') {
    const noValue = typeof value === 'string' && value.startsWith('=');
    return [
      info({
        ...at,
        code: 'formula',
        value: shown,
        message: noValue
          ? `${column} has a formula with no saved value, so its text was read as plain text. Formulas are never run on import.`
          : `${column} has a formula. The value it showed was used; formulas are never run on import.`,
      }),
    ];
  }
  if (typeof value === 'string' && needsFormulaEscape(value)) {
    return [
      info({
        ...at,
        code: 'formula_text',
        value,
        message: `${column} starts with '${value.trim()[0] ?? ''}', so a spreadsheet could treat it as a formula. It was read as plain text and is made safe when exported.`,
      }),
    ];
  }
  return [];
}

function firstHeaderRow(grid: RawSheet['grid']): number {
  return grid.findIndex((cells) => cells.some((cell) => !isBlank(cell)));
}

/** Maps a row tab's columns onto the pack's columns. */
export function mapRows(
  tab: Exclude<TabName, 'Course'>,
  sheet: RawSheet,
  mapping: readonly ColumnMappingEntry[],
): MappedTab {
  const out: MappedTab = {
    rows: [],
    rowNumbers: [],
    used: [],
    issues: [],
    missingRequired: [],
    empty: false,
  };
  const h = firstHeaderRow(sheet.grid);
  if (h < 0) {
    out.empty = true;
    return out;
  }
  const headers = sheet.grid[h]!.map(headerText);
  const spec = tabSpec(tab).cols;
  const at = { source: sheet.source, tab, row: sheet.rowNumbers[h] ?? null };
  const resolved = new Map<string, number>();
  const claimed = new Set<number>();
  const contested = new Set<number>();
  const unresolvable = new Set<string>();
  const describe = (indices: number[]) =>
    indices.map((i) => `'${headers[i]}' (column ${columnLetter(i)})`).join(' and ');

  // A saved mapping first.
  const entries = mapping.filter((e) => e.tab === tab);
  for (const entry of entries) {
    const column = spec.find((c) => c.name === entry.column);
    if (!column) {
      out.issues.push(
        warning({
          ...at,
          code: 'mapping_invalid',
          column: entry.column,
          value: entry.source_column,
          message: `The column mapping names ${tab}.${entry.column}, which isn't a column of the ${tab} tab, so that line of the mapping was skipped.`,
        }),
      );
      continue;
    }
    if (entries.filter((e) => e.column === entry.column).length > 1) {
      if (!unresolvable.has(column.name)) {
        out.issues.push(
          error({
            ...at,
            code: 'mapping_invalid',
            column: column.name,
            message: `The column mapping gives more than one source column for ${column.name}. Keep one in Column mapping.`,
          }),
        );
        unresolvable.add(column.name);
      }
      continue;
    }
    const wanted = entry.source_column.trim();
    let indices = headers.flatMap((header, i) => (header === wanted ? [i] : []));
    if (indices.length === 0) {
      indices = headers.flatMap((header, i) =>
        looseName(header) === looseName(wanted) ? [i] : [],
      );
    }
    if (indices.length === 1) {
      resolved.set(column.name, indices[0]!);
      claimed.add(indices[0]!);
    } else if (indices.length > 1) {
      out.issues.push(
        error({
          ...at,
          code: 'column_ambiguous',
          column: column.name,
          value: wanted,
          message: `The column mapping says ${column.name} comes from '${wanted}', but ${sheet.source} has more than one column that matches: ${describe(indices)}. Rename one so the mapping points to just one.`,
        }),
      );
      indices.forEach((i) => contested.add(i));
      unresolvable.add(column.name);
    } else {
      out.issues.push(
        warning({
          ...at,
          code: 'mapping_invalid',
          column: column.name,
          value: wanted,
          message: `The column mapping says ${column.name} comes from '${wanted}', but ${sheet.source} has no column called that. Update Column mapping to the column's new name.`,
        }),
      );
    }
  }

  // Then headers that match a column's name loosely.
  for (const column of spec) {
    if (resolved.has(column.name) || unresolvable.has(column.name)) continue;
    const key = looseName(column.name);
    const indices = headers.flatMap((header, i) =>
      !claimed.has(i) && header !== '' && looseName(header) === key ? [i] : [],
    );
    if (indices.length === 1) {
      resolved.set(column.name, indices[0]!);
      claimed.add(indices[0]!);
    } else if (indices.length > 1) {
      out.issues.push(
        error({
          ...at,
          code: 'column_ambiguous',
          column: column.name,
          message: `${sheet.source} has ${indices.length} columns that could be ${column.name}: ${describe(indices)}. Rename or remove the extra one, or pick one in Column mapping.`,
        }),
      );
      indices.forEach((i) => contested.add(i));
      unresolvable.add(column.name);
    }
  }

  const body = sheet.grid.slice(h + 1);
  const ignored: number[] = [];
  headers.forEach((header, i) => {
    if (claimed.has(i) || contested.has(i)) return;
    if (header !== '') {
      ignored.push(i);
      out.issues.push(
        info({
          ...at,
          code: 'column_ignored',
          column: header,
          message: `'${header}' (column ${columnLetter(i)}) isn't a column of the ${tab} tab, so it was left out of the pack.`,
        }),
      );
    } else if (body.some((cells) => !isBlank(cells[i]))) {
      out.issues.push(
        info({
          ...at,
          code: 'column_ignored',
          column: columnLetter(i),
          message: `Column ${columnLetter(i)} has values but no header, so it was left out of the pack.`,
        }),
      );
    }
  });

  const unmatched = spec.filter((c) => !resolved.has(c.name) && !unresolvable.has(c.name));
  for (const column of spec) {
    if (column.req && !resolved.has(column.name)) out.missingRequired.push(column.name);
  }
  for (const s of suggest(
    unmatched.map((c) => c.name),
    ignored.map((i) => headers[i]!),
  )) {
    out.issues.push(
      info({
        ...at,
        code: 'mapping_suggestion',
        column: s.column,
        value: s.header,
        suggestion: { tab, column: s.column, source_column: s.header.slice(0, 200) },
        message: `'${s.header}' looks like it could be ${s.column}. If it is, confirm it in Column mapping and import again.`,
      }),
    );
  }

  for (const [column, index] of resolved) {
    out.used.push({
      tab,
      column,
      source_column: headers[index]!.slice(0, 200) || columnLetter(index),
    });
  }
  const dateColumns = new Set(spec.filter((c) => c.type === 'date').map((c) => c.name));
  body.forEach((cells, i) => {
    if (cells.every(isBlank)) return;
    const rowNumber = sheet.rowNumbers[h + 1 + i] ?? h + 2 + i;
    const row: Record<string, RawCell> = {};
    for (const [column, index] of resolved) {
      let value = cells[index] ?? null;
      // An XLSX date that isn't formatted as one still arrives as its serial number.
      if (dateColumns.has(column) && typeof value === 'number' && sheet.date1904 !== undefined) {
        value = serialToIsoDate(value, sheet.date1904) ?? value;
      }
      row[column] = value;
      if (value !== null)
        out.issues.push(...cellIssues(sheet, tab, rowNumber, column, index, value));
    }
    out.rows.push(row);
    out.rowNumbers.push(rowNumber);
  });
  return out;
}

export interface MappedCourse {
  /** Key/value rows with keys turned into the spec's names where they match. */
  rows: { key: unknown; value: unknown }[];
  rowNumbers: number[];
  used: ColumnMappingEntry[];
  issues: ImportIssue[];
  /** The Course tab couldn't be read as keys and values. */
  unreadable: boolean;
}

/** Grade cells come as 6, 6.0, "6.0" or "k" from spreadsheets; the pack wants "6" or "K". */
function normalizeGrade(value: unknown): unknown {
  if (typeof value === 'number' && Number.isInteger(value)) return String(value);
  if (typeof value === 'string') {
    const text = value.trim();
    const whole = /^(\d{1,2})(\.0+)?$/.exec(text);
    if (whole) return String(Number(whole[1]));
    if (text.toLowerCase() === 'k') return 'K';
  }
  return value;
}

/**
 * Reads the Course tab: rows of key and value (with or without a key,value
 * header), or one header row of keys with the values below it.
 */
export function mapCourse(sheet: RawSheet, mapping: readonly ColumnMappingEntry[]): MappedCourse {
  const out: MappedCourse = { rows: [], rowNumbers: [], used: [], issues: [], unreadable: false };
  const spec = tabSpec('Course').cols;
  const at = { source: sheet.source, tab: 'Course' as const };
  const fromMapping = new Map<string, string>();
  for (const entry of mapping.filter((e) => e.tab === 'Course')) {
    if (!spec.some((c) => c.name === entry.column)) {
      out.issues.push(
        warning({
          ...at,
          code: 'mapping_invalid',
          column: entry.column,
          value: entry.source_column,
          message: `The column mapping names Course.${entry.column}, which isn't a Course key, so that line of the mapping was skipped.`,
        }),
      );
      continue;
    }
    fromMapping.set(looseName(entry.source_column), entry.column);
  }
  const specKey = (key: string): string | null =>
    fromMapping.get(looseName(key)) ??
    spec.find((c) => looseName(c.name) === looseName(key))?.name ??
    null;

  const h = firstHeaderRow(sheet.grid);
  if (h < 0) {
    out.unreadable = true;
    return out;
  }
  const header = sheet.grid[h]!.map(headerText);
  const keyAt = header.findIndex((cell) => looseName(cell) === 'key');
  const valueAt = header.findIndex((cell) => looseName(cell) === 'value');
  let pairs: { key: string; value: RawCell; row: number; valueColumn: number }[];

  if (keyAt >= 0 && valueAt >= 0) {
    header.forEach((cell, i) => {
      if (i !== keyAt && i !== valueAt && cell !== '') {
        out.issues.push(
          info({
            ...at,
            row: sheet.rowNumbers[h] ?? null,
            code: 'column_ignored',
            column: cell,
            message: `'${cell}' (column ${columnLetter(i)}) isn't part of the Course tab, which has only key and value, so it was left out.`,
          }),
        );
      }
    });
    pairs = sheet.grid.slice(h + 1).map((cells, i) => ({
      key: headerText(cells[keyAt]),
      value: cells[valueAt] ?? null,
      row: sheet.rowNumbers[h + 1 + i]!,
      valueColumn: valueAt,
    }));
  } else if (
    specKey(header[0] ?? '') !== null &&
    header.filter((c) => specKey(c) !== null).length === 1
  ) {
    // Key/value rows with no header row.
    pairs = sheet.grid.slice(h).map((cells, i) => ({
      key: headerText(cells[0]),
      value: cells[1] ?? null,
      row: sheet.rowNumbers[h + i]!,
      valueColumn: 1,
    }));
  } else if (header.filter((c) => specKey(c) !== null).length >= 2) {
    // One row of keys with the values in the next row.
    const v = sheet.grid.findIndex((cells, i) => i > h && cells.some((cell) => !isBlank(cell)));
    const values = v < 0 ? [] : sheet.grid[v]!;
    pairs = header.flatMap((key, i) =>
      key === ''
        ? []
        : [
            {
              key,
              value: values[i] ?? null,
              row: sheet.rowNumbers[v < 0 ? h : v]!,
              valueColumn: i,
            },
          ],
    );
  } else {
    out.unreadable = true;
    out.issues.push(
      error({
        ...at,
        row: sheet.rowNumbers[h] ?? null,
        code: 'column_missing',
        message:
          'The Course tab should have two columns, key and value, with one row for each setting: subject, topic, grade, framework, map_objective and pass_mark.',
      }),
    );
    return out;
  }

  const used = new Set<string>();
  for (const pair of pairs) {
    if (pair.key === '' && isBlank(pair.value)) continue;
    const name = specKey(pair.key);
    if (name !== null && !used.has(name)) {
      used.add(name);
      out.used.push({ tab: 'Course', column: name, source_column: pair.key.slice(0, 200) });
    }
    if (name === null && pair.key !== '') {
      const best = suggest(
        spec.map((c) => c.name),
        [pair.key],
      )[0];
      if (best) {
        out.issues.push(
          info({
            ...at,
            row: pair.row,
            code: 'mapping_suggestion',
            column: best.column,
            value: pair.key,
            suggestion: {
              tab: 'Course',
              column: best.column,
              source_column: pair.key.slice(0, 200),
            },
            message: `The Course key '${pair.key}' looks like it could be ${best.column}. If it is, confirm it in Column mapping and import again.`,
          }),
        );
      }
    }
    const value = name === 'grade' ? normalizeGrade(pair.value) : pair.value;
    out.rows.push({ key: name ?? pair.key, value });
    out.rowNumbers.push(pair.row);
    if (pair.value !== null && name !== null) {
      out.issues.push(...cellIssues(sheet, 'Course', pair.row, name, pair.valueColumn, pair.value));
    }
  }
  return out;
}
