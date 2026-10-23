import { PACK_SPEC, type DataCheckIssue, type Pack } from '@ideamap/contracts';
import { describe, expect, it } from 'vitest';
import { checkPack } from '../../domain/src/index.js';
import {
  alignmentReport,
  assessmentDraftsReport,
  csvExport,
  dataCheckReport,
  EXPORT_TARGETS,
  fileSlug,
  importPack,
  needsFormulaEscape,
  packReport,
  parseCsv,
  sheetToCsv,
  templateReport,
  xlsxExport,
  type ExportPayload,
  type FileRef,
} from './index.js';
import { file, fixtureBytes } from './testing/build.js';
import { decodeEntities } from './xml.js';
import { ZipReader } from './zip.js';

const DATE = { date: '2026-10-22' };

async function fixturePack(): Promise<Pack> {
  const result = await importPack(file('water-cycle.xlsx', fixtureBytes('water-cycle.xlsx')));
  expect(result.ok).toBe(true);
  return result.pack!;
}

const reimport = (ref: FileRef) => importPack(file(ref.name, ref.bytes));

function unzip(bytes: Uint8Array): Map<string, string> {
  const reader = ZipReader.open(bytes, { remaining: 1e9, total: 1e9 }, 1000);
  return new Map(
    [...reader.entries.keys()].map((name) => [
      name,
      new TextDecoder('utf-8', { ignoreBOM: true }).decode(reader.read(reader.entries.get(name)!)),
    ]),
  );
}

/** A CSV file's rows, after its byte order mark. */
function csvRows(ref: FileRef): string[][] {
  const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(ref.bytes);
  expect(text.startsWith('﻿')).toBe(true);
  return parseCsv(text.slice(1), 1e7, 1e4, ref.name).rows;
}

/** Every sheet of a workbook, read back by the importer's own XLSX reader. */
async function workbookSheets(ref: FileRef) {
  const { xlsxConnector } = await import('./xlsx.js');
  const raw = await xlsxConnector.parse(file(ref.name, ref.bytes));
  return raw;
}

