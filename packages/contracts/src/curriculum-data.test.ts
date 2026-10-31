import { describe, expect, it } from 'vitest';
import { countIssues, groupVersionIssues, rowLocator } from './curriculum-data.js';
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

describe('rowLocator (T2-U3)', () => {
  const pack = {
    ideas: [{ idea_id: 'a' }, { idea_id: 'b' }],
    units: [{ unit: 1 }, { unit: 2 }],
    assessment: [{ idea_id: 'b' }],
  };
  // A blank sheet row 3 was dropped, so b is row 4, not 3.
  const rows = { Ideas: [2, 4], Units: [2, 3], Assessment: [5] };

  it('finds ideas, units and assessment rows by sheet row, not pack order', () => {
    const locate = rowLocator(pack, rows);
    expect(locate('Ideas', 'b')).toEqual({ tab: 'Ideas', row: 4 });
    expect(locate('Links', 'a')).toEqual({ tab: 'Ideas', row: 2 });
    expect(locate('Units', '2')).toEqual({ tab: 'Units', row: 3 });
    expect(locate('Assessment', 'b')).toEqual({ tab: 'Assessment', row: 5 });
    // No question yet for a: its Ideas row names it.
    expect(locate('Assessment', 'a')).toEqual({ tab: 'Ideas', row: 2 });
    expect(locate('Ideas', 'aquifer')).toBeNull();
  });

  it('knows nothing for versions without rows', () => {
    expect(rowLocator(pack, undefined)('Ideas', 'a')).toBeNull();
    const [group] = groupVersionIssues(
      VersionIssuesSchema.parse([noLinks('a')]),
      rowLocator(pack, undefined),
    );
    expect(group!.issues[0]!.item_rows).toEqual([]);
  });

  it('puts rows beside the items when grouping', () => {
    const [group] = groupVersionIssues(
      VersionIssuesSchema.parse([noLinks('b')]),
      rowLocator(pack, rows),
    );
    expect(group!.issues[0]!.item_rows).toEqual([{ tab: 'Ideas', row: 4 }]);
  });
});
