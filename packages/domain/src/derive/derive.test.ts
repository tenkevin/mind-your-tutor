import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VersionDerivedSchema, parsePack, type Pack } from '@ideamap/contracts';
import { derive } from '../index.js';
import { expectRules, makePack, randomPack, type LinkInput } from './testing.js';

function samplePack(): Pack {
  const url = new URL('../../../../fixtures/water-cycle/pack.json', import.meta.url);
  const result = parsePack(JSON.parse(readFileSync(url, 'utf8')));
  if (!result.ok) throw new Error('The water-cycle fixture should parse.');
  return result.value;
}

const sample = samplePack();

function star(spokes: number[]): Pack {
  const ideas = [{ idea_id: 'hub' }, ...spokes.map((_, i) => ({ idea_id: `s${i}` }))];
  const links: LinkInput[] = spokes.map((importance, i) => ({
    from_id: 'hub',
    to_id: `s${i}`,
    importance,
  }));
  return makePack(ideas, links);
}

describe('derive on the water-cycle sample (C3-F3)', () => {
  const derived = derive(sample, { seed: 1 });

  it('keeps 27 links and lists the 4 it hides, as the prototype does', () => {
    expect(derived.ranked_links.kept).toHaveLength(27);
    const hidden = derived.ranked_links.hidden.map((l) => `${l.from_id}>${l.to_id}`);
    expect(hidden.sort()).toEqual(['coll>cycle', 'sun>ocean', 'temp>climate', 'trans>cycle']);
  });

  it('puts Evaporation in the centre and the prototype’s six in the inner ring', () => {
    expect(derived.layout.centre).toBe('evap');
    const inner = derived.layout.positions.filter((p) => p.ring === 1).map((p) => p.idea_id);
    expect(inner.sort()).toEqual(['cond', 'cycle', 'ocean', 'prec', 'temp', 'vap']);
  });

  it('follows every rule, with at least 8 questions per idea (C3-F5, F6)', () => {
    expectRules(sample, derived);
    expect(derived.quizzes.banks).toHaveLength(18);
    for (const bank of derived.quizzes.banks) {
      expect(bank.questions.length).toBeGreaterThanOrEqual(8);
      expect(bank.short).toBe(false);
    }
  });

  it('orders the inner ring so neighbours sit next to each other where possible (C3-U3)', () => {
    const kept = new Set(
      derived.ranked_links.kept.flatMap((l) => [
        `${l.from_id}>${l.to_id}`,
        `${l.to_id}>${l.from_id}`,
      ]),
    );
    const ring = derived.layout.positions
      .filter((p) => p.ring === 1)
      .sort((a, b) => a.angle! - b.angle!)
      .map((p) => p.idea_id);
    // Each step goes to a neighbour of the previous idea whenever one is still unplaced.
    for (let i = 1; i < ring.length; i++) {
      if (kept.has(`${ring[i - 1]}>${ring[i]}`)) continue;
      for (const later of ring.slice(i)) expect(kept.has(`${ring[i - 1]}>${later}`)).toBe(false);
    }
  });

  it('writes questions that read as plain English (C3-U1, U2)', () => {
    const evap = derived.quizzes.banks.find((b) => b.idea_id === 'evap')!;
    const texts = evap.questions.map((q) => q.text);
    expect(texts).toContain('The Sun powers Evaporation.');
    expect(texts).toContain('… powers Evaporation');
    for (const q of evap.questions.filter((q) => q.answer === 'False')) {
      expect(q.explanation).toMatch(/^The map says: .+\.$/);
    }
  });
});

describe('link ranking (C3-F1, F2)', () => {
  it('keeps the 3 strongest of 5 outgoing links', () => {
    const { ranked_links } = derive(star([5, 4, 3, 2, 1]), { seed: 1 });
    expect(ranked_links.kept.map((l) => l.importance)).toEqual([5, 4, 3]);
    expect(ranked_links.hidden.map((l) => [l.importance, l.reason])).toEqual([
      [2, 'too_many_out'],
      [1, 'too_many_out'],
    ]);
  });

  it('keeps the 3 strongest of 5 incoming links', () => {
    const pack = makePack(
      ['hub', 'a', 'b', 'c', 'd', 'e'].map((idea_id) => ({ idea_id })),
      ['a', 'b', 'c', 'd', 'e'].map((from_id, i) => ({ from_id, to_id: 'hub', importance: i + 1 })),
    );
    const { ranked_links } = derive(pack, { seed: 1 });
    expect(ranked_links.kept.map((l) => l.from_id)).toEqual(['e', 'd', 'c']);
    expect(ranked_links.hidden.every((l) => l.reason === 'too_many_in')).toBe(true);
  });

  it('breaks ties by row order, the same way on every run and seed', () => {
    const pack = star([3, 3, 3, 3, 3]);
    for (const seed of [1, 2, 99]) {
      const { ranked_links } = derive(pack, { seed });
      expect(ranked_links.kept.map((l) => l.to_id)).toEqual(['s0', 's1', 's2']);
    }
  });

  it('takes the limit as an option', () => {
    for (const maxLinks of [1, 2, 5]) {
      const { ranked_links } = derive(star([5, 4, 3, 2, 1, 1]), { seed: 1, maxLinks });
      expect(ranked_links.max_links).toBe(maxLinks);
      expect(ranked_links.kept).toHaveLength(maxLinks);
    }
    expect(() => derive(sample, { seed: 1, maxLinks: 0 })).toThrow(RangeError);
  });

  it('hides duplicate, self and unknown-idea links instead of failing', () => {
    const pack = makePack(
      [{ idea_id: 'a' }, { idea_id: 'b' }],
      [
        { from_id: 'a', to_id: 'b', importance: 2 },
        { from_id: 'a', to_id: 'b', importance: 5 },
        { from_id: 'a', to_id: 'a' },
        { from_id: 'a', to_id: 'ghost' },
      ],
    );
    const { ranked_links } = derive(pack, { seed: 1 });
    expect(ranked_links.kept.map((l) => l.row)).toEqual([1]);
    expect(ranked_links.hidden.map((l) => l.reason).sort()).toEqual([
      'duplicate',
      'self_link',
      'unknown_idea',
    ]);
  });
});

