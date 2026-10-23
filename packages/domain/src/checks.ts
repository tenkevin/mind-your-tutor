import type {
  DataCheckIssue,
  DataCheckKind,
  DataCheckLevel,
  Pack,
  TabName,
} from '@ideamap/contracts';

// Data checks on a parsed pack (ARCHITECTURE.md §7), ported from `issues()` in
// project/curriculum.js and extended with the cross-row checks that the field spec's
// "missing" behaviour implies. Pure: no I/O, and every graph walk is iterative so a
// hostile pack can't overflow the stack.

/** The tabs the checks read. A parsed `Pack` fits. */
export type CheckedPack = Pick<Pack, 'ideas' | 'links' | 'units' | 'categories' | 'assessment'>;

const LEVEL_ORDER: Record<DataCheckLevel, number> = { error: 0, warning: 1, info: 2 };

/** How many names a message lists before it says "and n more". */
const MAX_NAMES = 12;

/** Runs every data check. Errors come first, then warnings, then info. */
export function checkPack(pack: CheckedPack): DataCheckIssue[] {
  const out: DataCheckIssue[] = [];
  const add = (
    kind: DataCheckKind,
    level: DataCheckLevel,
    message: string,
    items: string[],
    tab: TabName,
    column: string | readonly [string, ...string[]],
    draftable = false,
  ) =>
    out.push({
      kind,
      level,
      message,
      items,
      fix:
        typeof column === 'string'
          ? { tab, column }
          : { tab, column: column[0], columns: [...column] },
      ...(draftable ? { draftable: true } : {}),
    });

  // The first row with an idea_id wins; duplicates are reported below.
  const ideas = new Map<string, Pack['ideas'][number]>();
  for (const idea of pack.ideas) if (!ideas.has(idea.idea_id)) ideas.set(idea.idea_id, idea);
  const title = (id: string) => ideas.get(id)?.title ?? `"${id}"`;
  const titles = (ids: readonly string[]) => list(ids.map(title));

  // Duplicate idea_ids.
  const rowsById = new Map<string, Pack['ideas']>();
  for (const idea of pack.ideas) {
    const rows = rowsById.get(idea.idea_id);
    if (rows) rows.push(idea);
    else rowsById.set(idea.idea_id, [idea]);
  }
  for (const [id, rows] of rowsById) {
    if (rows.length < 2) continue;
    add(
      'duplicate_id',
      'error',
      `${rows.length} rows in the Ideas tab use the idea_id "${id}" (${list(rows.map((r) => r.title))}). ` +
        `Each idea needs its own idea_id, so the app can't tell these apart. Fix it in Ideas → idea_id.`,
      [id],
      'Ideas',
      'idea_id',
    );
  }

  // Unknown units.
  const units = new Set(pack.units.map((u) => u.unit));
  for (const idea of ideas.values()) {
    if (units.has(idea.unit)) continue;
    add(
      'unknown_unit',
      'error',
      `${idea.title} is in unit ${idea.unit}, which isn't a unit in the Units tab, so it belongs to no unit. ` +
        `Fix it in Ideas → unit, or add unit ${idea.unit} to the Units tab.`,
      [idea.idea_id],
      'Ideas',
      'unit',
    );
  }

  // Unknown prerequisites.
  const broken = new Map<string, string>(); // idea_id → why it can never unlock
  for (const idea of ideas.values()) {
    for (const req of unique(idea.requires)) {
      if (ideas.has(req)) continue;
      add(
        'prereq',
        'error',
        `${idea.title} requires "${req}", which isn't an idea_id in the Ideas tab, so ${idea.title} can never unlock. ` +
          `Fix it in Ideas → requires.`,
        [idea.idea_id],
        'Ideas',
        'requires',
      );
      if (!broken.has(idea.idea_id))
        broken.set(idea.idea_id, `requires "${req}", which isn't an idea`);
    }
  }

  // Prerequisite loops: one issue per strongly connected component that loops.
  const ids = [...ideas.keys()];
  const index = new Map(ids.map((id, i) => [id, i]));
  const requires = ids.map((id) =>
    unique(ideas.get(id)!.requires)
      .map((r) => index.get(r))
      .filter((r): r is number => r !== undefined),
  );
  const loopOf = new Map<string, string[]>(); // idea_id → the loop it is in
  for (const component of loops(requires)) {
    const members = component.map((i) => ids[i]!);
    const inside = new Set(component);
    const within = component.map((i) => requires[i]!.filter((r) => inside.has(r)));
    // One ring (each idea requires exactly one other in it): removing any one of
    // these requirements breaks it. Any other shape can hold several loops, which may
    // or may not share a requirement, so the advice makes no claim about how many.
    const ring = within.every((reqs) => reqs.length === 1);
    const shape = ring
      ? `${describeLoop(loopPath(requires, component).map((i) => title(ids[i]!)))}. ` +
        `Remove one of these from Ideas → requires to break the loop.`
      : `${describeTangle(
          component.map((i, k) => ({ id: ids[i]!, reqs: within[k]!.map((r) => ids[r]!) })),
          title,
        )}. This group can contain several loops: remove requirements in Ideas → requires ` +
        `until no prerequisite loops remain.`;
    add(
      'cycle',
      'error',
      `Prerequisites form a loop, so ${count(members.length, 'idea')} can never unlock: ${shape}`,
      members,
      'Ideas',
      'requires',
    );
    for (const id of members) {
      loopOf.set(id, members);
      if (!broken.has(id)) broken.set(id, 'is in a prerequisite loop');
    }
  }

  // Knock-on blocks: ideas that need a broken idea, directly or through others.
  // Multi-source BFS over "is required by", so each idea gets its nearest cause.
  const requiredBy = ids.map((): number[] => []);
  requires.forEach((reqs, i) => {
    for (const r of reqs) requiredBy[r]!.push(i);
  });
  const cause: (number | undefined)[] = ids.map(() => undefined);
  const queue: number[] = [];
  ids.forEach((id, i) => {
    if (broken.has(id)) {
      cause[i] = i;
      queue.push(i);
    }
  });
  for (let head = 0; head < queue.length; head++) {
    const from = queue[head]!;
    for (const next of requiredBy[from]!) {
      if (cause[next] !== undefined) continue;
      cause[next] = cause[from];
      queue.push(next);
    }
  }
  // One warning per root cause: an idea with an unknown prerequisite, or a whole loop.
  const blocked = new Map<string, string[]>(); // root cause → blocked idea_ids, Ideas order
  ids.forEach((id, i) => {
    const root = cause[i];
    if (root === undefined || root === i) return;
    const rootId = ids[root]!;
    const key = loopOf.get(rootId)?.[0] ?? rootId;
    const group = blocked.get(key) ?? [];
    group.push(id);
    blocked.set(key, group);
  });
  for (const [key, affected] of blocked) {
    const loop = loopOf.get(key);
    const because = !loop
      ? `${title(key)}, which ${broken.get(key)}`
      : loop.length === 1
        ? `${title(key)}, which requires itself`
        : `the loop between ${titles(loop)}`;
    const fix = loop ? 'Break the loop' : `Fix ${title(key)}`;
    const n = affected.length;
    add(
      'blocked',
      'warning',
      n === 1
        ? `${title(affected[0]!)} may never unlock, because it depends on ${because}. ` +
            `${fix} in Ideas → requires first.`
        : `${n} ideas may never unlock, because they depend on ${because}: ${titles(affected)}. ` +
            `${fix} in Ideas → requires first.`,
      affected,
      'Ideas',
      'requires',
    );
  }

  // Links to unknown ideas: the row is skipped.
  const linked = new Set<string>();
  for (const link of pack.links) {
    const unknown = [link.from_id, link.to_id].filter((id) => !ideas.has(id));
    if (unknown.length === 0) {
      linked.add(link.from_id);
      linked.add(link.to_id);
      continue;
    }
    const known = [link.from_id, link.to_id].filter((id) => ideas.has(id));
    const which = unknown.length === 2 ? 'neither end is' : `"${unknown[0]}" isn't`;
    add(
      'link_unknown_idea',
      'warning',
      `The "${link.relation}" link from ${title(link.from_id)} to ${title(link.to_id)} is skipped, ` +
        `because ${which} an idea_id in the Ideas tab. ` +
        `Fix it in Links → ${unknown.length === 2 ? 'from_id and to_id' : ideas.has(link.from_id) ? 'to_id' : 'from_id'}.`,
      unique(known),
      'Links',
      unknown.length === 2 ? ['from_id', 'to_id'] : ideas.has(link.from_id) ? 'to_id' : 'from_id',
    );
  }

  // Unknown categories: the idea uses the first category.
  const categories = new Set(pack.categories.map((c) => c.category));
  const first = pack.categories[0]?.category;
  if (first === undefined && ideas.size > 0) {
    add(
      'no_categories',
      'warning',
      `The Categories tab has no rows, so every idea uses one category, "Idea". ` +
        `Add the kinds of idea in Categories → category.`,
      [...ideas.keys()],
      'Categories',
      'category',
    );
  }
  if (first !== undefined) {
    for (const idea of ideas.values()) {
      if (categories.has(idea.category)) continue;
      add(
        'unknown_category',
        'warning',
        `${idea.title} has the category "${idea.category}", which isn't in the Categories tab, ` +
          `so it uses the first category, "${first}". Fix it in Ideas → category, or add it to the Categories tab.`,
        [idea.idea_id],
        'Ideas',
        'category',
      );
    }
  }

  // Assessment rows for unknown ideas: the row is skipped.
  // A question covers its idea only in the idea's own unit.
  const asked = new Map<number, Set<string>>(); // unit → idea_ids with a question
  for (const item of pack.assessment) {
    if (!ideas.has(item.idea_id)) {
      add(
        'assessment_unknown_idea',
        'warning',
        `The unit ${item.unit} Assessment question for "${item.idea_id}" is skipped, ` +
          `because "${item.idea_id}" isn't an idea_id in the Ideas tab. Fix it in Assessment → idea_id.`,
        [],
        'Assessment',
        'idea_id',
      );
      continue;
    }
    const subject = ideas.get(item.idea_id)!;
    if (!units.has(item.unit)) {
      add(
        'assessment_unknown_unit',
        'warning',
        `The unit ${item.unit} Assessment question for ${subject.title} is skipped, ` +
          `because unit ${item.unit} isn't a unit in the Units tab. ` +
          `Fix it in Assessment → unit (${subject.title} is in unit ${subject.unit}).`,
        [item.idea_id],
        'Assessment',
        'unit',
      );
      continue;
    }
    // An idea in an unknown unit already has its own error; don't add a second issue.
    if (item.unit !== subject.unit && units.has(subject.unit)) {
      add(
        'assessment_unit_mismatch',
        'warning',
        `The Assessment question for ${subject.title} is in unit ${item.unit}, but ${subject.title} ` +
          `is in unit ${subject.unit}, so it doesn't count as a question for either unit. ` +
          `Fix it in Assessment → unit, or in Ideas → unit.`,
        [item.idea_id],
        'Assessment',
        'unit',
      );
      continue;
    }
    if (!item.question?.trim()) {
      add(
        'assessment_question',
        'warning',
        `The Assessment question for ${subject.title} in unit ${item.unit} is empty; Atlas can draft one. Add it in Assessment → question.`,
        [item.idea_id],
        'Assessment',
        'question',
        true,
      );
      continue;
    }
    const set = asked.get(item.unit) ?? new Set<string>();
    set.add(item.idea_id);
    asked.set(item.unit, set);
  }

  // Ideas in no link.
  for (const idea of ideas.values()) {
    if (linked.has(idea.idea_id)) continue;
    const tail =
      idea.requires.length > 0
        ? `If one of its prerequisites never unlocks, ${idea.title} won't either.`
        : `It has none in Ideas → requires, and no neighbour to unlock from, so it may never unlock.`;
    add(
      'no_links',
      'warning',
      `${idea.title} has no links in the Links tab, so it can only unlock through prerequisites. ${tail} ` +
        `Add a link to it in Links → from_id or to_id.`,
      [idea.idea_id],
      'Links',
      'from_id',
    );
  }

  // Missing standard codes.
  const noCodes = [...ideas.values()].filter((i) => i.standard_codes.length === 0);
  if (noCodes.length > 0) {
    const n = noCodes.length;
    add(
      'codes',
      'warning',
      `${n === 1 ? '1 idea has' : `${n} ideas have`} no standard_codes, so ${n === 1 ? 'it is' : 'they are'} ` +
        `missing from alignment reports: ${titles(noCodes.map((i) => i.idea_id))}. Add codes in Ideas → standard_codes.`,
      noCodes.map((i) => i.idea_id),
      'Ideas',
      'standard_codes',
    );
  }

  // Missing objectives. Ideas.objective is optional in the field spec (the tutor writes
  // one from links), so this is a warning that the teacher hasn't set one, not an error.
  const noObjective = [...ideas.values()].filter((i) => !i.objective?.trim());
  if (noObjective.length > 0) {
    const n = noObjective.length;
    add(
      'objective',
      'warning',
      `${n === 1 ? '1 idea has' : `${n} ideas have`} no objective, so the tutor will write ` +
        `${n === 1 ? 'one' : 'them'} from the links: ${titles(noObjective.map((i) => i.idea_id))}. ` +
        `To set your own, add it in Ideas → objective.`,
      noObjective.map((i) => i.idea_id),
      'Ideas',
      'objective',
    );
  }

  for (const unit of pack.units) {
    if (unit.objective?.trim()) continue;
    add(
      'unit_objective',
      'warning',
      `Unit ${unit.unit} (${unit.name}) has no objective; Atlas can draft one. Add it in Units → objective.`,
      [String(unit.unit)],
      'Units',
      'objective',
      true,
    );
  }

  // Missing media.
  const noMedia = [...ideas.values()].filter((i) => i.media_url === null);
  if (noMedia.length > 0) {
    const n = noMedia.length;
    add(
      'media',
      'info',
      `${n === 1 ? '1 idea has' : `${n} ideas have`} no media_url and will show a placeholder: ` +
        `${titles(noMedia.map((i) => i.idea_id))}. Add a video or image in Ideas → media_url.`,
      noMedia.map((i) => i.idea_id),
      'Ideas',
      'media_url',
    );
  }

  // Assessment coverage, per unit in Units order.
  const ideasByUnit = new Map<number, string[]>();
  for (const idea of ideas.values()) {
    const unitIdeas = ideasByUnit.get(idea.unit) ?? [];
    unitIdeas.push(idea.idea_id);
    ideasByUnit.set(idea.unit, unitIdeas);
  }
  for (const unit of unique(pack.units.map((u) => u.unit))) {
    const unitIdeas = ideasByUnit.get(unit) ?? [];
    const missing = unitIdeas.filter((id) => !asked.get(unit)?.has(id));
    if (missing.length === 0) continue;
    const m = unitIdeas.length;
    const k = m - missing.length;
    const detail = ` No question yet for ${titles(missing)}.`;
    add(
      'assessment_coverage',
      'info',
      `Unit ${unit}: ${k} of ${m} questions; Atlas can draft the rest.${detail} ` +
        `Add them in Assessment → question, or ask Atlas to draft them.`,
      missing,
      'Assessment',
      'question',
    );
  }

  return out
    .map((issue, i) => ({ issue, i }))
    .sort((a, b) => LEVEL_ORDER[a.issue.level] - LEVEL_ORDER[b.issue.level] || a.i - b.i)
    .map(({ issue }) => issue);
}

