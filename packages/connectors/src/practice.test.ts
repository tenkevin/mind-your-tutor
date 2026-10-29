import { PACK_SPEC, TEST_PRACTICE_SOURCES, type Pack } from '@ideamap/contracts';
import { describe, expect, it } from 'vitest';
import { checkPack } from '../../domain/src/index.js';
import {
  csvExport,
  ExportRefused,
  importPack,
  packReport,
  sheetToCsv,
  templateReport,
  xlsxExport,
  type FileRef,
} from './index.js';
import {
  file,
  fixtureBytes,
  fixtureCsvFiles,
  fixtureText,
  parseCsv,
  TABS,
} from './testing/build.js';
import { ZipReader } from './zip.js';

// C10: the Practice tab through import (C1), export (C6) and the three fixture forms.

const DATE = { date: '2026-10-29' };
const reimport = (ref: FileRef) => importPack(file(ref.name, ref.bytes));
const fixtureJson = () => importPack(file('pack.json', fixtureText('pack.json')));
const fixtureXlsx = () => importPack(file('water-cycle.xlsx', fixtureBytes('water-cycle.xlsx')));

/** The fixture CSVs with the Practice file replaced by `text`. */
const csvWithPractice = (text: string) =>
  TABS.map((tab) => file(`${tab}.csv`, tab === 'Practice' ? text : fixtureText(`${tab}.csv`)));

const HEADER = PACK_SPEC.find((t) => t.tab === 'Practice')!.cols.map((c) => c.name);
const line = (cells: Record<string, string>) =>
  HEADER.map((h) => {
    const v = cells[h] ?? '';
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(',');
const GOOD = {
  exercise_id: 'x1',
  idea_id: 'evap',
  group: 'Heat',
  exercise_title: 'Heat and puddles',
  problem_type: 'number',
  question: 'How many?',
  answer: '5',
  explanation: 'Because.',
  source_bank_id: 'fixture',
  license_type: 'Public Domain',
};
const csv = (...rows: Record<string, string>[]) =>
  [HEADER.join(','), ...rows.map(line)].join('\n') + '\n';

describe('the three forms agree (C10-F3)', () => {
  it('CSV, XLSX and pack JSON give deep-equal packs with no issues', async () => {
    const [fromCsv, fromXlsx, fromJson] = await Promise.all([
      importPack(fixtureCsvFiles()),
      fixtureXlsx(),
      fixtureJson(),
    ]);
    for (const r of [fromCsv, fromXlsx, fromJson]) {
      expect(r.issues).toEqual([]);
      expect(r.ok).toBe(true);
    }
    expect(fromCsv.pack).toEqual(fromJson.pack);
    expect(fromXlsx.pack).toEqual(fromJson.pack);
    const { practice } = fromJson.pack!;
    expect(practice).toHaveLength(5);
    expect(new Set(practice.map((p) => p.exercise_id)).size).toBe(3);
    expect(practice.filter((p) => p.kind === 'quiz')).toHaveLength(1);
    expect(new Set(practice.map((p) => p.problem_type))).toEqual(new Set(['mc', 'number']));
    expect(practice.some((p) => p.visual?.startsWith('graph:'))).toBe(true);
    expect(fromJson.rows.Practice).toEqual([2, 3, 4, 5, 6]);
  });

  it('the fixture Practice rows pass the checks under the test allow-list only', async () => {
    const { pack } = await fixtureJson();
    const practiceKinds = (issues: ReturnType<typeof checkPack>) =>
      issues.filter((i) => i.kind.startsWith('practice_')).map((i) => i.kind);
    expect(practiceKinds(checkPack(pack!, { practiceSources: TEST_PRACTICE_SOURCES }))).toEqual([]);
    expect(practiceKinds(checkPack(pack!))).toEqual(Array(5).fill('practice_source'));
  });

  it('a pack without a Practice tab imports with an empty list and a note', async () => {
    const files = TABS.filter((t) => t !== 'Practice').map((t) =>
      file(`${t}.csv`, fixtureText(`${t}.csv`)),
    );
    const result = await importPack(files);
    expect(result.ok).toBe(true);
    expect(result.pack!.practice).toEqual([]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'tab_default',
        tab: 'Practice',
        severity: 'info',
        message: expect.stringContaining('no practice exercises'),
      }),
    ]);
  });
});

