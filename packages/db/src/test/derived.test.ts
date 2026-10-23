import { VersionDerivedSchema } from '@ideamap/contracts';
import { describe, expect, it } from 'vitest';
import { validDerived } from './derived.js';

describe('validDerived fixture', () => {
  it('parses through VersionDerivedSchema unchanged', () => {
    const fixture = validDerived();
    expect(VersionDerivedSchema.parse(fixture)).toEqual(fixture);
  });

  it('returns a fresh copy each time', () => {
    const a = validDerived();
    a.layout.rank.pop();
    expect(validDerived().layout.rank).toHaveLength(3);
  });
});
