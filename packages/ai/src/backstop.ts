// The server backstop for student text (ARCHITECTURE.md D26, §9 "Privacy layer").
//
// The anonymous layer runs on the student's device (task A7): it swaps people's
// names, places, contact details and school identifiers for neutral labels (Person A,
// Place B) before any text leaves the device. A modified client could skip that, so
// the server checks again before text is stored or sent to a model: real roster names
// and contact details that slipped through are blurred, and each one counts as a
// privacy miss. The raw text is never kept.
//
// This is the seam: roster-name and identifier detection only. The device layer (A7)
// does the full entity extraction; this never needs to be as good, only to catch what
// a skipped or broken device layer lets through.

/** What a blurred identifier becomes. Not a device label, so it can't collide with one. */
export const BLURRED = '[removed]';

export interface BackstopMisses {
  /** Roster names (or parts of them) found in the text. */
  names: number;
  /** Email addresses found in the text. */
  emails: number;
  /** Phone numbers found in the text. */
  phones: number;
}

export interface BackstopResult {
  /** The text with every finding replaced by `BLURRED`. */
  text: string;
  misses: BackstopMisses;
}

export function totalMisses(misses: BackstopMisses): number {
  return misses.names + misses.emails + misses.phones;
}

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
// Seven or more digits, optionally grouped by spaces, dots, dashes or brackets.
const PHONE = /(?<![\p{N}])\+?\(?\d(?:[\s.()-]*\d){6,14}(?![\p{N}])/gu;
/** Name parts shorter than this are too ambiguous to match on their own ("Al", "Bo"). */
const MIN_PART = 2;

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The words to look for: each full name and each part of it (given and family names),
 * longest first so a full name is blurred once, not once per part.
 */
function nameTerms(names: readonly string[]): string[] {
  const terms = new Set<string>();
  for (const raw of names) {
    const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
    if (name.length < MIN_PART) continue;
    terms.add(name.toLocaleLowerCase());
    for (const part of name.split(/[\s-]+/)) {
      if (part.length >= MIN_PART) terms.add(part.toLocaleLowerCase());
    }
  }
  return [...terms].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

/**
 * Blur roster names and contact details in `text`, counting each one found.
 * `rosterNames` are the real names the text must not hold: the writer, their
 * classmates and their teacher. Matching is whole-word and ignores case.
 */
export function backstopText(text: string, rosterNames: readonly string[]): BackstopResult {
  const misses: BackstopMisses = { names: 0, emails: 0, phones: 0 };
  // Contact details first, so an email's local part isn't counted as a name.
  let out = text.normalize('NFC').replace(EMAIL, () => {
    misses.emails++;
    return BLURRED;
  });
  out = out.replace(PHONE, () => {
    misses.phones++;
    return BLURRED;
  });
  const terms = nameTerms(rosterNames);
  if (terms.length > 0) {
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])(?:${terms.map(escape).join('|')})(?![\\p{L}\\p{N}])`,
      'giu',
    );
    out = out.replace(pattern, () => {
      misses.names++;
      return BLURRED;
    });
  }
  return { text: out, misses };
}
