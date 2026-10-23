import { z } from 'zod';
import { PackIssueSchema } from './issues.js';
import { TAB_NAMES } from './spec.js';

// What an import (C1) reports back to the import screen: the pack issues F3
// defines, plus where in the upload each one is and problems with the files
// themselves (wrong type, too big, missing tabs, unmatched columns).

/** One source column mapped onto a pack column, as Teacher Settings → Column mapping saves it. */
export const ColumnMappingEntrySchema = z.object({
  tab: z.enum(TAB_NAMES),
  column: z.string().min(1).max(100),
  source_column: z.string().min(1).max(200),
});
export type ColumnMappingEntry = z.infer<typeof ColumnMappingEntrySchema>;

export const ColumnMappingSchema = z.array(ColumnMappingEntrySchema).max(500);
export type ColumnMapping = z.infer<typeof ColumnMappingSchema>;

export const IMPORT_ISSUE_CODES = [
  /** The file was refused: wrong type, too big, unsafe, or unreadable. */
  'file_refused',
  /** None of the eight tabs was found. */
  'no_tabs',
  'tab_missing',
  /** Two files or sheets give the same tab. */
  'tab_duplicate',
  /** A file or sheet that isn't one of the eight tabs. */
  'tab_ignored',
  /** An optional tab is missing or unusable, so its spec default is used. */
  'tab_default',
  'column_missing',
  /** More than one source column could be this pack column. */
  'column_ambiguous',
  /** A source column that isn't a pack column; it is left out of the pack. */
  'column_ignored',
  /** The saved column mapping names a column that doesn't exist. */
  'mapping_invalid',
  /** A near-miss header; the teacher can confirm the suggested mapping. */
  'mapping_suggestion',
  /** A cell value problem from the pack contracts. */
  'cell',
  /** A pack-level problem from the pack contracts, such as too many rows. */
  'pack',
  /** A spreadsheet formula: its saved value was read and the formula wasn't run. */
  'formula',
  /** Text starting with =, +, - or @, which a spreadsheet could run; exports escape it. */
  'formula_text',
  /** A spreadsheet error value such as #REF!. */
  'cell_error',
  /** pass_mark between 0 and 1, which probably means a fraction rather than a percent. */
  'pass_mark_fraction',
  /** A CSV quote that is never closed. */
  'csv_quote',
] as const;
export type ImportIssueCode = (typeof IMPORT_ISSUE_CODES)[number];

/**
 * One problem found while importing. Extends `PackIssue` with `info` severity,
 * the file or sheet it came from and a code for the import screen to group by.
 * `row` is the row number the teacher sees in their spreadsheet.
 */
export const ImportIssueSchema = PackIssueSchema.extend({
  severity: z.enum(['error', 'warning', 'info']),
  code: z.enum(IMPORT_ISSUE_CODES),
  /** File name, or "workbook.xlsx › Sheet" for a sheet, or null for the whole upload. */
  source: z.string().max(300).nullable(),
  /** For `mapping_suggestion`: the mapping the teacher can confirm. */
  suggestion: ColumnMappingEntrySchema.nullable().default(null),
});
export type ImportIssue = z.infer<typeof ImportIssueSchema>;
