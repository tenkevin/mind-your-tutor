import { createHash } from 'node:crypto';

// Text embeddings for library search (ARCHITECTURE.md §7, §9). The vendor is an open
// question (§12 q6), so everything depends on this interface, never on a provider. The
// width is fixed by the database column (`vector(1024)`).

export const EMBEDDING_DIMENSIONS = 1024;

export interface Embedder {
  readonly dimensions: number;
  /** One vector per text, in order. Vectors are finite and unit length. */
  embed(texts: readonly string[]): Promise<number[][]>;
}

const WORD = /[\p{L}\p{N}]+/gu;

/** The first letters of a word, so "evaporate" and "evaporation" share a feature. */
function stem(word: string): string {
  return word.length > 6 ? word.slice(0, 6) : word;
}

function bucket(feature: string, dimensions: number): { index: number; sign: 1 | -1 } {
  const digest = createHash('sha256').update(feature).digest();
  return { index: digest.readUInt32BE(0) % dimensions, sign: digest[4]! & 1 ? 1 : -1 };
}

/**
 * A deterministic embedder for tests and local development: hashed bag of words, so
 * texts that share words are close. No network, no key, same output every run. It is not
 * a semantic model; production wires a real one behind `Embedder`.
 */
export function hashEmbedder(dimensions = EMBEDDING_DIMENSIONS): Embedder {
  const embedOne = (text: string): number[] => {
    const vector = new Array<number>(dimensions).fill(0);
    for (const [word] of text.toLowerCase().matchAll(WORD)) {
      for (const feature of new Set([word, `~${stem(word)}`])) {
        const { index, sign } = bucket(feature, dimensions);
        vector[index]! += sign;
      }
    }
    const norm = Math.hypot(...vector);
    // Text with no words gets a fixed unit vector, so it is still storable.
    if (norm === 0) return vector.map((_, i) => (i === 0 ? 1 : 0));
    return vector.map((v) => v / norm);
  };
  return {
    dimensions,
    embed: (texts) => Promise.resolve(texts.map(embedOne)),
  };
}
