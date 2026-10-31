import {
  PracticeItemSchema,
  type CurriculumDiff,
  type DiffIdeaRef,
  type DiffUnit,
  type Pack,
} from '@ideamap/contracts';

// The draft vs published diff (ARCHITECTURE.md §7, task C5). Ideas are matched by
// `idea_id`, the stable identity across versions (§5), so a new title on the same id
// is a rename, never a removal and an addition. Every list is sorted by `idea_id`
// (code point order), so row order in the source sheet never changes the result.

export type PackDiff = CurriculumDiff;

type Idea = Pack['ideas'][number];
type PracticeRow = Pack['practice'][number];

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
 * Every accepted question per idea, sorted by code point. A row is accepted by the same
 * rules as the data check (checks.ts): its idea is in the Ideas tab, its unit is in the
 * Units tab and is the idea's own unit (unless the idea's unit is unknown, which has
 * its own error), and its question isn't blank. Skipped rows are ignored, never chosen
 * over an accepted one. Repeats are kept, so a copied question counts as a second one.
 */
function questions(pack: Pack): Map<string, string[]> {
  const ideas = ideasById(pack);
  const units = unitNames(pack);
  const out = new Map<string, string[]>();
  for (const row of pack.assessment) {
    const idea = ideas.get(row.idea_id);
    if (!idea || !units.has(row.unit)) continue;
    if (row.unit !== idea.unit && units.has(idea.unit)) continue;
    if (!row.question?.trim()) continue;
    const list = out.get(row.idea_id) ?? [];
    list.push(row.question);
    out.set(row.idea_id, list);
  }
  for (const list of out.values()) list.sort(byCodePoint);
  return out;
}

/** Multiset difference of two sorted lists: what `a` has that `b` lacks. */
function minus(a: readonly string[], b: readonly string[]): string[] {
  const left = new Map<string, number>();
  for (const q of b) left.set(q, (left.get(q) ?? 0) + 1);
  return a.filter((q) => {
    const n = left.get(q) ?? 0;
    if (n > 0) left.set(q, n - 1);
    return n === 0;
  });
}

const PRACTICE_COLUMNS = Object.keys(PracticeItemSchema.shape).filter(
  (name) => name !== 'exercise_id',
) as (keyof PracticeRow)[];

const show = (value: PracticeRow[keyof PracticeRow]): string =>
  value === null ? '' : Array.isArray(value) ? value.join(' | ') : String(value);

/** Every accepted Practice problem by exercise, then by question (trimmed), in a stable order. */
function practice(pack: Pack): Map<string, Map<string, PracticeRow[]>> {
  const ideas = ideasById(pack);
  const out = new Map<string, Map<string, PracticeRow[]>>();
  for (const row of pack.practice) {
    if (!ideas.has(row.idea_id)) continue;
    const exercise = out.get(row.exercise_id) ?? new Map<string, PracticeRow[]>();
    const key = row.question.trim();
    exercise.set(key, [...(exercise.get(key) ?? []), row]);
    out.set(row.exercise_id, exercise);
  }
  // The same question twice is paired in a fixed order, whichever row came first.
  const canonical = (row: PracticeRow) => JSON.stringify(PRACTICE_COLUMNS.map((c) => row[c]));
  for (const exercise of out.values()) {
    for (const rows of exercise.values()) {
      rows.sort((a, b) => byCodePoint(canonical(a), canonical(b)));
    }
  }
  return out;
}

function diffPractice(before: Pack | null, after: Pack): PackDiff['practice_changed'] {
  const was = before ? practice(before) : new Map<string, Map<string, PracticeRow[]>>();
  const now = practice(after);
  const out: PackDiff['practice_changed'] = [];
  const first = (e: Map<string, PracticeRow[]> | undefined) => [...(e?.values() ?? [])][0]?.[0];
  for (const id of [...new Set([...was.keys(), ...now.keys()])].sort(byCodePoint)) {
    const old = was.get(id);
    const cur = now.get(id);
    const head = first(cur) ?? first(old)!;
    const entry: PackDiff['practice_changed'][number] = {
      exercise_id: id,
      title: head.exercise_title,
      idea_id: head.idea_id,
      change: !old ? 'added' : !cur ? 'removed' : 'changed',
      problems_added: [],
      problems_removed: [],
      problems_changed: [],
    };
    for (const question of [...new Set([...(old?.keys() ?? []), ...(cur?.keys() ?? [])])].sort(
      byCodePoint,
    )) {
      const a = old?.get(question) ?? [];
      const b = cur?.get(question) ?? [];
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i];
        const y = b[i];
        if (!x) entry.problems_added.push({ question: y!.question });
        else if (!y) entry.problems_removed.push({ question: x.question });
        else {
          const fields = PRACTICE_COLUMNS.filter((c) => show(x[c]) !== show(y[c]));
          if (fields.length === 0) continue;
          entry.problems_changed.push({
            question: y.question,
            fields,
            before: Object.fromEntries(fields.map((c) => [c, show(x[c])])),
            after: Object.fromEntries(fields.map((c) => [c, show(y[c])])),
          });
        }
      }
    }
    if (
      entry.problems_added.length + entry.problems_removed.length + entry.problems_changed.length >
      0
    ) {
      out.push(entry);
    }
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
    practice_changed: diffPractice(before, after),
  };

  const prevQuestions = before ? questions(before) : new Map<string, string[]>();
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
    const q = { before: prevQuestions.get(id) ?? [], after: nextQuestions.get(id) ?? [] };
    const removed = minus(q.before, q.after);
    const added = minus(q.after, q.before);
    if (removed.length + added.length > 0) {
      diff.assessment_changed.push({
        idea_id: id,
        title: now.title,
        unit: unit(nextUnits, now.unit),
        ...q,
        removed,
        added,
      });
    }
  }

  diff.empty =
    diff.ideas_added.length +
      diff.ideas_removed.length +
      diff.ideas_renamed.length +
      diff.prerequisites_changed.length +
      diff.units_changed.length +
      diff.assessment_changed.length +
      diff.practice_changed.length ===
    0;
  return diff;
}
