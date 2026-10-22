import { serialToIsoDate } from './dates.js';
import { defaultContext } from './csv.js';
import { detect, readUpload } from './detect.js';
import { FileRefused, warning } from './issues.js';
import { matchTab } from './tabs.js';
import type { ImportConnector, ParseContext, RawCell, RawSheet, RawTabs } from './types.js';
import { decodeXml, walkXml } from './xml.js';
import { ZipReader } from './zip.js';

// Reads an .xlsx workbook without any spreadsheet library. Formulas are never
// run: a formula cell gives the value Excel saved with it, or the formula's text
// when there is none. Number formats are read only to tell dates and percents
// from plain numbers.

type FormatClass = 'general' | 'date' | 'percent';

// Built-in number formats (ECMA-376 §18.8.30) that show dates or percents.
const BUILT_IN_DATES = new Set([
  14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 34, 35, 36, 50, 51, 52, 53, 54, 57, 58,
]);
const BUILT_IN_PERCENTS = new Set([9, 10]);

export function classifyFormat(code: string): FormatClass {
  // Ignore quoted text, escaped characters and [colour] or [$-locale] sections.
  const bare = code
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/\[[^\]]*\]/g, '');
  if (bare.includes('%')) return 'percent';
  if (/general/i.test(bare)) return 'general';
  // A day or year means a date. Time-only formats stay plain numbers.
  return /[dy]/i.test(bare) ? 'date' : 'general';
}

function joinPath(dir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = dir === '' ? [] : dir.split('/');
  for (const part of target.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.' && part !== '') parts.push(part);
  }
  return parts.join('/');
}

const dirOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

interface Relationship {
  type: string;
  target: string;
}

function readRels(xml: string | null, base: string): Map<string, Relationship> {
  const rels = new Map<string, Relationship>();
  if (xml === null) return rels;
  walkXml(xml, {
    open(tag) {
      if (tag.name === 'Relationship' && tag.attrs.Id && tag.attrs.Target) {
        if (tag.attrs.TargetMode === 'External') return;
        rels.set(tag.attrs.Id, {
          type: tag.attrs.Type ?? '',
          target: joinPath(base, tag.attrs.Target),
        });
      }
    },
  });
  return rels;
}

function readSharedStrings(xml: string | null): string[] {
  const strings: string[] = [];
  if (xml === null) return strings;
  let current: string | null = null;
  let inText = false;
  let phonetic = 0;
  walkXml(xml, {
    open(tag) {
      if (tag.name === 'si') current = '';
      else if (tag.name === 'rPh') phonetic++;
      else if (tag.name === 't' && !tag.selfClosing) inText = true;
    },
    close(name) {
      if (name === 'si') {
        strings.push(current ?? '');
        current = null;
      } else if (name === 'rPh') phonetic--;
      else if (name === 't') inText = false;
    },
    text(text) {
      if (inText && phonetic === 0 && current !== null) current += text;
    },
  });
  return strings;
}

function readStyles(xml: string | null): FormatClass[] {
  if (xml === null) return [];
  const custom = new Map<number, string>();
  const classes: FormatClass[] = [];
  let inCellXfs = false;
  walkXml(xml, {
    open(tag) {
      if (tag.name === 'numFmt') custom.set(Number(tag.attrs.numFmtId), tag.attrs.formatCode ?? '');
      else if (tag.name === 'cellXfs') inCellXfs = true;
      else if (tag.name === 'xf' && inCellXfs) {
        const id = Number(tag.attrs.numFmtId ?? 0);
        const code = custom.get(id);
        classes.push(
          code !== undefined
            ? classifyFormat(code)
            : BUILT_IN_DATES.has(id)
              ? 'date'
              : BUILT_IN_PERCENTS.has(id)
                ? 'percent'
                : 'general',
        );
      }
    },
    close(name) {
      if (name === 'cellXfs') inCellXfs = false;
    },
  });
  return classes;
}

