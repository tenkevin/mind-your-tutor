// The device's anonymous layer (ARCHITECTURE.md D26, D27; task A7). One `Anonymiser` lives
// for one signed-in conversation in the student's browser. `blur` replaces identifiers
// with neutral labels before text is sent; `refill` puts the real words back into the
// reply for the student. The mapping exists only in this object's memory: it is never
// sent, stored or logged, and `clear` (sign-out) drops it.

import {
  LABEL,
  LABEL_PREFIX,
  ruleRecognizer,
  type EntityKind,
  type EntityRecognizer,
} from './entities.js';

export interface AnonymiserOptions {
  /** Defaults to the rules; an on-device NER model plugs in here (§12 q12). */
  recognizer?: EntityRecognizer;
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

const normalise = (text: string) =>
  text
    .toLocaleLowerCase()
    .replace(/['’]s$/, '')
    .replace(/[^\p{L}\p{N}@+]+/gu, ' ')
    .trim();

export class Anonymiser {
  private readonly recognizer: EntityRecognizer;
  /** label → what the student wrote, first time. Never leaves this object. */
  private readonly original = new Map<string, string>();
  private readonly labelOf = new Map<string, string>();
  private readonly counts = new Map<EntityKind, number>();

  constructor(options: AnonymiserOptions = {}) {
    this.recognizer = options.recognizer ?? ruleRecognizer;
  }

  /** Label for an identifier: the same one for the same entity, a new one for another. */
  private label(kind: EntityKind, raw: string): string {
    const key = `${kind}:${normalise(raw)}`;
    const known = this.labelOf.get(key) ?? this.sameName(kind, normalise(raw));
    if (known) {
      this.labelOf.set(key, known);
      return known;
    }
    const n = this.counts.get(kind) ?? 0;
    this.counts.set(kind, n + 1);
    const label = `${LABEL_PREFIX[kind]} ${letters(n)}`;
    this.labelOf.set(key, label);
    this.original.set(label, raw);
    return label;
  }

  /** "Sam" and "Sam Rivera" are one person when the words of one are within the other. */
  private sameName(kind: EntityKind, key: string): string | undefined {
    if (kind !== 'person') return undefined;
    const words = key.split(' ');
    for (const [other, label] of this.labelOf) {
      if (!other.startsWith('person:')) continue;
      const theirs = other.slice('person:'.length).split(' ');
      const [short, long] = words.length <= theirs.length ? [words, theirs] : [theirs, words];
      if (short.every((w) => long.includes(w))) return label;
    }
    return undefined;
  }

  async blur(text: string): Promise<string> {
    const entities = await this.recognizer.recognize(text);
    let out = '';
    let at = 0;
    for (const e of [...entities].sort((a, b) => a.start - b.start)) {
      if (e.start < at) continue;
      out += text.slice(at, e.start) + this.label(e.kind, text.slice(e.start, e.end));
      at = e.end;
    }
    return out + text.slice(at);
  }

  /** Real words back in place of the labels; a label this device never made stays. */
  refill(text: string): string {
    return text.replace(LABEL, (match: string) => this.original.get(match) ?? match);
  }

  /** Drop the mapping (sign-out). */
  clear(): void {
    this.original.clear();
    this.labelOf.clear();
    this.counts.clear();
  }
}
