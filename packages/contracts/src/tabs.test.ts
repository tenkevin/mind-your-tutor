import { describe, expect, it } from 'vitest';
import {
  AUDIENCES,
  EXPLANATION_SOURCES,
  ExplanationOverrideSchema,
  GRADES,
  PERSONA_IDS,
  RARITIES,
  TONES,
  USE_FOR,
  parseTabRow,
  type TabName,
} from './index.js';

// A minimal valid row for each tab; tests change one cell at a time.
const VALID: Record<TabName, Record<string, unknown>> = {
  Course: { subject: 'Science', topic: 'The water cycle', grade: '6' },
  Units: { unit: '1', name: 'Water goes up', objective: 'Describe how heat moves water.' },
  Ideas: { idea_id: 'evap', title: 'Evaporation', category: 'Process', unit: '1' },
  Links: { from_id: 'sun', to_id: 'evap', relation: 'powers' },
  Categories: { category: 'Process' },
  Assessment: { unit: '1', idea_id: 'evap', question: 'What is evaporation?' },
  Personas: { persona_id: 'tutor', name: 'Ms. Ivy' },
  Library: { title: 'Unit plan', file_url: 'unit-plan.pdf' },
};

function parseWith<T extends TabName>(tab: T, changes: Record<string, unknown>) {
  return parseTabRow(tab, { ...VALID[tab], ...changes }, 5);
}

function without<T extends TabName>(tab: T, column: string) {
  const row = { ...VALID[tab] };
  delete row[column];
  return parseTabRow(tab, row, 5);
}

describe('each tab accepts a valid row and rejects a bad one (F3-F12)', () => {
  const BAD: Record<TabName, Record<string, unknown>> = {
    Course: { grade: '13' },
    Units: { due_date: '30/10/2026' },
    Ideas: { idea_id: 'Evap' },
    Links: { importance: '6' },
    Categories: { icon: 'Arrows Clockwise' },
    Assessment: { unit: 'one' },
    Personas: { tone: 'grumpy' },
    Library: { file_url: 'javascript:alert(1)' },
  };
  it('allows optional unit objectives and assessment questions while keeping their identifiers required', () => {
    expect(parseWith('Units', { objective: '' })).toMatchObject({
      ok: true,
      value: { unit: 1, objective: null },
    });
    expect(parseWith('Assessment', { question: '' })).toMatchObject({
      ok: true,
      value: { unit: 1, idea_id: 'evap', question: null },
    });
    expect(parseWith('Personas', { name: '' })).toMatchObject({
      ok: true,
      value: { persona_id: 'tutor', name: null },
    });
    expect(without('Units', 'name').ok).toBe(false);
    expect(without('Assessment', 'idea_id').ok).toBe(false);
  });
  it('trims explanation edges, keeps internal newlines and normalizes blank text to null', () => {
    expect(parseWith('Ideas', { explanation: '  exact text\nsecond line  ' })).toMatchObject({
      ok: true,
      value: { explanation: 'exact text\nsecond line' },
    });
    expect(parseWith('Ideas', { explanation: ' \n ' })).toMatchObject({
      ok: true,
      value: { explanation: null },
    });
  });
  for (const tab of Object.keys(VALID) as TabName[]) {
    it(`${tab}: passes`, () => {
      const result = parseTabRow(tab, VALID[tab], 2);
      expect(result.issues).toEqual([]);
      expect(result.ok).toBe(true);
    });
    it(`${tab}: fails`, () => {
      const result = parseWith(tab, BAD[tab]!);
      expect(result.ok).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]!.column).toBe(Object.keys(BAD[tab]!)[0]);
    });
  }
});