describe('template workbook (C6-F1, F2, F3)', () => {
  it('has a Read me sheet and the eight tabs with exactly the spec columns', async () => {
    const report = templateReport(DATE);
    expect(report.sheets.map((s) => s.name)).toEqual(['Read me', ...PACK_SPEC.map((t) => t.tab)]);
    for (const spec of PACK_SPEC) {
      const sheet = report.sheets.find((s) => s.name === spec.tab)!;
      if (spec.kind === 'keyvalue') {
        expect(sheet.header).toEqual(['key', 'value']);
        expect(sheet.rows.map((r) => r[0])).toEqual(spec.cols.map((c) => c.name));
      } else {
        expect(sheet.header).toEqual(spec.cols.map((c) => c.name));
        expect(sheet.rows).toEqual([]);
      }
    }
    expect(report.sheets.find((s) => s.name === 'Ideas')!.header).toContain('explanation');
  });

  it('imports with no problems except that it has no content yet', async () => {
    const ref = await xlsxExport.write(templateReport(DATE));
    expect(ref.name).toBe('curriculum-pack-template-2026-10-22.xlsx');
    const result = await reimport(ref);
    // Every tab and column is recognised. The only errors are the three required
    // Course values, which are blank; the empty tabs (no ideas yet) are info.
    expect(result.issues.filter((i) => i.severity === 'error').map((e) => e.column)).toEqual([
      'subject',
      'topic',
      'grade',
    ]);
    expect(result.issues.filter((i) => i.severity === 'warning')).toEqual([]);
    expect(result.issues.find((i) => i.tab === 'Ideas')?.code).toBe('tab_default');
    expect(result.mapping.filter((m) => m.tab === 'Ideas').map((m) => m.column)).toEqual(
      PACK_SPEC.find((t) => t.tab === 'Ideas')!.cols.map((c) => c.name),
    );

    // Filling in just those three values gives a pack that imports.
    const report = templateReport(DATE);
    const course = report.sheets.find((s) => s.name === 'Course')!;
    const filled = {
      ...report,
      sheets: report.sheets.map((s) =>
        s === course
          ? {
              ...s,
              rows: s.rows.map((r) =>
                r[0] === 'subject'
                  ? ['subject', 'Science']
                  : r[0] === 'topic'
                    ? ['topic', 'Rocks']
                    : r[0] === 'grade'
                      ? ['grade', '5']
                      : r,
              ),
            }
          : s,
      ),
    };
    const ok = await reimport(await xlsxExport.write(filled));
    expect(ok.ok).toBe(true);
    expect(ok.pack!.ideas).toEqual([]);
  });

  it('the sample template has the prototype sample rows', async () => {
    const report = templateReport({ ...DATE, sample: true });
    const rowsOf = (tab: string) => report.sheets.find((s) => s.name === tab)!.rows;
    expect(rowsOf('Course')).toEqual([
      ['subject', 'Science'],
      ['topic', 'The water cycle'],
      ['grade', '6'],
      ['framework', 'NGSS'],
      [
        'map_objective',
        'Explain how water moves around the Earth in a never-ending cycle, and what powers it.',
      ],
      ['pass_mark', '70'],
    ]);
    expect(rowsOf('Units')).toEqual([
      [
        '1',
        'Water goes up',
        'Describe how heat from the Sun turns liquid water into water vapour.',
        'MS-ESS2-4, MS-PS1-4',
        '2026-10-30',
      ],
    ]);
    const ideas = report.sheets.find((s) => s.name === 'Ideas')!;
    const idea = Object.fromEntries(ideas.header.map((h, i) => [h, ideas.rows[0]![i]]));
    expect(idea).toMatchObject({
      idea_id: 'evap',
      title: 'Evaporation',
      category: 'Process',
      unit: '1',
      objective: 'Explain how heat turns liquid water into vapour.',
      standard_codes: 'MS-ESS2-4, MS-PS1-4',
      requires: '',
      media_url: 'evaporation.mp4',
      rarity: 'auto',
      notes: '',
    });
    expect(rowsOf('Links')).toEqual([
      ['sun', 'evap', 'heats water for', '5', ''],
      ['evap', 'vap', 'turns liquid into', '5', ''],
    ]);
    expect(rowsOf('Categories')).toEqual([
      ['Process', 'arrows-clockwise', 'Something that happens or changes'],
    ]);
    expect(rowsOf('Assessment')).toEqual([
      [
        '1',
        'evap',
        'Why does a puddle disappear on a sunny day?',
        'heat, liquid to gas, vapour rises',
      ],
    ]);
    expect(rowsOf('Personas')[0]!.slice(0, 5)).toEqual([
      'tutor',
      'Ms. Ivy',
      'AI tutor',
      'Students',
      'warm',
    ]);
    expect(rowsOf('Library')).toEqual([['Water cycle unit plan', 'unit-plan.pdf', 'agent']]);
    const ref = await xlsxExport.write(report);
    expect(ref.name).toBe('curriculum-pack-template-sample-2026-10-22.xlsx');
  });

  it('the Read me sheet describes every column from the spec', () => {
    const readMe = templateReport(DATE).sheets[0]!;
    expect(readMe.header).toEqual([
      'Tab',
      'Column',
      'Type',
      'Required',
      'If missing',
      'Edited in',
      'Notes',
    ]);
    for (const spec of PACK_SPEC) {
      for (const c of spec.cols) {
        const row = readMe.rows.find((r) => r[0] === spec.tab && r[1] === c.name);
        expect(row).toEqual([
          spec.tab,
          c.name,
          c.type,
          c.req ? 'Yes' : 'No',
          c.missing,
          expect.any(String),
          c.note || null,
        ]);
      }
    }
  });

  it('as CSV, is a zip of one file per tab that imports the same', async () => {
    const ref = await csvExport.write(templateReport({ ...DATE, sample: true }));
    expect(ref.name).toBe('curriculum-pack-template-sample-2026-10-22.zip');
    const files = unzip(ref.bytes);
    expect([...files.keys()]).toEqual(['Read me.csv', ...PACK_SPEC.map((t) => `${t.tab}.csv`)]);
    expect(files.get('Links.csv')).toBe(
      '﻿from_id,to_id,relation,importance,media_url\r\nsun,evap,heats water for,5,\r\nevap,vap,turns liquid into,5,\r\n',
    );
    const fromCsv = await reimport(ref);
    const fromXlsx = await reimport(
      await xlsxExport.write(templateReport({ ...DATE, sample: true })),
    );
    expect(fromCsv.issues.map((i) => i.code).sort()).toEqual(
      fromXlsx.issues.map((i) => i.code).sort(),
    );
  });
});