describe('import behaviour from the spec (C10-F5)', () => {
  it('keeps commas inside pipe-separated choices and steps', async () => {
    const result = await importPack(
      csvWithPractice(
        csv({
          ...GOOD,
          problem_type: 'mc',
          choices: 'Warm, wet air | Cold air',
          answer: 'Warm, wet air',
          demo_steps: 'Add heat, then wait | Vapour rises',
        }),
      ),
    );
    expect(result.issues).toEqual([]);
    expect(result.pack!.practice[0]).toMatchObject({
      choices: ['Warm, wet air', 'Cold air'],
      demo_steps: ['Add heat, then wait', 'Vapour rises'],
    });
  });

  it('skips a row with no question or no answer, locating the cell', async () => {
    const result = await importPack(
      csvWithPractice(
        csv(GOOD, { ...GOOD, question: '' }, { ...GOOD, question: 'Q3', answer: '' }),
      ),
    );
    expect(result.pack!.practice.map((p) => p.question)).toEqual(['How many?']);
    const skipped = result.issues.filter((i) => i.effect === 'skips_row');
    expect(skipped.map((i) => [i.tab, i.row, i.column])).toEqual([
      ['Practice', 3, 'question'],
      ['Practice', 4, 'answer'],
    ]);
    expect(skipped.every((i) => i.severity === 'warning')).toBe(true);
  });

  it('uses the spec fallbacks for a missing group, title and explanation, never rewriting a question', async () => {
    const result = await importPack(
      csvWithPractice(csv({ ...GOOD, group: '', exercise_title: '', explanation: '' })),
    );
    expect(result.ok).toBe(true);
    expect(result.pack!.practice[0]).toMatchObject({
      group: 'Practice',
      exercise_title: 'x1',
      explanation: '5',
      question: 'How many?',
    });
    expect(result.issues.map((i) => [i.column, i.severity])).toEqual([
      ['group', 'warning'],
      ['exercise_title', 'warning'],
      ['explanation', 'warning'],
    ]);
  });

  it('flags a bad kind, problem type or visual at its cell', async () => {
    const result = await importPack(
      csvWithPractice(
        csv(
          { ...GOOD, problem_type: 'essay' },
          { ...GOOD, question: 'Q2', visual: 'pie: 1,2' },
          { ...GOOD, question: 'Q3', kind: 'test' },
        ),
      ),
    );
    expect(result.issues.map((i) => [i.row, i.column])).toEqual([
      [2, 'problem_type'],
      [3, 'visual'],
      [4, 'kind'],
    ]);
  });

  it('stores hostile text as text and flags unsafe media references (C10-S1)', async () => {
    const result = await importPack(
      csvWithPractice(
        csv({
          ...GOOD,
          question: '<script>alert(1)</script>',
          explanation: '=HYPERLINK("http://x")',
          media_url: 'javascript:alert(1)',
          demo_video_url: 'http://example.org/v.mp4',
          answer_unit: '@SUM(1)',
        }),
      ),
    );
    expect(result.pack!.practice[0]).toMatchObject({
      question: '<script>alert(1)</script>',
      media_url: null,
      demo_video_url: null,
    });
    const flagged = result.issues.filter((i) => i.severity === 'warning' && i.tab === 'Practice');
    expect(flagged.map((i) => i.column).sort()).toEqual(['demo_video_url', 'media_url']);
    expect(result.issues.some((i) => i.code === 'formula_text')).toBe(true);
  });
});

