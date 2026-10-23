import type { CurriculumDiff, DiffIdeaRef, DiffUnit, Pack } from '@ideamap/contracts';

// The draft vs published diff (ARCHITECTURE.md §7, task C5). Ideas are matched by
// `idea_id`, the stable identity across versions (§5), so a new title on the same id
// is a rename, never a removal and an addition. Every list is sorted by `idea_id`
// (code point order), so row order in the source sheet never changes the result.

export type PackDiff = CurriculumDiff;

type Idea = Pack['ideas'][number];

const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The first row wins for a repeated id; C2 reports duplicates as errors. */
function ideasById(pack: Pack): Map<string, Idea> {
  const out = new Map<string, Idea>();
  for (const idea of pack.ideas) if (!out.has(idea.idea_id)) out.set(idea.idea_id, idea);
  return out;
}

function unitNames(pack: Pack): Map<number, string> {
  const out = new Map<number, string>();
  for (const unit of pack.units) if (!out.has(unit.unit)) out.set(unit.unit, unit.name);
  return out;
}

/**
 * One question per idea: the first non-empty question among its Assessment rows, in
 * row order, or null. Rows for ideas not in the pack are ignored (C2 skips them).
 */
function questions(pack: Pack): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const row of pack.assessment) {
    if (!out.get(row.idea_id)) out.set(row.idea_id, row.question);
  }
  return out;
}

const sortedUnique = (ids: readonly string[]) => [...new Set(ids)].sort(byCodePoint);

/**
 * What changes from `before` (the published pack, or null when nothing is published
 * yet) to `after` (the draft).
 */
export function diffPacks(before: Pack | null, after: Pack): PackDiff {
  const next = ideasById(after);
  const nextUnits = unitNames(after);
  const prev = before ? ideasById(before) : new Map<string, Idea>();
  const prevUnits = before ? unitNames(before) : new Map<number, string>();

  const unit = (names: Map<number, string>, n: number): DiffUnit => ({
    unit: n,
    name: names.get(n) ?? null,
  });
  // A prerequisite is named as the draft has it, or as it was if the draft dropped it.
  const ref = (id: string): DiffIdeaRef => ({
    idea_id: id,
    title: next.get(id)?.title ?? prev.get(id)?.title ?? id,
  });

  const diff: PackDiff = {
    first_publish: before === null,
    empty: true,
    ideas_added: [],
    ideas_removed: [],
    ideas_renamed: [],
    prerequisites_changed: [],
    units_changed: [],
    assessment_changed: [],
  };

  const prevQuestions = before ? questions(before) : new Map<string, string | null>();
  const nextQuestions = questions(after);

  for (const id of [...new Set([...prev.keys(), ...next.keys()])].sort(byCodePoint)) {
    const was = prev.get(id);
    const now = next.get(id);
    if (!was) {
      diff.ideas_added.push({ idea_id: id, title: now!.title, unit: unit(nextUnits, now!.unit) });
      continue;
    }
    if (!now) {
      diff.ideas_removed.push({ idea_id: id, title: was.title, unit: unit(prevUnits, was.unit) });
      continue;
    }
    if (was.title !== now.title) {
      diff.ideas_renamed.push({ idea_id: id, before: was.title, after: now.title });
    }
    const req = { before: sortedUnique(was.requires), after: sortedUnique(now.requires) };
    if (req.before.join('\n') !== req.after.join('\n')) {
      const had = new Set(req.before);
      const has = new Set(req.after);
      diff.prerequisites_changed.push({
        idea_id: id,
        title: now.title,
        ...req,
        added: req.after.filter((r) => !had.has(r)).map(ref),
        removed: req.before.filter((r) => !has.has(r)).map(ref),
      });
    }
    if (was.unit !== now.unit) {
      diff.units_changed.push({
        idea_id: id,
        title: now.title,
        from: unit(prevUnits, was.unit),
        to: unit(nextUnits, now.unit),
      });
    }
    const q = { before: prevQuestions.get(id) ?? null, after: nextQuestions.get(id) ?? null };
    if (q.before !== q.after) diff.assessment_changed.push({ idea_id: id, title: now.title, ...q });
  }

  diff.empty =
    diff.ideas_added.length +
      diff.ideas_removed.length +
      diff.ideas_renamed.length +
      diff.prerequisites_changed.length +
      diff.units_changed.length +
      diff.assessment_changed.length ===
    0;
  return diff;
}
