import {
  MAX_ROWS,
  TAB_KEYS,
  columnSpec,
  courseFromKeyValueRows,
  parsePack,
  parseTabRow,
  type Category,
  type ColumnMappingEntry,
  type ImportIssue,
  type Pack,
  type PackIssue,
  type TabName,
} from '@ideamap/contracts';
import { error, fromPackIssue, info, warning } from './issues.js';
import { mapCourse, mapRows, type MappedTab } from './mapping.js';
import type { RawCell, RawSheet } from './types.js';

// Turns mapped rows into a pack through the F3 contracts, applying the spec's
// "missing" behaviour (docs/spec/curriculum-pack.fields.json) row by row:
// `blocks_import` stops the import, `skips_row` drops the row with a warning, and
// `uses_fallback` carries on with the spec's default and a warning. Whole-pack
// checks (unknown ids, loops) are C2's; nothing here looks across tabs except
// Ideas.category, whose fallback is the first category.

type RowTab = Exclude<TabName, 'Course'>;

/** Optional tabs, and what a pack gets when one is missing. */
const TAB_DEFAULTS = {
  Categories: {
    rows: (): unknown[] => [{ category: 'Idea', icon: null, description: null } satisfies Category],
    note: 'one category, “Idea”, is used',
  },
  Assessment: { rows: (): unknown[] => [], note: 'units have no fixed teach-back questions' },
  Personas: { rows: (): unknown[] => [], note: 'Using the built-in personas' },
  Library: { rows: (): unknown[] => [], note: 'the library is empty' },
} as const satisfies Partial<Record<RowTab, unknown>>;

const isOptionalTab = (tab: RowTab): tab is keyof typeof TAB_DEFAULTS => tab in TAB_DEFAULTS;

const ROW_TABS: readonly RowTab[] = [
  'Units',
  'Categories',
  'Ideas',
  'Links',
  'Assessment',
  'Personas',
  'Library',
];

interface Fallback {
  /** The value to use, or `skip` to drop the row. */
  value: unknown;
  note: string;
}

const SKIP = Symbol('skip');

function fileTitle(fileUrl: unknown): string | undefined {
  if (typeof fileUrl !== 'string') return undefined;
  const name = fileUrl.trim().split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  const title = (dot > 0 ? name.slice(0, dot) : name).trim();
  return title === '' ? undefined : title.slice(0, 200);
}

/**
 * Fallbacks for required columns whose spec says the import carries on. A
 * fallback that returns undefined can't be applied, and the problem blocks.
 */
const REQUIRED_FALLBACKS: Partial<
  Record<TabName, Record<string, (row: Record<string, unknown>, ctx: Ctx) => Fallback | undefined>>
> = {
  Units: {
    name: (row) => {
      const unit = Number(typeof row.unit === 'string' ? row.unit.trim() : row.unit);
      return Number.isInteger(unit) && unit >= 1
        ? {
            value: `Unit ${unit}`,
            note: `The unit is shown as “Unit ${unit}” until it has a name.`,
          }
        : undefined;
    },
  },
  Ideas: {
    category: (_row, ctx) => ({
      value: ctx.firstCategory,
      note: `The idea uses the first category, ${ctx.firstCategory}, until it has one.`,
    }),
  },
  Personas: {
    persona_id: () => ({
      value: SKIP,
      note: 'The row was skipped and the built-in persona is used.',
    }),
  },
  Library: {
    title: (row) => {
      const title = fileTitle(row.file_url);
      return title
        ? { value: title, note: `The file name, ${title}, is used as its title.` }
        : undefined;
    },
  },
};

interface Ctx {
  firstCategory: string;
}

interface RowOutcome {
  value: unknown;
  issues: ImportIssue[];
  /** A problem that stops the whole import. */
  blocked: boolean;
}

const asWarning = (issue: PackIssue, source: string, note?: string): ImportIssue => ({
  ...fromPackIssue(issue, source),
  severity: 'warning',
  message: note ? `${issue.message} ${note}` : issue.message,
});

