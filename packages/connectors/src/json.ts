import { TAB_NAMES, type TabName } from '@ideamap/contracts';
import { decodeText, defaultContext } from './csv.js';
import { detect, readUpload } from './detect.js';
import { error, FileRefused, type ImportLimits } from './issues.js';
import { matchTab } from './tabs.js';
import type { ImportConnector, RawCell, RawSheet, RawTabs } from './types.js';

// A pack as JSON (docs/spec/curriculum-pack.schema.json). Each tab is turned into
// the same header-and-rows grid a sheet gives, so column mapping and validation
// are the same for every form. Item i of a tab is row i + 2, its row in the sheet.

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function courseGrid(course: Record<string, unknown>): RawSheet['grid'] {
  return [['key', 'value'], ...Object.entries(course).map(([k, v]) => [k, v as RawCell])];
}

function rowsGrid(
  tab: TabName,
  items: readonly unknown[],
  source: string,
  limits: ImportLimits,
  issues: RawTabs['issues'],
): { grid: RawSheet['grid']; rowNumbers: number[] } {
  if (items.length > limits.maxRowsPerTab) {
    throw new FileRefused(
      `The ${tab} tab has more than ${limits.maxRowsPerTab.toLocaleString('en')} rows; the most a tab can have is ${limits.maxRowsPerTab.toLocaleString('en')}.`,
    );
  }
  const header: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!isObject(item)) continue;
    for (const key of Object.keys(item)) {
      if (!seen.has(key)) {
        seen.add(key);
        header.push(key);
        if (header.length > limits.maxColumns) {
          throw new FileRefused(`The ${tab} tab has more than ${limits.maxColumns} columns.`);
        }
      }
    }
  }
  const grid: RawSheet['grid'] = [header];
  const rowNumbers = [1];
  items.forEach((item, i) => {
    if (!isObject(item)) {
      issues.push(
        error({
          code: 'cell',
          source,
          tab,
          row: i + 2,
          message: `This ${tab} row isn't a row of named columns.`,
        }),
      );
      return;
    }
    grid.push(header.map((key) => (Object.hasOwn(item, key) ? (item[key] as RawCell) : null)));
    rowNumbers.push(i + 2);
  });
  return { grid, rowNumbers };
}

export function readPackJson(text: string, file: string, limits: ImportLimits): RawTabs {
  let pack: unknown;
  try {
    pack = JSON.parse(text);
  } catch {
    throw new FileRefused(`${file} isn't valid JSON, so it can't be read as a pack.`);
  }
  if (!isObject(pack)) {
    throw new FileRefused(
      `${file} must be a JSON object with one entry per tab (course, units, ideas…).`,
    );
  }
  const out: RawTabs = { kind: 'json', sheets: [], issues: [] };
  if (pack.version !== 1) {
    out.issues.push(
      error({
        code: 'pack',
        source: file,
        column: 'version',
        value: typeof pack.version === 'number' ? pack.version : null,
        message: 'version must be 1.',
      }),
    );
  }
  for (const [key, value] of Object.entries(pack)) {
    if (key === 'version' || key === '$schema') continue;
    const tab = matchTab(key);
    const source = `${file} › ${key}`;
    if (tab === null || !TAB_NAMES.includes(tab)) {
      out.sheets.push({ tab: null, source, grid: [], rowNumbers: [] });
      continue;
    }
    if (tab === 'Course') {
      if (!isObject(value)) {
        out.issues.push(
          error({
            code: 'pack',
            source,
            tab,
            message: 'The Course tab must be a set of keys and values.',
          }),
        );
        continue;
      }
      const grid = courseGrid(value);
      out.sheets.push({ tab, source, grid, rowNumbers: grid.map((_, i) => i + 1) });
      continue;
    }
    if (!Array.isArray(value)) {
      out.issues.push(
        error({ code: 'pack', source, tab, message: `The ${tab} tab must be a list of rows.` }),
      );
      continue;
    }
    out.sheets.push({ tab, source, ...rowsGrid(tab, value, source, limits, out.issues) });
  }
  return out;
}

/** A pack as JSON, as exported by the app or written by hand. */
export const jsonConnector: ImportConnector = {
  kind: 'json',
  accepts(bytes) {
    return detect(bytes, '').kind === 'json';
  },
  async parse(file, context = defaultContext()) {
    const { name, bytes } = await readUpload(file, context.limits);
    const kind = detect(bytes, name);
    if (kind.kind !== 'json')
      throw new FileRefused(kind.kind === 'refused' ? kind.message : `${name} isn't a JSON file.`);
    return readPackJson(decodeText(bytes), name, context.limits);
  },
};
