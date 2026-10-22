// Test helpers: read the water-cycle fixture in its three forms.
import { readFileSync } from 'node:fs';
import readXlsxFile from 'read-excel-file/node';
import { tableFromGrid, type PackTables } from '../parse.js';
import { TAB_NAMES, type TabName } from '../spec.js';

export const fixtureDir = new URL('../../../../fixtures/water-cycle/', import.meta.url);

export function readPackJson(): unknown {
  return JSON.parse(readFileSync(new URL('pack.json', fixtureDir), 'utf8'));
}

/** A small RFC 4180 reader: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export interface ReadTables {
  tables: PackTables;
  rowNumbers: Partial<Record<TabName, number[]>>;
}

function fromGrids(grids: Partial<Record<TabName, unknown[][]>>): ReadTables {
  const out: ReadTables = { tables: {}, rowNumbers: {} };
  for (const tab of TAB_NAMES) {
    const grid = grids[tab];
    if (!grid) continue;
    const table = tableFromGrid(grid);
    out.tables[tab] = table.rows;
    out.rowNumbers[tab] = table.rowNumbers;
  }
  return out;
}

export function readCsvTables(): ReadTables {
  const grids: Partial<Record<TabName, unknown[][]>> = {};
  for (const tab of TAB_NAMES) {
    grids[tab] = parseCsv(readFileSync(new URL(`${tab}.csv`, fixtureDir), 'utf8'));
  }
  return fromGrids(grids);
}

export async function readXlsxTables(): Promise<ReadTables> {
  const sheets = await readXlsxFile(new URL('water-cycle.xlsx', fixtureDir).pathname);
  const grids: Partial<Record<TabName, unknown[][]>> = {};
  for (const sheet of sheets) {
    if ((TAB_NAMES as readonly string[]).includes(sheet.sheet)) {
      grids[sheet.sheet as TabName] = sheet.data as unknown[][];
    }
  }
  return fromGrids(grids);
}
