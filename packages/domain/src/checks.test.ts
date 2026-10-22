import { readFileSync } from 'node:fs';
import {
  DATA_CHECK_KINDS,
  DataCheckIssueSchema,
  parsePack,
  type DataCheckIssue,
  type DataCheckKind,
  type Pack,
} from '@ideamap/contracts';
import { describe, expect, it } from 'vitest';
import { canPublish, checkPack, summarizeIssues, type CheckedPack } from './index.js';

const sample = (): Pack => {
  const raw: unknown = JSON.parse(
    readFileSync(new URL('../../../fixtures/water-cycle/pack.json', import.meta.url), 'utf8'),
  );
  const parsed = parsePack(raw);
  if (!parsed.ok) throw new Error('fixture does not parse');
  return parsed.value;
};

type IdeaSpec = Partial<Pack['ideas'][number]> & { idea_id: string };

function idea(spec: IdeaSpec): Pack['ideas'][number] {
  return {
    title: spec.idea_id.toUpperCase(),
    category: 'Thing',
    unit: 1,
    objective: null,
    explanation: null,
    standard_codes: ['CODE-1'],
    requires: [],
    media_url: `${spec.idea_id}.mp4`,
    rarity: 'auto',
    notes: null,
    ...spec,
  };
}

/** A clean pack: every idea linked to the next, coded, with media and a question. */
function pack(specs: IdeaSpec[], extra: Partial<CheckedPack> = {}): CheckedPack {
  const ideas = specs.map(idea);
  const links = ideas.slice(1).map((to, i) => ({
    from_id: ideas[i]!.idea_id,
    to_id: to.idea_id,
    relation: 'leads to',
    importance: 3,
    media_url: null,
  }));
  if (ideas.length === 1) {
    links.push({
      from_id: ideas[0]!.idea_id,
      to_id: ideas[0]!.idea_id,
      relation: 'is',
      importance: 3,
      media_url: null,
    });
  }
  const units = [...new Set(ideas.map((i) => i.unit))].map((unit) => ({
    unit,
    name: `Unit ${unit}`,
    objective: 'Learn it.',
    standard_codes: [],
    due_date: null,
  }));
  return {
    ideas,
    links,
    units,
    categories: [{ category: 'Thing', icon: null, description: null }],
    assessment: ideas.map((i) => ({
      unit: i.unit,
      idea_id: i.idea_id,
      question: `What is ${i.title}?`,
      key_points: [],
    })),
    ...extra,
  };
}

const ofKind = (issues: DataCheckIssue[], kind: DataCheckKind) =>
  issues.filter((i) => i.kind === kind);

function chain(n: number, close: boolean): IdeaSpec[] {
  return Array.from({ length: n }, (_, i) => ({
    idea_id: `i${i}`,
    requires: i > 0 ? [`i${i - 1}`] : close ? [`i${n - 1}`] : [],
  }));
}

describe('a clean pack', () => {
  it('has no issues and can publish (C2-F8)', () => {
    const issues = checkPack(pack([{ idea_id: 'a' }, { idea_id: 'b', requires: ['a'] }]));
    expect(issues).toEqual([]);
    expect(canPublish(issues)).toBe(true);
    expect(summarizeIssues(issues)).toBe('all clear');
  });
});

