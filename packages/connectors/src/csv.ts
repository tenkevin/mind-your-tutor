import { detect, readUpload, sourceName } from './detect.js';
import { DEFAULT_LIMITS, FileRefused, warning, type ImportLimits } from './issues.js';
import { matchTab } from './tabs.js';
import type { ImportConnector, ParseContext, RawSheet, RawTabs } from './types.js';
import { ZipReader, type ZipEntry } from './zip.js';

export interface CsvGrid {
  rows: string[][];
  /** The 1-based record number of each row; a quoted cell can span lines. */
  rowNumbers: number[];
  /** Record number where a quoted cell was opened and never closed, or null. */
  unclosedQuoteAt: number | null;
}

/** Decodes CSV bytes: UTF-8 (with or without a byte order mark) or UTF-16 with one. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  // TextDecoder drops a UTF-8 byte order mark.
  return new TextDecoder('utf-8').decode(bytes);
}

/** Picks the delimiter used in the first line: comma, semicolon or tab. */
function delimiterOf(text: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const ch of text.slice(0, 10_000)) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && ch in counts) counts[ch]!++;
  }
  const [best, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]!;
  return count > 0 ? best : ',';
}

/**
 * Reads RFC 4180 CSV: quoted cells, doubled quotes, CRLF or LF line ends.
 * Stops once the row, column, header or cell limit is exceeded. Fields are
 * sliced from the decoded input so a long value is not built character by character.
 */
export function parseCsv(
  text: string,
  maxRows: number,
  maxColumns: number,
  label: string,
  limits: { maxCellChars?: number; maxHeaderChars?: number; headerlessFirstRow?: boolean } = {},
): CsvGrid {
  const delimiter = delimiterOf(text);
  const grid: CsvGrid = { rows: [], rowNumbers: [], unclosedQuoteAt: null };
  const maxCellChars = limits.maxCellChars ?? 256_000;
  const maxHeaderChars = limits.maxHeaderChars ?? 1_024;
  let row: string[] = [];
  let quoted = false;
  let record = 1;
  let quoteOpenedAt = 0;
  let fieldStart = 0;
  let fieldContentStart = 0;
  let fieldQuoted = false;
  let fieldEscaped = false;
  let fieldClosedAt: number | null = null;
  let fieldLength = 0;
  let firstLogicalRow = true;
  let logicalRowHasContent = false;

  const isHeader = () =>
    firstLogicalRow && logicalRowHasContent && limits.headerlessFirstRow !== true;
  const limitFor = () => (isHeader() ? maxHeaderChars : maxCellChars);
  const markRecordContent = (ch: string) => {
    if (firstLogicalRow && !logicalRowHasContent && !/\s/.test(ch)) logicalRowHasContent = true;
  };
  const refuseLongField = () => {
    const header = isHeader();
    const limit = limitFor();
    throw new FileRefused(
      `${label} has a ${header ? 'header' : 'cell'} longer than ${limit.toLocaleString('en')} characters; the most a CSV ${header ? 'header' : 'cell'} can have is ${limit.toLocaleString('en')}.`,
    );
  };
  const addFieldCharacter = () => {
    fieldLength++;
    if (fieldLength > limitFor()) refuseLongField();
  };
  const finishField = (end: number) => {
    if (!fieldQuoted) return text.slice(fieldStart, end);
    const contentEnd = fieldClosedAt ?? end;
    let value = text.slice(fieldContentStart, contentEnd);
    if (fieldEscaped) value = value.replace(/""/g, '"');
    if (fieldClosedAt !== null && fieldClosedAt + 1 < end) {
      value += text.slice(fieldClosedAt + 1, end);
    }
    return value;
  };
  const resetField = (nextStart: number) => {
    fieldStart = nextStart;
    fieldContentStart = nextStart;
    fieldQuoted = false;
    fieldEscaped = false;
    fieldClosedAt = null;
    fieldLength = 0;
  };
  const addRow = (end: number, nextStart: number) => {
    row.push(finishField(end));
    if (row.length > maxColumns) {
      throw new FileRefused(
        `${label} has more than ${maxColumns} columns; the most a tab can have is ${maxColumns}.`,
      );
    }
    grid.rows.push(row);
    grid.rowNumbers.push(record);
    if (logicalRowHasContent) firstLogicalRow = false;
    logicalRowHasContent = false;
    row = [];
    record++;
    resetField(nextStart);
    if (grid.rows.length > maxRows + 1) {
      throw new FileRefused(
        `${label} has more than ${maxRows.toLocaleString('en')} rows; the most a tab can have is ${maxRows.toLocaleString('en')}.`,
      );
    }
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          fieldEscaped = true;
          logicalRowHasContent = true;
          addFieldCharacter();
          i++;
        } else {
          quoted = false;
          fieldClosedAt = i;
        }
      } else {
        markRecordContent(ch);
        addFieldCharacter();
      }
    } else if (ch === '"' && i === fieldStart) {
      quoted = true;
      quoteOpenedAt = record;
      fieldQuoted = true;
      fieldContentStart = i + 1;
    } else if (ch === delimiter) {
      row.push(finishField(i));
      if (row.length > maxColumns) {
        throw new FileRefused(
          `${label} has more than ${maxColumns} columns; the most a tab can have is ${maxColumns}.`,
        );
      }
      resetField(i + 1);
    } else if (ch === '\n' || ch === '\r') {
      const end = i;
      if (ch === '\r' && text[i + 1] === '\n') i++;
      addRow(end, i + 1);
    } else {
      markRecordContent(ch);
      addFieldCharacter();
    }
  }
  if (quoted) grid.unclosedQuoteAt = quoteOpenedAt;
  if (fieldStart < text.length || row.length > 0 || quoted) addRow(text.length, text.length);
  return grid;
}

