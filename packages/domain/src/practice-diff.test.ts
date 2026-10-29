import type { Pack } from '@ideamap/contracts';
import { describe, expect, it } from 'vitest';
import { diffPacks } from './index.js';
import { packA } from '../../contracts/src/testing/publish.js';

// C10-F6: the publish diff lists changed, added and removed Practice items (D40).

type Row = Pack['practice'][number];

const row = (changes: Partial<Row> = {}): Row => ({
  exercise_id: 'e1',
  idea_id: 'sun',
  group: 'Heat',
  standard_code: null,
  exercise_title: 'Sun and heat',
  kind: 'exercise',
  quiz_from: [],
  problem_type: 'number',
  question: 'How many?',
  choices: [],
  answer: '5',
  answer_unit: null,
  explanation: 'Because.',
  visual: null,
  media_url: null,
  demo_video_url: null,
  demo_steps: [],
  source_bank_id: 'fixture',
  license_type: 'Public Domain',
  attribution_string: null,
  ...changes,
});

const withPractice = (practice: Row[]): Pack => ({ ...packA(), practice });

describe('Practice in the diff (C10-F6)', () => {
  const before = withPractice([
    row({ question: 'Q1' }),
    row({ question: 'Q2' }),
    row({ exercise_id: 'gone', question: 'Old', exercise_title: 'Gone' }),
  ]);
  const after = withPractice([
    row({ question: 'Q1', answer: '6' }),
    row({ question: 'Q2' }),
    row({ question: 'Q3' }),
    row({ exercise_id: 'new', question: 'Fresh', exercise_title: 'New one' }),
  ]);

  it('lists a changed answer, an added problem and exercise, and a removed exercise', () => {
    const diff = diffPacks(before, after);
    expect(diff.empty).toBe(false);
    expect(diff.practice_changed).toEqual([
      {
        exercise_id: 'e1',
        title: 'Sun and heat',
        idea_id: 'sun',
        change: 'changed',
        problems_added: [{ question: 'Q3' }],
        problems_removed: [],
        problems_changed: [
          { question: 'Q1', fields: ['answer'], before: { answer: '5' }, after: { answer: '6' } },
        ],
      },
      {
        exercise_id: 'gone',
        title: 'Gone',
        idea_id: 'sun',
        change: 'removed',
        problems_added: [],
        problems_removed: [{ question: 'Old' }],
        problems_changed: [],
      },
      {
        exercise_id: 'new',
        title: 'New one',
        idea_id: 'sun',
        change: 'added',
        problems_added: [{ question: 'Fresh' }],
        problems_removed: [],
        problems_changed: [],
      },
    ]);
  });

  it('gives the same result whatever the row order', () => {
    const shuffled = withPractice([...after.practice].reverse());
    const reversedBefore = withPractice([...before.practice].reverse());
    expect(diffPacks(reversedBefore, shuffled)).toEqual(diffPacks(before, after));
    expect(JSON.stringify(diffPacks(reversedBefore, shuffled))).toBe(
      JSON.stringify(diffPacks(before, after)),
    );
  });

  it('is empty for identical Practice tabs, and lists everything on a first publish', () => {
    expect(
      diffPacks(before, withPractice([...before.practice].reverse())).practice_changed,
    ).toEqual([]);
    expect(diffPacks(null, before).practice_changed.map((c) => [c.exercise_id, c.change])).toEqual([
      ['e1', 'added'],
      ['gone', 'added'],
    ]);
  });

  it('reports a Practice-only change as a change', () => {
    const base = withPractice([]);
    expect(diffPacks(base, { ...base, practice: [row()] }).empty).toBe(false);
    expect(diffPacks(base, base).empty).toBe(true);
  });

  it('ignores rows for ideas that are not in the pack, as the data check skips them', () => {
    const base = withPractice([]);
    expect(diffPacks(base, { ...base, practice: [row({ idea_id: 'nope' })] }).empty).toBe(true);
  });

  it('shows list columns joined with " | "', () => {
    const a = withPractice([row({ problem_type: 'mc', choices: ['x', 'y'], answer: 'x' })]);
    const b = withPractice([row({ problem_type: 'mc', choices: ['x', 'z'], answer: 'x' })]);
    expect(diffPacks(a, b).practice_changed[0]!.problems_changed[0]).toMatchObject({
      fields: ['choices'],
      before: { choices: 'x | y' },
      after: { choices: 'x | z' },
    });
  });

  it('diffs 6,000 Practice rows well inside the budget (C10-P1)', () => {
    const rows = (answer: string) =>
      Array.from({ length: 6000 }, (_, i) =>
        row({ exercise_id: `e${i % 1000}`, question: `Question ${i}`, answer }),
      );
    const start = performance.now();
    const diff = diffPacks(withPractice(rows('1')), withPractice(rows('2')));
    expect(performance.now() - start).toBeLessThan(1000);
    expect(diff.practice_changed).toHaveLength(1000);
  });
});
