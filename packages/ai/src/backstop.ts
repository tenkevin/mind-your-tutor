// The server's identifier backstop (ARCHITECTURE.md D26, §9, §10). Student text is
// meant to be blurred on the device before it leaves (task A7). A modified client could
// skip that, so the gateway runs this over every turn before the model call and before
// anything is stored or logged: contact details and the names and ids of people the
// server knows (the class roster) become neutral labels, and each replacement counts as
// a privacy miss. Text already blurred on the device ("Person A") passes through.
//
// A7 (D26) extends it with the same entity rules the device runs (entities.ts): names of
// people outside the class, places, addresses and school identifiers, and roster given
// names in any case. It implements the same `IdentifierBackstop` interface, so the
// gateway doesn't change.

import { AMBIGUOUS } from './gazetteer.js';
import { EMAIL, LABEL, LABEL_PREFIX, PHONE, ruleRecognizer, type EntityKind } from './entities.js';

/** People and identifiers the server knows for this call, never sent to the model. */
export interface BackstopContext {
  /** Full names of people in the class (students, teacher) and the caller. */
  names: readonly string[];
  /** Roster and sign-in identifiers (roster ids, emails) that must not leave. */
  identifiers?: readonly string[];
  /** Words that look like identifiers but are ours, such as the persona's own name. */
  allow?: readonly string[];
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

function letters(n: number): string {
  // A … Z, then AA, AB, …
  let label = '';
  let i = n;
  do {
    label = String.fromCharCode(65 + (i % 26)) + label;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return label;
}

function index(label: string): number {
  return [...label].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
}

const normalise = (text: string) =>
  text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Contact details, known identifiers, roster names and recognised entities, as labels. */
export const entityBackstop: IdentifierBackstop = {
  blur(texts, context) {
    // Each person's full name and each part of it (two letters or more) map to one label.
    // A full name matches in any case, and so does a given name that isn't also an
    // everyday word ("sam said hi"). Other parts match only when capitalised, as a name
    // is written, so a surname that is also a word ("Young", "Student") doesn't blur the
    // word in "a young student".
    const fullNames = new Set<string>();
    const anyCase = new Set<string>();
    const nameOwner = new Map<string, number>();
    context.names.forEach((name, person) => {
      const full = name.trim().replace(/\s+/g, ' ');
      if ([...full].length < 2) return;
      fullNames.add(full.toLocaleLowerCase());
      const parts = full.split(' ').filter((p) => [...p].length >= 2);
      const given = parts[0]?.toLocaleLowerCase();
      if (given && given.length >= 3 && !AMBIGUOUS.has(given)) anyCase.add(given);
      for (const w of [full, ...parts]) {
        const key = w.toLocaleLowerCase();
        if (!nameOwner.has(key)) nameOwner.set(key, person);
      }
    });
    const names = wordPattern([...nameOwner.keys()]);
    const identifiers = wordPattern(
      (context.identifiers ?? []).map((s) => s.trim()).filter((s) => s.length >= 3),
    );

    // Labels the device already wrote stay as they are; new ones continue after them, so
    // a label never means two people in one call.
    const next = new Map<EntityKind, number>();
    for (const text of texts) {
      for (const m of text.matchAll(LABEL)) {
        const kind = (Object.keys(LABEL_PREFIX) as EntityKind[]).find(
          (k) => LABEL_PREFIX[k] === m[1],
        )!;
        next.set(kind, Math.max(next.get(kind) ?? 0, index(m[2]!) + 1));
      }
    }
    const labelOf = new Map<string, string>();
    const label = (kind: EntityKind, key: string) => {
      const id = `${kind}:${key}`;
      let found = labelOf.get(id);
      if (!found) {
        const n = next.get(kind) ?? 0;
        next.set(kind, n + 1);
        found = `${LABEL_PREFIX[kind]} ${letters(n)}`;
        labelOf.set(id, found);
      }
      return found;
    };

    const allowed = new Set(
      (context.allow ?? [])
        .flatMap((a) => [a, ...a.split(/\s+/)])
        .map((a) => a.toLocaleLowerCase()),
    );

    let misses = 0;
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
          if (!fullNames.has(key0) && !anyCase.has(key0) && first === first.toLocaleLowerCase()) {
            return match;
          }
          misses++;
          return label('person', `roster:${nameOwner.get(key0)!}`);
        });
      }
      // Anyone or anywhere else the rules recognise: people outside the class, places,
      // addresses, schools.
      let blurred = '';
      let at = 0;
      for (const e of ruleRecognizer.recognize(t)) {
        const raw = t.slice(e.start, e.end);
        if (allowed.has(raw.toLocaleLowerCase())) continue;
        misses++;
        blurred += t.slice(at, e.start) + label(e.kind, normalise(raw));
        at = e.end;
      }
      return blurred + t.slice(at);
    });
    return { texts: out, misses };
  },
};

/** The default backstop; the earlier name still works. */
export const patternBackstop = entityBackstop;
