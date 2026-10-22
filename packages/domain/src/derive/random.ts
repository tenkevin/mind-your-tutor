// Seeded randomness for generation (D6): the same seed always gives the same output.
// These are the prototype's `rng`, `hash` and `shuffle` (Idea Map Explorer v2).

export type Random = () => number;

/** mulberry32: a small, fast generator returning numbers in [0, 1). */
export function seeded(seed: number): Random {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(text: string): number {
  let h = 7;
  for (const ch of text) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return h;
}

/** A shuffled copy (Fisher-Yates). */
export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Up to `count` different items that pass `accept`, in random order. Large lists are
 * sampled by index, so picking a few from thousands doesn't copy the list.
 */
export function pickDistinct<T>(
  items: readonly T[],
  count: number,
  random: Random,
  accept: (item: T) => boolean,
): T[] {
  if (count <= 0) return [];
  if (items.length <= 64) return shuffle(items, random).filter(accept).slice(0, count);
  const picked: T[] = [];
  const tried = new Set<number>();
  for (let attempt = 0; picked.length < count && attempt < count * 20; attempt++) {
    const i = Math.floor(random() * items.length);
    if (tried.has(i)) continue;
    tried.add(i);
    if (accept(items[i]!)) picked.push(items[i]!);
  }
  // Most items were rejected: scan the rest from a random start.
  const start = Math.floor(random() * items.length);
  for (let n = 0; picked.length < count && n < items.length; n++) {
    const i = (start + n) % items.length;
    if (tried.has(i)) continue;
    tried.add(i);
    if (accept(items[i]!)) picked.push(items[i]!);
  }
  return picked;
}