describe('pack workbook (C6-F4)', () => {
  it('round-trips the water-cycle pack', async () => {
    const pack = await fixturePack();
    const ref = await xlsxExport.write(packReport(pack, DATE));
    expect(ref.name).toBe('water-cycle-pack-2026-10-22.xlsx');
    const again = await reimport(ref);
    expect(again.ok).toBe(true);
    expect(again.pack).toEqual(pack);
  });

  it('as CSV, round-trips too', async () => {
    const pack = await fixturePack();
    const again = await reimport(await csvExport.write(packReport(pack, DATE)));
    expect(again.pack).toEqual(pack);
  });
});

const HOSTILE = [
  '=HYPERLINK("http://x","click")',
  "+cmd|' /C calc'!A0",
  '-2+3',
  '@SUM(1)',
  '\t=1+1',
  '\r=1+1',
];

describe('formula injection (C6-S1)', () => {
  async function hostilePack(): Promise<Pack> {
    const pack = structuredClone(await fixturePack());
    HOSTILE.slice(0, 4).forEach((title, i) => (pack.ideas[i]!.title = title));
    pack.ideas[4]!.notes = HOSTILE[4]!;
    pack.ideas[5]!.notes = HOSTILE[5]!;
    return pack;
  }

  const payloads = async (): Promise<ExportPayload[]> => {
    const pack = await hostilePack();
    return [
      packReport(pack, DATE),
      dataCheckReport(pack, checkPack(pack), DATE),
      alignmentReport(pack, DATE),
      assessmentDraftsReport(pack.course.topic, [
        { unit: 1, idea_id: 'evap', question: '=1+1', key_points: ['@x'] },
      ]),
    ];
  };

  it('CSV cells that start like a formula get a leading apostrophe', async () => {
    const seen = new Set<string>();
    for (const payload of await payloads()) {
      for (const sheet of payload.sheets) {
        const rows = parseCsv(sheetToCsv(sheet).slice(1), 1e7, 1e4, 'x').rows;
        for (const cell of rows.flat()) {
          // No cell a spreadsheet reads starts with a formula character.
          expect(cell).not.toMatch(/^[=+@\t\r]/);
          if (cell.startsWith('-')) expect(cell).toMatch(/^-\d+(\.\d+)?$/);
          if (cell.startsWith("'")) seen.add(cell.slice(1));
        }
      }
    }
    for (const value of HOSTILE.slice(0, 4)) expect(seen).toContain(value);
  });

  it('XLSX has no formulas, marks formula-like text as text, and round-trips it', async () => {
    for (const payload of await payloads()) {
      const ref = await xlsxExport.write(payload);
      const parts = unzip(ref.bytes);
      for (const [name, text] of parts) {
        if (!name.startsWith('xl/worksheets/')) continue;
        expect(text).not.toMatch(/<f[ >]/);
        // Every formula-like value is a text cell with the quote-prefix style.
        let marked = 0;
        for (const [cell] of text.matchAll(/<c [^>]*>(?:(?!<\/c>)[\s\S])*<\/c>/g)) {
          const value = decodeEntities(/<t[^>]*>([\s\S]*)<\/t>/.exec(cell)?.[1] ?? '');
          if (!needsFormulaEscape(value)) continue;
          expect(cell).toMatch(/ t="inlineStr" s="2"/);
          marked++;
        }
        if (payload.report === 'pack' && name.endsWith('sheet3.xml')) expect(marked).toBe(6);
      }
      expect(parts.get('xl/styles.xml')).toContain('quotePrefix="1"');
    }
    const pack = await hostilePack();
    const again = await reimport(await xlsxExport.write(packReport(pack, DATE)));
    expect(again.pack!.ideas.slice(0, 4).map((i) => i.title)).toEqual(HOSTILE.slice(0, 4));
  });
});

