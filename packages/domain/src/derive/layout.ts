import type { DerivedLink, IdeaPosition, Layout, Pack } from '@ideamap/contracts';

// Ring layout (prototype `buildGraph`): the most connected idea in the centre, the next
// six in the inner ring, everyone else in the outer ring.

const INNER_RING_SIZE = 6;

/** JSON has no -0, so store 0 instead and keep the data round-trippable. */
function num(value: number): number {
  return value === 0 ? 0 : value;
}

function place(id: string, ring: 1 | 2, angle: number): IdeaPosition {
  return {
    idea_id: id,
    ring,
    angle: num(angle),
    x: num(Math.cos(angle) * ring),
    y: num(Math.sin(angle) * ring),
  };
}

export function layOut(pack: Pack, kept: readonly DerivedLink[]): Layout {
  const ids = pack.ideas.map((i) => i.idea_id);
  const adjacent = new Map<string, Set<string>>();
  const degree = new Map<string, number>();
  const weight = new Map<string, number>();
  const order = new Map<string, number>();
  ids.forEach((id, i) => {
    if (order.has(id)) return;
    order.set(id, i);
    adjacent.set(id, new Set());
    degree.set(id, 0);
    weight.set(id, 0);
  });
  for (const link of kept) {
    for (const [a, b] of [
      [link.from_id, link.to_id],
      [link.to_id, link.from_id],
    ] as const) {
      adjacent.get(a)?.add(b);
      degree.set(a, (degree.get(a) ?? 0) + 1);
      weight.set(a, (weight.get(a) ?? 0) + link.importance);
    }
  }

  // Ideas in pack order (first appearance), then by kept links and importance sum.
  const rank = [...order.keys()].sort(
    (x, y) => degree.get(y)! - degree.get(x)! || weight.get(y)! - weight.get(x)!,
  );
  if (rank.length === 0) return { centre: null, rank, positions: [] };

  const centre = rank[0]!;
  const positions = new Map<string, IdeaPosition>();
  positions.set(centre, { idea_id: centre, ring: 0, angle: null, x: 0, y: 0 });

  // Inner ring: walk from the strongest idea, next to a neighbour of the last where possible.
  const inner = rank.slice(1, 1 + INNER_RING_SIZE);
  const ring2 = rank.slice(1 + INNER_RING_SIZE);
  const walk = inner.slice(0, 1);
  const left = inner.slice(1);
  while (left.length) {
    const last = adjacent.get(walk[walk.length - 1]!)!;
    left.sort((x, y) => (last.has(y) ? 1 : 0) - (last.has(x) ? 1 : 0));
    walk.push(left.shift()!);
  }
  walk.forEach((id, i) => {
    positions.set(id, place(id, 1, -Math.PI / 2 + (i * 2 * Math.PI) / walk.length));
  });

  // Outer ring: each idea near the mean angle of its inner-ring neighbours.
  const innerAngles = new Map(walk.map((id) => [id, positions.get(id)!.angle!]));
  const preferred = ring2.map((id) => {
    const angles = [...adjacent.get(id)!].flatMap((n) => {
      const a = innerAngles.get(n);
      return a === undefined ? [] : [a];
    });
    if (!angles.length) return { id, angle: null };
    const sin = angles.reduce((s, a) => s + Math.sin(a), 0);
    const cos = angles.reduce((s, a) => s + Math.cos(a), 0);
    return { id, angle: Math.atan2(sin, cos) };
  });
  const known = preferred
    .filter((o): o is { id: string; angle: number } => o.angle !== null)
    .sort((x, y) => x.angle - y.angle);
  const outer = [...known, ...preferred.filter((o) => o.angle === null)];
  const start = known.length ? known[0]!.angle : -Math.PI / 2;
  outer.forEach((o, i) => {
    positions.set(o.id, place(o.id, 2, start + (i * 2 * Math.PI) / outer.length));
  });

  return { centre, rank, positions: rank.map((id) => positions.get(id)!) };
}