describe('types match the spec (F3-F1)', () => {
  it('integers', () => {
    expect(parseWith('Units', { unit: 2 }).value).toMatchObject({ unit: 2 });
    expect(parseWith('Units', { unit: ' 2 ' }).value).toMatchObject({ unit: 2 });
    expect(parseWith('Units', { unit: '2.0' }).value).toMatchObject({ unit: 2 });
    for (const bad of ['2.5', 'two', 0, -1, true, '']) {
      expect(parseWith('Units', { unit: bad }).ok, String(bad)).toBe(false);
    }
  });

  it('percent 0–100', () => {
    for (const [cell, value] of [
      ['70', 70],
      [0, 0],
      ['100', 100],
      ['72.5', 72.5],
      ['80%', 80],
    ] as const) {
      expect(parseWith('Course', { pass_mark: cell }).value?.pass_mark).toBe(value);
    }
    for (const bad of ['101', -1, 'seventy', '70 percent']) {
      expect(parseWith('Course', { pass_mark: bad }).ok, String(bad)).toBe(false);
    }
  });

  it('dates are real YYYY-MM-DD dates', () => {
    expect(parseWith('Units', { due_date: '2026-10-30' }).value?.due_date).toBe('2026-10-30');
    expect(parseWith('Units', { due_date: '2028-02-29' }).ok).toBe(true);
    expect(parseWith('Units', { due_date: new Date('2026-10-30T00:00:00Z') }).value?.due_date).toBe(
      '2026-10-30',
    );
    for (const bad of ['2026-02-30', '2026-13-01', '30/10/2026', '2026-10-30T10:00:00Z', 46325]) {
      expect(parseWith('Units', { due_date: bad }).ok, String(bad)).toBe(false);
    }
  });

  it('lists come out as string arrays', () => {
    expect(
      parseWith('Units', { standard_codes: 'MS-ESS2-4, MS-PS1-4' }).value?.standard_codes,
    ).toEqual(['MS-ESS2-4', 'MS-PS1-4']);
  });

  it('slugs', () => {
    expect(parseWith('Links', { from_id: 'water-cycle' }).ok).toBe(true);
    expect(parseWith('Links', { from_id: 'Water' }).ok).toBe(false);
  });

  it('text is trimmed, and numbers in text cells become text', () => {
    expect(parseWith('Ideas', { title: '  Evaporation  ' }).value?.title).toBe('Evaporation');
    expect(parseWith('Ideas', { title: 1984 }).value?.title).toBe('1984');
    expect(parseWith('Ideas', { title: true }).ok).toBe(false);
  });
});

describe('enumerations are exact (F3-F2)', () => {
  const cases: [TabName, string, readonly string[], string[]][] = [
    ['Ideas', 'rarity', RARITIES, ['Epic', 'rare', 'AUTO']],
    ['Personas', 'tone', TONES, ['grumpy', 'Warm']],
    ['Personas', 'persona_id', PERSONA_IDS, ['teacher', 'Tutor']],
    ['Personas', 'audience', AUDIENCES, ['Parents', 'students']],
    ['Library', 'use_for', USE_FOR, ['everyone', 'Agent']],
    ['Course', 'grade', GRADES, ['13', '0', 'k', 'Kindergarten', '6th', '06', '1.5']],
  ];
  for (const [tab, column, allowed, invalid] of cases) {
    it(`${tab}.${column}`, () => {
      for (const value of allowed) {
        const result = parseWith(tab, { [column]: value });
        expect(result.ok, value).toBe(true);
        expect((result.value as Record<string, unknown>)[column]).toBe(value);
      }
      for (const value of invalid) {
        expect(parseWith(tab, { [column]: value }).ok, value).toBe(false);
      }
    });
  }

  it('grade accepts numbers from a spreadsheet', () => {
    expect(parseWith('Course', { grade: 6 }).value?.grade).toBe('6');
    expect(parseWith('Course', { grade: 12 }).value?.grade).toBe('12');
    expect(parseWith('Course', { grade: 13 }).ok).toBe(false);
  });

  it('importance is a whole number from 1 to 5', () => {
    for (const value of [1, 2, 3, 4, 5, '5']) {
      expect(parseWith('Links', { importance: value }).ok, String(value)).toBe(true);
    }
    for (const value of [0, 6, 2.5, 'high']) {
      expect(parseWith('Links', { importance: value }).ok, String(value)).toBe(false);
    }
  });
});

