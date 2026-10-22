import { describe, expect, it } from 'vitest';
import { CurriculumVersionSchema, VERSION_STATUSES, parsePack } from './index.js';
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
    expect(version.source.column_mapping).toHaveLength(1);
  });

  it('parses a published version with derived data', () => {
    const version = CurriculumVersionSchema.parse({
      ...draft,
      status: 'published',
      issues: [],
      derived: { ranked_links: [], layout: { evap: { x: 0, y: 0 } }, quizzes: [] },
      published_at: '2026-10-22T10:00:00+01:00',
    });
    expect(version.status).toBe('published');
    expect(version.derived?.layout).toEqual({ evap: { x: 0, y: 0 } });
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
