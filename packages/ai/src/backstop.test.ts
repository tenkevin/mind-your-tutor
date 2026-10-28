import { describe, expect, it } from 'vitest';
import { entityBackstop } from './index.js';

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
    expect(blur(text)).toEqual({ texts: [text], misses: 0 });
  });

  it("lets a persona's own name through when it is allowed", () => {
    expect(
      entityBackstop.blur(['You are Ms. Ivy, tutoring Sam.'], { ...context, allow: ['Ms. Ivy'] })
        .texts,
    ).toEqual(['You are Ms. Ivy, tutoring Person A.']);
  });
});
