import { describe, expect, it } from 'vitest';
import { formatIssue, parsePack, parsePackTables, parseTabRow } from './index.js';
import { readCsvTables, readPackJson } from './testing/fixtures.js';

const RAW_ZOD =
  /invalid_type|invalid_value|invalid_format|invalid_union|too_big|too_small|unrecognized_keys|Invalid input|Expected /;

describe('errors point to the exact cell (F3-U1)', () => {
  it('names the tab, sheet row, column and value', () => {
    const { tables, rowNumbers } = readCsvTables();
    const ideas = [...(tables.Ideas as Record<string, unknown>[])];
    // Sheet row 7 is the sixth idea (row 1 is the header).
    ideas[5] = { ...ideas[5], unit: 'two' };
    const result = parsePackTables({ ...tables, Ideas: ideas }, { rowNumbers });
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      {
        severity: 'error',
        effect: 'blocks_import',
        tab: 'Ideas',
        row: 7,
        column: 'unit',
        value: 'two',
        fallback: null,
        message: "unit must be a whole number of 1 or more, like 1 (got 'two').",
      },
    ]);
    expect(formatIssue(result.issues[0]!)).toBe(
      "Ideas, row 7, unit: unit must be a whole number of 1 or more, like 1 (got 'two').",
    );
  });

  it('uses the sheet row even when blank rows were dropped', () => {
    const result = parsePackTables(
      {
        Course: [
          { key: 'subject', value: 'Science' },
          { key: 'topic', value: 'Water' },
          { key: 'grade', value: 'Year 6' },
        ],
        Units: [],
        Ideas: [{ idea_id: 'evap', title: 'Evaporation', category: 'Process', unit: 'x' }],
        Links: [],
      },
      { rowNumbers: { Course: [2, 3, 5], Ideas: [9] } },
    );
    expect(result.issues.map((i) => [i.tab, i.row, i.column])).toEqual([
      ['Course', 5, 'grade'],
      ['Ideas', 9, 'unit'],
    ]);
  });
});

describe('errors are plain English with a fix (F3-U2)', () => {
  const messages = (tab: Parameters<typeof parseTabRow>[0], row: Record<string, unknown>) =>
    parseTabRow(tab, row).issues.map((i) => i.message);

  it.each([
    [
      'Ideas',
      { idea_id: 'Evap Two', title: 'E', category: 'P', unit: 1 },
      "idea_id can only use lowercase letters, numbers and hyphens, up to 64 characters (got 'Evap Two').",
    ],
    [
      'Ideas',
      { idea_id: 'e', title: 'E', category: 'P', unit: 1, rarity: 'Epic' },
      "rarity must be one of auto, Common, Rare or Legendary (got 'Epic').",
    ],
    [
      'Personas',
      { persona_id: 'teacher', name: 'Ms. Ivy' },
      "persona_id must be one of tutor, peer, agent or custom (got 'teacher').",
    ],
    [
      'Personas',
      { persona_id: 'tutor', name: 'Ms. Ivy', tone: 'grumpy' },
      "tone must be one of warm, calm, playful or socratic (got 'grumpy').",
    ],
    [
      'Personas',
      { persona_id: 'tutor', name: 'Ms. Ivy', audience: 'Parents' },
      "audience must be one of Students or Teachers (got 'Parents').",
    ],
    [
      'Library',
      { title: 'Plan', file_url: 'plan.pdf', use_for: 'everyone' },
      "use_for must be one of agent, tutor or both (got 'everyone').",
    ],
    [
      'Course',
      { subject: 'S', topic: 'T', grade: '13' },
      "grade must be K or a whole number from 1 to 12 (got '13').",
    ],
    [
      'Links',
      { from_id: 'a', to_id: 'b', relation: 'r', importance: 9 },
      'importance must be a whole number from 1 to 5 (got 9).',
    ],
    [
      'Ideas',
      { idea_id: 'e', title: 'E', category: 'P', unit: 1, media_url: 'javascript:alert(1)' },
      "media_url must be a web address starting with https:// or a file name like evaporation.mp4 (got 'javascript:alert(1)').",
    ],
    [
      'Units',
      { unit: 1, name: 'N', objective: 'O', due_date: '30/10/2026' },
      "due_date must be a real date written as YYYY-MM-DD, like 2026-10-30 (got '30/10/2026').",
    ],
    [
      'Course',
      { subject: 'S', topic: 'T', grade: 'K', pass_mark: '120' },
      'pass_mark must be a number from 0 to 100, like 70 (got 120).',
    ],
    [
      'Ideas',
      { idea_id: 'e', title: 'E', category: 'P', unit: 1, requires: 'evap, Cond' },
      "requires can only list ids made of lowercase letters, numbers and hyphens, up to 64 characters (got 'Cond').",
    ],
  ] as const)('%s: %j', (tab, row, message) => {
    const found = messages(tab, row);
    expect(found).toEqual([message]);
    expect(found[0]).not.toMatch(RAW_ZOD);
  });
});

describe('every problem is reported at once (F3-U3)', () => {
  it('returns all 5 bad cells across 3 tabs', () => {
    const pack = readPackJson() as Record<string, Record<string, unknown>[]>;
    pack.ideas![0]!.idea_id = 'Water Cycle';
    pack.ideas![4]!.rarity = 'Epic';
    pack.links![2]!.importance = 9;
    pack.links![10]!.media_url = 'javascript:alert(1)';
    (pack.units![1] as Record<string, unknown>).due_date = 'next week';
    const result = parsePack(pack);
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => `${i.tab}:${i.row}:${i.column}`)).toEqual([
      'Units:3:due_date',
      'Ideas:2:idea_id',
      'Ideas:6:rarity',
      'Links:4:importance',
      'Links:12:media_url',
    ]);
    for (const issue of result.issues) expect(issue.message).not.toMatch(RAW_ZOD);
  });

  it('reports missing tabs and a missing Course key in plain English', () => {
    const result = parsePackTables({ Course: [{ key: 'subject', value: 'Science' }] });
    expect(result.issues.map((i) => i.message)).toEqual([
      "topic is missing. The import can't go ahead until it's filled in.",
      "grade is missing. The import can't go ahead until it's filled in.",
      "The Units tab is missing. The import can't go ahead without it.",
      "The Ideas tab is missing. The import can't go ahead without it.",
      "The Links tab is missing. The import can't go ahead without it.",
    ]);
    expect(result.issues.every((i) => i.effect === 'blocks_import')).toBe(true);
  });

  it('warns about unknown and repeated Course keys', () => {
    const result = parsePackTables({
      Course: [
        { key: 'subject', value: 'Science' },
        { key: 'topic', value: 'Water' },
        { key: 'grade', value: 6 },
        { key: 'subjct', value: 'Maths' },
        { key: 'topic', value: 'Again' },
      ],
      Units: [],
      Ideas: [],
      Links: [],
    });
    expect(result.ok).toBe(true);
    expect(result.value?.course.topic).toBe('Water');
    expect(result.issues.map((i) => [i.severity, i.row, i.message])).toEqual([
      [
        'warning',
        5,
        "The Course tab has a key 'subjct' that isn't used. The keys are subject, topic, grade, framework, map_objective, pass_mark.",
      ],
      [
        'warning',
        6,
        'topic appears twice in the Course tab (rows 3 and 6); the first one is used.',
      ],
    ]);
  });
});