/** Errors block publishing; warnings and info don't (ARCHITECTURE.md §7). */
export function canPublish(issues: readonly DataCheckIssue[]): boolean {
  return issues.every((issue) => issue.level !== 'error');
}

/** The Teacher Settings line after "Data checks · ": "3 to review" or "all clear". */
export function summarizeIssues(issues: readonly DataCheckIssue[]): string {
  return issues.length > 0 ? `${issues.length} to review` : 'all clear';
}

/**
 * The strongly connected components that contain a loop (two or more ideas, or one
 * that requires itself), each in Ideas order, in order of their first idea.
 * Iterative Tarjan, O(ideas + requires).
 */
function loops(edges: readonly (readonly number[])[]): number[][] {
  const n = edges.length;
  const order = new Array<number>(n).fill(-1);
  const low = new Array<number>(n).fill(0);
  const onStack = new Array<boolean>(n).fill(false);
  const stack: number[] = [];
  const found: number[][] = [];
  let counter = 0;

  for (let start = 0; start < n; start++) {
    if (order[start] !== -1) continue;
    const work: [node: number, edge: number][] = [[start, 0]];
    order[start] = low[start] = counter++;
    stack.push(start);
    onStack[start] = true;
    while (work.length > 0) {
      const frame = work[work.length - 1]!;
      const [node, edge] = frame;
      const next = edges[node]![edge];
      if (next !== undefined) {
        frame[1]++;
        if (order[next] === -1) {
          order[next] = low[next] = counter++;
          stack.push(next);
          onStack[next] = true;
          work.push([next, 0]);
        } else if (onStack[next]) {
          low[node] = Math.min(low[node]!, order[next]!);
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent) low[parent[0]] = Math.min(low[parent[0]]!, low[node]!);
      if (low[node] !== order[node]) continue;
      const component: number[] = [];
      let member: number;
      do {
        member = stack.pop()!;
        onStack[member] = false;
        component.push(member);
      } while (member !== node);
      if (component.length > 1 || edges[node]!.includes(node)) {
        found.push(component.sort((a, b) => a - b));
      }
    }
  }
  return found.sort((a, b) => a[0]! - b[0]!);
}

/** A shortest loop through the component's first idea, ending where it starts. */
function loopPath(edges: readonly (readonly number[])[], component: readonly number[]): number[] {
  const start = component[0]!;
  const inside = new Set(component);
  const prev = new Map<number, number>();
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head]!;
    for (const next of edges[node]!) {
      if (!inside.has(next)) continue;
      // A self-requirement only closes the loop when the idea loops on its own.
      if (next === start && (node !== start || component.length === 1)) {
        const path = [start];
        for (let at = node; at !== start; at = prev.get(at)!) path.push(at);
        path.push(start);
        // path runs backwards from the closing step; reverse to read "requires" forwards.
        return [start, ...path.slice(1, -1).reverse(), start];
      }
      if (next === start || prev.has(next)) continue;
      prev.set(next, node);
      queue.push(next);
    }
  }
  return [start, start];
}

