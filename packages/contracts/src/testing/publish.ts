// Test helpers for C5: the QA fixtures A, B and E from docs/qa/C5.md, built from
// fixtures/water-cycle/pack.json.
import { parsePack } from '../parse.js';
import type { Pack } from '../pack.js';
import { readPackJson } from './fixtures.js';

/** The sample pack as JSON, unmodified (fixture E: one data-check error). */
export const rawSample = readPackJson;

export function parsed(raw: unknown): Pack {
  const result = parsePack(raw);
  if (!result.ok) throw new Error('test pack does not parse');
  return result.value;
}

/** E: the sample as it is, with `ground` requiring the unknown `aquifer`. */
export const packE = (): Pack => parsed(rawSample());

/** A: the sample with its one error fixed. */
export function packA(): Pack {
  const pack = packE();
  const ground = pack.ideas.find((i) => i.idea_id === 'ground')!;
  ground.requires = ground.requires.filter((id) => id !== 'aquifer');
  return pack;
}

/**
 * B: A with one idea added (`snow`), one removed (`glacier`), one renamed (`vap`),
 * one `requires` change (`climate` drops `prec`), one idea moved to another unit
 * (`ocean`, unit 1 → 3) and one assessment question edited (`sun`).
 */
export function packB(): Pack {
  const pack = packA();
  pack.ideas = pack.ideas.filter((i) => i.idea_id !== 'glacier');
  pack.links = pack.links.filter((l) => l.from_id !== 'glacier' && l.to_id !== 'glacier');
  pack.assessment = pack.assessment.filter((a) => a.idea_id !== 'glacier');
  const rain = pack.ideas.find((i) => i.idea_id === 'rain')!;
  pack.ideas.push({ ...rain, idea_id: 'snow', title: 'Snow', requires: ['prec'] });
  pack.links.push({
    from_id: 'prec',
    to_id: 'snow',
    relation: 'can fall as',
    importance: 3,
    media_url: null,
  });
  pack.ideas.find((i) => i.idea_id === 'vap')!.title = 'Vapour';
  pack.ideas.find((i) => i.idea_id === 'climate')!.requires = ['temp'];
  pack.ideas.find((i) => i.idea_id === 'ocean')!.unit = 3;
  pack.assessment.find((a) => a.idea_id === 'ocean')!.unit = 3;
  pack.assessment.find((a) => a.idea_id === 'sun')!.question =
    'How does the Sun help water rise into the air?';
  return pack;
}

/** The same pack with every tab's rows in reverse order. */
export function reordered(pack: Pack): Pack {
  return {
    ...pack,
    units: [...pack.units].reverse(),
    ideas: [...pack.ideas].reverse().map((i) => ({ ...i, requires: [...i.requires].reverse() })),
    links: [...pack.links].reverse(),
    categories: [...pack.categories].reverse(),
    assessment: [...pack.assessment].reverse(),
  };
}