/** Parses one row, applying the spec's missing behaviour to each problem in it. */
function parseRow(
  tab: TabName,
  input: Record<string, unknown>,
  row: number | null,
  source: string,
  ctx: Ctx,
): RowOutcome {
  const current: Record<string, unknown> = { ...input };
  const issues: ImportIssue[] = [];
  // Each pass fixes at least one column, so this ends within one pass per column.
  for (let pass = 0; pass <= Object.keys(current).length + 1; pass++) {
    const result = parseTabRow(tab, current, row);
    const notes = result.issues.filter((i) => i.severity !== 'error');
    if (result.ok) {
      const missingPersonaName =
        tab === 'Personas' &&
        (current.name === null ||
          current.name === undefined ||
          (typeof current.name === 'string' && current.name.trim() === ''))
          ? [
              warning({
                code: 'cell',
                source,
                tab,
                row,
                column: 'name',
                value: null,
                fallback: 'Built-in default',
                effect: 'uses_fallback',
                message: 'The name is missing; the built-in persona name will be used.',
              }),
            ]
          : [];
      return {
        value: result.value,
        issues: [...issues, ...notes.map((i) => fromPackIssue(i, source)), ...missingPersonaName],
        blocked: false,
      };
    }
    const errors = result.issues.filter((i) => i.severity === 'error');
    const fallbacks = errors.map((e) => {
      if (e.effect !== 'uses_fallback' || e.column === null) return undefined;
      const spec = columnSpec(tab, e.column);
      if (!spec) return undefined;
      if (!spec.req)
        return { value: undefined, note: `The import uses the default instead: ${spec.missing}.` };
      return REQUIRED_FALLBACKS[tab]?.[e.column]?.(current, ctx);
    });
    const blocking = errors.filter(
      (e, i) => e.effect === 'blocks_import' || (e.effect === 'uses_fallback' && !fallbacks[i]),
    );
    if (blocking.length > 0) {
      return {
        value: null,
        blocked: true,
        issues: [
          ...issues,
          ...errors.map((e) => fromPackIssue(e, source)),
          ...notes.map((i) => fromPackIssue(i, source)),
        ],
      };
    }
    const skipping = errors.findIndex(
      (e, i) => e.effect === 'skips_row' || fallbacks[i]?.value === SKIP,
    );
    if (skipping >= 0) {
      return {
        value: null,
        blocked: false,
        issues: [
          ...issues,
          ...errors.map((e, i) =>
            fallbacks[i]?.value === SKIP
              ? { ...asWarning(e, source, fallbacks[i]!.note), effect: 'skips_row' as const }
              : asWarning(e, source),
          ),
          ...notes.map((i) => fromPackIssue(i, source)),
        ],
      };
    }
    errors.forEach((e, i) => {
      const fallback = fallbacks[i]!;
      if (fallback.value === undefined) delete current[e.column!];
      else current[e.column!] = fallback.value;
      // A missing value's message already says what happens; a wrong one needs saying.
      issues.push(
        asWarning(
          e,
          source,
          e.value === null && fallback.value === undefined ? undefined : fallback.note,
        ),
      );
    });
  }
  return { value: null, blocked: true, issues };
}

export interface Assembled {
  pack: Pack | null;
  issues: ImportIssue[];
  used: ColumnMappingEntry[];
  /** The sheet row of each pack item, by tab, in pack order (Course aside). */
  rows: Partial<Record<TabName, number[]>>;
}