describe('the water-cycle sample (C2-F2)', () => {
  const issues = checkPack(sample());

  it('gives exactly 1 error, 1 warning and 1 info', () => {
    expect(issues.map((i) => [i.kind, i.level])).toEqual([
      ['prereq', 'error'],
      ['codes', 'warning'],
      ['media', 'info'],
    ]);
  });

  it('names Groundwater, Rain & snow and the 11 ideas without media', () => {
    const [prereq, codes, media] = issues;
    expect(prereq).toEqual({
      kind: 'prereq',
      level: 'error',
      message:
        'Groundwater requires "aquifer", which isn\'t an idea_id in the Ideas tab, so Groundwater can never unlock. Fix it in Ideas → requires.',
      items: ['ground'],
      fix: { tab: 'Ideas', column: 'requires' },
    });
    expect(codes!.items).toEqual(['rain']);
    expect(codes!.message).toBe(
      '1 idea has no standard_codes, so it is missing from alignment reports: Rain & snow. Add codes in Ideas → standard_codes.',
    );
    expect(media!.items).toHaveLength(11);
    expect(media!.message).toMatch(/^11 ideas have no media_url and will show a placeholder: /);
    expect(media!.message).toContain('Groundwater');
  });

  it('blocks publishing and summarises as "3 to review" (C2-F8, C2-U3)', () => {
    expect(canPublish(issues)).toBe(false);
    expect(summarizeIssues(issues)).toBe('3 to review');
  });

  it('matches the contract shape (C2-F7)', () => {
    for (const issue of issues) expect(DataCheckIssueSchema.parse(issue)).toEqual(issue);
  });
});

describe('prototype checks (C2-F1)', () => {
  it('media: info naming each idea', () => {
    const [issue, ...rest] = checkPack(pack([{ idea_id: 'a', media_url: null }, { idea_id: 'b' }]));
    expect(rest).toEqual([]);
    expect(issue).toMatchObject({ kind: 'media', level: 'info', items: ['a'] });
    expect(issue!.message).toBe(
      '1 idea has no media_url and will show a placeholder: A. Add a video or image in Ideas → media_url.',
    );
    expect(issue!.fix).toEqual({ tab: 'Ideas', column: 'media_url' });
  });

  it('codes: one warning for all ideas without codes', () => {
    const issues = checkPack(
      pack([
        { idea_id: 'a', standard_codes: [] },
        { idea_id: 'b', standard_codes: [] },
      ]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: 'codes', level: 'warning', items: ['a', 'b'] });
    expect(issues[0]!.message).toContain('2 ideas have no standard_codes, so they are missing');
    expect(issues[0]!.message).toContain('A and B');
  });

  it('prereq: one error per unknown id', () => {
    const issues = checkPack(pack([{ idea_id: 'a', requires: ['x', 'y', 'x'] }]));
    expect(issues.map((i) => [i.kind, i.level])).toEqual([
      ['prereq', 'error'],
      ['prereq', 'error'],
    ]);
    expect(issues[1]!.message).toContain('A requires "y"');
    expect(canPublish(issues)).toBe(false);
  });

  it('cycle: an error listing the ideas in the loop', () => {
    const issues = checkPack(
      pack([
        { idea_id: 'a', requires: ['b'] },
        { idea_id: 'b', requires: ['a'] },
      ]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: 'cycle',
      level: 'error',
      items: ['a', 'b'],
      fix: { tab: 'Ideas', column: 'requires' },
    });
    expect(issues[0]!.message).toBe(
      'Prerequisites form a loop, so 2 ideas can never unlock: A requires B, which requires A. Remove one of these from Ideas → requires to break the loop.',
    );
  });
});

describe('loops of every shape (C2-F4)', () => {
  it('a → a', () => {
    const issues = checkPack(pack([{ idea_id: 'a', requires: ['a'] }]));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: 'cycle', level: 'error', items: ['a'] });
    expect(issues[0]!.message).toContain('1 idea can never unlock: A requires itself');
  });

  it('a 50-idea chain closing on itself', () => {
    const issues = checkPack(pack(chain(50, true)));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.kind).toBe('cycle');
    expect(issues[0]!.items).toHaveLength(50);
    expect(issues[0]!.message).toContain('50 ideas can never unlock: I0 requires I49');
    expect(issues[0]!.message).toContain('38 more ideas');
  });

  it('two separate loops give two issues', () => {
    const issues = checkPack(
      pack([
        { idea_id: 'a', requires: ['b'] },
        { idea_id: 'b', requires: ['a'] },
        { idea_id: 'c', requires: ['d'] },
        { idea_id: 'd', requires: ['c'] },
      ]),
    );
    expect(issues.map((i) => [i.kind, i.items])).toEqual([
      ['cycle', ['a', 'b']],
      ['cycle', ['c', 'd']],
    ]);
  });

  it('shows a loop through the ideas, not a self-requirement, in a bigger loop', () => {
    const issues = checkPack(
      pack([
        { idea_id: 'a', requires: ['a', 'b'] },
        { idea_id: 'b', requires: ['a'] },
      ]),
    );
    expect(issues[0]!.message).toContain('A requires B, which requires A');
  });
});

