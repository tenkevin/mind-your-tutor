import { describe, expect, it } from 'vitest';
import { patternBackstop } from './backstop.js';

describe('patternBackstop byKind', () => {
  it('counts names, emails and phones separately', () => {
    const out = patternBackstop.blur(
      ['Sam Student mailed sam@district.example.org or call 555-010-0199 about Kim.'],
      { names: ['Sam Student', 'Kim Lee'] },
    );
    expect(out.byKind).toEqual({ names: 2, emails: 1, phones: 1, identifiers: 0 });
    expect(out.misses).toBe(4);
    expect(out.texts[0]).not.toMatch(/Sam|Kim|@|555/);
  });

  it('counts nothing for text already blurred on the device', () => {
    const out = patternBackstop.blur(['Person A and Person B did it.'], { names: ['Sam Student'] });
    expect(out.byKind).toEqual({ names: 0, emails: 0, phones: 0, identifiers: 0 });
  });
});