function parseCourse(
  sheet: RawSheet | undefined,
  mapping: readonly ColumnMappingEntry[],
  out: Assembled,
): { course: unknown; courseRows: Record<string, number> } | null {
  if (!sheet) {
    out.issues.push(
      error({
        code: 'tab_missing',
        tab: 'Course',
        message: "The Course tab is missing. The import can't go ahead without it.",
      }),
    );
    return null;
  }
  const mapped = mapCourse(sheet, mapping);
  out.issues.push(...mapped.issues);
  out.used.push(...mapped.used);
  if (mapped.unreadable) {
    if (!mapped.issues.some((i) => i.severity === 'error')) {
      out.issues.push(
        error({
          code: 'tab_missing',
          source: sheet.source,
          tab: 'Course',
          message: "The Course tab is empty. The import can't go ahead without it.",
        }),
      );
    }
    return null;
  }
  const { course, courseRows, issues } = courseFromKeyValueRows(mapped.rows, mapped.rowNumbers);
  out.issues.push(...issues.map((i) => fromPackIssue(i, sheet.source)));
  // Each problem is placed on the row of its key.
  const current: Record<string, unknown> = { ...course };
  for (let pass = 0; pass < 8; pass++) {
    const result = parseTabRow('Course', current, null);
    const place = (i: PackIssue): ImportIssue => ({
      ...fromPackIssue(i, sheet.source),
      code: 'cell',
      row: i.column ? (courseRows[i.column] ?? null) : null,
    });
    if (result.ok) {
      const passMark = result.value.pass_mark;
      if (passMark > 0 && passMark <= 1) {
        out.issues.push(
          warning({
            code: 'pass_mark_fraction',
            source: sheet.source,
            tab: 'Course',
            row: courseRows.pass_mark ?? null,
            column: 'pass_mark',
            value: passMark,
            message: `pass_mark is ${passMark}, which means a pass mark of ${passMark}%. If you meant ${Math.round(passMark * 100)}%, write ${Math.round(passMark * 100)}.`,
          }),
        );
      }
      return { course: result.value, courseRows };
    }
    const fixable = result.issues.filter((i) => {
      const spec = i.column ? columnSpec('Course', i.column) : undefined;
      return i.severity === 'error' && spec !== undefined && !spec.req;
    });
    const blocking = result.issues.filter((i) => i.severity === 'error' && !fixable.includes(i));
    if (blocking.length > 0) {
      out.issues.push(...result.issues.map(place));
      return null;
    }
    for (const i of fixable) {
      delete current[i.column!];
      out.issues.push({
        ...place(i),
        severity: 'warning',
        message: `${i.message} The import uses the default instead: ${columnSpec('Course', i.column!)!.missing}.`,
      });
    }
  }
  return null;
}

function missingColumns(tab: RowTab, mapped: MappedTab, sheet: RawSheet, out: Assembled): void {
  for (const column of mapped.missingRequired) {
    // A mapping or ambiguity error already explains this column.
    if (mapped.issues.some((i) => i.severity === 'error' && i.column === column)) continue;
    out.issues.push(
      error({
        code: 'column_missing',
        source: sheet.source,
        tab,
        row: sheet.rowNumbers[0] ?? 1,
        column,
        message: `The ${tab} tab has no ${column} column, and the import can't go ahead without it. Add the column, or map one of your columns to ${column} in Column mapping.`,
      }),
    );
  }
}

