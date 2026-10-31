import { describe, expect, it } from 'vitest';
import { entityBackstop, patternBackstop } from './index.js';

// A7-F5, A7-F8, A7-S3 at the unit level; gateway.test.ts covers the stored and logged side.
const context = {
  names: ['Sam Student', 'Ana Young', 'Ben Young', 'Tara Teacher'],
  identifiers: ['roster-student-a1'],
};
const blur = (...texts: string[]) => entityBackstop.blur(texts, context);

describe('server backstop (A7-F5, A7-F8)', () => {
  it('blurs a lower-case roster given name, but not a surname that is a word', () => {
    expect(blur('sam said hi, and a young student agreed').texts).toEqual([
      'Person A said hi, and a young student agreed',
    ]);
    expect(blur('Young people like Ana Young and Ben Young').texts).toEqual([
      'Person A people like Person A and Person B',
    ]);
  });

  it('blurs people and places outside the class, schools, addresses and contacts', () => {
    const { texts, misses } = blur(
      'my friend Omar from Leeds goes to Lincoln Elementary School, 42 Birch Street, 555-123-4567',
    );
    expect(texts).toEqual(['my friend Person A from Place A goes to School A, Address A, [phone]']);
    expect(misses).toBe(5);
  });

  it('keeps device labels, continues after them and never reuses one for another person', () => {
    expect(blur('Person A told Person B about Sam and Omar').texts).toEqual([
      'Person A told Person B about Person C and Person D',
    ]);
  });

  it('leaves interests and ordinary text, and counts no miss', () => {
    const text = 'I love Real Madrid and my cat Luna; water boils at 100 degrees.';
    expect(blur(text)).toMatchObject({ texts: [text], misses: 0 });
  });

  it("lets a persona's own name through when it is allowed", () => {
    expect(
      entityBackstop.blur(['You are Ms. Ivy, tutoring Sam.'], { ...context, allow: ['Ms. Ivy'] })
        .texts,
    ).toEqual(['You are Ms. Ivy, tutoring Person A.']);
  });
});

describe('patternBackstop byKind (M2)', () => {
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

describe('byKind with the device entity rules (A7 + M2)', () => {
  it('counts people, places, schools and addresses as names, so the sum equals misses', () => {
    const out = entityBackstop.blur(
      ['Omar from Leeds goes to Lincoln Elementary School, 42 Birch Street, 555-123-4567'],
      { names: ['Sam Student'] },
    );
    expect(out.byKind).toEqual({ names: 4, emails: 0, phones: 1, identifiers: 0 });
    const { names, emails, phones, identifiers } = out.byKind;
    expect(names + emails + phones + identifiers).toBe(out.misses);
  });
});