describe('spec defaults (F3-F4)', () => {
  it('fills the spec defaults and nulls the rest', () => {
    expect(parseTabRow('Course', VALID.Course).value).toEqual({
      subject: 'Science',
      topic: 'The water cycle',
      grade: '6',
      framework: null,
      map_objective: null,
      pass_mark: 70,
    });
    expect(parseTabRow('Units', VALID.Units).value).toEqual({
      unit: 1,
      name: 'Water goes up',
      objective: 'Describe how heat moves water.',
      standard_codes: [],
      due_date: null,
    });
    expect(parseTabRow('Ideas', VALID.Ideas).value).toEqual({
      idea_id: 'evap',
      title: 'Evaporation',
      category: 'Process',
      unit: 1,
      objective: null,
      standard_codes: [],
      requires: [],
      layer: 'process',
      media_url: null,
      rarity: 'auto',
      notes: null,
      explanation: null,
    });
    expect(parseTabRow('Links', VALID.Links).value).toEqual({
      from_id: 'sun',
      to_id: 'evap',
      relation: 'powers',
      importance: 3,
      media_url: null,
    });
    expect(parseTabRow('Categories', VALID.Categories).value).toEqual({
      category: 'Process',
      icon: null,
      description: null,
    });
    expect(parseTabRow('Assessment', VALID.Assessment).value).toEqual({
      unit: 1,
      idea_id: 'evap',
      question: 'What is evaporation?',
      key_points: [],
    });
    expect(parseTabRow('Personas', VALID.Personas).value).toEqual({
      persona_id: 'tutor',
      name: 'Ms. Ivy',
      role: null,
      audience: 'Students',
      tone: 'warm',
      prompt_template: null,
    });
    expect(parseTabRow('Library', VALID.Library).value).toEqual({
      title: 'Unit plan',
      file_url: 'unit-plan.pdf',
      use_for: 'agent',
    });
  });

  it('treats empty cells and null like missing ones', () => {
    const row = parseWith('Ideas', {
      objective: '',
      notes: '   ',
      media_url: null,
      rarity: '',
      explanation: '',
    });
    expect(row.value).toMatchObject({
      objective: null,
      notes: null,
      media_url: null,
      rarity: 'auto',
      explanation: null,
    });
    expect(parseWith('Links', { importance: '' }).value?.importance).toBe(3);
    expect(parseWith('Course', { pass_mark: null }).value?.pass_mark).toBe(70);
    expect(parseWith('Personas', { tone: '', audience: null }).value).toMatchObject({
      tone: 'warm',
      audience: 'Students',
    });
    expect(parseWith('Library', { use_for: '' }).value?.use_for).toBe('agent');
  });
});

describe('missing values are classed by the spec (F3-F5)', () => {
  const blocks: [TabName, string][] = [
    ['Course', 'subject'],
    ['Course', 'topic'],
    ['Course', 'grade'],
    ['Units', 'unit'],
    ['Ideas', 'idea_id'],
    ['Ideas', 'title'],
    ['Ideas', 'unit'],
  ];
  const skips: [TabName, string][] = [
    ['Links', 'from_id'],
    ['Links', 'to_id'],
    ['Links', 'relation'],
    ['Assessment', 'unit'],
    ['Assessment', 'idea_id'],
    ['Library', 'file_url'],
  ];

  it.each(blocks)('%s.%s blocks the import', (tab, column) => {
    for (const result of [without(tab, column), parseWith(tab, { [column]: '' })]) {
      expect(result.ok).toBe(false);
      expect(result.issues).toEqual([
        expect.objectContaining({ tab, column, row: 5, effect: 'blocks_import', value: null }),
      ]);
      expect(result.issues[0]!.message).toBe(
        `${column} is missing. The import can't go ahead until it's filled in.`,
      );
    }
  });

  it.each(skips)('%s.%s skips the row', (tab, column) => {
    const result = without(tab, column);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([expect.objectContaining({ tab, column, effect: 'skips_row' })]);
    expect(result.issues[0]!.message).toBe(`${column} is missing, so this row will be skipped.`);
  });

  it('other required columns report the fallback the spec describes', () => {
    const result = without('Units', 'name');
    expect(result.issues).toEqual([
      expect.objectContaining({
        tab: 'Units',
        column: 'name',
        effect: 'uses_fallback',
        fallback: 'Shows “Unit n”',
      }),
    ]);
    expect(result.issues[0]!.message).toBe('name is missing. If it stays empty: Shows “Unit n”.');
  });

  it('a bad value has the same effect as a missing one', () => {
    expect(parseWith('Links', { to_id: 'Not An Id' }).issues[0]!.effect).toBe('skips_row');
    expect(parseWith('Ideas', { unit: 'two' }).issues[0]!.effect).toBe('blocks_import');
    expect(parseWith('Ideas', { rarity: 'Epic' }).issues[0]).toMatchObject({
      effect: 'uses_fallback',
      fallback: 'auto',
    });
  });
});