describe('data-check report (C6-F5)', () => {
  it('lists the three sample issues, most serious first, with what to fix', async () => {
    const pack = await fixturePack();
    const issues = checkPack(pack);
    expect(issues.map((i) => i.level)).toEqual(['error', 'warning', 'info']);
    // Shuffle to show the report sorts them itself.
    const report = dataCheckReport(pack, [...issues].reverse(), DATE);
    const ref = await csvExport.write(report);
    expect(ref.name).toBe('water-cycle-data-checks-2026-10-22.csv');
    const [header, ...rows] = csvRows(ref);
    expect(header).toEqual([
      'Level',
      'Check',
      'Message',
      'Ideas affected',
      'Ids',
      'Tab to fix',
      'Column to fix',
    ]);
    expect(rows.map((r) => [r[0], r[1], r[5], r[6]])).toEqual([
      ['Error', 'prereq', 'Ideas', 'requires'],
      ['Warning', 'codes', 'Ideas', 'standard_codes'],
      ['Info', 'media', 'Ideas', 'media_url'],
    ]);
    const titles = new Map(pack.ideas.map((i) => [i.idea_id, i.title]));
    expect(rows[0]![3]).toBe(titles.get('ground'));
    expect(rows[1]![3]).toBe(titles.get('rain'));
    expect(rows[2]![3]!.split('; ')).toHaveLength(11);
    for (const row of rows) expect(row[2]).toBe(issues.find((i) => i.kind === row[1])!.message);
  });

  it('names units by number and name for unit checks', async () => {
    const pack = await fixturePack();
    const issue: DataCheckIssue = {
      kind: 'unit_objective',
      level: 'warning',
      message: 'Unit 1 has no objective.',
      items: ['1'],
      draftable: true,
      fix: { tab: 'Units', column: 'objective' },
    };
    const row = dataCheckReport(pack, [issue], DATE).sheets[0]!.rows[0]!;
    expect(row[3]).toBe(`Unit 1: ${pack.units[0]!.name}`);
  });
});

describe('alignment report (C6-F6)', () => {
  it('lists the ideas and units for each code, then the ideas without codes', async () => {
    const pack = await fixturePack();
    const report = alignmentReport(pack, DATE);
    const ref = await xlsxExport.write(report);
    expect(ref.name).toBe('water-cycle-alignment-2026-10-22.xlsx');
    const sheet = report.sheets[0]!;
    expect(sheet.name).toBe('NGSS alignment');
    expect(sheet.header).toEqual(['NGSS code', 'Number of ideas', 'Ideas', 'Idea ids', 'Units']);

    const codes = [...new Set(pack.ideas.flatMap((i) => i.standard_codes))];
    for (const code of codes) {
      const row = sheet.rows.find((r) => r[0] === code)!;
      const ideas = pack.ideas.filter((i) => i.standard_codes.includes(code));
      expect(row[1]).toBe(ideas.length);
      expect(row[2]).toBe(ideas.map((i) => i.title).join('; '));
      expect(row[3]).toBe(ideas.map((i) => i.idea_id).join(', '));
      const units = new Set([
        ...ideas.map((i) => i.unit),
        ...pack.units.filter((u) => u.standard_codes.includes(code)).map((u) => u.unit),
      ]);
      expect(String(row[4]).split('; ')).toHaveLength(units.size);
    }
    const ess24 = sheet.rows.find((r) => r[0] === 'MS-ESS2-4')!;
    expect(String(ess24[3]).split(', ')).toEqual(
      pack.ideas.filter((i) => i.standard_codes.includes('MS-ESS2-4')).map((i) => i.idea_id),
    );
    const last = sheet.rows.at(-1)!;
    expect(last.slice(0, 4)).toEqual(['No standards code', 1, 'Rain & snow', 'rain']);
  });

  it('is labelled Custom when the course has no framework', async () => {
    const pack = structuredClone(await fixturePack());
    pack.course.framework = null;
    expect(alignmentReport(pack, DATE).sheets[0]!.header[0]).toBe('Custom code');
  });
});