describe('knock-on blocks (C2-F5)', () => {
  it('warns an idea downstream of an unknown id, naming the cause', () => {
    const issues = checkPack(
      pack([
        { idea_id: 'a', title: 'Groundwater', requires: ['aquifer'] },
        { idea_id: 'b', title: 'Wells', requires: ['a'] },
        { idea_id: 'c', title: 'Springs', requires: ['b'] },
      ]),
    );
    expect(issues.map((i) => [i.kind, i.level, i.items])).toEqual([
      ['prereq', 'error', ['a']],
      ['blocked', 'warning', ['b', 'a']],
      ['blocked', 'warning', ['c', 'a']],
    ]);
    expect(issues[1]!.message).toBe(
      'Wells may never unlock: it requires Groundwater, and Groundwater requires "aquifer", which isn\'t an idea. Fix Groundwater in Ideas → requires first.',
    );
    expect(issues[2]!.message).toContain(
      'Springs may never unlock: it requires Wells, which depends on Groundwater',
    );
  });

  it('warns an idea downstream of a loop, but not the ideas in it', () => {
    const issues = checkPack(
      pack([
        { idea_id: 'a', requires: ['b'] },
        { idea_id: 'b', requires: ['a'] },
        { idea_id: 'c', requires: ['b'] },
      ]),
    );
    expect(issues.map((i) => [i.kind, i.items])).toEqual([
      ['cycle', ['a', 'b']],
      ['blocked', ['c', 'b']],
    ]);
    expect(issues[1]!.message).toContain('C may never unlock');
    expect(issues[1]!.message).toContain('B is in a prerequisite loop');
  });

  it("doesn't add a warning to an idea that carries the error", () => {
    const issues = checkPack(
      pack([
        { idea_id: 'a', requires: ['x'] },
        { idea_id: 'b', requires: ['a', 'y'] },
      ]),
    );
    expect(ofKind(issues, 'prereq')).toHaveLength(2);
    expect(ofKind(issues, 'blocked')).toEqual([]);
  });
});

