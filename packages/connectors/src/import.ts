import {
  ColumnMappingSchema,
  TAB_NAMES,
  type ColumnMapping,
  type ColumnMappingEntry,
  type ImportIssue,
  type Pack,
  type TabName,
} from '@ideamap/contracts';
import { assemblePack } from './assemble.js';
import { csvConnector, defaultContext } from './csv.js';
import { detect, readUpload, sourceName } from './detect.js';
import {
  DEFAULT_LIMITS,
  error,
  FileRefused,
  info,
  sortIssues,
  type ImportLimits,
} from './issues.js';
import { jsonConnector } from './json.js';
import type { ImportConnector, RawSheet, SourceKind } from './types.js';
import { xlsxConnector } from './xlsx.js';

export const CONNECTORS: readonly ImportConnector[] = [xlsxConnector, csvConnector, jsonConnector];

export interface ImportOptions {
  /** The saved column mapping (Teacher Settings → Column mapping). */
  mapping?: ColumnMapping;
  limits?: Partial<ImportLimits>;
}

export interface ImportResult {
  /** True when nothing blocks the import and `pack` is set. */
  ok: boolean;
  pack: Pack | null;
  /** Every problem at once: blocking errors first, then warnings, then info. */
  issues: ImportIssue[];
  /** The form the pack came in, for the version's source; null if nothing was read. */
  kind: SourceKind | null;
  /** Each file or sheet read, and the tab it was taken as (null if it was ignored). */
  sources: { source: string; tab: TabName | null }[];
  /** The column mapping that was applied, to store with the version. */
  mapping: ColumnMappingEntry[];
  /** Mappings for near-miss headers, for the teacher to confirm. */
  suggestions: ColumnMappingEntry[];
}

const fileName = (file: Blob) =>
  sourceName(typeof (file as File).name === 'string' ? (file as File).name : '');

const EXPECTED_TABS =
  `A curriculum pack has eight tabs: ${TAB_NAMES.join(', ')}. ` +
  'Upload a workbook with a sheet for each, or one CSV file per tab named after it (Ideas.csv and so on). ' +
  'The Curriculum Pack template shows the layout.';

/**
 * Imports a curriculum pack from an upload: one .xlsx workbook, pack JSON, CSV
 * files (one per tab, or zipped), or a mix. Returns the parsed pack and every
 * problem found. Nothing is written to disk and nothing is stored; saving the
 * draft version is C4's job.
 */
export async function importPack(
  files: Blob | readonly Blob[],
  options: ImportOptions = {},
): Promise<ImportResult> {
  const limits: ImportLimits = { ...DEFAULT_LIMITS, ...options.limits };
  const context = defaultContext(limits);
  const list = files instanceof Blob ? [files] : [...files];
  const result: ImportResult = {
    ok: false,
    pack: null,
    issues: [],
    kind: null,
    sources: [],
    mapping: [],
    suggestions: [],
  };
  const finish = () => {
    result.issues = sortIssues(result.issues);
    result.suggestions = result.issues.flatMap((i) => (i.suggestion ? [i.suggestion] : []));
    return result;
  };

  let mapping: ColumnMappingEntry[] = [];
  if (options.mapping !== undefined) {
    const parsed = ColumnMappingSchema.safeParse(options.mapping);
    if (parsed.success) mapping = parsed.data;
    else {
      result.issues.push(
        error({
          code: 'mapping_invalid',
          message:
            "The saved column mapping can't be read, so the import stopped. Check Column mapping in Teacher Settings.",
        }),
      );
      return finish();
    }
  }
  if (list.length === 0) {
    result.issues.push(
      error({ code: 'no_tabs', message: `Nothing was uploaded. ${EXPECTED_TABS}` }),
    );
    return finish();
  }
  if (list.length > limits.maxFiles) {
    result.issues.push(
      error({
        code: 'file_refused',
        message: `${list.length} files were uploaded; the most is ${limits.maxFiles}. Zip them, or upload one workbook.`,
      }),
    );
    return finish();
  }

  const sheets = new Map<TabName, RawSheet>();
  const kinds: SourceKind[] = [];
  let refused = false;
  for (const file of list) {
    const name = fileName(file);
    try {
      const { bytes } = await readUpload(file, limits);
      const connector = CONNECTORS.find((c) => c.accepts(bytes));
      if (!connector) {
        const found = detect(bytes, name);
        throw new FileRefused(found.kind === 'refused' ? found.message : `${name} can't be read.`);
      }
      const raw = await connector.parse(file, context);
      result.issues.push(...raw.issues);
      for (const sheet of raw.sheets) {
        result.sources.push({ source: sheet.source, tab: sheet.tab });
        if (sheet.tab === null) continue;
        const earlier = sheets.get(sheet.tab);
        if (earlier) {
          result.issues.push(
            error({
              code: 'tab_duplicate',
              source: sheet.source,
              tab: sheet.tab,
              message: `Both ${earlier.source} and ${sheet.source} give the ${sheet.tab} tab. Upload just one of them.`,
            }),
          );
          continue;
        }
        sheets.set(sheet.tab, sheet);
        if (!kinds.includes(raw.kind)) kinds.push(raw.kind);
      }
    } catch (cause) {
      refused = true;
      result.issues.push(
        error({
          code: 'file_refused',
          source: name,
          message:
            cause instanceof FileRefused
              ? cause.message
              : `${name} couldn't be read. Check that it opens in a spreadsheet app, then upload it again.`,
        }),
      );
    }
  }

  if (sheets.size === 0) {
    if (!refused) {
      // One message that says what was expected, rather than one per file or key.
      result.issues = [];
      result.issues.push(
        error({
          code: 'no_tabs',
          message: `None of the files or sheets uploaded is a pack tab. ${EXPECTED_TABS}`,
        }),
      );
    }
    return finish();
  }
  for (const { source, tab } of result.sources) {
    if (tab === null) {
      result.issues.push(
        info({
          code: 'tab_ignored',
          source,
          message: `${source} isn't one of the eight pack tabs, so it wasn't read.`,
        }),
      );
    }
  }
  result.kind = kinds[0] ?? null;
  const assembled = assemblePack(sheets, mapping);
  result.issues.push(...assembled.issues);
  result.mapping = assembled.used;
  result.pack = assembled.pack;
  result.ok = assembled.pack !== null && !result.issues.some((i) => i.severity === 'error');
  if (!result.ok) result.pack = null;
  return finish();
}
