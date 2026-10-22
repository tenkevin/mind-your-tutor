import type { DerivedLink, HiddenLink, Pack, RankedLinks } from '@ideamap/contracts';

// Link ranking (prototype `buildGraph`): strongest links first, ties in row order, and
// a link is kept only while both its ideas are under the limit for that direction.

export function linkKey(fromId: string, toId: string): string {
  return `${fromId}\u0000${toId}`;
}

export function rankLinks(pack: Pack, maxLinks: number): RankedLinks {
  const ideaIds = new Set(pack.ideas.map((i) => i.idea_id));
  const links: DerivedLink[] = pack.links.map((l, row) => ({
    from_id: l.from_id,
    to_id: l.to_id,
    relation: l.relation,
    importance: l.importance,
    media_url: l.media_url,
    row,
  }));
  links.sort((x, y) => y.importance - x.importance || x.row - y.row);

  const outCount = new Map<string, number>();
  const inCount = new Map<string, number>();
  const seen = new Set<string>();
  const kept: DerivedLink[] = [];
  const hidden: HiddenLink[] = [];
  for (const link of links) {
    const key = linkKey(link.from_id, link.to_id);
    const outs = outCount.get(link.from_id) ?? 0;
    const ins = inCount.get(link.to_id) ?? 0;
    let reason: HiddenLink['reason'] | null = null;
    if (!ideaIds.has(link.from_id) || !ideaIds.has(link.to_id)) reason = 'unknown_idea';
    else if (link.from_id === link.to_id) reason = 'self_link';
    else if (seen.has(key)) reason = 'duplicate';
    else if (outs >= maxLinks) reason = 'too_many_out';
    else if (ins >= maxLinks) reason = 'too_many_in';
    if (reason !== 'unknown_idea' && reason !== 'self_link') seen.add(key);
    if (reason) {
      hidden.push({ ...link, reason });
    } else {
      kept.push(link);
      outCount.set(link.from_id, outs + 1);
      inCount.set(link.to_id, ins + 1);
    }
  }
  return { max_links: maxLinks, kept, hidden };
}
