import { describe, expect, it } from 'vitest';
import {
  CurriculumVersionSchema,
  VERSION_STATUSES,
  VersionIssuesSchema,
  parsePack,
} from './index.js';
import { readPackJson } from './testing/fixtures.js';

const source = {
  kind: 'xlsx',
  file_ref: 'imports/0d6b5c1e/water-cycle.xlsx',
  file_name: 'water-cycle.xlsx',
  checksum: 'a'.repeat(64),
  column_mapping: [{ tab: 'Ideas', column: 'idea_id', source_column: 'Idea ID' }],
};

const draft = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  curriculum_id: '0f8fad5b-d9cb-469f-a165-70867728950e',
  number: 2,
  status: 'draft',
  pack: readPackJson(),
  derived: null,
  issues: [
    {
      severity: 'error',
      effect: 'blocks_import',
      tab: 'Ideas',
      row: 19,
      column: 'requires',
      value: 'aquifer',
      fallback: null,
      message: "requires lists 'aquifer', which isn't an idea_id.",
    },
  ],
  source,
  created_at: '2026-10-22T09:00:00Z',
  published_at: null,
};

describe('CurriculumVersion follows §5 (F3-F9)', () => {
  it('has the §5 fields', () => {
    expect(Object.keys(CurriculumVersionSchema.shape)).toEqual([
      'id',
      'curriculum_id',
      'number',
      'status',
      'pack',
      'derived',
      'issues',
      'source',
      'created_at',
      'published_at',
    ]);
    expect([...VERSION_STATUSES]).toEqual(['draft', 'published', 'archived']);
  });

  it('parses a draft, with its pack body parsed like parsePack', () => {
    const version = CurriculumVersionSchema.parse(draft);
    expect(version.status).toBe('draft');
    expect(version.pack).toEqual(parsePack(readPackJson()).value);
    expect(version.issues).toHaveLength(1);
    expect(version.issues[0]).toMatchObject({ origin: 'import', level: 'error' });
    expect(version.source.column_mapping).toHaveLength(1);
  });

  it('stores import and data-check issues as one lossless typed collection', () => {
    const checkIssue = {
      kind: 'prereq',
      level: 'error',
      message: 'Groundwater requires "aquifer".',
      items: ['ground'],
      fix: { tab: 'Ideas', column: 'requires' },
    } as const;
    const issues = [draft.issues[0]!, checkIssue];
    const version = CurriculumVersionSchema.parse({ ...draft, issues });

    expect(version.issues).toEqual([
      { ...draft.issues[0], origin: 'import', level: 'error' },
      { ...checkIssue, origin: 'data_check' },
    ]);
    expect(CurriculumVersionSchema.parse(JSON.parse(JSON.stringify(version))).issues).toEqual(
      version.issues,
    );
  });

  it('blocks published versions on error-level checks but allows warning and info checks', () => {
    const publish = (issues: unknown[]) =>
      CurriculumVersionSchema.safeParse({
        ...draft,
        status: 'published',
        issues,
        published_at: '2026-10-22T10:00:00Z',
      }).success;
    const dataCheck = {
      kind: 'prereq',
      level: 'error',
      message: 'Groundwater requires "aquifer".',
      items: ['ground'],
      fix: { tab: 'Ideas', column: 'requires' },
    };
    const warning = { ...dataCheck, kind: 'codes', level: 'warning' };
    const info = { ...dataCheck, kind: 'media', level: 'info' };
    const importWarning = {
      severity: 'warning',
      effect: 'none',
      tab: 'Ideas',
      row: 19,
      column: 'media_url',
      value: null,
      fallback: null,
      message: 'No media.',
    };

    expect(publish([dataCheck])).toBe(false);
    expect(publish([warning, info])).toBe(true);
    expect(publish([draft.issues[0]])).toBe(false);
    expect(publish([importWarning])).toBe(true);
  });

  it('keeps the serialized issue field below 1 MB and rejects overflow', () => {
    const grouped = {
      kind: 'blocked',
      level: 'warning',
      message: '10,000 ideas may never unlock.',
      items: Array.from({ length: 10_000 }, (_, i) => `idea-${i}`),
      fix: { tab: 'Ideas', column: 'requires' },
    };
    const stored = VersionIssuesSchema.parse([grouped]);
    expect(new TextEncoder().encode(JSON.stringify(stored)).byteLength).toBeLessThan(1_000_000);

    const tooLarge = {
      ...grouped,
      items: Array.from({ length: 15_000 }, () => 'i'.repeat(64)),
    };
    expect(VersionIssuesSchema.safeParse([tooLarge]).success).toBe(false);
  });

  it('parses a published version with derived data', () => {
    const version = CurriculumVersionSchema.parse({
      ...draft,
      status: 'published',
      issues: [],
      derived: {
        ranked_links: { max_links: 3, kept: [], hidden: [] },
        layout: {
          centre: 'evap',
          rank: ['evap'],
          positions: [{ idea_id: 'evap', ring: 0, angle: null, x: 0, y: 0 }],
        },
        quizzes: { seed: 1, quiz_length: 8, banks: [] },
      },
      published_at: '2026-10-22T10:00:00+01:00',
    });
    expect(version.status).toBe('published');
    expect(version.derived?.layout.centre).toBe('evap');
  });

  it('parses an archived version and defaults optional parts', () => {
    const rest: Record<string, unknown> = { ...draft };
    delete rest.derived;
    delete rest.issues;
    const version = CurriculumVersionSchema.parse({
      ...rest,
      status: 'archived',
      published_at: '2026-10-22T10:00:00Z',
      source: { ...source, file_name: undefined, column_mapping: undefined },
    });
    expect(version.derived).toBeNull();
    expect(version.issues).toEqual([]);
    expect(version.source.column_mapping).toEqual([]);
  });

  it('rejects inconsistent or malformed versions', () => {
    const bad = [
      { ...draft, status: 'live' },
      { ...draft, status: 'published', issues: [], published_at: null },
      { ...draft, status: 'draft', published_at: '2026-10-22T10:00:00Z' },
      { ...draft, status: 'published', published_at: '2026-10-22T10:00:00Z' },
      { ...draft, id: 'not-a-uuid' },
      { ...draft, number: 0 },
      { ...draft, source: { ...source, checksum: 'abc' } },
      { ...draft, source: { ...source, kind: 'pdf' } },
      { ...draft, pack: { ...(readPackJson() as object), ideas: 'none' } },
      { ...draft, created_at: 'yesterday' },
    ];
    for (const version of bad) {
      expect(CurriculumVersionSchema.safeParse(version).success).toBe(false);
    }
  });
});