describe('formats (C6-F7, F8, U1, U2)', () => {
  it('every target writes every report, CSV with a BOM and XLSX with a frozen header', async () => {
    const pack = await fixturePack();
    const reports = [
      templateReport(DATE),
      packReport(pack, DATE),
      dataCheckReport(pack, checkPack(pack), DATE),
      alignmentReport(pack, DATE),
    ];
    for (const target of Object.values(EXPORT_TARGETS)) {
      for (const report of reports) {
        const ref = await target.write(report);
        expect(ref.name).toMatch(/^[a-z0-9-]+\.(csv|xlsx|zip)$/);
        if (target.kind === 'xlsx') {
          expect(ref.contentType).toContain('spreadsheetml');
          for (const [name, text] of unzip(ref.bytes)) {
            if (name.startsWith('xl/worksheets/'))
              expect(text).toContain(
                '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>',
              );
          }
          const raw = await workbookSheets(ref);
          expect(raw.issues).toEqual([]);
          expect(raw.sheets.map((s) => s.source.split(' › ')[1])).toEqual(
            report.sheets.map((s) => s.name),
          );
        }
      }
    }
  });

  it('keeps accents in UTF-8', async () => {
    const pack = structuredClone(await fixturePack());
    pack.ideas[0]!.title = 'Évaporation – café';
    const csv = await csvExport.write(alignmentReport(pack, DATE));
    expect(new TextDecoder().decode(csv.bytes)).toContain('Évaporation – café');
    const again = await reimport(await xlsxExport.write(packReport(pack, DATE)));
    expect(again.pack!.ideas[0]!.title).toBe('Évaporation – café');
  });

  it('drops characters XML cannot hold, so the workbook still opens', async () => {
    const pack = structuredClone(await fixturePack());
    pack.ideas[0]!.title = 'Bell\u0007 <b>&amp; \uD800 sound';
    const ref = await xlsxExport.write(packReport(pack, DATE));
    const sheet = unzip(ref.bytes).get('xl/worksheets/sheet3.xml')!;
    expect(sheet).toContain('Bell &lt;b&gt;&amp;amp;  sound');
    const again = await reimport(ref);
    expect(again.pack!.ideas[0]!.title).toBe('Bell <b>&amp;  sound');
  });

  it('file names use the topic and date, with safe characters only', () => {
    expect(fileSlug('The water cycle')).toBe('water-cycle');
    expect(fileSlug('Ünits & Fractions: Part 2/3')).toBe('units-fractions-part-2-3');
    expect(fileSlug('../../etc')).toBe('etc');
    expect(fileSlug('')).toBe('curriculum');
    expect(() => templateReport({ date: '22/10/2026' })).toThrow();
  });
});

describe('Atlas-drafted rows (C6-F9)', () => {
  it('are a CSV with exactly the Assessment columns', async () => {
    const ref = await csvExport.write(
      assessmentDraftsReport(
        'The water cycle',
        [
          {
            unit: 1,
            idea_id: 'evap',
            question: 'Where does a puddle go?',
            key_points: ['heat', 'vapour'],
          },
        ],
        DATE,
      ),
    );
    expect(ref.name).toBe('water-cycle-assessment-drafts-2026-10-22.csv');
    expect(csvRows(ref)).toEqual([
      PACK_SPEC.find((t) => t.tab === 'Assessment')!.cols.map((c) => c.name),
      ['1', 'evap', 'Where does a puddle go?', 'heat, vapour'],
    ]);
  });
});

describe('scope and size (C6-S3, P1, P2)', () => {
  it('exports only curriculum columns', async () => {
    const pack = await fixturePack();
    const all = [
      templateReport(DATE),
      packReport(pack, DATE),
      dataCheckReport(pack, checkPack(pack), DATE),
      alignmentReport(pack, DATE),
    ].flatMap((r) => r.sheets.flatMap((s) => s.header));
    for (const header of all) expect(header).not.toMatch(/student|progress|transcript|email/i);
  });

  it('sample exports take well under 300 ms each', async () => {
    const pack = await fixturePack();
    const issues = checkPack(pack);
    const builds = [
      () => templateReport({ ...DATE, sample: true }),
      () => packReport(pack, DATE),
      () => dataCheckReport(pack, issues, DATE),
      () => alignmentReport(pack, DATE),
    ];
    for (const build of builds) {
      for (const target of [csvExport, xlsxExport]) {
        const start = performance.now();
        await target.write(build());
        expect(performance.now() - start).toBeLessThan(300);
      }
    }
  });

  it('a 2,000-idea pack exports as XLSX in under 5 seconds', async () => {
    const pack = structuredClone(await fixturePack());
    const base = pack.ideas[0]!;
    pack.ideas = Array.from({ length: 2000 }, (_, i) => ({
      ...base,
      idea_id: `idea-${i}`,
      title: `Idea ${i}`,
      standard_codes: [`CODE-${i % 50}`],
      requires: i > 0 ? [`idea-${i - 1}`] : [],
    }));
    pack.links = Array.from({ length: 6000 }, (_, i) => ({
      from_id: `idea-${i % 2000}`,
      to_id: `idea-${(i * 7 + 1) % 2000}`,
      relation: 'leads to',
      importance: 3,
      media_url: null,
    }));
    const start = performance.now();
    const ref = await xlsxExport.write(packReport(pack, DATE));
    await xlsxExport.write(alignmentReport(pack, DATE));
    await xlsxExport.write(dataCheckReport(pack, checkPack(pack), DATE));
    expect(performance.now() - start).toBeLessThan(5000);
    const again = await reimport(ref);
    expect(again.pack!.ideas).toHaveLength(2000);
  });
});
