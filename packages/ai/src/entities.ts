// Entity recognition for the anonymous layer (ARCHITECTURE.md D26, D27; task A7).
//
// People's names, places, contact details and school identifiers are identifiers;
// interests ("Real Madrid", "my cat Luna") are not (D27). Recognition sits behind
// `EntityRecognizer`, so an on-device NER model can replace or add to the rules below
// without touching the anonymiser or the gateway (open question 12). The rules are pure
// and synchronous, so the server backstop runs the very same code over anything that
// reaches it, and nothing here needs a network, a clock or a model download.

import { AMBIGUOUS, FIRST_NAMES, PLACE_PHRASES_LONGEST_FIRST, PLACES } from './gazetteer.js';

export type EntityKind = 'person' | 'place' | 'school' | 'address' | 'email' | 'phone';

export interface Entity {
  /** Character offsets into the text: `text.slice(start, end)` is the identifier. */
  start: number;
  end: number;
  kind: EntityKind;
}

export interface EntityRecognizer {
  recognize(text: string): Entity[] | Promise<Entity[]>;
}

export interface SyncEntityRecognizer extends EntityRecognizer {
  recognize(text: string): Entity[];
}

/** Neutral labels the device (or the backstop) writes in place of an identifier. */
export const LABEL_PREFIX: Record<EntityKind, string> = {
  person: 'Person',
  place: 'Place',
  school: 'School',
  address: 'Address',
  email: 'Email',
  phone: 'Phone',
};
export const LABEL = /\b(Person|Place|School|Address|Email|Phone) ([A-Z]{1,3})\b/g;

export const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
// Seven or more digits with optional separators: phone numbers, not "1 to 3" or years.
export const PHONE = /(?<![\p{L}\p{N}])\+?(?:\d[\s().-]{0,2}){6,14}\d(?![\p{L}\p{N}])/gu;