export function csvSheet(
  text: string,
  name: string,
  source: string,
  limits: ImportLimits,
): { sheet: RawSheet; issues: RawTabs['issues'] } {
  const tab = matchTab(name);
  const issues: RawTabs['issues'] = [];
  if (tab === null) {
    return { sheet: { tab, source, grid: [], rowNumbers: [] }, issues };
  }
  const grid = parseCsv(text, limits.maxRowsPerTab, limits.maxColumns, source, {
    maxCellChars: limits.maxCsvCellChars,
    maxHeaderChars: limits.maxCsvHeaderChars,
    ...(tab === 'Course' ? { headerlessFirstRow: true } : {}),
  });
  if (tab === 'Course') {
    const header = grid.rows.find((row) => row.some((cell) => cell.trim() !== ''));
    if (
      header?.some((cell) => cell.trim().toLowerCase() === 'key') &&
      header.some((cell) => cell.trim().toLowerCase() === 'value')
    ) {
      const long = header.find((cell) => cell.length > limits.maxCsvHeaderChars);
      if (long !== undefined)
        throw new FileRefused(
          `${source} has a header longer than ${limits.maxCsvHeaderChars.toLocaleString('en')} characters; the most a CSV header can have is ${limits.maxCsvHeaderChars.toLocaleString('en')}.`,
        );
    }
  }
  if (grid.unclosedQuoteAt !== null) {
    issues.push(
      warning({
        code: 'csv_quote',
        source,
        tab,
        row: grid.unclosedQuoteAt,
        message: `A quoted cell that starts on row ${grid.unclosedQuoteAt} is never closed, so everything after it was read into that one cell. Check for a missing " in that row.`,
      }),
    );
  }
  return { sheet: { tab, source, grid: grid.rows, rowNumbers: grid.rowNumbers }, issues };
}

const isCsvName = (name: string) => /\.(csv|tsv|txt)$/i.test(name);

/** Reads every CSV in a zip; folders are ignored and entry names are only matched, never used as paths. */
function readCsvZip(bytes: Uint8Array, file: string, context: ParseContext): RawTabs {
  const zip = ZipReader.open(bytes, context.budget, context.limits.maxZipEntries);
  const out: RawTabs = { kind: 'csv', sheets: [], issues: [] };
  const candidates = zip.allEntries.filter((entry) => {
    const base = entry.name.split('/').pop() ?? '';
    return (
      !entry.name.endsWith('/') &&
      !entry.unsafe &&
      !base.startsWith('.') &&
      !entry.name.startsWith('__MACOSX/') &&
      isCsvName(base) &&
      matchTab(base) !== null
    );
  });
  zip.preflightDeclared(candidates);
  const firstByTab = new Map<NonNullable<ReturnType<typeof matchTab>>, ZipEntry>();
  const duplicateTabs = new Set<NonNullable<ReturnType<typeof matchTab>>>();
  for (const entry of candidates) {
    const tab = matchTab(entry.name.split('/').pop() ?? '');
    if (tab === null) continue;
    if (firstByTab.has(tab)) duplicateTabs.add(tab);
    else firstByTab.set(tab, entry);
  }
  if (duplicateTabs.size > 0) {
    // Report duplicates to importPack without touching any entry payload. This
    // lets its normal tab_duplicate issue explain the affected source files.
    for (const entry of candidates) {
      const base = entry.name.split('/').pop() ?? '';
      const tab = matchTab(base);
      if (tab !== null) {
        out.sheets.push({
          tab,
          source: `${file} › ${entry.name}`,
          grid: [],
          rowNumbers: [],
        });
      }
    }
    return out;
  }
  for (const entry of zip.allEntries) {
    const base = entry.name.split('/').pop() ?? '';
    if (entry.name.endsWith('/') || base.startsWith('.') || entry.name.startsWith('__MACOSX/'))
      continue;
    const source = `${file} › ${entry.name}`;
    if (entry.unsafe) {
      out.issues.push(
        warning({
          code: 'tab_ignored',
          source,
          message: `The zip has a file named '${entry.name}', which points outside the zip. It was skipped.`,
        }),
      );
      continue;
    }
    if (!isCsvName(base) || matchTab(base) === null) {
      out.sheets.push({ tab: null, source, grid: [], rowNumbers: [] });
      continue;
    }
    const data = zip.read(entry);
    if (detect(data, base).kind !== 'csv') {
      throw new FileRefused(`${entry.name} in the zip isn't a CSV file.`);
    }
    const { sheet, issues } = csvSheet(decodeText(data), base, source, context.limits);
    out.sheets.push(sheet);
    out.issues.push(...issues);
  }
  return out;
}

/** CSV: one file per tab, matched to its tab by file name, or several in a zip. */
export const csvConnector: ImportConnector = {
  kind: 'csv',
  accepts(bytes) {
    const kind = detect(bytes, '').kind;
    return kind === 'csv' || kind === 'csv-zip';
  },
  async parse(file, context = defaultContext()) {
    const { name, bytes } = await readUpload(file, context.limits);
    const kind = detect(bytes, name);
    if (kind.kind === 'csv-zip') return readCsvZip(bytes, name, context);
    if (kind.kind !== 'csv')
      throw new FileRefused(kind.kind === 'refused' ? kind.message : `${name} isn't a CSV file.`);
    const { sheet, issues } = csvSheet(decodeText(bytes), name, sourceName(name), context.limits);
    return { kind: 'csv', sheets: [sheet], issues };
  },
};

export function defaultContext(limits: ImportLimits = DEFAULT_LIMITS): ParseContext {
  return { limits, budget: { remaining: limits.maxUnpackedBytes, total: limits.maxUnpackedBytes } };
}