describe('cross-row checks from the spec (C2-F3)', () => {
  it('duplicate_id: error', () => {
    const p = pack([{ idea_id: 'a' }, { idea_id: 'b' }]);
    p.ideas.push(idea({ idea_id: 'a', title: 'Another A' }));
    const issues = checkPack(p);
    expect(issues.map((i) => i.kind)).toEqual(['duplicate_id']);
    expect(issues[0]).toMatchObject({
      level: 'error',
      items: ['a'],
      fix: { tab: 'Ideas', column: 'idea_id' },
    });
    expect(issues[0]!.message).toContain(
      '2 rows in the Ideas tab use the idea_id "a" (A and Another A)',
    );
  });

  it('link_unknown_idea: warning, row skipped', () => {
    const p = pack([{ idea_id: 'a' }, { idea_id: 'b' }]);
    p.links.push(
      { from_id: 'a', to_id: 'nope', relation: 'feeds', importance: 3, media_url: null },
      { from_id: 'nope', to_id: 'b', relation: 'feeds', importance: 3, media_url: null },
      { from_id: 'x', to_id: 'y', relation: 'feeds', importance: 3, media_url: null },
    );
    const issues = checkPack(p);
    expect(issues.map((i) => [i.kind, i.level, i.items, i.fix.column])).toEqual([
      ['link_unknown_idea', 'warning', ['a'], 'to_id'],
      ['link_unknown_idea', 'warning', ['b'], 'from_id'],
      ['link_unknown_idea', 'warning', [], 'from_id'],
    ]);
    expect(issues[0]!.message).toBe(
      'The "feeds" link from A to "nope" is skipped, because "nope" isn\'t an idea_id in the Ideas tab. Fix it in Links → to_id.',
    );
    expect(issues[2]!.message).toContain('neither end is an idea_id');
  });

  it('unknown_category: warning, uses the first category', () => {
    const issues = checkPack(pack([{ idea_id: 'a', category: 'Stuff' }, { idea_id: 'b' }]));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: 'unknown_category',
      level: 'warning',
      items: ['a'],
      fix: { tab: 'Ideas', column: 'category' },
    });
    expect(issues[0]!.message).toContain('so it uses the first category, "Thing"');
  });

  it('unknown_unit: error', () => {
    const p = pack([{ idea_id: 'a' }, { idea_id: 'b' }]);
    p.ideas[1] = idea({ idea_id: 'b', unit: 7 });
    p.assessment = p.assessment.map((q) => ({ ...q, unit: 1 }));
    const issues = checkPack(p);
    expect(issues.map((i) => [i.kind, i.level, i.items])).toEqual([
      ['unknown_unit', 'error', ['b']],
    ]);
    expect(issues[0]!.message).toContain("B is in unit 7, which isn't a unit in the Units tab");
    expect(canPublish(issues)).toBe(false);
  });

  it('assessment_unknown_idea: warning, row skipped', () => {
    const p = pack([{ idea_id: 'a' }]);
    p.assessment.push({ unit: 1, idea_id: 'ghost', question: 'Who?', key_points: [] });
    const issues = checkPack(p);
    expect(issues.map((i) => [i.kind, i.level])).toEqual([['assessment_unknown_idea', 'warning']]);
    expect(issues[0]!.message).toContain('is skipped');
    expect(issues[0]!.fix).toEqual({ tab: 'Assessment', column: 'idea_id' });
  });

  it('a skipped Assessment row does not count towards coverage', () => {
    const p = pack([{ idea_id: 'a' }, { idea_id: 'b' }]);
    p.assessment = [
      p.assessment[0]!,
      { unit: 1, idea_id: 'ghost', question: 'Who?', key_points: [] },
    ];
    expect(checkPack(p).map((i) => i.kind)).toEqual([
      'assessment_unknown_idea',
      'assessment_coverage',
    ]);
  });

  it('no_links: warning explaining why it may never unlock', () => {
    const p = pack([{ idea_id: 'a' }, { idea_id: 'b' }, { idea_id: 'c', requires: ['a'] }]);
    p.links = [{ from_id: 'a', to_id: 'b', relation: 'feeds', importance: 3, media_url: null }];
    const issues = checkPack(p);
    expect(issues.map((i) => [i.kind, i.level, i.items])).toEqual([['no_links', 'warning', ['c']]]);
    expect(issues[0]!.message).toContain(
      'C has no links in the Links tab, so it can only unlock through prerequisites.',
    );
    expect(issues[0]!.message).toContain(
      "If one of its prerequisites never unlocks, C won't either.",
    );
  });

  it('no_links with no prerequisites says it may never unlock', () => {
    const p = pack([{ idea_id: 'a' }, { idea_id: 'b' }, { idea_id: 'c' }]);
    p.links = p.links.slice(0, 1);
    const [issue] = checkPack(p);
    expect(issue!.kind).toBe('no_links');
    expect(issue!.message).toContain('may never unlock');
  });
});

describe('assessment coverage (C2-F6)', () => {
  it('info: "Unit n: k of m questions; Atlas can draft the rest"', () => {
    const p = pack([
      { idea_id: 'a', unit: 2 },
      { idea_id: 'b', unit: 2 },
      { idea_id: 'c', unit: 2 },
    ]);
    p.assessment = p.assessment.slice(0, 1);
    const issues = checkPack(p);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: 'assessment_coverage',
      level: 'info',
      items: ['b', 'c'],
      fix: { tab: 'Assessment', column: 'question' },
    });
    expect(issues[0]!.message).toMatch(/^Unit 2: 1 of 3 questions; Atlas can draft the rest\./);
    expect(issues[0]!.message).toContain('No question yet for B and C');
    expect(canPublish(issues)).toBe(true);
  });
});

