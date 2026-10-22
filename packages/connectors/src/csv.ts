import { detect, readUpload, sourceName } from './detect.js';
import { DEFAULT_LIMITS, FileRefused, warning, type ImportLimits } from './issues.js';
import { matchTab } from './tabs.js';
import type { ImportConnector, ParseContext, RawSheet, RawTabs } from './types.js';
import { ZipReader } from './zip.js';

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
 * Stops with `FileRefused` once more than `maxRows` records follow the header.
 */
export function parseCsv(
  text: string,
  maxRows: number,
  maxColumns: number,
  label: string,
): CsvGrid {
  const delimiter = delimiterOf(text);
  const grid: CsvGrid = { rows: [], rowNumbers: [], unclosedQuoteAt: null };
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let record = 1;
  let quoteOpenedAt = 0;
  const endRow = () => {
    row.push(field);
    field = '';
    if (row.length > maxColumns) {
      throw new FileRefused(
        `${label} has more than ${maxColumns} columns; the most a tab can have is ${maxColumns}.`,
      );
    }
    grid.rows.push(row);
    grid.rowNumbers.push(record);
    row = [];
    record++;
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
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') {
      quoted = true;
      quoteOpenedAt = record;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else field += ch;
  }
  if (quoted) grid.unclosedQuoteAt = quoteOpenedAt;
  if (field !== '' || row.length > 0 || quoted) endRow();
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
  const grid = parseCsv(text, limits.maxRowsPerTab, limits.maxColumns, source);
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
  for (const entry of zip.entries.values()) {
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