describe('layout (C3-F4)', () => {
  it('breaks a tie for the centre by importance sum', () => {
    const pack = makePack(
      ['a', 'b', 'c', 'd'].map((idea_id) => ({ idea_id })),
      [
        { from_id: 'a', to_id: 'c', importance: 1 },
        { from_id: 'b', to_id: 'd', importance: 5 },
      ],
    );
    expect(derive(pack, { seed: 1 }).layout.centre).toBe('b');
  });

  it('places small packs without gaps', () => {
    for (const n of [0, 1, 2, 7, 8]) {
      const pack = makePack(
        Array.from({ length: n }, (_, i) => ({ idea_id: `i${i}` })),
        [],
      );
      const derived = derive(pack, { seed: 1 });
      expectRules(pack, derived);
      expect(derived.layout.positions).toHaveLength(n);
    }
  });
});

describe('rules hold on random packs (C3-F1, F4, F5, F6, F9)', () => {
  it.each(Array.from({ length: 20 }, (_, i) => i + 1))('random pack %i', (seed) => {
    const pack = randomPack(seed);
    for (const maxLinks of [3, 1]) {
      const derived = derive(pack, { seed, maxLinks });
      expectRules(pack, derived, maxLinks);
      expect(VersionDerivedSchema.parse(derived)).toEqual(derived);
    }
  });
});