describe('export (C10-F7)', () => {
  it('includes Practice in the pack workbook and reimports equal, as CSV and XLSX', async () => {
    const { pack } = await fixtureJson();
    const sheet = packReport(pack!, DATE).sheets.find((s) => s.name === 'Practice')!;
    expect(sheet.header).toEqual(HEADER);
    expect(sheet.rows).toHaveLength(5);
    for (const target of [csvExport, xlsxExport]) {
      const again = await reimport(await target.write(packReport(pack!, DATE)));
      expect(again.issues).toEqual([]);
      expect(again.pack).toEqual(pack);
    }
  });

  it('writes pipe lists with " | " and refuses an item holding a pipe', async () => {
    const { pack } = await fixtureJson();
    const sheet = packReport(pack!, DATE).sheets.find((s) => s.name === 'Practice')!;
    expect(sheet.rows[0]![HEADER.indexOf('choices')]).toBe(
      'A shallow puddle in the sun | A deep puddle in the shade | A puddle on a cold night',
    );
    expect(sheet.rows[4]![HEADER.indexOf('quiz_from')]).toBe('wc-evap-1, wc-cond-1');
    const bad = structuredClone(pack!);
    bad.practice[0]!.choices = ['a | b', 'c'];
    expect(() => packReport(bad, DATE)).toThrow(
      /^Practice, row 2, choices: the item "a \| b" has a \|/,
    );
    expect(() => packReport(bad, DATE)).toThrow(ExportRefused);
  });

  it('neutralises formula prefixes in Practice cells and reads them back', async () => {
    const pack = structuredClone((await fixtureJson()).pack!);
    pack.practice[0]!.question = '=1+1';
    pack.practice[0]!.explanation = '@SUM(A1)';
    pack.practice[1]!.answer_unit = '+cmd';
    const sheet = packReport(pack, DATE).sheets.find((s) => s.name === 'Practice')!;
    const cells = parseCsv(sheetToCsv(sheet).slice(1), 1e7, 1e4, 'x').rows.flat();
    for (const cell of cells) expect(cell).not.toMatch(/^[=+@\t\r]/);
    expect(cells).toContain("'=1+1");
    const again = await reimport(await xlsxExport.write(packReport(pack, DATE)));
    expect(again.pack!.practice[0]).toMatchObject({ question: '=1+1', explanation: '@SUM(A1)' });
  });

  it('uses CRLF line endings in CSV, like every other tab (C6cx2)', async () => {
    const { pack } = await fixtureJson();
    const sheet = packReport(pack!, DATE).sheets.find((s) => s.name === 'Practice')!;
    const text = sheetToCsv(sheet);
    expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(text.endsWith('\r\n')).toBe(true);
  });

  it('the template has the Practice tab and its example row matches the spec', async () => {
    const blank = templateReport(DATE).sheets.find((s) => s.name === 'Practice')!;
    expect(blank.header).toEqual(HEADER);
    expect(blank.rows).toEqual([]);
    const sample = templateReport({ ...DATE, sample: true }).sheets.find(
      (s) => s.name === 'Practice',
    )!;
    expect(sample.rows).toHaveLength(1);
    const spec = PACK_SPEC.find((t) => t.tab === 'Practice')!;
    const readMe = templateReport(DATE).sheets.find((s) => s.name === 'Read me')!;
    expect(readMe.rows.filter((r) => r[0] === 'Practice')).toHaveLength(spec.cols.length + 1);
    // The sample row imports and reads back exactly as the spec's example.
    const row = Object.fromEntries(HEADER.map((h, i) => [h, sample.rows[0]![i]]));
    expect(row).toMatchObject({
      exercise_id: 'v4',
      idea_id: 'vel',
      standard_code: 'HSF-IF.B.6',
      problem_type: 'number',
      answer: '-5',
      answer_unit: 'm/s',
      visual: 'graph: 0,30; 6,0',
      demo_video_url: 'v4-worked-example.mp4',
      source_bank_id: 'OpenStax',
      license_type: 'CC-BY-4.0',
    });
    const zip = await csvExport.write(templateReport(DATE));
    const reader = ZipReader.open(zip.bytes, { remaining: 1e9, total: 1e9 }, 1000);
    expect([...reader.entries.keys()]).toContain('Practice.csv');
  });
});

describe('a large pack (C10-P1)', () => {
  it('imports, checks and exports 2,000 ideas and 6,000 Practice rows within budget', async () => {
    const base = (await fixtureJson()).pack!;
    const pack: Pack = structuredClone(base);
    pack.ideas = Array.from({ length: 2000 }, (_, i) => ({
      ...base.ideas[0]!,
      idea_id: `idea-${i}`,
      title: `Idea ${i}`,
      requires: [],
    }));
    pack.links = [];
    pack.assessment = [];
    pack.practice = Array.from({ length: 6000 }, (_, i) => ({
      ...base.practice[0]!,
      exercise_id: `ex-${i % 1500}`,
      idea_id: `idea-${i % 2000}`,
      question: `Question ${i}?`,
      choices: ['a', 'b', 'c'],
      answer: 'a',
    }));
    let start = performance.now();
    const ref = await xlsxExport.write(packReport(pack, DATE));
    const exported = performance.now() - start;
    start = performance.now();
    const again = await reimport(ref);
    const imported = performance.now() - start;
    start = performance.now();
    checkPack(again.pack!, { practiceSources: TEST_PRACTICE_SOURCES });
    const checked = performance.now() - start;
    expect(again.pack!.practice).toHaveLength(6000);
    expect(exported).toBeLessThan(5000);
    expect(imported).toBeLessThan(10_000);
    expect(checked).toBeLessThan(1000);
  });
});
