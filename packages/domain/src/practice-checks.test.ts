import {
  DEFAULT_PRACTICE_SOURCES,
  TEST_PRACTICE_SOURCES,
  type DataCheckIssue,
  type DataCheckKind,
  type Pack,
} from '@ideamap/contracts';
import { describe, expect, it } from 'vitest';
import { canPublish, checkPack, practiceItem, type CheckedPack } from './index.js';

// C10-F4, F5, U1: the Practice data checks (D40).

type Row = Pack['practice'][number];

const row = (changes: Partial<Row> = {}): Row => ({
  exercise_id: 'e1',
  idea_id: 'a',
  group: 'Heat',
  standard_code: 'MS-PS1-4',
  exercise_title: 'Evaporation',
  kind: 'exercise',
  quiz_from: [],
  problem_type: 'mc',
  question: 'Which puddle dries fastest?',
  choices: ['Shallow, sunny', 'Deep, shady'],
  answer: 'Shallow, sunny',
  answer_unit: null,
  explanation: 'More heat and surface area.',
  visual: null,
  media_url: null,
  demo_video_url: null,
  demo_steps: [],
  source_bank_id: 'OpenStax',
  license_type: 'Public Domain',
  attribution_string: null,
  ...changes,
});

function pack(practice: Row[]): CheckedPack {
  return {
    ideas: [
      {
        idea_id: 'a',
        title: 'A',
        category: 'Thing',
        unit: 1,
        objective: 'Learn A.',
        explanation: null,
        standard_codes: ['C'],
        requires: [],
        media_url: 'a.mp4',
        rarity: 'auto',
        notes: null,
      },
    ],
    links: [{ from_id: 'a', to_id: 'a', relation: 'is', importance: 3, media_url: null }],
    units: [{ unit: 1, name: 'U', objective: 'Learn.', standard_codes: [], due_date: null }],
    categories: [{ category: 'Thing', icon: null, description: null }],
    assessment: [{ unit: 1, idea_id: 'a', question: 'What is A?', key_points: [] }],
    practice,
  };
}

const ofKind = (issues: DataCheckIssue[], kind: DataCheckKind) =>
  issues.filter((i) => i.kind === kind);

describe('vetted sources only (C10-F4)', () => {
  it('passes rows from allow-listed banks and licences', () => {
    const rows = [
      row({ source_bank_id: 'OpenStax', license_type: 'Public Domain' }),
      row({
        exercise_id: 'e2',
        question: 'Q2',
        source_bank_id: 'PhET',
        license_type: 'CC-BY-4.0',
        attribution_string: 'PhET Interactive Simulations, CC BY 4.0',
      }),
      row({ exercise_id: 'e3', question: 'Q3', source_bank_id: 'NASA' }),
      row({ exercise_id: 'e4', question: 'Q4', source_bank_id: 'NOAA' }),
    ];
    const issues = checkPack(pack(rows));
    expect(issues).toEqual([]);
    expect(canPublish(issues)).toBe(true);
  });

  it('blocks an unknown bank, an unknown licence and a CC-BY row with no attribution', () => {
    const issues = checkPack(
      pack([
        row({ source_bank_id: 'MadeUpBank' }),
        row({ exercise_id: 'e2', license_type: 'All rights reserved' }),
        row({ exercise_id: 'e3', license_type: 'CC-BY-4.0', attribution_string: null }),
      ]),
    );
    const [bank] = ofKind(issues, 'practice_source');
    const [license] = ofKind(issues, 'practice_license');
    const [attribution] = ofKind(issues, 'practice_attribution');
    for (const issue of [bank, license, attribution]) {
      expect(issue?.level).toBe('error');
      expect(issue?.fix.tab).toBe('Practice');
    }
    expect(bank).toMatchObject({
      items: [practiceItem('e1', 1)],
      fix: { column: 'source_bank_id' },
    });
    expect(license).toMatchObject({
      items: [practiceItem('e2', 1)],
      fix: { column: 'license_type' },
    });
    expect(attribution).toMatchObject({
      items: [practiceItem('e3', 1)],
      fix: { column: 'attribution_string' },
    });
    expect(canPublish(issues)).toBe(false);
  });

  it('says what to do in plain words (C10-U1)', () => {
    const [a] = ofKind(
      checkPack(pack([row({ license_type: 'CC-BY-4.0' })])),
      'practice_attribution',
    );
    expect(a!.message).toContain('Add an attribution for this CC-BY-4.0 item');
    expect(a!.message).toContain('Practice → attribution_string');
    const [b] = ofKind(checkPack(pack([row({ source_bank_id: 'Blog' })])), 'practice_source');
    expect(b!.message).toContain('"Blog"');
    expect(b!.message).toContain('OpenStax, PhET, NASA, NOAA');
  });

  it('blocks a row with no bank or no licence', () => {
    const issues = checkPack(pack([row({ source_bank_id: null, license_type: null })]));
    expect(ofKind(issues, 'practice_source')).toHaveLength(1);
    expect(ofKind(issues, 'practice_license')).toHaveLength(1);
    expect(canPublish(issues)).toBe(false);
  });

  it('reads the allow-list from configuration; production does not contain the fixture bank', () => {
    expect(DEFAULT_PRACTICE_SOURCES.banks).not.toContain('fixture');
    const rows = [row({ source_bank_id: 'fixture' })];
    expect(ofKind(checkPack(pack(rows)), 'practice_source')).toHaveLength(1);
    expect(checkPack(pack(rows), { practiceSources: TEST_PRACTICE_SOURCES })).toEqual([]);
    const custom = {
      banks: ['LocalBank'],
      licenses: [{ id: 'Site licence', attribution_required: false }],
    };
    expect(
      checkPack(pack([row({ source_bank_id: 'localbank', license_type: 'site licence' })]), {
        practiceSources: custom,
      }),
    ).toEqual([]);
  });
});