describe('every kind (C2-F9)', () => {
  it('has a test above', () => {
    const tested: DataCheckKind[] = [
      'prereq',
      'cycle',
      'duplicate_id',
      'unknown_unit',
      'blocked',
      'link_unknown_idea',
      'unknown_category',
      'assessment_unknown_idea',
      'no_links',
      'codes',
      'media',
      'assessment_coverage',
    ];
    expect([...tested].sort()).toEqual([...DATA_CHECK_KINDS].sort());
  });
});

describe('hostile input', () => {
  it('keeps titles as raw text, building no markup (C2-S1)', () => {
    const issues = checkPack(
      pack([
        { idea_id: 'a', title: '<img src=x onerror=alert(1)>', requires: ['nope'] },
        { idea_id: 'b', title: '{{constructor}}', standard_codes: [] },
      ]),
    );
    expect(issues[0]!.message).toContain('<img src=x onerror=alert(1)> requires "nope"');
    expect(ofKind(issues, 'codes')[0]!.message).toContain('{{constructor}}');
  });

  it('handles a 10,000-idea chain without overflowing the stack (C2-S2)', () => {
    const open = checkPack(pack(chain(10_000, false)));
    expect(open).toEqual([]);
    const closed = checkPack(pack(chain(10_000, true)));
    expect(closed).toHaveLength(1);
    expect(closed[0]!.items).toHaveLength(10_000);
  });

  it('handles one idea requiring 5,000 others (C2-S2)', () => {
    const others = Array.from({ length: 5000 }, (_, i) => ({ idea_id: `o${i}` }));
    const issues = checkPack(
      pack([...others, { idea_id: 'hub', requires: others.map((o) => o.idea_id) }]),
    );
    expect(issues).toEqual([]);
  });
});

describe('performance', () => {
  it('runs the sample in well under 5 ms (C2-P1)', () => {
    const p = sample();
    const times: number[] = [];
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      checkPack(p);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    expect(times[50]).toBeLessThan(5);
  });

  it('checks 2,000 ideas, 6,000 links and 2,000 questions in under 200 ms, finding 20 problems (C2-P2)', () => {
    const specs: IdeaSpec[] = Array.from({ length: 2000 }, (_, i) => ({
      idea_id: `i${i}`,
      unit: (i % 10) + 1,
      requires: i >= 10 ? [`i${i - 10}`] : [],
    }));
    // 20 seeded problems, on the last ideas so nothing depends on them.
    for (let k = 0; k < 5; k++) specs[1999 - k]!.requires = [`missing${k}`]; // 5 prereq
    specs[1990]!.requires = ['i1991']; // loop 1
    specs[1991]!.requires = ['i1990'];
    specs[1988]!.requires = ['i1988']; // loop 2
    for (let k = 0; k < 5; k++) specs[1980 + k]!.category = 'Nope'; // 5 unknown_category
    const p = pack(specs);
    p.links = Array.from({ length: 6000 }, (_, i) => ({
      from_id: `i${i % 2000}`,
      to_id: `i${(i * 7 + 1) % 2000}`,
      relation: 'leads to',
      importance: 3,
      media_url: null,
    }));
    for (let k = 0; k < 4; k++) p.links[k] = { ...p.links[k]!, to_id: `ghost${k}` }; // 4 links
    for (let k = 0; k < 4; k++) p.assessment[k] = { ...p.assessment[k]!, idea_id: `ghost${k}` }; // 4 questions

    const start = performance.now();
    const issues = checkPack(p);
    const elapsed = performance.now() - start;

    const counts = Object.fromEntries(
      DATA_CHECK_KINDS.map((kind) => [kind, ofKind(issues, kind).length]),
    );
    expect(counts).toMatchObject({
      prereq: 5,
      cycle: 2,
      unknown_category: 5,
      link_unknown_idea: 4,
      assessment_unknown_idea: 4,
    });
    expect(elapsed).toBeLessThan(200);
  });
});
