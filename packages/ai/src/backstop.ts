// The server's identifier backstop (ARCHITECTURE.md D26, §9, §10). Student text is
// meant to be blurred on the device before it leaves (task A7). A modified client could
// skip that, so the gateway runs this over every turn before the model call and before
// anything is stored or logged: contact details and the names and ids of people the
// server knows (the class roster) become neutral labels, and each replacement counts as
// a privacy miss. Text already blurred on the device ("Person A") passes through.
//
// A7 adds detection (NER, places, school identifiers); it implements the same
// `IdentifierBackstop` interface, so the gateway doesn't change.

/** People and identifiers the server knows for this call, never sent to the model. */
export interface BackstopContext {
  /** Full names of people in the class (students, teacher) and the caller. */
  names: readonly string[];
  /** Roster and sign-in identifiers (roster ids, emails) that must not leave. */
  identifiers?: readonly string[];
}

export interface BlurResult {
  texts: string[];
  /** Identifiers that reached the server unblurred (D26 privacy misses). */
  misses: number;
}

export interface IdentifierBackstop {
  /** Blur every text of one call; labels stay consistent across the texts. */
  blur(texts: readonly string[], context: BackstopContext): BlurResult;
}

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
// Seven or more digits with optional separators: phone numbers, not "1 to 3" or years.
const PHONE = /(?<![\p{L}\p{N}])\+?(?:\d[\s().-]{0,2}){6,14}\d(?![\p{L}\p{N}])/gu;
const LETTER_OR_DIGIT = '[\\p{L}\\p{N}]';

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word, case-insensitive, Unicode-aware. */
function wordPattern(words: readonly string[]): RegExp | null {
  if (words.length === 0) return null;
  // Longest first, so "Ana Lopez" wins over "Ana".
  const sorted = [...words].sort((a, b) => b.length - a.length).map(escape);
  return new RegExp(`(?<!${LETTER_OR_DIGIT})(?:${sorted.join('|')})(?!${LETTER_OR_DIGIT})`, 'giu');
}

function personLabel(n: number): string {
  // Person A … Person Z, then Person AA, Person AB, …
  let label = '';
  let i = n;
  do {
    label = String.fromCharCode(65 + (i % 26)) + label;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return `Person ${label}`;
}

/** Contact details, known identifiers and roster names, replaced with labels. */
export const patternBackstop: IdentifierBackstop = {
  blur(texts, context) {
    // Each person's full name and each part of it (two letters or more) map to one label.
    // A full name matches in any case. A single part matches only when capitalised, as a
    // name is written, so a surname that is also a word ("Young", "Student") doesn't
    // blur the word in "a young student".
    const labelOf = new Map<string, string>();
    const fullNames = new Set<string>();
    const nameOwner = new Map<string, number>();
    context.names.forEach((name, person) => {
      const full = name.trim().replace(/\s+/g, ' ');
      if ([...full].length < 2) return;
      fullNames.add(full.toLocaleLowerCase());
      const parts = full.split(' ').filter((p) => [...p].length >= 2);
      for (const w of [full, ...parts]) {
        const key = w.toLocaleLowerCase();
        if (!nameOwner.has(key)) nameOwner.set(key, person);
      }
    });
    const names = wordPattern([...nameOwner.keys()]);
    const identifiers = wordPattern(
      (context.identifiers ?? []).map((s) => s.trim()).filter((s) => s.length >= 3),
    );

    let misses = 0;
    let next = 0;
    const out = texts.map((text) => {
      let t = text.replace(EMAIL, () => {
        misses++;
        return '[email]';
      });
      if (identifiers) {
        t = t.replace(identifiers, () => {
          misses++;
          return '[id]';
        });
      }
      t = t.replace(PHONE, () => {
        misses++;
        return '[phone]';
      });
      if (names) {
        t = t.replace(names, (match) => {
          const key0 = match.toLocaleLowerCase();
          const first = match[0]!;
          if (!fullNames.has(key0) && first === first.toLocaleLowerCase()) return match;
          const person = nameOwner.get(key0)!;
          const key = String(person);
          let label = labelOf.get(key);
          if (!label) {
            label = personLabel(next++);
            labelOf.set(key, label);
          }
          misses++;
          return label;
        });
      }
      return t;
    });
    return { texts: out, misses };
  },
};
