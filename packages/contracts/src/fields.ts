import { z } from 'zod';
import type { ColumnSpec } from './spec.js';
import { GRADES, missingEffect } from './spec.js';

// Builders for pack columns. Every message is written for a teacher: it names the
// column, says what's allowed and quotes the value it got. No zod codes leak out.

export const LIMITS = {
  id: 64,
  title: 200,
  shortText: 100,
  objective: 1000,
  question: 1000,
  description: 1000,
  longText: 4000,
  promptTemplate: 8000,
  url: 2048,
  code: 64,
  keyPoint: 500,
  listEntries: 100,
} as const;

export type FieldKind =
  | { kind: 'text'; max: number }
  | { kind: 'slug' }
  | { kind: 'integer' }
  | { kind: 'importance' }
  | { kind: 'percent' }
  | { kind: 'date' }
  | { kind: 'grade' }
  | { kind: 'enum'; values: readonly [string, ...string[]] }
  | { kind: 'url' }
  | { kind: 'list'; itemMax: number }
  | { kind: 'slugList' };

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const NUMBER = /^[+-]?\d+(\.\d+)?$/;
const PERCENT = /^([+-]?\d+(\.\d+)?)\s*%$/;
// Browsers drop tabs and newlines inside URLs, so "java\tscript:" is still javascript:.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;
const UNSAFE_SCHEMES = new Set([
  'javascript',
  'vbscript',
  'data',
  'file',
  'blob',
  'filesystem',
  'about',
  'view-source',
]);

export function isSlug(value: string): boolean {
  return SLUG.test(value);
}

/**
 * A media or library reference: an https URL, or a relative file name such as
 * `evaporation.mp4` or `labs/jar.docx`. Anything else with a scheme is refused,
 * as are absolute paths, `..` segments and protocol-relative `//host` links.
 * A file name may contain ": " ("Lab: evaporation in a jar.docx"), which no
 * browser reads as a scheme.
 */
export function isSafeMediaRef(value: string): boolean {
  if (value.length === 0 || CONTROL.test(value) || value.includes('\\')) return false;
  const scheme = SCHEME.exec(value);
  if (scheme) {
    const name = scheme[1]!.toLowerCase();
    if (name === 'https') {
      try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.hostname.length > 0;
      } catch {
        return false;
      }
    }
    if (UNSAFE_SCHEMES.has(name)) return false;
    if (value[scheme[0].length] !== ' ') return false;
  }
  if (value.startsWith('/')) return false;
  return value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

/** Splits a list cell: commas or semicolons, entries trimmed, empty entries dropped. */
export function splitList(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** How a raw cell is converted before validation. */
export type CellKind = 'text' | 'number' | 'percent' | 'date' | 'list';

/**
 * Turns a raw cell (CSV text, an XLSX value or a JSON value) into the shape the
 * column's schema expects. Text is trimmed and empty cells become `undefined`, so
 * defaults apply. Values that can't be converted pass through for the schema to reject.
 */
export function normalizeCell(kind: CellKind, value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text === '') return kind === 'list' ? [] : undefined;
    switch (kind) {
      case 'number':
        return NUMBER.test(text) ? Number(text) : text;
      case 'percent': {
        const number = PERCENT.exec(text)?.[1] ?? text;
        return NUMBER.test(number) ? Number(number) : text;
      }
      case 'list':
        return splitList(text);
      default:
        return text;
    }
  }
  if (typeof value === 'number') {
    if (kind === 'list') return [String(value)];
    if (kind === 'text' && Number.isFinite(value)) return String(value);
    return value;
  }
  if (value instanceof Date && kind === 'date') {
    return Number.isNaN(value.getTime()) ? value : value.toISOString().slice(0, 10);
  }
  if (Array.isArray(value) && kind === 'list') {
    return value
      .map((item) =>
        typeof item === 'string' ? item.trim() : typeof item === 'number' ? String(item) : item,
      )
      .filter((item) => item !== '' && item !== null && item !== undefined);
  }
  return value;
}

