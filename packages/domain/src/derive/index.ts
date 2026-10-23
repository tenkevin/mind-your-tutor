import type { Pack, VersionDerived } from '@ideamap/contracts';
import { layOut } from './layout.js';
import { quizBank, quizContext } from './quiz.js';
import { rankLinks } from './rank.js';

export { rankLinks } from './rank.js';
export { layOut } from './layout.js';
export { statement } from './quiz.js';

export interface DeriveOptions {
  /**
   * Seeds quiz generation (D6). The same pack and seed always give the same result.
   * Generation uses the low 32 bits as a signed integer, and that is the seed stored.
   */
  seed: number;
  /** The most kept links an idea may have in each direction. Default 3. */
  maxLinks?: number;
  /** Questions in one quiz attempt; each idea's bank aims for at least this many. Default 8. */
  quizLength?: number;
}

function positiveInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a whole number of at least 1.`);
  }
  return value;
}

/**
 * Works out what a curriculum version shows from its pack (ARCHITECTURE.md §7): which
 * links the map draws, where each idea sits, and a quiz bank per idea. Pure: no I/O,
 * and the only randomness comes from `options.seed`. C4 stores the result.
 */
export function derive(pack: Pack, options: DeriveOptions): VersionDerived {
  if (!Number.isSafeInteger(options.seed)) {
    throw new RangeError('seed must be a whole number.');
  }
  const maxLinks = positiveInteger('maxLinks', options.maxLinks ?? 3);
  const quizLength = positiveInteger('quizLength', options.quizLength ?? 8);

  const ranked = rankLinks(pack, maxLinks);
  const layout = layOut(pack, ranked.kept);
  const seed = options.seed | 0;
  const ctx = quizContext(pack, ranked.kept, seed, quizLength);
  return {
    ranked_links: ranked,
    layout,
    quizzes: {
      seed,
      quiz_length: quizLength,
      banks: ctx.ideaList.map((idea) => quizBank(ctx, idea)),
    },
  };
}
