import { describe, expect, it } from 'vitest';
import { countIssues, groupVersionIssues } from './curriculum-data.js';
import { VersionIssuesSchema } from './curriculum-version.js';

const noLinks = (id: string) => ({
  kind: 'no_links' as const,
  level: 'warning' as const,
  message: `${id} has no links.`,
  items: [id],
  fix: { tab: 'Links' as const, column: 'from_id' },
});

const cell = (row: number, severity: 'error' | 'warning' | 'info' = 'warning') => ({
  severity,
  effect: severity === 'error' ? ('skips_row' as const) : ('none' as const),
  code: 'cell' as const,
  tab: 'Ideas' as const,
  row,
  column: 'unit',
  value: 'x',
  fallback: null,
  source: 'water-cycle.xlsx › Ideas',
  message: `Row ${row}: unit must be a whole number.`,
});

describe('groupVersionIssues (T2-F3)', () => {
  it('groups by cause, errors first, keeping where to fix each', () => {
    const issues = VersionIssuesSchema.parse([
      {
        kind: 'media',
        level: 'info',
        message: 'm',
        items: ['a'],
        fix: { tab: 'Ideas', column: 'media_url' },
      },
      noLinks('a'),
      {
        kind: 'prereq',
        level: 'error',
        message: 'p',
        items: ['g'],
        fix: { tab: 'Ideas', column: 'requires' },
      },
      noLinks('b'),
      cell(7),
      cell(9),
    ]);
    const groups = groupVersionIssues(issues);
    expect(groups.map((g) => [g.level, g.cause, g.issues.length])).toEqual([
      ['error', 'prereq', 1],
      ['warning', 'no_links', 2],
      ['warning', 'cell', 2],
      ['info', 'media', 1],
    ]);
    expect(groups[0]).toMatchObject({
      label: 'Unknown prerequisite',
      fix: { tab: 'Ideas', column: 'requires' },
      blocks_publish: true,
      draftable: false,
    });
    expect(groups[2]!.issues.map((i) => i.at)).toEqual([
      { tab: 'Ideas', row: 7, column: 'unit' },
      { tab: 'Ideas', row: 9, column: 'unit' },
    ]);
    expect(countIssues(groups)).toEqual({ error: 1, warning: 4, info: 1 });
  });

  it('marks draftable gaps (D12) and keeps every column to fix', () => {
    const [group] = groupVersionIssues(
      VersionIssuesSchema.parse([
        {
          kind: 'unit_objective',
          level: 'warning',
          message: 'Unit 1 has no objective; Atlas can draft one.',
          items: ['1'],
          draftable: true,
          fix: { tab: 'Units', column: 'objective', columns: ['objective', 'name'] },
        },
      ]),
    );
    expect(group).toMatchObject({
      draftable: true,
      blocks_publish: false,
      fix: { tab: 'Units', column: 'objective', columns: ['objective', 'name'] },
    });
  });

  it('only counts import errors that block the import as blocking publish', () => {
    const groups = groupVersionIssues(VersionIssuesSchema.parse([cell(4, 'error')]));
    expect(groups[0]).toMatchObject({ level: 'error', blocks_publish: false });
  });

  it('is empty for a clean pack', () => {
    expect(groupVersionIssues([])).toEqual([]);
    expect(countIssues([])).toEqual({ error: 0, warning: 0, info: 0 });
  });
});
