import { draftKey, type ClassContent, type DraftKind, type Pack } from '@ideamap/contracts';

// Drafts to approve (ARCHITECTURE.md D9, D12; task A6): which curriculum rows are
// empty and can be drafted, the curriculum's own material about each (the only thing
// a draft is built from), and the text a student may see. Pure; no clock or I/O.

export interface DraftTarget {
  kind: DraftKind;
  key: string;
}

/** One line of context about a row: what a drafter is given and a reviewer sees. */
export interface DraftContext {
  title: string;
  detail: { label: string; value: string }[];
}

const empty = (value: string | null | undefined) => !value?.trim();

/**
 * Rows with nothing in the sheet: ideas without an explanation, units without an
 * objective, and assessment rows without a question. An assessment row counts only
 * when C9's check does (its idea exists and the unit agrees), since otherwise the
 * sheet has an error to fix first.
 */
export function findDraftable(pack: Pack): DraftTarget[] {
  const out: DraftTarget[] = [];
  const seen = new Set<string>();
  const add = (kind: DraftKind, row: { idea_id?: string; unit?: number }) => {
    const key = draftKey(kind, row);
    if (seen.has(`${kind}/${key}`)) return;
    seen.add(`${kind}/${key}`);
    out.push({ kind, key });
  };
  for (const idea of pack.ideas) if (empty(idea.explanation)) add('idea_explanation', idea);
  for (const unit of pack.units) if (empty(unit.objective)) add('unit_objective', unit);
  const ideas = new Map(pack.ideas.map((i) => [i.idea_id, i] as const));
  const units = new Set(pack.units.map((u) => u.unit));
  for (const item of pack.assessment) {
    const idea = ideas.get(item.idea_id);
    if (!idea) continue;
    if (item.unit !== idea.unit && units.has(idea.unit)) continue;
    if (empty(item.question)) add('assessment_question', item);
  }
  return out;
}

const trimmed = (value: string | null | undefined) => value?.trim() || null;

/** The curriculum's own words about one row, or null if the row is no longer in the pack. */
export function draftContext(pack: Pack, kind: DraftKind, key: string): DraftContext | null {
  const titleOf = (id: string) => pack.ideas.find((i) => i.idea_id === id)?.title ?? id;
  const unitOf = (unit: number) => pack.units.find((u) => u.unit === unit);
  const detail: DraftContext['detail'] = [];
  const push = (label: string, value: string | null | undefined) => {
    const v = trimmed(value);
    if (v) detail.push({ label, value: v });
  };
  if (kind === 'idea_explanation') {
    const idea = pack.ideas.find((i) => i.idea_id === key);
    if (!idea) return null;
    const unit = unitOf(idea.unit);
    push('Category', idea.category);
    push('Unit', unit ? `${unit.unit}: ${unit.name}` : String(idea.unit));
    push('Unit objective', unit?.objective);
    push('Idea objective', idea.objective);
    const links = pack.links
      .filter((l) => l.from_id === key || l.to_id === key)
      .slice(0, 12)
      .map((l) =>
        l.from_id === key
          ? `${idea.title} ${l.relation} ${titleOf(l.to_id)}`
          : `${titleOf(l.from_id)} ${l.relation} ${idea.title}`,
      );
    if (links.length) push('Links', links.join('; '));
    push('Teacher notes', idea.notes);
    return { title: idea.title, detail };
  }
  if (kind === 'unit_objective') {
    const unit = pack.units.find((u) => String(u.unit) === key);
    if (!unit) return null;
    push('Standards', unit.standard_codes.join(', '));
    const ideas = pack.ideas.filter((i) => i.unit === unit.unit).map((i) => i.title);
    if (ideas.length) push('Ideas in this unit', ideas.slice(0, 40).join(', '));
    return { title: `Unit ${unit.unit}: ${unit.name}`, detail };
  }
  const [unitText, ...rest] = key.split(':');
  const ideaId = rest.join(':');
  const idea = pack.ideas.find((i) => i.idea_id === ideaId);
  const row = pack.assessment.find((a) => String(a.unit) === unitText && a.idea_id === ideaId);
  if (!idea || !row) return null;
  const unit = unitOf(row.unit);
  push('Unit', unit ? `${unit.unit}: ${unit.name}` : String(row.unit));
  push('Idea explanation', idea.explanation);
  push('Idea objective', idea.objective);
  if (row.key_points.length) push('Key points', row.key_points.join('; '));
  return { title: `Question about ${idea.title}`, detail };
}

export interface ApprovedText {
  kind: DraftKind;
  key: string;
  text: string;
}

/**
 * What a student may read: the sheet's own value where it has one (D9: a sheet value
 * takes precedence), else the teacher-approved text for that row, else nothing.
 * Drafts never come in; only approved text does.
 */
export function classContent(
  versionId: string,
  pack: Pack,
  approved: readonly ApprovedText[],
): ClassContent {
  const byKey = new Map(approved.map((a) => [`${a.kind}/${a.key}`, a.text] as const));
  const pick = (sheet: string | null | undefined, kind: DraftKind, key: string) =>
    trimmed(sheet) ?? byKey.get(`${kind}/${key}`) ?? null;
  return {
    version_id: versionId,
    ideas: pack.ideas.map((i) => ({
      idea_id: i.idea_id,
      explanation: pick(i.explanation, 'idea_explanation', draftKey('idea_explanation', i)),
    })),
    units: pack.units.map((u) => ({
      unit: u.unit,
      objective: pick(u.objective, 'unit_objective', draftKey('unit_objective', u)),
    })),
    assessment: pack.assessment.map((a) => ({
      unit: a.unit,
      idea_id: a.idea_id,
      question: pick(a.question, 'assessment_question', draftKey('assessment_question', a)),
    })),
  };
}
