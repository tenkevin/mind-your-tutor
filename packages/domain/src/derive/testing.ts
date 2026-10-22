// Test helpers: build packs and check derived data against the C3 rules.
import { expect } from 'vitest';
import { parsePack, type Pack, type VersionDerived } from '@ideamap/contracts';
import { seeded } from './random.js';
import { statement } from './quiz.js';

export interface IdeaInput {
  idea_id: string;
  title?: string;
  category?: string;
}
export interface LinkInput {
  from_id: string;
  to_id: string;
  relation?: string;
  importance?: number;
}

export function makePack(
  ideas: IdeaInput[],
  links: LinkInput[],
  categories: string[] = ['Process', 'Force', 'Thing'],
): Pack {
  const result = parsePack({
    version: 1,
    course: { subject: 'Science', topic: 'Test', grade: '6' },
    units: [{ unit: 1, name: 'Unit', objective: 'Learn it.' }],
    ideas: ideas.map((i) => ({
      idea_id: i.idea_id,
      title: i.title ?? `Idea ${i.idea_id}`,
      category: i.category ?? categories[0] ?? 'Thing',
      unit: 1,
    })),
    links: links.map((l) => ({
      from_id: l.from_id,
      to_id: l.to_id,
      relation: l.relation ?? 'leads to',
      importance: l.importance ?? 3,
    })),
    categories: categories.map((category) => ({ category })),
  });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
}

/** A random pack, including duplicate links and self-links that C2 would flag. */
export function randomPack(seed: number, maxIdeas = 30): Pack {
  const random = seeded(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));
  const categories = ['Cause', 'Effect', 'Object', 'Place'].slice(0, int(1, 4));
  const n = int(1, maxIdeas);
  const ideas = Array.from({ length: n }, (_, i) => ({
    idea_id: `i${i}`,
    title: `Idea ${i}`,
    category: categories[int(0, categories.length - 1)]!,
  }));
  const relations = ['causes', 'is part of', 'feeds', 'turns into', 'needs'];
  const links = Array.from({ length: int(0, n * 4) }, () => ({
    from_id: `i${int(0, n - 1)}`,
    to_id: `i${int(0, n - 1)}`,
    relation: relations[int(0, relations.length - 1)]!,
    importance: int(1, 5),
  }));
  return makePack(ideas, links, categories);
}

