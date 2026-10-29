import { describe, expect, it } from 'vitest';
import {
  PIPE_LIST_COLUMNS,
  PackSchema,
  parsePack,
  parseTabRow,
  parseVisual,
  splitPipeList,
} from './index.js';

// C10-F2: Practice rows through the F3 schemas.

const ROW = {
  exercise_id: 'v4',
  idea_id: 'vel',
  group: 'Velocity as a rate of change',
  standard_code: 'HSF-IF.B.6',
  exercise_title: 'Velocity from position–time graphs',
  problem_type: 'number',
  question: 'What is the velocity of this object?',
  answer: '-5',
  answer_unit: 'm/s',
  explanation: 'Slope = (0 − 30) ÷ 6 = −5 m/s.',
};

const parse = (changes: Record<string, unknown>) =>
  parseTabRow('Practice', { ...ROW, ...changes }, 3);

describe('Practice rows (C10-F2)', () => {
  it('defaults kind to exercise and the optional columns to empty', () => {
    const { ok, value } = parse({});
    expect(ok).toBe(true);
    expect(value).toMatchObject({
      kind: 'exercise',
      quiz_from: [],
      choices: [],
      demo_steps: [],
      visual: null,
      media_url: null,
      demo_video_url: null,
      source_bank_id: null,
      license_type: null,
      attribution_string: null,
    });
  });

  it('accepts exercise and quiz, mc and number; rejects other values', () => {
    expect(parse({ kind: 'quiz', quiz_from: 'v1, v2, v4' }).value).toMatchObject({
      kind: 'quiz',
      quiz_from: ['v1', 'v2', 'v4'],
    });
    expect(parse({ problem_type: 'mc' }).ok).toBe(true);
    for (const bad of [{ kind: 'test' }, { problem_type: 'essay' }, { quiz_from: 'V 1' }]) {
      const result = parse(bad);
      expect(result.ok, JSON.stringify(bad)).toBe(false);
      expect(result.issues[0]!.column).toBe(Object.keys(bad)[0]);
    }
  });

  it('splits choices and demo_steps on pipes, keeping commas inside an entry', () => {
    const { value } = parse({
      problem_type: 'mc',
      choices: 'At rest | 10 m/s, due north | Speeding up',
      demo_steps: 'Rise 20 m, run 4 s | 20 ÷ 4 | 5 m/s',
    });
    expect(value?.choices).toEqual(['At rest', '10 m/s, due north', 'Speeding up']);
    expect(value?.demo_steps).toEqual(['Rise 20 m, run 4 s', '20 ÷ 4', '5 m/s']);
    expect(splitPipeList(' a || b |')).toEqual(['a', 'b']);
    expect(PIPE_LIST_COLUMNS.Practice).toEqual(['choices', 'demo_steps']);
  });

  it('reads numbers from a spreadsheet as text', () => {
    expect(parse({ answer: -5 }).value?.answer).toBe('-5');
  });

  it('accepts graph and table visuals and rejects other forms', () => {
    expect(parse({ visual: 'graph: 0,30; 6,0' }).value?.visual).toBe('graph: 0,30; 6,0');
    expect(parse({ visual: 'table: t: 0, 2, 4; x: 0, 6, 12' }).ok).toBe(true);
    for (const bad of [
      'chart: 0,1',
      'graph: 0,30; 6',
      'graph: a,b',
      'graph:',
      'table: t: 0, 1; x: 0',
      'table: 0, 1',
      '<img src=x>',
      'graph: 0,1;; 2,3',
    ]) {
      const result = parse({ visual: bad });
      expect(result.ok, bad).toBe(false);
      expect(result.issues[0]!.column).toBe('visual');
    }
  });

  it('parseVisual returns what the app draws', () => {
    expect(parseVisual('graph: 0,30; 6,0')).toEqual({
      type: 'graph',
      points: [
        [0, 30],
        [6, 0],
      ],
    });
    expect(parseVisual('table: t: 0, 2; x: 5, 7')).toEqual({
      type: 'table',
      rows: [
        { label: 't', values: [0, 2] },
        { label: 'x', values: [5, 7] },
      ],
    });
    expect(parseVisual('nonsense')).toBeNull();
  });

  it('treats media references as inert text and refuses unsafe ones', () => {
    expect(parse({ media_url: 'hint.mp4', demo_video_url: 'https://example.org/v.mp4' }).ok).toBe(
      true,
    );
    for (const column of ['media_url', 'demo_video_url']) {
      const result = parse({ [column]: 'javascript:alert(1)' });
      expect(result.ok, column).toBe(false);
      expect(result.issues[0]!.column).toBe(column);
    }
  });

  it('reports the spec behaviour for missing required columns', () => {
    const missing = (column: string) => {
      const row: Record<string, unknown> = { ...ROW };
      delete row[column];
      return parseTabRow('Practice', row, 4).issues[0]!;
    };
    expect(missing('question')).toMatchObject({ effect: 'skips_row', column: 'question', row: 4 });
    expect(missing('answer')).toMatchObject({ effect: 'skips_row' });
    expect(missing('group')).toMatchObject({ effect: 'uses_fallback' });
    expect(missing('exercise_title')).toMatchObject({ effect: 'uses_fallback' });
  });
});

describe('a pack without a Practice tab (C10-F2)', () => {
  const base = {
    version: 1,
    course: { subject: 'Science', topic: 'Water', grade: '6' },
    units: [{ unit: 1, name: 'U' }],
    ideas: [{ idea_id: 'a', title: 'A', category: 'c', unit: 1 }],
    links: [],
  };
  it('parses with an empty list', () => {
    const result = parsePack(base);
    expect(result.ok).toBe(true);
    expect(result.value?.practice).toEqual([]);
    expect(PackSchema.safeParse(base).success).toBe(true);
  });
  it('locates a bad Practice cell by tab, row and column', () => {
    const result = parsePack({ ...base, practice: [{ ...ROW, problem_type: 'essay' }] });
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({ tab: 'Practice', row: 2, column: 'problem_type' });
  });
});
