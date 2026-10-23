import type { DerivedLink, Idea, Pack, QuizBank, QuizQuestion } from '@ideamap/contracts';
import { linkKey } from './rank.js';
import { hashString, pickDistinct, seeded, shuffle, type Random } from './random.js';

// Quiz banks (prototype `genQuiz`). Every question comes from the map: links the map
// draws, the idea's category from the pack's Categories tab, and false statements made
// by swapping one end of a kept link for an idea that has no link to this one at all.
// Link questions ask about the map, not the world, and quote the relation as the
// teacher wrote it, so swapping an idea in never has to make a verb agree with it.

const DISTRACTORS = 3;
const MAX_CATEGORY_OPTIONS = 4;
const MIN_FALSE_STATEMENTS = 2;
const TRUE_FALSE_PROMPT = 'True or false: this link is on the map.';

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** A link as the map shows it: "The Sun" + "powers" + "Evaporation" → `The Sun → “powers” → Evaporation`. */
export function statement(from: string, relation: string, to: string): string {
  return `${clean(from)} → “${clean(relation)}” → ${clean(to)}`;
}

/** Statements compare without case, so "Water" and "water" are the same idea to a student. */
function sentenceKey(text: string): string {
  return text.toLowerCase();
}

interface Context {
  ideas: Map<string, Idea>;
  /** Unique ideas in pack order. */
  ideaList: Idea[];
  kept: readonly DerivedLink[];
  /** Kept links by idea, strongest first. */
  keptBy: Map<string, DerivedLink[]>;
  /** Every idea linked to an idea by any pack link, kept or hidden. */
  linkedTo: Map<string, Set<string>>;
  /** The sentence for every pack link between known ideas, kept or hidden, by `sentenceKey`. */
  allStatements: Set<string>;
  categories: string[];
  seed: number;
  quizLength: number;
}

export function quizContext(
  pack: Pack,
  kept: readonly DerivedLink[],
  seed: number,
  quizLength: number,
): Context {
  const ideas = new Map<string, Idea>();
  for (const idea of pack.ideas) if (!ideas.has(idea.idea_id)) ideas.set(idea.idea_id, idea);
  const keptBy = new Map<string, DerivedLink[]>();
  const linkedTo = new Map<string, Set<string>>();
  for (const id of ideas.keys()) {
    keptBy.set(id, []);
    linkedTo.set(id, new Set());
  }
  for (const link of kept) {
    keptBy.get(link.from_id)!.push(link);
    if (link.to_id !== link.from_id) keptBy.get(link.to_id)!.push(link);
  }
  const allStatements = new Set<string>();
  for (const link of pack.links) {
    const from = ideas.get(link.from_id);
    const to = ideas.get(link.to_id);
    if (!from || !to) continue;
    linkedTo.get(from.idea_id)!.add(to.idea_id);
    linkedTo.get(to.idea_id)!.add(from.idea_id);
    allStatements.add(sentenceKey(statement(from.title, link.relation, to.title)));
  }

  // Category names from the Categories tab; ideas' own categories only if it is empty.
  const categories: string[] = [];
  const seen = new Set<string>();
  const names = pack.categories.length
    ? pack.categories.map((c) => c.category)
    : [...ideas.values()].map((i) => i.category);
  for (const name of names) {
    const key = clean(name).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      categories.push(clean(name));
    }
  }

  return {
    ideas,
    ideaList: [...ideas.values()],
    kept,
    keptBy,
    linkedTo,
    allStatements,
    categories,
    seed,
    quizLength,
  };
}

function categoryQuestion(ctx: Context, idea: Idea, random: Random): QuizQuestion | null {
  const own = clean(idea.category);
  const answer = ctx.categories.find((c) => c.toLowerCase() === own.toLowerCase()) ?? own;
  const all = ctx.categories.includes(answer) ? ctx.categories : [...ctx.categories, answer];
  if (all.length < 2) return null;
  const others = pickDistinct(
    all.filter((c) => c !== answer),
    MAX_CATEGORY_OPTIONS - 1,
    random,
    () => true,
  );
  const chosen = new Set([answer, ...others]);
  const title = clean(idea.title);
  return {
    id: `${idea.idea_id}/category`,
    kind: 'category',
    prompt: 'What kind of idea is it?',
    text: title,
    options: all.filter((c) => chosen.has(c)),
    answer,
    // No verb that agrees with the title, so "Glaciers" reads as well as "The Sun".
    explanation: `The map says: the category for ${title} is ${answer}.`,
    link: null,
  };
}

