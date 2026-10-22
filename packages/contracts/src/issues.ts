import { z } from 'zod';
import { TAB_NAMES } from './spec.js';

/**
 * One problem found in a pack, located to the cell.
 *
 * `row` is the sheet row, counting the header as row 1. For a pack given as JSON,
 * item `i` of a tab is reported as row `i + 2`, the row it has in the exported sheet.
 * Course keys have a row only when parsed from key/value rows.
 *
 * `effect` is what the import does about it, from the column's spec `missing` text:
 * `blocks_import`, `skips_row`, or `uses_fallback` (the app carries on as `fallback`
 * describes). Warnings have the effect `none`.
 */
export const PackIssueSchema = z.object({
  severity: z.enum(['error', 'warning']),
  effect: z.enum(['blocks_import', 'skips_row', 'uses_fallback', 'none']),
  tab: z.enum(TAB_NAMES).nullable(),
  row: z.number().int().min(1).nullable(),
  column: z.string().max(100).nullable(),
  /** The cell's value; long text is cut short. `null` when the cell is empty. */
  value: z.union([z.string().max(250), z.number(), z.boolean()]).nullable(),
  /** The spec's behaviour when the value is missing, for `uses_fallback`. */
  fallback: z.string().max(200).nullable(),
  message: z.string().max(2000),
});
export type PackIssue = z.infer<typeof PackIssueSchema>;
export type IssueEffect = PackIssue['effect'];

/** "Ideas, row 7, unit: unit must be a whole number…" */
export function formatIssue(issue: PackIssue): string {
  const where = [issue.tab, issue.row === null ? null : `row ${issue.row}`, issue.column].filter(
    (part) => part !== null,
  );
  return where.length > 0 ? `${where.join(', ')}: ${issue.message}` : issue.message;
}
