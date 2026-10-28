import { describe, expect, it } from 'vitest';
import { EMBEDDING_DIMENSIONS, hashEmbedder } from './embedding.js';

const cosine = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i]!, 0);

describe('hashEmbedder', () => {
  const embedder = hashEmbedder();

  it('is deterministic, unit length and the column width', async () => {
    const [a] = await embedder.embed(['Why does water evaporate?']);
    const [b] = await embedder.embed(['Why does water evaporate?']);
    expect(a).toEqual(b);
    expect(a).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(Math.hypot(...a!)).toBeCloseTo(1, 6);
    expect(a!.every(Number.isFinite)).toBe(true);
  });

  it('puts texts that share words closer than texts that do not', async () => {
    const [q, near, far] = await embedder.embed([
      'why does water evaporate',
      'Heat makes water evaporate from the ocean surface.',
      'The mitochondria is the powerhouse of the cell.',
    ]);
    expect(cosine(q!, near!)).toBeGreaterThan(cosine(q!, far!));
  });

  it('embeds empty text without dividing by zero', async () => {
    const [v] = await embedder.embed(['   ']);
    expect(Math.hypot(...v!)).toBeCloseTo(1, 6);
  });
});