export function quizBank(ctx: Context, idea: Idea): QuizBank {
  const id = idea.idea_id;
  const random = seeded(Math.imul(ctx.seed, 7919) + hashString(id));
  const links = ctx.keptBy.get(id)!;
  const linked = ctx.linkedTo.get(id)!;
  const others = ctx.ideaList.filter((i) => i.idea_id !== id && !linked.has(i.idea_id));
  const title = (i: string) => clean(ctx.ideas.get(i)!.title);
  const ownTitle = clean(idea.title);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const isTrue = (text: string) => ctx.allStatements.has(sentenceKey(text));

  const pool: QuizQuestion[] = [];
  const texts = new Set<string>();
  const add = (q: QuizQuestion) => {
    const key = `${q.prompt}\u0000${q.text}`;
    if (texts.has(key)) return;
    texts.add(key);
    pool.push(q);
  };

  for (const link of links) {
    const forward = link.from_id === id;
    const answer = title(forward ? link.to_id : link.from_id);
    const truth = statement(title(link.from_id), link.relation, title(link.to_id));
    const ref = { from_id: link.from_id, to_id: link.to_id };
    const tag = linkKey(link.from_id, link.to_id).replace('\u0000', '>');
    const relation = clean(link.relation);
    // The link an option would make: never a true one, or a student could argue for it.
    const complete = (t: string) =>
      forward ? statement(ownTitle, relation, t) : statement(t, relation, ownTitle);
    const used = new Set([sentenceKey(answer)]);
    const distractors = pickDistinct(others, DISTRACTORS, random, (o) => {
      const t = clean(o.title);
      if (used.has(sentenceKey(t)) || same(t, ownTitle) || isTrue(complete(t))) return false;
      used.add(sentenceKey(t));
      return true;
    }).map((o) => clean(o.title));
    if (distractors.length) {
      add({
        id: `${id}/complete_link/${tag}`,
        kind: 'complete_link',
        prompt: 'Which idea completes the link?',
        text: complete('…'),
        options: shuffle([answer, ...distractors], random),
        answer,
        explanation: `The map says: ${truth}.`,
        link: ref,
      });
    }
    add({
      id: `${id}/true/${tag}`,
      kind: 'true_false',
      prompt: TRUE_FALSE_PROMPT,
      text: truth,
      options: ['True', 'False'],
      answer: 'True',
      explanation: `The map says: ${truth}.`,
      link: ref,
    });
  }

  const category = categoryQuestion(ctx, idea, random);
  if (category) add(category);

  // False statements: the prototype pads the bank with these until it is full. A swap
  // never comes from next to either end of the link, and is first sought at least three
  // links from this idea, so "Rain & snow feeds Water cycle" (rain falls as
  // precipitation, which is part of the water cycle) isn't marked false. Closer swaps
  // are used only if those run out.
  const nearby = new Set<string>();
  for (const n of linked) for (const m of ctx.linkedTo.get(n)!) nearby.add(m);
  const wanted = Math.max(MIN_FALSE_STATEMENTS, ctx.quizLength - pool.length);
  let made = 0;
  const attempts = links.length && others.length ? Math.max(60, wanted * 20) : 0;
  for (const far of [true, false]) {
    for (let k = 0; made < wanted && k < attempts; k++) {
      const link = links[k % links.length]!;
      const forward = link.from_id === id;
      const swap = others[Math.floor(random() * others.length)]!;
      const replacedId = forward ? link.to_id : link.from_id;
      const replaced = title(replacedId);
      const swapTitle = clean(swap.title);
      if (same(swapTitle, replaced) || same(swapTitle, ownTitle)) continue;
      if (ctx.linkedTo.get(replacedId)!.has(swap.idea_id)) continue;
      if (far && nearby.has(swap.idea_id)) continue;
      const text = forward
        ? statement(ownTitle, link.relation, swapTitle)
        : statement(swapTitle, link.relation, ownTitle);
      if (isTrue(text)) continue;
      const before = pool.length;
      add({
        id: `${id}/false/${linkKey(link.from_id, link.to_id).replace('\u0000', '>')}/${swap.idea_id}`,
        kind: 'true_false',
        prompt: TRUE_FALSE_PROMPT,
        text,
        options: ['True', 'False'],
        answer: 'False',
        explanation: `The map says: ${statement(title(link.from_id), link.relation, title(link.to_id))}.`,
        link: { from_id: link.from_id, to_id: link.to_id },
      });
      if (pool.length > before) made++;
    }
  }

  const questions = shuffle(pool, random);
  return { idea_id: id, questions, short: questions.length < ctx.quizLength };
}