/** A short, safe rendering of a value for a message or an issue. */
export function displayValue(value: unknown, max = 60): string {
  if (typeof value === 'string') {
    return `'${value.length > max ? `${value.slice(0, max)}…` : value}'`;
  }
  if (Array.isArray(value)) return 'a list';
  if (value instanceof Date) return 'a date';
  if (typeof value === 'object' && value !== null) return 'a table of values';
  return String(value);
}

const got = (value: unknown) =>
  value === undefined || value === null ? '' : ` (got ${displayValue(value)})`;

function listOf(values: readonly string[]): string {
  return values.length < 2
    ? values.join('')
    : `${values.slice(0, -1).join(', ')} or ${values[values.length - 1]}`;
}

export function missingMessage(column: ColumnSpec): string {
  const effect = missingEffect(column);
  if (effect === 'blocks_import') {
    return `${column.name} is missing. The import can't go ahead until it's filled in.`;
  }
  if (effect === 'skips_row') {
    return `${column.name} is missing, so this row will be skipped.`;
  }
  return `${column.name} is missing. If it stays empty: ${column.missing}.`;
}

export function invalidMessage(name: string, field: FieldKind, value: unknown): string {
  switch (field.kind) {
    case 'text':
      return `${name} must be text${got(value)}.`;
    case 'slug':
      return `${name} can only use lowercase letters, numbers and hyphens, up to ${LIMITS.id} characters${got(value)}.`;
    case 'integer':
      return `${name} must be a whole number of 1 or more, like 1${got(value)}.`;
    case 'importance':
      return `${name} must be a whole number from 1 to 5${got(value)}.`;
    case 'percent':
      return `${name} must be a number from 0 to 100, like 70${got(value)}.`;
    case 'date':
      return `${name} must be a real date written as YYYY-MM-DD, like 2026-10-30${got(value)}.`;
    case 'grade':
      return `${name} must be K or a whole number from 1 to 12${got(value)}.`;
    case 'enum':
      return `${name} must be one of ${listOf(field.values)}${got(value)}.`;
    case 'url':
      return `${name} must be a web address starting with https:// or a file name like evaporation.mp4${got(value)}.`;
    case 'list':
    case 'slugList':
      return `${name} must be a list of entries separated by commas${got(value)}.`;
  }
}

function tooLong(name: string, max: number) {
  return (iss: { input?: unknown }) =>
    `${name} is too long: it can have at most ${max.toLocaleString('en')} characters (got ${
      typeof iss.input === 'string' ? iss.input.length.toLocaleString('en') : 'more'
    }).`;
}

function typeError(column: ColumnSpec, field: FieldKind) {
  return (iss: { input?: unknown }) =>
    iss.input === undefined || iss.input === null
      ? missingMessage(column)
      : invalidMessage(column.name, field, iss.input);
}

function checkError(column: ColumnSpec, field: FieldKind) {
  return (iss: { input?: unknown }) => invalidMessage(column.name, field, iss.input);
}

/**
 * Column builders for one tab. Each returns the bare schema for a value that is
 * present; tabs add `.nullable().default(null)` or a spec default for optional columns.
 */