/** Builds the pack from the tabs found in the upload. */
export function assemblePack(
  sheets: ReadonlyMap<TabName, RawSheet>,
  mapping: readonly ColumnMappingEntry[],
): Assembled {
  const out: Assembled = { pack: null, issues: [], used: [], rows: {} };
  const course = parseCourse(sheets.get('Course'), mapping, out);
  const tabs: Partial<Record<RowTab, unknown[]>> = {};
  const rowNumbers: Partial<Record<TabName, number[]>> = {};
  const ctx: Ctx = { firstCategory: 'Idea' };
  let blocked = course === null;

  const useDefault = (tab: keyof typeof TAB_DEFAULTS, why: string, source: string | null) => {
    tabs[tab] = TAB_DEFAULTS[tab].rows();
    rowNumbers[tab] = tabs[tab].map((_, i) => i + 2);
    out.issues.push(
      info({ code: 'tab_default', source, tab, message: `${why}, so ${TAB_DEFAULTS[tab].note}.` }),
    );
  };

  for (const tab of ROW_TABS) {
    const sheet = sheets.get(tab);
    if (!sheet) {
      if (isOptionalTab(tab)) useDefault(tab, `There is no ${tab} tab`, null);
      else {
        out.issues.push(
          error({
            code: 'tab_missing',
            tab,
            message: `The ${tab} tab is missing. The import can't go ahead without it.`,
          }),
        );
        blocked = true;
      }
      continue;
    }
    const mapped = mapRows(tab, sheet, mapping);
    out.issues.push(...mapped.issues);
    out.used.push(...mapped.used);
    if (mapped.empty || mapped.rows.length === 0) {
      if (isOptionalTab(tab)) useDefault(tab, `The ${tab} tab has no rows`, sheet.source);
      else {
        tabs[tab] = [];
        rowNumbers[tab] = [];
        out.issues.push(
          info({
            code: 'tab_default',
            source: sheet.source,
            tab,
            message: `The ${tab} tab has no rows.`,
          }),
        );
      }
      if (!mapped.empty && mapped.missingRequired.length > 0 && !isOptionalTab(tab)) {
        missingColumns(tab, mapped, sheet, out);
        blocked = true;
      }
      continue;
    }
    if (mapped.missingRequired.length > 0) {
      if (isOptionalTab(tab)) {
        out.issues.push(
          warning({
            code: 'column_missing',
            source: sheet.source,
            tab,
            row: sheet.rowNumbers[0] ?? 1,
            column: mapped.missingRequired[0]!,
            message: `The ${tab} tab has no ${mapped.missingRequired.join(' or ')} column, so it can't be used and ${TAB_DEFAULTS[tab].note}. Add the column, or map one of your columns to it in Column mapping.`,
          }),
        );
        tabs[tab] = TAB_DEFAULTS[tab].rows();
        rowNumbers[tab] = tabs[tab].map((_, i) => i + 2);
      } else {
        missingColumns(tab, mapped, sheet, out);
        blocked = true;
      }
      continue;
    }
    const cap = MAX_ROWS[tab];
    if (mapped.rows.length > cap) {
      // Checked before any row is parsed, so an oversized tab costs nothing more.
      out.issues.push(
        error({
          code: 'pack',
          source: sheet.source,
          tab,
          message: `The ${tab} tab has ${mapped.rows.length.toLocaleString('en')} rows; the most it can have is ${cap.toLocaleString('en')}.`,
        }),
      );
      blocked = true;
      continue;
    }
    const kept: unknown[] = [];
    const keptRows: number[] = [];
    mapped.rows.forEach((row: Record<string, RawCell>, i) => {
      const rowNumber = mapped.rowNumbers[i] ?? null;
      const result = parseRow(tab, row, rowNumber, sheet.source, ctx);
      out.issues.push(...result.issues);
      if (result.blocked) blocked = true;
      else if (result.value !== null) {
        kept.push(result.value);
        keptRows.push(rowNumber ?? i + 2);
      }
    });
    tabs[tab] = kept;
    rowNumbers[tab] = keptRows;
    if (tab === 'Categories') {
      if (kept.length === 0)
        useDefault('Categories', 'The Categories tab has no usable rows', sheet.source);
      const first = (tabs.Categories?.[0] as Category | undefined)?.category;
      if (first) ctx.firstCategory = first;
    }
  }

  if (blocked || course === null) return out;
  const result = parsePack(
    {
      version: 1,
      course: course.course,
      ...Object.fromEntries(ROW_TABS.map((tab) => [TAB_KEYS[tab], tabs[tab] ?? []])),
    },
    { courseRows: course.courseRows, rowNumbers },
  );
  if (!result.ok) {
    // Rows were already checked one by one; anything left is a whole-pack problem.
    out.issues.push(
      ...result.issues.filter((i) => i.severity === 'error').map((i) => fromPackIssue(i, null)),
    );
    return out;
  }
  out.pack = result.value;
  out.rows = rowNumbers;
  return out;
}
