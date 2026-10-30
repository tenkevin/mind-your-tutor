import { needsFormulaEscape } from './mapping.js';
import { writeZip } from './zip-write.js';

// Export targets (ARCHITECTURE.md §7, decision D4): a report is built as plain
// sheets of cells (reports.ts), and a target writes it as a file to download.
// Nothing is cut short or dropped: a cell that can't be written as it is refuses
// the export with ExportRefused, saying where. Nothing an export writes is ever run as a formula: CSV cells that a spreadsheet
// would read as one get a leading apostrophe, and XLSX cells are always typed
// values, never formulas, with text that looks like one marked as text.

export type ExportCell = string | number | null;

export interface ExportSheet {
  /** Sheet name in a workbook; file name (`<name>.csv`) in a zip of CSVs. */
  name: string;
  header: readonly string[];
  rows: readonly (readonly ExportCell[])[];
  /** Column widths in characters, for XLSX. */
  widths?: readonly number[];
}

export const REPORT_KINDS = [
  'template',
  'pack',
  'data-checks',
  'alignment',
  'assessment-drafts',
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/** A report ready to write: what an `ExportTarget` takes. */
export interface ExportPayload {
  report: ReportKind;
  /** The file name without its extension, e.g. `water-cycle-alignment-2026-10-22`. */
  fileStem: string;
  sheets: readonly ExportSheet[];
}

/** A file ready to download. */
export interface FileRef {
  name: string;
  contentType: string;
  bytes: Uint8Array;
}

export type ExportFormat = 'csv' | 'xlsx';

/**
 * An export that can't be written without changing what it says. Nothing is ever
 * cut short or dropped silently: the export stops and says what to fix, and where.
 */
export class ExportRefused extends Error {
  constructor(
    message: string,
    readonly at: { sheet: string; row?: number; column?: string } | null = null,
  ) {
    super(message);
    this.name = 'ExportRefused';
  }
}

/** Excel's limit on the text in one cell; Excel also cuts a longer CSV cell here. */
export const MAX_CELL_TEXT = 32_767;

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** Where a cell is, as a teacher reads it: "Ideas, row 4, title". */
function where(sheet: ExportSheet, r: number, c: number) {
  const column = sheet.header[c] ?? columnName(c);
  return { sheet: sheet.name, row: r + 1, column, text: `${sheet.name}, row ${r + 1}, ${column}` };
}

/** Refuses a cell no spreadsheet could hold as it is. */
function checkCell(sheet: ExportSheet, r: number, c: number, text: string) {
  if (text.length > MAX_CELL_TEXT) {
    const at = where(sheet, r, c);
    throw new ExportRefused(
      `${at.text} has ${text.length.toLocaleString('en')} characters, more than the ` +
        `${MAX_CELL_TEXT.toLocaleString('en')} a spreadsheet cell can hold, so the export stopped. Shorten it, then export again.`,
      at,
    );
  }
}

/** Writes a report as a file (ARCHITECTURE.md §7). */
export interface ExportTarget {
  kind: ExportFormat;
  write(report: ExportPayload): Promise<FileRef>;
}

// ---- CSV -------------------------------------------------------------------

/** A carriage return not followed by a line feed (CRLF pairs are kept as they are). */
const LONE_CR = /\r(?!\n)/;

/** The idea a row is about, for a message: ` (idea "evap")`, or '' when the sheet names none. */
function ideaOf(sheet: ExportSheet, r: number): string {
  if (r === 0 || sheet.name !== 'Ideas') return '';
  const row = sheet.rows[r - 1];
  for (const key of ['title', 'id']) {
    const v = row?.[sheet.header.indexOf(key)];
    if (typeof v === 'string' && v.trim())
      return ` (idea "${v.replace(/\s+/g, ' ').trim().slice(0, 60)}")`;
  }
  return '';
}

const BOM = '﻿';

function csvCell(sheet: ExportSheet, r: number, c: number, cell: ExportCell): string {
  if (cell === null) return '';
  let text = String(cell);
  checkCell(sheet, r, c, text);
  if (LONE_SURROGATE.test(text)) {
    const at = where(sheet, r, c);
    throw new ExportRefused(
      `${at.text} has a broken character (half of an emoji or symbol) that UTF-8 can't store, so the export stopped. Retype that text, or export as XLSX.`,
      at,
    );
  }
  if (LONE_CR.test(text)) {
    // LibreOffice reads a bare carriage return inside a quoted CSV cell as a line feed, so the
    // text would change on opening. XLSX keeps it exactly (C6-E4).
    const at = where(sheet, r, c);
    const idea = ideaOf(sheet, r);
    throw new ExportRefused(
      `${at.text}${idea} has a lone carriage return (a line break typed as Return on its own) that a CSV file can't keep as it is, so the export stopped. Use the XLSX export, which keeps it exactly, or retype the line break in that cell.`,
      at,
    );
  }
  if (typeof cell === 'string' && needsFormulaEscape(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One sheet as CSV text: UTF-8 with a byte order mark, so Excel reads accents correctly. */
export function sheetToCsv(sheet: ExportSheet): string {
  const lines = [sheet.header, ...sheet.rows].map((row, r) =>
    row.map((cell, c) => csvCell(sheet, r, c, cell)).join(','),
  );
  return BOM + lines.join('\r\n') + '\r\n';
}

const encode = (text: string) => new TextEncoder().encode(text);

/** One sheet becomes a .csv file; a report with several sheets becomes a .zip of CSVs. */
export const csvExport: ExportTarget = {
  kind: 'csv',
  // A refused export rejects the promise rather than throwing.
  write: (report) => Promise.resolve().then(() => writeCsv(report)),
};

function writeCsv(report: ExportPayload): FileRef {
  const [only] = report.sheets;
  if (report.sheets.length === 1 && only) {
    return {
      name: `${report.fileStem}.csv`,
      contentType: 'text/csv; charset=utf-8',
      bytes: encode(sheetToCsv(only)),
    };
  }
  const bytes = writeZip(
    report.sheets.map((sheet) => ({ name: `${sheet.name}.csv`, data: encode(sheetToCsv(sheet)) })),
  );
  return { name: `${report.fileStem}.zip`, contentType: 'application/zip', bytes };
}

// ---- XLSX ------------------------------------------------------------------

const xml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r/g, '&#13;');

// Characters an XML file can't hold. Excel writes them as _xHHHH_ (one UTF-16 unit
// each), and the XLSX reader decodes them (xml.ts `decodeXstring`); text that
// already looks like an escape has its "_" escaped as _x005F_, as Excel does.
const XML_UNSAFE =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const hex4 = (code: number) => code.toString(16).toUpperCase().padStart(4, '0');

/** Text as an OOXML string (ST_Xstring), so every character reads back as it was. */
export function encodeXstring(text: string): string {
  return text
    .replace(/_(x[0-9A-Fa-f]{4}_)/g, '_x005F_$1')
    .replace(XML_UNSAFE, (ch) => `_x${hex4(ch.charCodeAt(0))}_`);
}

// Cell styles in styles.xml: 0 plain, 1 header (bold), 2 text marked as text
// (Excel's "quote prefix"), so it stays text even when the cell is edited.
const STYLE_HEADER = 1;
const STYLE_TEXT = 2;

function columnName(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function xlsxCell(sheet: ExportSheet, r: number, c: number, cell: ExportCell): string {
  const ref = `${columnName(c)}${r + 1}`;
  const header = r === 0;
  if (cell === null || cell === '') return header ? `<c r="${ref}" s="${STYLE_HEADER}"/>` : '';
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    return `<c r="${ref}"${header ? ` s="${STYLE_HEADER}"` : ''}><v>${cell}</v></c>`;
  }
  const text = String(cell);
  checkCell(sheet, r, c, text);
  const style = header ? STYLE_HEADER : needsFormulaEscape(text) ? STYLE_TEXT : 0;
  return (
    `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}>` +
    `<is><t xml:space="preserve">${xml(encodeXstring(text))}</t></is></c>`
  );
}

function worksheet(sheet: ExportSheet): string {
  const rows = [sheet.header, ...sheet.rows];
  const width = Math.max(1, ...rows.map((r) => r.length));
  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    `<dimension ref="A1:${columnName(width - 1)}${rows.length}"/>`,
    // The header row stays in view while scrolling.
    '<sheetViews><sheetView workbookViewId="0">',
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>',
    '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>',
    '</sheetView></sheetViews>',
    '<sheetFormatPr defaultRowHeight="15"/>',
  ];
  if (sheet.widths && sheet.widths.length > 0) {
    parts.push('<cols>');
    sheet.widths.forEach((w, i) =>
      parts.push(`<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`),
    );
    parts.push('</cols>');
  }
  parts.push('<sheetData>');
  rows.forEach((row, r) => {
    const cells = row.map((cell, c) => xlsxCell(sheet, r, c, cell));
    parts.push(`<row r="${r + 1}">${cells.join('')}</row>`);
  });
  parts.push('</sheetData></worksheet>');
  return parts.join('');
}

const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" quotePrefix="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Sheet names: at most 31 characters, none of : \ / ? * [ ], and unique. */
function sheetNames(sheets: readonly ExportSheet[]): string[] {
  const used = new Set<string>();
  return sheets.map((sheet, i) => {
    let name =
      sheet.name
        .replace(/[:\\/?*[\]]/g, ' ')
        .trim()
        .slice(0, 31) || `Sheet${i + 1}`;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${name.slice(0, 28)} ${n}`;
    used.add(name.toLowerCase());
    return name;
  });
}

/** Writes sheets as an .xlsx workbook. */
export function writeWorkbook(sheets: readonly ExportSheet[]): Uint8Array {
  const names = sheetNames(sheets);
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const files = [
    {
      name: '[Content_Types].xml',
      text:
        head +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join('') +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      text:
        head +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/>` +
        '</Relationships>',
    },
    {
      name: 'xl/workbook.xml',
      text:
        head +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${rel}">` +
        '<bookViews><workbookView/></bookViews><sheets>' +
        names
          .map((name, i) => `<sheet name="${xml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
          .join('') +
        '</sheets></workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      text:
        head +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="${rel}/styles" Target="styles.xml"/>` +
        '</Relationships>',
    },
    { name: 'xl/styles.xml', text: STYLES },
    ...sheets.map((sheet, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      text: worksheet(sheet),
    })),
  ];
  return writeZip(files.map((f) => ({ name: f.name, data: encode(f.text) })));
}

export const xlsxExport: ExportTarget = {
  kind: 'xlsx',
  write: (report) =>
    Promise.resolve().then(() => ({
      name: `${report.fileStem}.xlsx`,
      contentType: XLSX_TYPE,
      bytes: writeWorkbook(report.sheets),
    })),
};

export const EXPORT_TARGETS: Readonly<Record<ExportFormat, ExportTarget>> = {
  csv: csvExport,
  xlsx: xlsxExport,
};