/** "A requires itself" or "A requires B, which requires C, which requires A". */
function describeLoop(path: readonly string[]): string {
  if (path.length === 2) return `${path[0]} requires itself`;
  const steps = path.slice(1);
  const shown =
    steps.length > MAX_NAMES
      ? [
          ...steps.slice(0, MAX_NAMES - 1),
          `… ${count(steps.length - MAX_NAMES, 'more idea')} …`,
          steps.at(-1)!,
        ]
      : steps;
  return `${path[0]} requires ${shown.join(', which requires ')}`;
}

/**
 * A loop that isn't one ring, idea by idea: "A requires itself and B; B requires A;
 * C requires A". Every idea is named, up to MAX_NAMES of them.
 */
function describeTangle(
  members: readonly { id: string; reqs: readonly string[] }[],
  title: (id: string) => string,
): string {
  const lines = members.slice(0, MAX_NAMES).map(({ id, reqs }) => {
    const names = reqs.map((r) => (r === id ? 'itself' : title(r)));
    return `${title(id)} requires ${list(names)}`;
  });
  const rest = members.length - MAX_NAMES;
  if (rest > 0) lines.push(`and ${count(rest, 'more idea')} in the loop`);
  return lines.join('; ');
}

/** "A", "A and B", "A, B and C", or "A, B, … and 7 more". */
function list(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length > MAX_NAMES) {
    return `${names.slice(0, MAX_NAMES).join(', ')} and ${names.length - MAX_NAMES} more`;
  }
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