/** Asserts every C3 rule that holds for any pack (C3-F1, F4, F5, F6, F8, F9, U1, U2). */
export function expectRules(pack: Pack, derived: VersionDerived, maxLinks = 3, quizLength = 8) {
  const ids = [...new Set(pack.ideas.map((i) => i.idea_id))];
  const titleOf = new Map(pack.ideas.map((i) => [i.idea_id, i.title]));
  const { kept, hidden } = derived.ranked_links;

  // F1: link limits, and every pack link is either kept or hidden.
  expect(kept.length + hidden.length).toBe(pack.links.length);
  const outs = new Map<string, number>();
  const ins = new Map<string, number>();
  for (const l of kept) {
    outs.set(l.from_id, (outs.get(l.from_id) ?? 0) + 1);
    ins.set(l.to_id, (ins.get(l.to_id) ?? 0) + 1);
  }
  for (const n of [...outs.values(), ...ins.values()]) expect(n).toBeLessThanOrEqual(maxLinks);

  // F4: one centre with the most kept links, six in ring 1, the rest in ring 2.
  const { layout } = derived;
  expect(layout.positions.map((p) => p.idea_id).sort()).toEqual([...ids].sort());
  const degree = (id: string) => (outs.get(id) ?? 0) + (ins.get(id) ?? 0);
  if (ids.length) {
    const centre = layout.positions.filter((p) => p.ring === 0);
    expect(centre).toHaveLength(1);
    expect(layout.centre).toBe(centre[0]!.idea_id);
    for (const id of ids) expect(degree(id)).toBeLessThanOrEqual(degree(layout.centre!));
  } else {
    expect(layout.centre).toBeNull();
  }
  const ring = (r: number) => layout.positions.filter((p) => p.ring === r);
  expect(ring(1)).toHaveLength(Math.min(6, Math.max(0, ids.length - 1)));
  expect(ring(2)).toHaveLength(Math.max(0, ids.length - 7));
  const ring1Min = Math.min(...ring(1).map((p) => degree(p.idea_id)));
  for (const p of ring(2)) expect(degree(p.idea_id)).toBeLessThanOrEqual(ring1Min);
  const spots = layout.positions.map((p) => `${p.ring}:${p.x.toFixed(9)}:${p.y.toFixed(9)}`);
  expect(new Set(spots).size).toBe(spots.length);

  // F5, F6, F8: question banks.
  const keptKeys = new Set(kept.map((l) => `${l.from_id}>${l.to_id}`));
  const linkedTo = new Map(ids.map((id) => [id, new Set<string>()]));
  const allStatements = new Set<string>();
  for (const l of pack.links) {
    if (!titleOf.has(l.from_id) || !titleOf.has(l.to_id)) continue;
    linkedTo.get(l.from_id)!.add(l.to_id);
    linkedTo.get(l.to_id)!.add(l.from_id);
    allStatements.add(
      statement(titleOf.get(l.from_id)!, l.relation, titleOf.get(l.to_id)!).toLowerCase(),
    );
  }
  const keptStatements = new Set(
    kept.map((l) => statement(titleOf.get(l.from_id)!, l.relation, titleOf.get(l.to_id)!)),
  );
  const categories = new Set(pack.categories.map((c) => c.category));
  expect(derived.quizzes.banks.map((b) => b.idea_id)).toEqual(ids);
  for (const bank of derived.quizzes.banks) {
    const id = bank.idea_id;
    const idea = pack.ideas.find((i) => i.idea_id === id)!;
    expect(bank.short).toBe(bank.questions.length < quizLength);
    const keys = bank.questions.map((q) => `${q.prompt}|${q.text}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(bank.questions.map((q) => q.id)).size).toBe(bank.questions.length);
    for (const q of bank.questions) {
      expect(q.prompt.length && q.text.length && q.explanation.length).toBeTruthy();
      expect(q.options.filter((o) => o === q.answer)).toHaveLength(1);
      expect(new Set(q.options).size).toBe(q.options.length);
      for (const s of [q.text, q.explanation, ...q.options]) {
        expect(s).not.toMatch(/\s{2}|undefined|null|NaN|\[object/);
      }
      expect(q.explanation).toMatch(/^The map says: /);
      if (q.kind === 'category') {
        expect(q.link).toBeNull();
        expect(q.answer).toBe(idea.category);
        for (const o of q.options) expect(categories.has(o) || o === idea.category).toBe(true);
        expect(q.text).not.toContain('…');
        continue;
      }
      expect(q.link).not.toBeNull();
      const link = q.link!;
      expect(keptKeys.has(`${link.from_id}>${link.to_id}`)).toBe(true);
      expect([link.from_id, link.to_id]).toContain(id);
      const truth = q.explanation.slice('The map says: '.length);
      expect(keptStatements.has(truth)).toBe(true);
      if (q.kind === 'complete_link') {
        const neighbour = link.from_id === id ? link.to_id : link.from_id;
        expect(q.answer).toBe(titleOf.get(neighbour));
        expect(q.text.match(/…/g)).toHaveLength(1);
        const lower = q.options.map((o) => o.toLowerCase());
        expect(new Set(lower).size).toBe(lower.length);
        for (const o of q.options) {
          if (o === q.answer) continue;
          // C8-F5: no distractor completes a true sentence, whatever its case.
          expect(allStatements.has(q.text.replace('…', o).toLowerCase() + '.')).toBe(false);
          expect(allStatements.has(q.text.replace('…', o).toLowerCase())).toBe(false);
          expect(o.toLowerCase()).not.toBe(idea.title.toLowerCase());
          const other = ids.find((i) => titleOf.get(i) === o)!;
          expect(other).toBeDefined();
          expect(other).not.toBe(id);
          expect(linkedTo.get(id)!.has(other)).toBe(false);
        }
      } else {
        expect(q.kind).toBe('true_false');
        expect(q.options).toEqual(['True', 'False']);
        expect(q.text).not.toContain('…');
        if (q.answer === 'True') expect(keptStatements.has(q.text)).toBe(true);
        else expect(allStatements.has(q.text.toLowerCase())).toBe(false);
      }
    }
  }

  // F9: JSON round trip.
  expect(JSON.parse(JSON.stringify(derived))).toEqual(derived);
}