describe('lists (F3-F6)', () => {
  const cases: [unknown, string[]][] = [
    ['a, b', ['a', 'b']],
    ['a;b', ['a', 'b']],
    [' a ,b ', ['a', 'b']],
    ['', []],
    ['   ', []],
    [
      ['a', 'b'],
      ['a', 'b'],
    ],
    [
      [' a ', '', 'b'],
      ['a', 'b'],
    ],
    [[], []],
    ['a,,b;', ['a', 'b']],
    [null, []],
  ];
  for (const column of ['standard_codes', 'requires'] as const) {
    it.each(cases)(`Ideas.${column} from %j`, (cell, expected) => {
      expect(parseWith('Ideas', { [column]: cell }).value?.[column]).toEqual(expected);
    });
  }
  it.each(cases)('Assessment.key_points from %j', (cell, expected) => {
    expect(parseWith('Assessment', { key_points: cell }).value?.key_points).toEqual(expected);
  });

  it('rejects lists of the wrong kind', () => {
    expect(parseWith('Ideas', { requires: 'evap, Bad Id' }).ok).toBe(false);
    expect(parseWith('Ideas', { standard_codes: [{ code: 'x' }] }).ok).toBe(false);
    expect(parseWith('Ideas', { standard_codes: true }).ok).toBe(false);
  });
});

describe('cross-row checks are left to C2 (F3-F7)', () => {
  it('parses ground (requires an unknown id) and rain (no codes)', () => {
    const ground = parseTabRow('Ideas', {
      idea_id: 'ground',
      title: 'Groundwater',
      category: 'Thing',
      unit: '3',
      standard_codes: 'MS-ESS3-1',
      requires: 'coll, aquifer',
    });
    expect(ground.ok).toBe(true);
    expect(ground.value?.requires).toEqual(['coll', 'aquifer']);
    const rain = parseTabRow('Ideas', {
      idea_id: 'rain',
      title: 'Rain',
      category: 'Thing',
      unit: '2',
      standard_codes: '',
      requires: 'prec',
    });
    expect(rain.ok).toBe(true);
    expect(rain.value?.standard_codes).toEqual([]);
  });

  it('accepts an unknown category, a unit with no row and a self link', () => {
    expect(parseWith('Ideas', { category: 'Nonexistent', unit: 99 }).ok).toBe(true);
    expect(parseWith('Links', { from_id: 'evap', to_id: 'evap' }).ok).toBe(true);
  });
});

describe('Ideas.explanation follows D9 (F3-F13)', () => {
  const text =
    'When the Sun warms water in oceans, lakes and puddles, some of it turns into an invisible gas and rises into the air.';

  it('keeps the text as written', () => {
    expect(parseWith('Ideas', { explanation: text }).value?.explanation).toBe(text);
    expect(parseWith('Ideas', { explanation: `  ${text}\n` }).value?.explanation).toBe(text);
  });

  it('turns an empty cell or a missing column into null', () => {
    for (const cell of ['', '   ', null]) {
      expect(parseWith('Ideas', { explanation: cell }).value?.explanation).toBeNull();
    }
    expect(without('Ideas', 'explanation').value?.explanation).toBeNull();
  });

  it('is optional and limited to 2,000 characters', () => {
    expect(parseWith('Ideas', { explanation: 'x'.repeat(2000) }).ok).toBe(true);
    const result = parseWith('Ideas', { explanation: 'x'.repeat(2001) });
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({ column: 'explanation', effect: 'uses_fallback' });
    expect(result.issues[0]!.message).toBe(
      'explanation is too long: it can have at most 2,000 characters (got 2,001).',
    );
  });
});

describe('approved explanation override (F3-F13)', () => {
  const approved = {
    text: 'Water vapour cools and turns back into tiny drops.',
    source: 'ai',
    approvedBy: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    approvedAt: '2026-10-22T09:00:00Z',
  };

  it('has text, source, approvedBy and approvedAt', () => {
    expect(Object.keys(ExplanationOverrideSchema.shape)).toEqual([
      'text',
      'source',
      'approvedBy',
      'approvedAt',
    ]);
    expect([...EXPLANATION_SOURCES]).toEqual(['sheet', 'ai']);
    expect(ExplanationOverrideSchema.parse(approved)).toEqual(approved);
    expect(ExplanationOverrideSchema.parse({ ...approved, source: 'sheet' }).source).toBe('sheet');
  });

  it('rejects incomplete or invalid overrides', () => {
    const bad = [
      { ...approved, text: '' },
      { ...approved, text: 'x'.repeat(2001) },
      { ...approved, source: 'teacher' },
      { ...approved, approvedBy: '' },
      { ...approved, approvedAt: 'yesterday' },
      { text: approved.text, source: 'ai' },
    ];
    for (const override of bad) {
      expect(ExplanationOverrideSchema.safeParse(override).success, JSON.stringify(override)).toBe(
        false,
      );
    }
  });
});
