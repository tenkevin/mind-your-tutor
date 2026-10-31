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

/** One model the device may use: a typed config entry (see apps/student/src/privacy.ts). */
export interface NerModelSource {
  id: string;
  load: ModelLoader;
}

/** No configured model could be loaded; the device sends nothing (D33). */
export class ModelUnavailableError extends Error {
  constructor(readonly tried: readonly string[]) {
    super('No on-device model could be loaded');
    this.name = 'ModelUnavailableError';
  }
}

/**
 * A recognizer that loads a model the first time it is needed and keeps it. It tries the
 * configured models in order and uses the first that loads. If none does it fails closed:
 * `recognize` rejects with `ModelUnavailableError` and the caller must send nothing. There
 * is no fallback to word lists on the device (D33). A later call tries again, so a student
 * who comes back online is not stuck. `onFailure` gets the model id and the error, never text.
 */
export function lazyModelRecognizer(
  sources: readonly NerModelSource[],
  onFailure?: (id: string, error: unknown) => void,
): EntityRecognizer {
  let ready: EntityRecognizer | null = null;
  let loading: Promise<EntityRecognizer> | null = null;

  async function load(): Promise<EntityRecognizer> {
    for (const source of sources) {
      try {
        return modelRecognizer(BertNer.load(await source.load()));
      } catch (error) {
        onFailure?.(source.id, error);
      }
    }
    throw new ModelUnavailableError(sources.map((s) => s.id));
  }

  return {
    async recognize(text) {
      if (!ready) {
        loading ??= load().finally(() => {
          loading = null;
        });
        ready = await loading;
      }
      return ready.recognize(text);
    },
  };
}
