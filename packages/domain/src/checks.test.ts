import { readFileSync } from 'node:fs';
import {
  DATA_CHECK_KINDS,
  DataCheckIssueSchema,
  CurriculumVersionSchema,
  VersionIssuesSchema,
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
    objective: `Learn ${spec.idea_id}.`,
    explanation: null,
    standard_codes: ['CODE-1'],
    requires: [],
    layer: 'process',
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

describe('issues stored on a curriculum version (C2cx5)', () => {
  const versionSource = {
    kind: 'json',
    file_ref: null,
    file_name: null,
    checksum: 'a'.repeat(64),
    column_mapping: [],
  } as const;

  it('round-trips parse and data-check issues without losing their fields or origin', () => {
    const clean = sample();
    const parsed = parsePack({
      ...clean,
      personas: clean.personas.map((persona, i) =>
        i === 0
          ? { ...persona, prompt_template: `${persona.prompt_template ?? ''} {unknown}` }
          : persona,
      ),
    });
    if (!parsed.ok) throw new Error('sample with a prompt warning should parse');
    const checks = checkPack(parsed.value);
    const issues = [...parsed.issues, ...checks];
    const version = CurriculumVersionSchema.parse({
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      curriculum_id: '0f8fad5b-d9cb-469f-a165-70867728950e',
      number: 2,
      status: 'draft',
      pack: parsed.value,
      derived: null,
      issues,
      source: versionSource,
      created_at: '2026-10-22T09:00:00Z',
      published_at: null,
    });
    const restored = CurriculumVersionSchema.parse(JSON.parse(JSON.stringify(version)));

    expect(version.issues.filter((issue) => issue.origin === 'import')).toEqual(
      parsed.issues.map((issue) => ({ ...issue, origin: 'import', level: issue.severity })),
    );
    expect(version.issues.filter((issue) => issue.origin === 'data_check')).toEqual(
      checks.map((issue) => ({ ...issue, origin: 'data_check' })),
    );
    expect(restored.issues).toEqual(version.issues);
  });

  it('keeps C8 issues for 10,000 ideas below the 1 MB storage bound', () => {
    const specs = chain(10_000, false);
    specs[0] = { idea_id: 'i0', requires: ['nowhere'] };
    const checks = checkPack(pack(specs));
    expect(checks.map((issue) => issue.kind)).toEqual(['prereq', 'blocked']);
    expect(checks[1]!.items).toHaveLength(9_999);

    const stored = VersionIssuesSchema.parse(checks);
    const bytes = new TextEncoder().encode(JSON.stringify(stored)).byteLength;
    expect(bytes).toBeLessThan(1_000_000);
  });

  it('parses a version with the largest valid C8 issue group in under 50 ms', () => {
    const specs = chain(10_000, false);
    specs[0] = { idea_id: 'i0', requires: ['nowhere'] };
    const checks = checkPack(pack(specs));
    const input = {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      curriculum_id: '0f8fad5b-d9cb-469f-a165-70867728950e',
      number: 2,
      status: 'draft',
      pack: sample(),
      derived: null,
      issues: checks,
      source: versionSource,
      created_at: '2026-10-22T09:00:00Z',
      published_at: null,
    };

    const start = performance.now();
    const version = CurriculumVersionSchema.parse(input);
    const elapsed = performance.now() - start;

    const largeIssue = version.issues[1];
    if (largeIssue?.origin !== 'data_check') throw new Error('expected a stored data-check issue');
    expect(largeIssue.items).toHaveLength(9999);
    expect(elapsed).toBeLessThan(50);
  });
});

describe('optional unit objectives and assessment questions (C9)', () => {
  it('flags each empty value as draftable and leaves publishing available', () => {
    const p = sample();
    p.units[0]!.objective = null;
    p.assessment[0]!.question = null;
    p.assessment[1]!.question = null;
    const issues = checkPack(p);
    const draftable = issues.filter(
      (issue) => issue.kind === 'unit_objective' || issue.kind === 'assessment_question',
    );
    expect(draftable).toHaveLength(3);
    expect(draftable).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'unit_objective',
          level: 'warning',
          draftable: true,
          items: ['1'],
          fix: { tab: 'Units', column: 'objective' },
        }),
        expect.objectContaining({
          kind: 'assessment_question',
          level: 'warning',
          draftable: true,
          items: [p.assessment[0]!.idea_id],
          fix: { tab: 'Assessment', column: 'question' },
        }),
      ]),
    );
    expect(draftable.find((issue) => issue.kind === 'unit_objective')!.message).toMatch(
      /Unit 1.*objective.*Atlas can draft one/,
    );
    expect(draftable.find((issue) => issue.kind === 'assessment_question')!.message).toMatch(
      /Assessment question.*Atlas can draft one/,
    );
    expect(canPublish(issues)).toBe(canPublish(checkPack(sample())));
  });

  it('keeps structural warnings for empty questions with an unknown idea or mismatched unit', () => {
    const p = sample();
    p.assessment[0]!.question = null;
    p.assessment[0]!.idea_id = 'missing-idea';
    p.assessment[1]!.question = null;
    p.assessment[1]!.unit = 3;
    const issues = checkPack(p);
    expect(ofKind(issues, 'assessment_unknown_idea')).toHaveLength(1);
    expect(ofKind(issues, 'assessment_unit_mismatch')).toHaveLength(1);
    expect(ofKind(issues, 'assessment_question')).toHaveLength(0);
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

  it('shows a self-requirement inside a bigger loop, with advice for its shape (C8-F2)', () => {
    const issues = checkPack(
      pack([
        { idea_id: 'a', requires: ['a', 'b'] },
        { idea_id: 'b', requires: ['a'] },
      ]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toBe(
      'Prerequisites form a loop, so 2 ideas can never unlock: A requires itself and B; B requires A. This group can contain several loops: remove requirements in Ideas → requires until no prerequisite loops remain.',
    );
  });

  it('names every idea in a loop with more than one ring (C8-F2)', () => {
    const issues = checkPack(
      pack([
        { idea_id: 'a', requires: ['b', 'c'] },
        { idea_id: 'b', requires: ['a'] },
        { idea_id: 'c', requires: ['a'] },
      ]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.items).toEqual(['a', 'b', 'c']);
    expect(issues[0]!.message).toContain(
      '3 ideas can never unlock: A requires B and C; B requires A; C requires A.',
    );
    expect(issues[0]!.message).not.toContain('Remove one of these');
    expect(issues[0]!.message).toContain('This group can contain several loops');
  });

  it('makes no claim about how many removals a shared-requirement loop needs (C8-F2)', () => {
    // Both loops (A→B→C→A and A→C→A) share C→A, so removing that one requirement is enough.
    const specs = [
      { idea_id: 'a', requires: ['b', 'c'] },
      { idea_id: 'b', requires: ['c'] },
      { idea_id: 'c', requires: ['a'] },
    ];
    const [issue] = checkPack(pack(specs));
    expect(issue!.kind).toBe('cycle');
    expect(issue!.items).toEqual(['a', 'b', 'c']);
    expect(issue!.message).toBe(
      'Prerequisites form a loop, so 3 ideas can never unlock: A requires B and C; B requires C; C requires A. This group can contain several loops: remove requirements in Ideas → requires until no prerequisite loops remain.',
    );
    expect(issue!.message).not.toMatch(/won't break|Remove one of these/);
    const fixed = checkPack(
      pack(specs.map((s) => (s.idea_id === 'c' ? { ...s, requires: [] } : s))),
    );
    expect(ofKind(fixed, 'cycle')).toEqual([]);
  });

  it('keeps "remove one of these" for a single ring (C8-F2)', () => {
    const [issue] = checkPack(
      pack([
        { idea_id: 'a', requires: ['b'] },
        { idea_id: 'b', requires: ['c'] },
        { idea_id: 'c', requires: ['a'] },
      ]),
    );
    expect(issue!.message).toBe(
      'Prerequisites form a loop, so 3 ideas can never unlock: A requires B, which requires C, which requires A. Remove one of these from Ideas → requires to break the loop.',
    );
  });
});

describe('knock-on blocks (C2-F5)', () => {
  it('warns the ideas downstream of an unknown id once, naming the cause (C8-F3)', () => {
    const issues = checkPack(
      pack([
        { idea_id: 'a', title: 'Groundwater', requires: ['aquifer'] },
        { idea_id: 'b', title: 'Wells', requires: ['a'] },
        { idea_id: 'c', title: 'Springs', requires: ['b'] },
      ]),
    );
    expect(issues.map((i) => [i.kind, i.level, i.items])).toEqual([
      ['prereq', 'error', ['a']],
      ['blocked', 'warning', ['b', 'c']],
    ]);
    expect(issues[1]!.message).toBe(
      '2 ideas may never unlock, because they depend on Groundwater, which requires "aquifer", which isn\'t an idea: Wells and Springs. Fix Groundwater in Ideas → requires first.',
    );
  });

  it('words a single blocked idea in the singular', () => {
    const issues = checkPack(
      pack([
        { idea_id: 'a', title: 'Groundwater', requires: ['aquifer'] },
        { idea_id: 'b', title: 'Wells', requires: ['a'] },
      ]),
    );
    expect(issues[1]!.message).toBe(
      'Wells may never unlock, because it depends on Groundwater, which requires "aquifer", which isn\'t an idea. Fix Groundwater in Ideas → requires first.',
    );
  });

  it('warns an idea downstream of a loop, but not the ideas in it', () => {
    const issues = checkPack(
      pack([
        { idea_id: 'a', requires: ['b'] },
        { idea_id: 'b', requires: ['a'] },
        { idea_id: 'c', requires: ['b'] },
        { idea_id: 'd', requires: ['a'] },
      ]),
    );
    expect(issues.map((i) => [i.kind, i.items])).toEqual([
      ['cycle', ['a', 'b']],
      ['blocked', ['c', 'd']],
    ]);
    expect(issues[1]!.message).toBe(
      '2 ideas may never unlock, because they depend on the loop between A and B: C and D. Break the loop in Ideas → requires first.',
    );
  });

  it('gives one warning per root cause on a large pack (C8-F3, C8-U1)', () => {
    // 2,000 ideas in ten chains of 200; two chains have an unknown root, two a loop at the top.
    const specs: IdeaSpec[] = [];
    for (let c = 0; c < 10; c++) {
      for (let k = 0; k < 200; k++) {
        const id = `c${c}k${k}`;
        const requires =
          k > 0 ? [`c${c}k${k - 1}`] : c < 2 ? [`missing${c}`] : c < 4 ? [`c${c}k1`] : [];
        specs.push({ idea_id: id, requires });
      }
    }
    const issues = checkPack(pack(specs));
    expect(issues.map((i) => i.kind)).toEqual([
      'prereq',
      'prereq',
      'cycle',
      'cycle',
      ...Array(4).fill('blocked'),
    ]);
    expect(ofKind(issues, 'blocked').map((i) => i.items.length)).toEqual([199, 199, 198, 198]);
    expect(summarizeIssues(issues)).toBe('8 to review');
  });

  it('gives one warning for a 10,000-idea chain with a broken root (C8-F3, C8-S1)', () => {
    const specs = chain(10_000, false);
    specs[0] = { idea_id: 'i0', requires: ['nowhere'] };
    const issues = checkPack(pack(specs));
    expect(issues.map((i) => i.kind)).toEqual(['prereq', 'blocked']);
    expect(issues[1]!.items).toHaveLength(9_999);
    expect(issues[1]!.message).toMatch(/^9999 ideas may never unlock, .* and 9987 more\. /);
    expect(summarizeIssues(issues)).toBe('2 to review');
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
    expect(issues.map((i) => [i.kind, i.level, i.items, i.fix])).toEqual([
      ['link_unknown_idea', 'warning', ['a'], { tab: 'Links', column: 'to_id' }],
      ['link_unknown_idea', 'warning', ['b'], { tab: 'Links', column: 'from_id' }],
      // C8-F9: both ends unknown lists both columns.
      [
        'link_unknown_idea',
        'warning',
        [],
        { tab: 'Links', column: 'from_id', columns: ['from_id', 'to_id'] },
      ],
    ]);
    for (const issue of issues) expect(DataCheckIssueSchema.parse(issue)).toEqual(issue);
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

describe('assessment coverage counts ideas, not rows (C8-F1)', () => {
  it('reports an idea with no question when another idea has two', () => {
    const p = pack([{ idea_id: 'a' }, { idea_id: 'b' }]);
    p.assessment = [p.assessment[0]!, { ...p.assessment[0]!, question: 'And again?' }];
    const issues = checkPack(p);
    expect(issues.map((i) => [i.kind, i.items])).toEqual([['assessment_coverage', ['b']]]);
    expect(issues[0]!.message).toMatch(
      /^Unit 1: 1 of 2 questions; Atlas can draft the rest\. No question yet for B\./,
    );
  });

  it("warns on a question in a different unit from its idea, and doesn't count it", () => {
    const p = pack([{ idea_id: 'a' }, { idea_id: 'b', unit: 2 }]);
    p.assessment = [
      { unit: 1, idea_id: 'a', question: 'What is A?', key_points: [] },
      { unit: 1, idea_id: 'b', question: 'What is B?', key_points: [] },
    ];
    const issues = checkPack(p);
    expect(issues.map((i) => [i.kind, i.level, i.items, i.fix.column])).toEqual([
      ['assessment_unit_mismatch', 'warning', ['b'], 'unit'],
      ['assessment_coverage', 'info', ['b'], 'question'],
    ]);
    expect(issues[0]!.message).toBe(
      "The Assessment question for B is in unit 1, but B is in unit 2, so it doesn't count as a question for either unit. Fix it in Assessment → unit, or in Ideas → unit.",
    );
    expect(issues[1]!.message).toMatch(/^Unit 2: 0 of 1 questions; /);
  });

  it('warns on a question for a unit that is not in Units, and skips it', () => {
    const p = pack([{ idea_id: 'a' }, { idea_id: 'b' }]);
    p.assessment.push({ unit: 9, idea_id: 'a', question: 'Again?', key_points: [] });
    const issues = checkPack(p);
    expect(issues.map((i) => [i.kind, i.level, i.items])).toEqual([
      ['assessment_unknown_unit', 'warning', ['a']],
    ]);
    expect(issues[0]!.message).toContain(
      "is skipped, because unit 9 isn't a unit in the Units tab",
    );
    expect(issues[0]!.fix).toEqual({ tab: 'Assessment', column: 'unit' });
  });
});

describe('spec "missing" behaviours (C8-F4, C8-F9)', () => {
  it('flags ideas with no objective in one warning', () => {
    const p = pack([
      { idea_id: 'a', objective: null },
      { idea_id: 'b' },
      { idea_id: 'c', objective: '  ' },
    ]);
    const issues = checkPack(p);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: 'objective',
      level: 'warning',
      items: ['a', 'c'],
      fix: { tab: 'Ideas', column: 'objective' },
    });
    expect(issues[0]!.message).toBe(
      '2 ideas have no objective, so the tutor will write them from the links: A and C. To set your own, add it in Ideas → objective.',
    );
    expect(canPublish(issues)).toBe(true);
  });

  it('warns when the Categories tab is empty', () => {
    const issues = checkPack(pack([{ idea_id: 'a' }, { idea_id: 'b' }], { categories: [] }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      kind: 'no_categories',
      level: 'warning',
      items: ['a', 'b'],
      fix: { tab: 'Categories', column: 'category' },
    });
    expect(issues[0]!.message).toContain('every idea uses one category, "Idea"');
  });
});

describe('two layers (C12, D41)', () => {
  const loopLinks = (ids: string[]) =>
    ids.map((id, i) => ({
      from_id: id,
      to_id: ids[(i + 1) % ids.length]!,
      relation: 'leads to',
      importance: 3,
      media_url: null,
    }));

  it('C12-F2: allows the process loop in Links while requires stays acyclic', () => {
    const ids = ['evap', 'cond', 'prec', 'coll'];
    const p = pack([
      { idea_id: 'heat', layer: 'mechanism' },
      { idea_id: 'evap', requires: ['heat'] },
      { idea_id: 'cond', requires: ['evap'] },
      { idea_id: 'prec', requires: ['cond'] },
      { idea_id: 'coll', requires: ['prec'] },
    ]);
    p.links = [...loopLinks(ids), { ...loopLinks(['heat', 'evap'])[0]!, to_id: 'evap' }];
    expect(checkPack(p)).toEqual([]);
  });

  it('C12-F2: a requires loop is still an error in the mechanism layer, and in the process layer', () => {
    for (const layer of ['mechanism', 'process'] as const) {
      const issues = checkPack(
        pack([
          { idea_id: 'a', layer, requires: ['b'] },
          { idea_id: 'b', layer, requires: ['a'] },
        ]),
      );
      expect(ofKind(issues, 'cycle')).toHaveLength(1);
      expect(canPublish(issues)).toBe(false);
    }
  });

  it('C12-F3: a process idea may require mechanisms', () => {
    const issues = checkPack(
      pack([
        { idea_id: 'gravity', layer: 'mechanism' },
        { idea_id: 'prec', requires: ['gravity'] },
      ]),
    );
    expect(ofKind(issues, 'layer_requires')).toEqual([]);
    expect(issues).toEqual([]);
  });

  it('C12-F3, U1: warns, in plain words, when a mechanism requires a process idea', () => {
    const issues = checkPack(
      pack([
        { idea_id: 'rain', title: 'Rain' },
        { idea_id: 'gravity', title: 'Gravity', layer: 'mechanism', requires: ['rain'] },
      ]),
    );
    const [w] = ofKind(issues, 'layer_requires');
    expect(w).toEqual({
      kind: 'layer_requires',
      level: 'warning',
      message:
        "Gravity is a mechanism idea but requires the process idea Rain. Mechanisms underlie the process, not the other way round. Remove it from Ideas → requires, or change Gravity's layer to process.",
      items: ['gravity', 'rain'],
      fix: { tab: 'Ideas', column: 'requires' },
    });
    expect(DataCheckIssueSchema.parse(w)).toEqual(w);
    expect(canPublish(issues)).toBe(true);
  });

  it('C12-F1: a mechanism idea without standard_codes is a warning', () => {
    const issues = checkPack(
      pack([{ idea_id: 'gravity', layer: 'mechanism', standard_codes: [] }]),
    );
    expect(ofKind(issues, 'codes')[0]).toMatchObject({ level: 'warning', items: ['gravity'] });
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
      'objective',
      'unit_objective',
      'assessment_question',
      'no_categories',
      'assessment_unknown_unit',
      'assessment_unit_mismatch',
      'layer_requires',
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
    // C8-F3: knock-ons are one per root cause (5 unknown prerequisites and 2 loops at most).
    expect(counts.blocked).toBeLessThanOrEqual(7);
    expect(issues.length).toBeLessThan(40);
    expect(elapsed).toBeLessThan(200);
  });
});