export function columns(lookup: (name: string) => ColumnSpec) {
  /** The cell conversion each built column needs, for `normalizeRow`. */
  const cells: Record<string, CellKind> = {};
  const cell = (name: string, kind: CellKind) => {
    cells[name] = kind;
    return lookup(name);
  };
  return {
    cells,
    text(name: string, max: number) {
      const column = cell(name, 'text');
      const field: FieldKind = { kind: 'text', max };
      const schema = z
        .string({ error: typeError(column, field) })
        .max(max, { error: tooLong(name, max) });
      return column.req ? schema.min(1, { error: () => missingMessage(column) }) : schema;
    },
    slug(name: string) {
      const column = cell(name, 'text');
      const field: FieldKind = { kind: 'slug' };
      return z.string({ error: typeError(column, field) }).regex(SLUG, {
        error: checkError(column, field),
      });
    },
    integer(name: string) {
      const column = cell(name, 'number');
      const field: FieldKind = { kind: 'integer' };
      const error = checkError(column, field);
      return z
        .number({ error: typeError(column, field) })
        .int({ error })
        .min(1, { error })
        .max(9999, { error });
    },
    importance(name: string) {
      const column = cell(name, 'number');
      const field: FieldKind = { kind: 'importance' };
      const error = checkError(column, field);
      return z
        .number({ error: typeError(column, field) })
        .int({ error })
        .min(1, { error })
        .max(5, { error });
    },
    percent(name: string) {
      const column = cell(name, 'percent');
      const field: FieldKind = { kind: 'percent' };
      const error = checkError(column, field);
      return z
        .number({ error: typeError(column, field) })
        .min(0, { error })
        .max(100, { error });
    },
    date(name: string) {
      const column = cell(name, 'date');
      return z.iso.date({ error: typeError(column, { kind: 'date' }) });
    },
    grade(name: string) {
      const column = cell(name, 'text');
      return z.enum(GRADES, { error: typeError(column, { kind: 'grade' }) });
    },
    oneOf<const V extends readonly [string, ...string[]]>(name: string, values: V) {
      const column = cell(name, 'text');
      return z.enum(values, { error: typeError(column, { kind: 'enum', values }) });
    },
    url(name: string) {
      const column = cell(name, 'text');
      const field: FieldKind = { kind: 'url' };
      return z
        .string({ error: typeError(column, field) })
        .max(LIMITS.url, { error: tooLong(name, LIMITS.url) })
        .refine(isSafeMediaRef, { error: checkError(column, field) });
    },
    list(name: string, itemMax: number) {
      const column = cell(name, 'list');
      return z
        .array(
          z
            .string({ error: (iss) => `Each entry in ${name} must be text${got(iss.input)}.` })
            .max(itemMax, {
              error: (iss) =>
                `Each entry in ${name} can have at most ${itemMax} characters (got one with ${
                  typeof iss.input === 'string' ? iss.input.length : 'more'
                }).`,
            }),
          { error: typeError(column, { kind: 'list', itemMax }) },
        )
        .max(LIMITS.listEntries, {
          error: () => `${name} can have at most ${LIMITS.listEntries} entries.`,
        });
    },
    slugList(name: string) {
      const column = cell(name, 'list');
      return z
        .array(
          z
            .string({ error: (iss) => `Each entry in ${name} must be text${got(iss.input)}.` })
            .regex(SLUG, {
              error: (iss) =>
                `${name} can only list ids made of lowercase letters, numbers and hyphens, up to ${LIMITS.id} characters${got(iss.input)}.`,
            }),
          { error: typeError(column, { kind: 'slugList' }) },
        )
        .max(LIMITS.listEntries, {
          error: () => `${name} can have at most ${LIMITS.listEntries} entries.`,
        });
    },
  };
}

/** Adds each column's spec note as its description, so the import screen can show it. */
export function documented<T extends z.ZodRawShape>(
  lookup: (name: string) => ColumnSpec,
  shape: T,
): T {
  const out: Record<string, z.ZodType> = {};
  for (const [name, schema] of Object.entries(shape)) {
    const note = lookup(name).note;
    out[name] = note ? (schema as z.ZodType).describe(note) : (schema as z.ZodType);
  }
  return out as unknown as T;
}

/**
 * Normalizes every known column of a row and drops everything else, so unknown
 * keys (including `__proto__`) never reach the schema or its output. Non-objects
 * pass through for the schema to reject.
 */
export function normalizeRow(cells: Readonly<Record<string, CellKind>>, input: unknown): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return input;
  const row: Record<string, unknown> = {};
  for (const [name, kind] of Object.entries(cells)) {
    if (!Object.hasOwn(input, name)) continue;
    const value = normalizeCell(kind, (input as Record<string, unknown>)[name]);
    if (value !== undefined) row[name] = value;
  }
  return row;
}
