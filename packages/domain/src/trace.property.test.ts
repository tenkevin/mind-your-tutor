import { describe, expect, it } from 'vitest';
import { traceTargets, type TraceIdea } from './index.js';

// Property tests on random acyclic graphs (C12-F4). A small seeded generator keeps runs
// reproducible without a dependency.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function randomGraph(seed: number, layered: boolean) {
  const rand = rng(seed);
  const n = 2 + Math.floor(rand() * 25);
  const ideas: TraceIdea[] = [];
  for (let i = 0; i < n; i++) {
    // requires only point at earlier ideas, so the graph is acyclic by construction.
    const requires = Array.from({ length: i }, (_, j) => `i${j}`).filter(() => rand() < 0.25);
    ideas.push({
      idea_id: `i${i}`,
      requires,
      layer: layered && rand() < 0.4 ? 'mechanism' : 'process',
    });
  }
  const mastered = new Set(ideas.filter(() => rand() < 0.25).map((i) => i.idea_id));
  return { ideas, mastered, target: `i${Math.floor(rand() * n)}` };
}

/** Everything reachable through unmastered ideas. */
function reachable(ideas: readonly TraceIdea[], target: string, mastered: ReadonlySet<string>) {
  const byId = new Map(ideas.map((i) => [i.idea_id, i]));
  const seen = new Set<string>();
  const stack = [target];
  while (stack.length > 0) {
    for (const r of byId.get(stack.pop()!)!.requires) {
      if (seen.has(r) || mastered.has(r)) continue;
      seen.add(r);
      stack.push(r);
    }
  }
  return seen;
}

describe('traceTargets properties (C12-F4)', () => {
  for (const layered of [false, true]) {
    describe(layered ? 'two-layer graphs' : 'single-layer graphs', () => {
      it('returns each unmastered prerequisite once, never the idea itself or a mastered idea', () => {
        for (let seed = 1; seed <= 300; seed++) {
          const { ideas, mastered, target } = randomGraph(seed, layered);
          const out = traceTargets(ideas, target, mastered);
          expect(new Set(out).size).toBe(out.length);
          expect(out).not.toContain(target);
          for (const id of out) expect(mastered.has(id)).toBe(false);
        }
      });

      it('names exactly the reachable unmastered prerequisites in the right layer', () => {
        for (let seed = 1; seed <= 300; seed++) {
          const { ideas, mastered, target } = randomGraph(seed, layered);
          const layerOf = new Map(ideas.map((i) => [i.idea_id, i.layer]));
          const hasMechanism = ideas.some((i) => i.layer === 'mechanism');
          const want = [...reachable(ideas, target, mastered)].filter(
            (id) => !hasMechanism || layerOf.get(id) === 'mechanism',
          );
          expect([...traceTargets(ideas, target, mastered)].sort()).toEqual(want.sort());
        }
      });

      it('lists a prerequisite after everything it needs (deepest first)', () => {
        for (let seed = 1; seed <= 300; seed++) {
          const { ideas, mastered, target } = randomGraph(seed, layered);
          const out = traceTargets(ideas, target, mastered);
          const at = new Map(out.map((id, i) => [id, i]));
          const reqs = new Map(ideas.map((i) => [i.idea_id, i.requires]));
          // Compare through the full unmastered graph: if b is needed (even through an
          // unlisted idea) by a, then b comes first.
          const needs = (a: string, b: string, seen = new Set<string>()): boolean =>
            reqs
              .get(a)!
              .some(
                (r) =>
                  !mastered.has(r) && !seen.has(r) && (r === b || (seen.add(r), needs(r, b, seen))),
              );
          for (const a of out)
            for (const b of out) if (needs(a, b)) expect(at.get(b)!).toBeLessThan(at.get(a)!);
        }
      });

      it('is deterministic', () => {
        const { ideas, mastered, target } = randomGraph(7, layered);
        expect(traceTargets(ideas, target, mastered)).toEqual(
          traceTargets(ideas, target, mastered),
        );
      });
    });
  }
});
