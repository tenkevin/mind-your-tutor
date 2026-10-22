import { describe, expect, it } from 'vitest';
import { DATA_CHECK_KINDS, DataCheckIssueSchema } from './index.js';

describe('DataCheckIssueSchema', () => {
  const issue = {
    kind: 'prereq',
    level: 'error',
    message: 'Groundwater requires "aquifer".',
    items: ['ground'],
    fix: { tab: 'Ideas', column: 'requires' },
  };

  it('accepts an issue', () => {
    expect(DataCheckIssueSchema.parse(issue)).toEqual(issue);
  });

  it('rejects unknown kinds, levels and tabs', () => {
    expect(DataCheckIssueSchema.safeParse({ ...issue, kind: 'other' }).success).toBe(false);
    expect(DataCheckIssueSchema.safeParse({ ...issue, level: 'warn' }).success).toBe(false);
    expect(
      DataCheckIssueSchema.safeParse({ ...issue, fix: { tab: 'Sheet1', column: 'x' } }).success,
    ).toBe(false);
  });

  it('keeps the prototype kinds', () => {
    expect(DATA_CHECK_KINDS).toEqual(expect.arrayContaining(['media', 'codes', 'prereq', 'cycle']));
  });
});