describe('categories come from the pack (C3-F7)', () => {
  const renamed = { Process: 'Cause', Force: 'Effect', Thing: 'Object' } as Record<string, string>;
  const pack: Pack = {
    ...sample,
    categories: ['Cause', 'Effect', 'Object', 'Place'].map((category) => ({
      category,
      icon: null,
      description: null,
    })),
    ideas: sample.ideas.map((i) => ({ ...i, category: renamed[i.category]! })),
  };

  it('offers the four pack categories, never the prototype’s', () => {
    const derived = derive(pack, { seed: 1 });
    expectRules(pack, derived);
    for (const bank of derived.quizzes.banks) {
      const q = bank.questions.find((q) => q.kind === 'category')!;
      expect(q.options).toEqual(['Cause', 'Effect', 'Object', 'Place']);
      expect(q.prompt).toBe('What kind of idea is it?');
    }
    const all = JSON.stringify(derived.quizzes);
    for (const old of ['Process', 'Force', 'Thing']) expect(all).not.toContain(old);
    const ocean = derived.quizzes.banks.find((b) => b.idea_id === 'ocean')!;
    expect(ocean.questions.find((q) => q.kind === 'category')!.explanation).toBe(
      'The map says: Oceans is an object.',
    );
  });

  it('skips the question when there is only one category', () => {
    const one: Pack = {
      ...pack,
      categories: [{ category: 'Cause', icon: null, description: null }],
      ideas: pack.ideas.map((i) => ({ ...i, category: 'Cause' })),
    };
    const derived = derive(one, { seed: 1 });
    expectRules(one, derived);
    for (const bank of derived.quizzes.banks) {
      expect(bank.questions.some((q) => q.kind === 'category')).toBe(false);
      expect(bank.questions.length).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('sparse ideas (C3-F8)', () => {
  const ideas = Array.from({ length: 12 }, (_, i) => ({ idea_id: `i${i}`, title: `Idea ${i}` }));
  const pack = makePack(
    [...ideas, { idea_id: 'lonely', title: 'Lonely idea', category: 'Force' }],
    [{ from_id: 'i0', to_id: 'i1', relation: 'turns into' }],
  );
  const derived = derive(pack, { seed: 3 });
  const bank = (id: string) => derived.quizzes.banks.find((b) => b.idea_id === id)!;

  it('pads an idea with one link to a full quiz, as the prototype does', () => {
    expectRules(pack, derived);
    expect(bank('i0').questions.length).toBeGreaterThanOrEqual(8);
    expect(bank('i0').short).toBe(false);
    expect(bank('i1').questions.length).toBeGreaterThanOrEqual(8);
  });

  it('gives an idea with no links fewer questions and flags it', () => {
    const lonely = bank('lonely');
    expect(lonely.short).toBe(true);
    expect(lonely.questions.length).toBeLessThan(8);
    expect(lonely.questions.every((q) => q.kind === 'category')).toBe(true);
  });
});

describe('output is typed and stored-ready (C3-F9)', () => {
  it('round-trips through JSON and parses as the version’s derived data', () => {
    const derived = derive(sample, { seed: 7 });
    const copy = JSON.parse(JSON.stringify(derived));
    expect(copy).toEqual(derived);
    expect(VersionDerivedSchema.parse(copy)).toEqual(derived);
  });
});

describe('security (C3-S1, S2, S3)', () => {
  it('copies HTML in titles and relations as plain text', () => {
    const pack = makePack(
      [
        { idea_id: 'a', title: '<img src=x onerror=alert(1)>' },
        ...Array.from({ length: 10 }, (_, i) => ({ idea_id: `b${i}` })),
      ],
      [{ from_id: 'a', to_id: 'b0', relation: '</script><b>x' }],
    );
    const derived = derive(pack, { seed: 1 });
    expectRules(pack, derived);
    const texts = derived.quizzes.banks
      .find((b) => b.idea_id === 'a')!
      .questions.map((q) => q.text);
    expect(texts).toContain('<img src=x onerror=alert(1)> </script><b>x Idea b0.');
  });

  it('handles ids that are Object.prototype names', () => {
    const before = Object.getOwnPropertyNames(Object.prototype).sort();
    const slugs = ['constructor', 'tostring', 'hasownproperty', 'proto', 'valueof'];
    const slugPack = makePack(
      slugs.map((idea_id) => ({ idea_id, title: `Idea ${idea_id}` })),
      [
        { from_id: 'constructor', to_id: 'tostring', importance: 5 },
        { from_id: 'constructor', to_id: 'hasownproperty', importance: 4 },
        { from_id: 'tostring', to_id: 'proto' },
      ],
    );
    // The same pack with the exact property names, as a caller could pass them.
    const exact = new Map([
      ['tostring', 'toString'],
      ['hasownproperty', 'hasOwnProperty'],
      ['proto', '__proto__'],
      ['valueof', 'valueOf'],
    ]);
    const rename = (id: string) => exact.get(id) ?? id;
    const exactPack: Pack = {
      ...slugPack,
      ideas: slugPack.ideas.map((i) => ({ ...i, idea_id: rename(i.idea_id) })),
      links: slugPack.links.map((l) => ({
        ...l,
        from_id: rename(l.from_id),
        to_id: rename(l.to_id),
      })),
    };
    for (const pack of [slugPack, exactPack]) {
      const derived = derive(pack, { seed: 1 });
      expectRules(pack, derived);
      expect(derived.layout.centre).toBe('constructor');
      expect(derived.ranked_links.kept).toHaveLength(3);
      expect(derived.quizzes.banks).toHaveLength(5);
    }
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(before);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('is repeatable for a seed and varies only through it', () => {
    expect(derive(sample, { seed: 42 })).toEqual(derive(sample, { seed: 42 }));
    const a = derive(sample, { seed: 1 });
    const b = derive(sample, { seed: 2 });
    expect(a.ranked_links).toEqual(b.ranked_links);
    expect(a.layout).toEqual(b.layout);
    expect(a.quizzes.banks).not.toEqual(b.quizzes.banks);
    expect(() => derive(sample, { seed: Number.NaN })).toThrow(RangeError);
  });
});

describe('performance (C3-P1, P2)', () => {
  it('derives the sample in under 20 ms (median of 50)', () => {
    const times: number[] = [];
    for (let i = 0; i < 50; i++) {
      const start = performance.now();
      derive(sample, { seed: i });
      times.push(performance.now() - start);
    }
    times.sort((x, y) => x - y);
    expect(times[25]!).toBeLessThan(20);
  });

  it('derives 2,000 ideas and 6,000 links in under a second', () => {
    const n = 2000;
    const ideas = Array.from({ length: n }, (_, i) => ({ idea_id: `i${i}`, title: `Idea ${i}` }));
    const links = Array.from({ length: 6000 }, (_, k) => ({
      from_id: `i${(k * 7919) % n}`,
      to_id: `i${(k * 104729 + 1 + (k % 13)) % n}`,
      importance: (k % 5) + 1,
    }));
    const pack = makePack(ideas, links);
    const start = performance.now();
    const derived = derive(pack, { seed: 1 });
    expect(performance.now() - start).toBeLessThan(1000);
    expect(derived.quizzes.banks).toHaveLength(n);
  });
});