function columnIndex(ref: string | undefined): number | null {
  const letters = ref ? /^([A-Z]{1,3})/i.exec(ref)?.[1] : undefined;
  if (!letters) return null;
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

interface SheetContext {
  strings: string[];
  styles: FormatClass[];
  date1904: boolean;
  maxRows: number;
  maxColumns: number;
}

const round = (n: number) => Math.round(n * 1e9) / 1e9;

function readSheet(
  xml: string,
  source: string,
  ctx: SheetContext,
): { sheet: Omit<RawSheet, 'tab'>; wide: boolean } {
  const rows: { number: number; cells: RawCell[] }[] = [];
  const marks = new Map<string, 'formula' | 'error'>();
  let wide = false;
  let rowNumber = 0;
  let cells: RawCell[] = [];
  let hasValue = false;
  let column = -1;
  let type = 'n';
  let style = 0;
  let value = '';
  let formula: string | null = null;
  let inline: string | null = null;
  let into: 'v' | 'f' | 't' | null = null;

  const endCell = () => {
    let cell: RawCell = null;
    if (type === 's') cell = value === '' ? null : (ctx.strings[Number(value)] ?? null);
    else if (type === 'inlineStr') cell = inline;
    else if (type === 'str') cell = value;
    else if (type === 'b') cell = value === '' ? null : value === '1' ? 'TRUE' : 'FALSE';
    else if (type === 'e') cell = value;
    else if (type === 'd') cell = /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value;
    else if (value !== '') {
      const n = Number(value);
      const format = ctx.styles[style] ?? 'general';
      if (!Number.isFinite(n)) cell = value;
      else if (format === 'percent') cell = round(n * 100);
      else if (format === 'date') cell = serialToIsoDate(n, ctx.date1904) ?? n;
      else cell = n;
    }
    if (formula !== null && (cell === null || cell === '')) cell = `=${formula}`;
    if (column >= ctx.maxColumns) {
      if (cell !== null && cell !== '') wide = true;
      return;
    }
    if (cell === null || cell === '') return;
    cells[column] = cell;
    hasValue = true;
    if (type === 'e') marks.set(`${rowNumber}:${column}`, 'error');
    else if (formula !== null) marks.set(`${rowNumber}:${column}`, 'formula');
  };

  walkXml(xml, {
    open(tag) {
      switch (tag.name) {
        case 'row':
          rowNumber = Number(tag.attrs.r) || rowNumber + 1;
          cells = [];
          hasValue = false;
          column = -1;
          break;
        case 'c':
          column = columnIndex(tag.attrs.r) ?? column + 1;
          type = tag.attrs.t ?? 'n';
          style = Number(tag.attrs.s ?? 0);
          value = '';
          formula = null;
          inline = null;
          break;
        case 'v':
          into = 'v';
          break;
        case 'f':
          formula = '';
          into = 'f';
          break;
        case 'is':
          inline = '';
          break;
        case 't':
          if (inline !== null) into = 't';
          break;
      }
    },
    close(name) {
      if (name === 'v' || name === 'f' || name === 't') into = null;
      else if (name === 'c') endCell();
      else if (name === 'row' && hasValue) {
        rows.push({ number: rowNumber, cells });
        if (rows.length > ctx.maxRows + 1) {
          throw new FileRefused(
            `${source} has more than ${ctx.maxRows.toLocaleString('en')} rows; the most a tab can have is ${ctx.maxRows.toLocaleString('en')}.`,
          );
        }
      }
    },
    text(text) {
      if (into === 'v') value += text;
      else if (into === 'f') formula += text;
      else if (into === 't' && inline !== null) inline += text;
    },
  });
  rows.sort((a, b) => a.number - b.number);
  const grid = rows.map((r) => Array.from(r.cells, (c) => c ?? null));
  return {
    sheet: { source, grid, rowNumbers: rows.map((r) => r.number), marks, date1904: ctx.date1904 },
    wide,
  };
}

function readWorkbook(bytes: Uint8Array, file: string, context: ParseContext): RawTabs {
  const zip = ZipReader.open(bytes, context.budget, context.limits.maxZipEntries);
  const text = (path: string) => {
    const entry = zip.find(path);
    return entry ? decodeXml(zip.read(entry)) : null;
  };
  if (/macroEnabled/i.test(text('[Content_Types].xml') ?? '')) {
    throw new FileRefused(
      `${file} is a macro-enabled workbook, which imports never accept. Save it as an .xlsx (Excel Workbook) and upload that.`,
    );
  }
  const root = readRels(text('_rels/.rels'), '');
  const workbookPath =
    [...root.values()].find((r) => r.type.endsWith('/officeDocument'))?.target ?? 'xl/workbook.xml';
  const workbookXml = text(workbookPath);
  if (workbookXml === null)
    throw new FileRefused(`${file} is missing its workbook part, so it can't be read.`);

  const sheets: { name: string; rid: string }[] = [];
  let date1904 = false;
  walkXml(workbookXml, {
    open(tag) {
      if (tag.name === 'workbookPr')
        date1904 = tag.attrs.date1904 === '1' || tag.attrs.date1904 === 'true';
      if (tag.name === 'sheet' && tag.attrs.name && tag.attrs.id) {
        sheets.push({ name: tag.attrs.name, rid: tag.attrs.id });
      }
    },
  });
  const dir = dirOf(workbookPath);
  const rels = readRels(
    text(`${dir ? `${dir}/` : ''}_rels/${workbookPath.split('/').pop()}.rels`),
    dir,
  );
  const relOf = (kind: string) =>
    [...rels.values()].find((r) => r.type.endsWith(`/${kind}`))?.target;
  const ctx: SheetContext = {
    strings: readSharedStrings(text(relOf('sharedStrings') ?? `${dir}/sharedStrings.xml`)),
    styles: readStyles(text(relOf('styles') ?? `${dir}/styles.xml`)),
    date1904,
    maxRows: context.limits.maxRowsPerTab,
    maxColumns: context.limits.maxColumns,
  };

  const out: RawTabs = { kind: 'xlsx', sheets: [], issues: [] };
  for (const { name, rid } of sheets) {
    const source = `${file} › ${name}`;
    const tab = matchTab(name);
    const target = rels.get(rid)?.target;
    if (tab === null || target === undefined) {
      out.sheets.push({ tab: null, source, grid: [], rowNumbers: [] });
      continue;
    }
    const xml = text(target);
    if (xml === null) throw new FileRefused(`${file} is missing the data for its ${name} sheet.`);
    const { sheet, wide } = readSheet(xml, source, ctx);
    out.sheets.push({ tab, ...sheet });
    if (wide) {
      out.issues.push(
        warning({
          code: 'column_ignored',
          source,
          tab,
          message: `${name} has values after column ${ctx.maxColumns}. Only the first ${ctx.maxColumns} columns were read.`,
        }),
      );
    }
  }
  return out;
}

/** XLSX workbooks, including Google Sheets downloaded as .xlsx. Sheets are matched to tabs by name. */
export const xlsxConnector: ImportConnector = {
  kind: 'xlsx',
  accepts(bytes) {
    return detect(bytes, '').kind === 'xlsx';
  },
  async parse(file, context = defaultContext()) {
    const { name, bytes } = await readUpload(file, context.limits);
    const kind = detect(bytes, name);
    if (kind.kind !== 'xlsx')
      throw new FileRefused(
        kind.kind === 'refused' ? kind.message : `${name} isn't an .xlsx workbook.`,
      );
    return readWorkbook(bytes, name, context);
  },
};
