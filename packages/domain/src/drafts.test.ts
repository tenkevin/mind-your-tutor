import { describe, expect, it } from 'vitest';
import { packA } from '../../contracts/src/testing/publish.js';
import { checkPack } from './checks.js';
import { classContent, draftContext, findDraftable } from './drafts.js';

describe('findDraftable (A6)', () => {
  it('finds ideas without an explanation, units without an objective and rows without a question', () => {
    const pack = packA();
    for (const i of pack.ideas) i.explanation ||= 'x';
    for (const u of pack.units) u.objective ||= 'x';
    for (const a of pack.assessment) a.question ||= 'x?';
    expect(findDraftable(pack)).toEqual([]);
    pack.ideas[0]!.explanation = null;
    pack.ideas[1]!.explanation = '  ';
    pack.units[0]!.objective = null;
    pack.assessment[0]!.question = null;
    const found = findDraftable(pack);
    expect(found.map((f) => f.kind)).toEqual([
      'idea_explanation',
      'idea_explanation',
      'unit_objective',
      'assessment_question',
    ]);
    expect(found[3]!.key).toBe(`${pack.assessment[0]!.unit}:${pack.assessment[0]!.idea_id}`);
  });

  it('agrees with the data checks’ draftable warnings, which never block publishing (D12)', () => {
    const pack = packA();
    pack.units[0]!.objective = null;
    pack.assessment[0]!.question = null;
    const issues = checkPack(pack);
    const draftable = issues.filter((i) => i.draftable);
    expect(draftable.length).toBeGreaterThan(0);
    expect(draftable.every((i) => i.level === 'warning')).toBe(true);
    const kinds = findDraftable(pack).map((f) => f.kind);
    expect(kinds).toContain('unit_objective');
    expect(kinds).toContain('assessment_question');
  });

  it('gives each row’s own context, and null for a row no longer in the pack', () => {
    const pack = packA();
    const idea = pack.ideas[0]!;
    const context = draftContext(pack, 'idea_explanation', idea.idea_id)!;
    expect(context.title).toBe(idea.title);
    expect(context.detail.length).toBeGreaterThan(0);
    expect(draftContext(pack, 'idea_explanation', 'gone')).toBeNull();
    expect(draftContext(pack, 'unit_objective', '99')).toBeNull();
    expect(draftContext(pack, 'assessment_question', '1:gone')).toBeNull();
  });
});

describe('classContent (A6, D9)', () => {
  it('serves the sheet value first, then approved text, and never anything else', () => {
    const pack = packA();
    pack.ideas[0]!.explanation = null;
    pack.ideas[1]!.explanation = 'Sheet text.';
    const out = classContent('v', pack, [
      { kind: 'idea_explanation', key: pack.ideas[0]!.idea_id, text: 'Approved text.' },
      { kind: 'idea_explanation', key: pack.ideas[1]!.idea_id, text: 'Approved but overridden.' },
    ]);
    expect(out.ideas[0]!.explanation).toBe('Approved text.');
    expect(out.ideas[1]!.explanation).toBe('Sheet text.');
    expect(classContent('v', pack, []).ideas[0]!.explanation).toBeNull();
  });
});