const ADDRESS =
  /(?<![\p{L}\p{N}])\d{1,5}[A-Za-z]?\s+(?:[\p{L}'’-]+\s+){1,2}(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|court|ct|boulevard|blvd|way|close|terrace|crescent|place|pl)(?![\p{L}\p{N}])/giu;
const SCHOOL_KEYWORD =
  '(?:School|Academy|Elementary|High|Middle|Primary|Secondary|College|Prep|Preparatory)';
const SCHOOL_CAPITAL = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:(?:[\\p{Lu}][\\p{L}'’.-]*)\\s+){1,4}${SCHOOL_KEYWORD}(?:\\s+School)?(?![\\p{L}\\p{N}])`,
  'gu',
);
const SCHOOL_LOWER =
  /(?<![\p{L}\p{N}])[\p{L}'’-]+\s+(?:elementary|high|middle|primary|secondary)\s+school(?![\p{L}\p{N}])/giu;
const LANDMARK =
  /(?<![\p{L}\p{N}])(?:[\p{Lu}][\p{L}'’-]*\s+){1,2}(?:Park|Beach|Mall|Library|Hospital|Station|Lake|River|Mountain)(?![\p{L}\p{N}])/gu;

/** Words that start a capitalised run but are not part of the name. */
const LEADING = new Set(
  `the a an my our your his her their this that these those at in on to from near by of and but or so then also after before when if because we i you he she it they us me them go went going come came goes today tomorrow yesterday new old big small little best good great`.split(
    ' ',
  ),
);
const FUNCTION_WORDS = new Set(
  `the a an and but or so then is was are were am be been said says asked told thinks think likes like loves love has have had did does do can could will would should may might must not no yes to of in on at by for with from as it its i we you he she they that this these those there here what who when where why how if because all`.split(
    ' ',
  ),
);
const TITLE = /^(?:mr|mrs|ms|miss|mx|dr|prof|professor|coach|principal|sir|madam|mister)$/i;
const ABBREVIATION = /^(?:mr|mrs|ms|dr|prof)$/i;
const RELATION = new Set(
  `friend friends mom mum mother dad father brother sister cousin teacher classmate neighbour neighbor aunt uncle grandma grandpa grandmother grandfather boyfriend girlfriend coach babysitter bff`.split(
    ' ',
  ),
);
const PET_BEFORE =
  /\b(?:cat|kitten|dog|puppy|pet|hamster|rabbit|bunny|fish|bird|parrot|horse|pony|turtle|tortoise|guinea pig|snake|lizard)\s+(?:(?:named|called)\s+)?$/i;
const TEAM_BEFORE = new Set(
  'real fc ac cf sc as inter atletico athletic olympique sporting'.split(' '),
);
const TEAM_AFTER = new Set('fc united city cf sc rovers wanderers athletic'.split(' '));
const PLACE_LOWER_SKIP = new Set(['turkey', 'china', 'chile', 'wales', 'queens']);

interface Token {
  text: string;
  lower: string;
  start: number;
  end: number;
  cap: boolean;
}

const WORD = /[\p{L}][\p{L}'’-]*/gu;

function tokenise(text: string): Token[] {
  const tokens: Token[] = [];
  for (const m of text.matchAll(WORD)) {
    const word = m[0].replace(/['’-]+$/, '');
    // "Sam's" is the name "Sam" plus a possessive.
    const stem = word.replace(/['’]s$/i, '');
    tokens.push({
      text: stem,
      lower: stem.toLocaleLowerCase(),
      start: m.index!,
      end: m.index! + stem.length,
      cap: stem[0]! !== stem[0]!.toLocaleLowerCase(),
    });
  }
  return tokens;
}

function withinOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length)
    return (
      a.slice(i + 1) === b.slice(i + 1) || // substitution
      (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2))
    ); // swap
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

const FUZZY_NAMES = [...FIRST_NAMES].filter((n) => n.length >= 5);

function isName(token: Token): 'exact' | 'fuzzy' | null {
  if (FIRST_NAMES.has(token.lower)) {
    return token.cap || !AMBIGUOUS.has(token.lower) ? 'exact' : null;
  }
  // Misspellings of a name, written as a name: "Sofiya", "Maddy" style slips.
  if (token.cap && token.lower.length >= 5 && FUZZY_NAMES.some((n) => withinOne(token.lower, n))) {
    return 'fuzzy';
  }
  return null;
}

/** Drop leading filler ("Our", "The"); needs a name word left before the keyword. */
function trimLeading(text: string, start: number, end: number): [number, number] | null {
  const words = [...text.slice(start, end).matchAll(/[\p{L}'’.-]+/gu)];
  const first = words.findIndex(
    (m) => !LEADING.has(m[0].toLocaleLowerCase().replace(/[.'’-]+$/, '')),
  );
  if (first < 0 || first > words.length - 2) return null;
  return [start + words[first]!.index!, end];
}

function regexEntities(text: string, out: Entity[]): void {
  const add = (re: RegExp, kind: EntityKind, trim = false) => {
    for (const m of text.matchAll(re)) {
      let span: [number, number] | null = [m.index!, m.index! + m[0].length];
      if (trim) span = trimLeading(text, span[0], span[1]);
      if (span) out.push({ start: span[0], end: span[1], kind });
    }
  };
  add(EMAIL, 'email');
  add(PHONE, 'phone');
  add(ADDRESS, 'address');
  add(SCHOOL_CAPITAL, 'school', true);
  add(SCHOOL_LOWER, 'school', true);
  add(LANDMARK, 'place', true);
}

function phraseEntities(text: string, out: Entity[]): void {
  const lower = text.toLocaleLowerCase();
  for (const phrase of PLACE_PHRASES_LONGEST_FIRST) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(phrase, from);
      if (at < 0) break;
      from = at + phrase.length;
      const before = lower[at - 1];
      const after = lower[at + phrase.length];
      if ((before && /[\p{L}\p{N}]/u.test(before)) || (after && /[\p{L}\p{N}]/u.test(after))) {
        continue;
      }
      out.push({ start: at, end: at + phrase.length, kind: 'place' });
    }
  }
}

function tokenEntities(text: string, out: Entity[]): void {
  const tokens = tokenise(text);
  const person = (from: number, to: number) =>
    out.push({ start: tokens[from]!.start, end: tokens[to]!.end, kind: 'person' });
  const isPet = (t: Token) => PET_BEFORE.test(text.slice(0, t.start));

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const next = tokens[i + 1];
    const prev = tokens[i - 1];
    const gap = (a: Token, b: Token) => /^[\s]*$/.test(text.slice(a.end, b.start));

    // "Mr. Okafor", "Coach Dana": a title, then the capitalised name.
    if (
      TITLE.test(t.text) &&
      next &&
      next.cap &&
      !LEADING.has(next.lower) &&
      // A full stop between them only after an abbreviation: "Mr. Okafor", not "coach. Ask".
      new RegExp(ABBREVIATION.test(t.text) ? '^\\.?\\s+$' : '^\\s+$').test(
        text.slice(t.end, next.start),
      )
    ) {
      let last = i + 1;
      const after = tokens[last + 1];
      if (after?.cap && gap(next, after) && !FUNCTION_WORDS.has(after.lower)) last++;
      person(i + 1, last);
      continue;
    }

    // "my friend Jo", "my best friend Priya", "my teacher Okafor".
    if (RELATION.has(t.lower) && next && prev) {
      const chain = ['my', 'our', 'his', 'her', 'their', 'best', 'old', 'new', 'good', 'little'];
      if (chain.includes(prev.lower)) {
        let j = i + 1;
        if (tokens[j]?.lower === 'named' || tokens[j]?.lower === 'called') j++;
        const name = tokens[j];
        if (
          name &&
          (name.cap || j > i + 1) &&
          !FUNCTION_WORDS.has(name.lower) &&
          !LEADING.has(name.lower)
        ) {
          person(j, j);
        }
      }
    }

    // "my name is sam", "call me maddie", "I'm Alex", "I am Sofia".
    if (t.lower === 'name' && next?.lower === 'is' && tokens[i + 2]) {
      if (!FUNCTION_WORDS.has(tokens[i + 2]!.lower)) person(i + 2, i + 2);
    } else if (t.lower === 'call' && next?.lower === 'me' && tokens[i + 2]) {
      if (!FUNCTION_WORDS.has(tokens[i + 2]!.lower)) person(i + 2, i + 2);
    } else if (/^i[’']?m$/.test(t.lower) || (t.lower === 'i' && next?.lower === 'am')) {
      const name = t.lower === 'i' ? tokens[i + 2] : next;
      if (name?.cap && !FUNCTION_WORDS.has(name.lower) && !LEADING.has(name.lower)) {
        person(tokens.indexOf(name), tokens.indexOf(name));
      }
    }

    // Names from the list; a following capitalised word is the surname.
    const found = isName(t);
    if (found && !isPet(t)) {
      let last = i;
      if (
        next?.cap &&
        gap(t, next) &&
        !FUNCTION_WORDS.has(next.lower) &&
        !LEADING.has(next.lower)
      ) {
        last = i + 1;
      }
      person(i, last);
    }

    // "I live in Springfield", "moved to Oakdale", "born in Leeds".
    if (
      /^(?:live|lives|living|lived|moved|born|grew)$/.test(t.lower) &&
      next &&
      /^(?:in|to|at|near)$/.test(next.lower) &&
      tokens[i + 2]?.cap
    ) {
      let last = i + 2;
      const more = tokens[last + 1];
      if (more?.cap && gap(tokens[last]!, more) && !FUNCTION_WORDS.has(more.lower)) last++;
      if (!LEADING.has(tokens[i + 2]!.lower)) {
        out.push({ start: tokens[i + 2]!.start, end: tokens[last]!.end, kind: 'place' });
      }
    }

    // Cities and countries from the list, except inside a team name ("Real Madrid").
    if (PLACES.has(t.lower) && (t.cap || !PLACE_LOWER_SKIP.has(t.lower))) {
      const teamBefore = prev && prev.cap && TEAM_BEFORE.has(prev.lower) && gap(prev, t);
      const teamAfter = next && next.cap && TEAM_AFTER.has(next.lower) && gap(t, next);
      if (!teamBefore && !teamAfter) out.push({ start: t.start, end: t.end, kind: 'place' });
    }
  }
}

/** The rules above: names, places, contact details and school identifiers. */
export const ruleRecognizer: SyncEntityRecognizer = {
  recognize(text) {
    const found: Entity[] = [];
    regexEntities(text, found);
    phraseEntities(text, found);
    tokenEntities(text, found);

    // Labels already in the text ("Person A") are not identifiers.
    const labels = [...text.matchAll(LABEL)].map((m) => [m.index!, m.index! + m[0].length]);
    const clear = found.filter(
      (e) => e.end > e.start && !labels.some(([s, f]) => e.start < f! && e.end > s!),
    );

    // Earliest first, longest first; overlapping candidates lose to the one before.
    clear.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
    const kept: Entity[] = [];
    for (const e of clear) {
      const last = kept[kept.length - 1];
      if (!last || e.start >= last.end) kept.push(e);
    }
    return kept;
  },
};
