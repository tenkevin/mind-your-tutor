import type { ImportIssue, TabName } from '@ideamap/contracts';
import type { ImportLimits } from './issues.js';
import type { UnpackBudget } from './zip.js';

export type SourceKind = 'csv' | 'xlsx' | 'json';

/** A spreadsheet cell as read, before any pack conversion. JSON cells can also be lists. */
export type RawCell = string | number | boolean | null | readonly unknown[] | object;

/** One tab's worth of cells from a CSV file, an XLSX sheet or a JSON pack. */
export interface RawSheet {
  /** The tab this file or sheet is, or null when its name matches none. */
  tab: TabName | null;
  /** The file or sheet as the teacher would name it: "Ideas.csv", "water-cycle.xlsx › Ideas". */
  source: string;
  /** Rows of cells. Unmatched sheets have no rows: they are never read. */
  grid: RawCell[][];
  /** The spreadsheet row number of each grid row, as the teacher sees it. */
  rowNumbers: number[];
  /**
   * Cells that need a note, keyed `${gridRow}:${column}`: `formula` (the saved value
   * was read, the formula wasn't run) or `error` (a value such as #REF!).
   */
  marks?: ReadonlyMap<string, 'formula' | 'error'>;
  /** XLSX only: dates count from 1904 rather than 1900. */
  date1904?: boolean;
}

/** What a connector reads from one file. */
export interface RawTabs {
  kind: SourceKind;
  sheets: RawSheet[];
  issues: ImportIssue[];
}

export interface ParseContext {
  limits: ImportLimits;
  budget: UnpackBudget;
}

/**
 * A file parser (ARCHITECTURE.md §7, decision D4). It turns one uploaded file into
 * raw tabs; column mapping and validation through the F3 contracts happen after.
 */
export interface ImportConnector {
  kind: SourceKind;
  /** True when the bytes are this connector's format. The type is decided by content, never by file name. */
  accepts(bytes: Uint8Array): boolean;
  parse(file: Blob, context?: ParseContext): Promise<RawTabs>;
}
