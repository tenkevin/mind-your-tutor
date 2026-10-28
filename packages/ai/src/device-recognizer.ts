// The device's recognizer (ARCHITECTURE.md D26, D27, D33): an on-device ML NER model finds
// people's names and places from sentence context; pattern rules still catch contact
// details, addresses and school identifiers. No word list of names or places is used, and
// no class roster is ever on the device (A7-S2).

import {
  PET_BEFORE,
  TEAM_AFTER,
  TEAM_BEFORE,
  patternRecognizer,
  resolveEntities,
  ruleRecognizer,
  type Entity,
  type EntityRecognizer,
} from './entities.js';
import { BertNer } from './ner-model.js';

const WORD_BEFORE = /([\p{L}]+)\s*$/u;
const WORD_AFTER = /^\s*([\p{L}]+)/u;

/** Interests stay specific (D27): a pet's name or a team is not an identifier. */
function isInterest(text: string, e: Entity): boolean {
  if (PET_BEFORE.test(text.slice(0, e.start))) return true;
  const before = WORD_BEFORE.exec(text.slice(0, e.start))?.[1];
  const after = WORD_AFTER.exec(text.slice(e.end))?.[1];
  return (
    (before !== undefined && /^\p{Lu}/u.test(before) && TEAM_BEFORE.has(before.toLowerCase())) ||
    (after !== undefined && /^\p{Lu}/u.test(after) && TEAM_AFTER.has(after.toLowerCase()))
  );
}

/** Model names and places plus the pattern rules, as one recognizer. */
export function modelRecognizer(model: BertNer): EntityRecognizer {
  return {
    recognize(text) {
      const found: Entity[] = patternRecognizer.recognize(text);
      for (const span of model.predict(text)) {
        if (span.label !== 'PER' && span.label !== 'LOC') continue;
        const entity: Entity = {
          start: span.start,
          end: span.end,
          kind: span.label === 'PER' ? 'person' : 'place',
        };
        if (!isInterest(text, entity)) found.push(entity);
      }
      return resolveEntities(text, found);
    },
  };
}

export type ModelLoader = () => Promise<ArrayBuffer>;

/**
 * A recognizer that loads the model the first time it is needed and keeps it. If the file
 * can't be loaded (offline, blocked), it falls back to the pattern and word-list rules, so
 * a student isn't locked out; the server backstop still blurs whatever slips through.
 * `onFallback` lets the app note that, without any text.
 */
export function lazyModelRecognizer(
  load: ModelLoader,
  onFallback?: (error: unknown) => void,
): EntityRecognizer {
  let ready: Promise<EntityRecognizer> | null = null;
  return {
    async recognize(text) {
      ready ??= load()
        .then((bytes) => modelRecognizer(BertNer.load(bytes)))
        .catch((error: unknown) => {
          onFallback?.(error);
          return ruleRecognizer;
        });
      return (await ready).recognize(text);
    },
  };
}