describe('other Practice checks (C10-F5)', () => {
  it('skips a row for an unknown idea with a located warning', () => {
    const issues = checkPack(pack([row({ idea_id: 'nope' })]));
    expect(issues).toEqual([
      expect.objectContaining({
        kind: 'practice_unknown_idea',
        level: 'warning',
        items: [practiceItem('e1', 1)],
        fix: { tab: 'Practice', column: 'idea_id' },
      }),
    ]);
  });

  it('blocks a multiple-choice problem with no choices', () => {
    const issues = checkPack(pack([row({ choices: [] }), row({ question: 'Q2', choices: ['x'] })]));
    expect(ofKind(issues, 'practice_choices').map((i) => i.items)).toEqual([
      [practiceItem('e1', 1)],
      [practiceItem('e1', 2)],
    ]);
    expect(canPublish(issues)).toBe(false);
  });

  it('blocks a number answer that is not numeric, and an mc answer that is not the first choice', () => {
    const issues = checkPack(
      pack([
        row({ problem_type: 'number', answer: 'about five', choices: [] }),
        row({ question: 'Q2', problem_type: 'number', answer: '-5.5', choices: [] }),
        row({ question: 'Q3', answer: 'Deep, shady' }),
      ]),
    );
    expect(ofKind(issues, 'practice_answer').map((i) => i.items)).toEqual([
      [practiceItem('e1', 1)],
      [practiceItem('e1', 3)],
    ]);
  });

  it('blocks a quiz that names a missing exercise, another quiz, or nothing', () => {
    const quiz = (id: string, from: string[]) =>
      row({ exercise_id: id, kind: 'quiz', quiz_from: from, question: `Q ${id}` });
    const issues = checkPack(
      pack([row(), quiz('q1', ['e1', 'ghost']), quiz('q2', ['q1']), quiz('q3', [])]),
    );
    const quizIssues = ofKind(issues, 'practice_quiz');
    expect(quizIssues.map((i) => i.items)).toEqual([
      [practiceItem('q1', 1)],
      [practiceItem('q2', 1)],
      [practiceItem('q3', 1)],
    ]);
    expect(quizIssues[0]!.message).toContain('"ghost"');
    expect(quizIssues[1]!.message).toContain('is a quiz');
    expect(quizIssues.every((i) => i.level === 'error')).toBe(true);
  });

  it('warns about two standard codes in one group', () => {
    const issues = checkPack(
      pack([
        row(),
        row({ exercise_id: 'e2', standard_code: 'MS-ESS2-4', question: 'Q2' }),
        row({ exercise_id: 'e3', standard_code: 'MS-PS1-4', group: 'Other', question: 'Q3' }),
      ]),
    );
    expect(ofKind(issues, 'practice_standard')).toEqual([
      expect.objectContaining({
        level: 'warning',
        items: [practiceItem('e1', 1), practiceItem('e2', 1)],
        fix: { tab: 'Practice', column: 'standard_code' },
      }),
    ]);
  });

  it('warns when rows of one exercise name different ideas or kinds', () => {
    const issues = checkPack(
      pack([row(), row({ question: 'Q2', kind: 'quiz', quiz_from: ['e1'] })]),
    );
    expect(ofKind(issues, 'practice_exercise')).toHaveLength(1);
  });

  it('never writes or changes a question', () => {
    const rows = [row({ choices: [], question: 'Keep me exactly' })];
    const before = JSON.stringify(rows);
    checkPack(pack(rows));
    expect(JSON.stringify(rows)).toBe(before);
  });

  it('a pack with no Practice rows, or no practice key, raises nothing', () => {
    expect(checkPack(pack([]))).toEqual([]);
    const { practice: _practice, ...old } = pack([]);
    void _practice;
    expect(checkPack(old)).toEqual([]);
  });

  it('keeps hostile text inert', () => {
    const issues = checkPack(
      pack([row({ source_bank_id: '<script>alert(1)</script>', license_type: '=1+1' })]),
    );
    expect(ofKind(issues, 'practice_source')[0]!.message).toContain('<script>');
    expect(canPublish(issues)).toBe(false);
  });

  it('checks 6,000 rows well inside the budget (C10-P1)', () => {
    const rows = Array.from({ length: 6000 }, (_, i) =>
      row({ exercise_id: `e${i % 1000}`, question: `Question ${i}` }),
    );
    const start = performance.now();
    const issues = checkPack(pack(rows));
    expect(performance.now() - start).toBeLessThan(500);
    expect(issues).toEqual([]);
  });
});
