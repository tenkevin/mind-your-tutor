import type { Pack } from '@ideamap/contracts';

// Where the trace-back goes (ARCHITECTURE.md D41). For a conceptual domain the surface
// process loop circles through Links, so the trace never walks it; it goes down
// `requires` to the causal-mechanism layer. For a single-layer pack (no mechanism ideas,
// such as kinematics) it walks `requires` as before. Pure and iterative; the signals that
// use it are M8.

/** What the trace reads of an idea. A parsed `Pack` idea fits. */
export type TraceIdea = Pick<Pack['ideas'][number], 'idea_id' | 'requires' | 'layer'>;

/**
 * The unmastered prerequisites to trace back to for `ideaId`, deepest first: every
 * prerequisite comes after the ideas it needs, ties in Ideas order. A mastered idea is
 * a boundary (what it needs is not a gap), and the idea itself and unknown ids are never
 * returned. If the pack has any mechanism idea, only mechanism ideas are returned;
 * process ideas are walked through but not named.
 */
export function traceTargets(
  ideas: readonly TraceIdea[],
  ideaId: string,
  mastered: ReadonlySet<string>,
): string[] {
  const n = ideas.length;
  const index = new Map<string, number>(); // the first row wins for a repeated id
  for (let i = 0; i < n; i++) if (!index.has(ideas[i]!.idea_id)) index.set(ideas[i]!.idea_id, i);
  const start = index.get(ideaId);
  if (start === undefined) return [];
  const layered = ideas.some((idea) => idea.layer === 'mechanism');

  // Depth-first from the idea, over unmastered prerequisites. `height` is the longest
  // chain of unmastered prerequisites below an idea (-1: not reached yet), so ascending
  // height is deepest first. A back edge (a loop C2 would reject) is skipped, not followed.
  const height = new Int32Array(n).fill(-1);
  const open = new Uint8Array(n);
  const reached: number[] = [];
  const edgesOf = (i: number) => {
    const out: number[] = [];
    for (const r of ideas[i]!.requires) {
      const j = index.get(r);
      if (j !== undefined && !mastered.has(r)) out.push(j);
    }
    return out;
  };
  const work: { at: number; edges: number[]; next: number }[] = [];
  work.push({ at: start, edges: edgesOf(start), next: 0 });
  open[start] = 1;
  while (work.length > 0) {
    const frame = work[work.length - 1]!;
    const j = frame.edges[frame.next++];
    if (j !== undefined) {
      if (height[j]! < 0 && !open[j]) {
        open[j] = 1;
        work.push({ at: j, edges: edgesOf(j), next: 0 });
      }
      continue;
    }
    work.pop();
    open[frame.at] = 0;
    let h = 0;
    for (const j2 of frame.edges) if (height[j2]! >= 0) h = Math.max(h, height[j2]! + 1);
    height[frame.at] = h;
    if (frame.at !== start && (!layered || ideas[frame.at]!.layer === 'mechanism')) {
      reached.push(frame.at);
    }
  }

  // Height first, then Ideas order: one numeric key per idea.
  const keys = Float64Array.from(reached, (i) => height[i]! * n + i);
  keys.sort();
  return Array.from(keys, (key) => ideas[key % n]!.idea_id);
}
