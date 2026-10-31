import { readdirSync, readFileSync } from 'node:fs';
import { constants, crc32, deflateRawSync, inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { expectTimingUnder, summarize, timeRuns } from '@ideamap/testing';
import { importPack, type ImportResult } from './index.js';
import { TABS, file, fixtureBytes, fixtureText, xlsx, zip, type XCell } from './testing/build.js';

// Best of three runs: the budgets are about the code, not a loaded runner (F1e).
const timed = async (run: () => Promise<ImportResult>) => {
  const t = await timeRuns(run, { runs: 3 });
  const label = expect.getState().currentTestName ?? 'import';
  return { result: t.result, ms: t.best, timing: t, label };
};

const refusal = (r: ImportResult) => {
  expect(r.ok).toBe(false);
  expect(r.pack).toBeNull();
  const errors = r.issues.filter((i) => i.severity === 'error');
  expect(errors).toHaveLength(1);
  expect(errors[0]!.code).toBe('file_refused');
  return errors[0]!.message;
};

/**
 * Raw deflate of `mb` megabytes of zeros, made without compressing them all: a
 * full-flushed block is byte-aligned and needs no earlier data, so copies of one
 * block followed by an empty final block are a valid stream.
 */
function deflatedZeros(mb: number): { data: Uint8Array; crc: number } {
  const chunk = Buffer.alloc(1024 * 1024);
  const block = deflateRawSync(chunk, {
    level: constants.Z_BEST_COMPRESSION,
    finishFlush: constants.Z_FULL_FLUSH,
  });
  let crc = 0;
  for (let i = 0; i < mb; i++) crc = crc32(chunk, crc);
  const data = Buffer.concat([
    ...Array.from({ length: mb }, () => block),
    deflateRawSync(Buffer.alloc(0)),
  ]);
  return { data, crc };
}

it('the test zip bomb is a valid deflate stream of the size it claims', () => {
  const { data } = deflatedZeros(3);
  expect(inflateRawSync(data).length).toBe(3 * 1024 * 1024);
});

describe('C1-S2 oversized and malicious files are refused (and C1-P3: fast)', () => {
  it('a 60 MB CSV', async () => {
    const big = new File([Buffer.alloc(60 * 1024 * 1024, 'a,b\n')], 'Ideas.csv');
    const { result, ms, timing, label } = await timed(() => importPack(big));
    expect(refusal(result)).toBe(
      'Ideas.csv is 60 MB; the most an import accepts is 10 MB per file.',
    );
    expectTimingUnder(label, 2000, ms, timing, 'best');
  });

  it('a zip bomb (about 1 MB that unpacks to 1 GB), whatever its headers claim', async () => {
    const bomb = deflatedZeros(1024);
    expect(bomb.data.length).toBeLessThan(1.1 * 1024 * 1024);
    for (const claimedSize of [1024 * 1024 * 1024, 1000]) {
      const archive = zip([{ name: 'Ideas.csv', data: '', deflated: bomb, claimedSize }]);
      const { result, ms, timing, label } = await timed(() =>
        importPack(file('pack.zip', archive)),
      );
      expect(refusal(result)).toMatch(/unpacks to more than 100 MB/);
      expectTimingUnder(label, 2000, ms, timing, 'best');
    }
  }, 30_000);

  it('a workbook whose parts add up past the unpack budget', async () => {
    const part = deflatedZeros(60);
    // Two 60 MB parts: each fits, together they don't.
    const bombed = zip([
      { name: '[Content_Types].xml', data: '<Types/>' },
      {
        name: 'xl/workbook.xml',
        data: '<workbook><sheets><sheet name="Course" r:id="rId1"/><sheet name="Units" r:id="rId2"/></sheets></workbook>',
      },
      {
        name: 'xl/_rels/workbook.xml.rels',
        data: '<Relationships><Relationship Id="rId1" Type="x/worksheet" Target="worksheets/a.xml"/><Relationship Id="rId2" Type="x/worksheet" Target="worksheets/b.xml"/></Relationships>',
      },
      { name: 'xl/worksheets/a.xml', data: '', deflated: part, claimedSize: 60 * 1024 * 1024 },
      { name: 'xl/worksheets/b.xml', data: '', deflated: part, claimedSize: 60 * 1024 * 1024 },
    ]);
    const { result, ms, timing, label } = await timed(() => importPack(file('big.xlsx', bombed)));
    expect(refusal(result)).toMatch(/unpacks to more than 100 MB/);
    expectTimingUnder(label, 2000, ms, timing, 'best');
  }, 30_000);

  it('preflights aggregate declared ZIP output before reading any entry', async () => {
    const archive = zip([
      { name: 'Ideas.csv', data: 'h', claimedSize: 60 * 1024 * 1024 },
      { name: 'Units.csv', data: 'h', claimedSize: 60 * 1024 * 1024 },
    ]);
    const { result, ms, timing, label } = await timed(() =>
      importPack(file('declared.zip', archive)),
    );
    expect(refusal(result)).toMatch(/zip unpacks to more than 100 MB based on its declared sizes/);
    expectTimingUnder(label, 2000, ms, timing, 'best');
  });

  it('detects many duplicate canonical tabs before checking their payloads', async () => {
    const archive = zip(
      Array.from({ length: 100 }, (_, i) => ({
        name: `part${i}/Ideas.csv`,
        data: Buffer.alloc(1024),
      })),
    );
    const { result, ms, timing, label } = await timed(() =>
      importPack(file('duplicates.zip', archive)),
    );
    expect(result.ok).toBe(false);
    expect(result.issues.filter((issue) => issue.code === 'tab_duplicate')).toHaveLength(99);
    expect(result.issues.some((issue) => issue.code === 'file_refused')).toBe(false);
    expectTimingUnder(label, 2000, ms, timing, 'best');
  });

  it('an XLSX with 1,000,000 rows', async () => {
    const rows = Array.from(
      { length: 1_000_000 },
      (_, i) => `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c></row>`,
    ).join('');
    const workbook = xlsx(
      { Ideas: [['idea_id']] },
      {
        parts: {
          'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${rows}</sheetData></worksheet>`,
        },
      },
    );
    expect(workbook.length).toBeLessThan(10 * 1024 * 1024);
    const { result, ms, timing, label } = await timed(() =>
      importPack(file('rows.xlsx', workbook)),
    );
    expect(refusal(result)).toBe(
      'rows.xlsx › Ideas has more than 50,000 rows; the most a tab can have is 50,000.',
    );
    expectTimingUnder(label, 2000, ms, timing, 'best');
  }, 30_000);

  it('a CSV with more than 50,000 rows', async () => {
    const csv = `idea_id\n${'a\n'.repeat(60_000)}`;
    const { result, ms, timing, label } = await timed(() => importPack(file('Ideas.csv', csv)));
    expect(refusal(result)).toMatch(/Ideas\.csv has more than 50,000 rows/);
    expectTimingUnder(label, 2000, ms, timing, 'best');
  });

  it('a pack JSON tab with more than 50,000 rows', async () => {
    const pack = JSON.parse(fixtureText('pack.json')) as { links: unknown[] };
    pack.links = Array.from({ length: 50_001 }, () => ({
      from_id: 'a',
      to_id: 'b',
      relation: 'r',
    }));
    expect(refusal(await importPack(file('pack.json', JSON.stringify(pack))))).toMatch(
      /more than 50,000 rows/,
    );
  });

  it('a tab over its contract row cap is refused before its rows are parsed', async () => {
    const pack = JSON.parse(fixtureText('pack.json')) as { links: unknown[] };
    pack.links = Array.from({ length: 30_000 }, () => ({
      from_id: 'a',
      to_id: 'b',
      relation: 'r',
    }));
    const { result, ms, timing, label } = await timed(() =>
      importPack(file('pack.json', JSON.stringify(pack))),
    );
    expect(result.issues.filter((i) => i.severity === 'error').map((i) => i.message)).toEqual([
      'The Links tab has 30,000 rows; the most it can have is 20,000.',
    ]);
    expectTimingUnder(label, 500, ms, timing, 'best');
  });

  it('a .xlsm with macros', async () => {
    const sheets = Object.fromEntries(TABS.map((t) => [t, [['x']]])) as Record<string, XCell[][]>;
    const macro = xlsx(sheets, { extra: [{ name: 'xl/vbaProject.bin', data: 'VBA' }] });
    expect(refusal(await importPack(file('pack.xlsm', macro)))).toMatch(/contains macros/);
    // The same workbook named .xlsx is still refused: type comes from content.
    expect(refusal(await importPack(file('pack.xlsx', macro)))).toMatch(/contains macros/);
    const flagged = xlsx(sheets, {
      contentTypes:
        '<Types><Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/></Types>',
    });
    expect(refusal(await importPack(file('pack.xlsx', flagged)))).toMatch(/macro-enabled/);
  });

  it('a file named .xlsx that is really a PNG', async () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(100),
    ]);
    expect(refusal(await importPack(file('pack.xlsx', png)))).toBe(
      'pack.xlsx is a PNG image, not a spreadsheet. Upload the pack as an .xlsx workbook, as CSV files (one per tab, or zipped), or as pack JSON.',
    );
  });

  it('other look-alikes: an old .xls, binary data, an empty file, a broken zip, bad JSON', async () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    expect(refusal(await importPack(file('pack.xls', ole)))).toMatch(/older Excel file/);
    expect(refusal(await importPack(file('Ideas.csv', Buffer.from([1, 2, 0, 3]))))).toMatch(
      /isn't a text or spreadsheet file/,
    );
    expect(refusal(await importPack(file('Ideas.csv', '')))).toBe('Ideas.csv is empty.');
    expect(refusal(await importPack(file('pack.xlsx', Buffer.from('PK\x03\x04garbage'))))).toMatch(
      /damaged or unsupported zip/,
    );
    expect(refusal(await importPack(file('pack.json', '{"version":1,')))).toMatch(
      /isn't valid JSON/,
    );
  });

  it('a CSV named .xlsx is read as CSV', async () => {
    const r = await importPack(
      TABS.map((tab) =>
        file(tab === 'Ideas' ? 'Ideas.xlsx' : `${tab}.csv`, fixtureText(`${tab}.csv`)),
      ),
    );
    expect(r.ok).toBe(true);
  });

  it('a corrupted entry fails its checksum', async () => {
    const archive = Buffer.from(
      zip(
        TABS.map((tab) => ({ name: `${tab}.csv`, data: fixtureText(`${tab}.csv`), store: true })),
      ),
    );
    archive[40] = archive[40]! ^ 0xff;
    expect(refusal(await importPack(file('pack.zip', archive)))).toMatch(/checksum/);
  });

  it('too many files at once', async () => {
    const files = Array.from({ length: 21 }, (_, i) => file(`f${i}.csv`, 'a'));
    expect(refusal(await importPack(files))).toMatch(/21 files were uploaded; the most is 20/);
  });

  it('a refused file does not hide problems in the others', async () => {
    const files = TABS.map((tab) =>
      file(
        `${tab}.csv`,
        tab === 'Library' ? Buffer.from([0x89, 0x50, 0x4e, 0x47]) : fixtureText(`${tab}.csv`),
      ),
    );
    const r = await importPack(files);
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toMatchObject({ code: 'file_refused', source: 'Library.csv' });
  });
});

describe('C1-S4 zip paths cannot escape', () => {
  it('entries with ../ or absolute paths are skipped, and the rest imports', async () => {
    const archive = zip([
      ...TABS.map((tab) => ({ name: `${tab}.csv`, data: fixtureText(`${tab}.csv`) })),
      { name: '../../etc/passwd', data: 'root:x:0:0' },
      { name: '/etc/passwd', data: 'root:x:0:0' },
      { name: 'C:/Windows/evil.csv', data: 'x' },
      { name: '../../Ideas.csv', data: 'idea_id\nevil\n' },
    ]);
    const r = await importPack(file('pack.zip', archive));
    expect(r.ok).toBe(true);
    expect(r.pack!.ideas).toHaveLength(18);
    const skipped = r.issues.filter((i) => i.code === 'tab_ignored' && i.severity === 'warning');
    expect(skipped.map((i) => i.source)).toEqual([
      'pack.zip › ../../etc/passwd',
      'pack.zip › /etc/passwd',
      'pack.zip › C:/Windows/evil.csv',
      'pack.zip › ../../Ideas.csv',
    ]);
  });

  it('nothing in the import code can write to disk', () => {
    const dir = new URL('./', import.meta.url);
    const sources = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(sources.length).toBeGreaterThan(5);
    for (const name of sources) {
      const text = readFileSync(new URL(name, dir), 'utf8');
      expect(text, name).not.toMatch(
        /from 'node:(fs|child_process|net|http|https)'|from '(fs|child_process)'|\bfetch\(/,
      );
    }
  });
});

describe('C1-P1 the sample is fast', () => {
  const median = (values: number[]) =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

  it.each([
    ['CSV', () => TABS.map((tab) => file(`${tab}.csv`, fixtureText(`${tab}.csv`)))],
    ['XLSX', () => [file('water-cycle.xlsx', fixtureBytes('water-cycle.xlsx'))]],
    ['JSON', () => [file('pack.json', fixtureText('pack.json'))]],
  ])('%s: median of 20 imports is under 200 ms', async (form, files) => {
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t = await timeRuns(() => importPack(files()), { runs: 1 });
      expect(t.result.ok).toBe(true);
      times.push(t.best);
    }
    expectTimingUnder(`${form} sample import`, 200, median(times), summarize(times), 'median');
  });
});

describe('C1-P2 a large workbook scales', () => {
  it('2,000 ideas, 6,000 links and 2,000 assessment rows in under 3 seconds', async () => {
    const id = (i: number) => `idea-${i}`;
    const sheets: Record<string, XCell[][]> = {
      Course: [
        ['key', 'value'],
        ['subject', 'Science'],
        ['topic', 'Big map'],
        ['grade', 6],
      ],
      Units: [
        ['unit', 'name', 'objective'],
        [1, 'One', 'Do one.'],
        [2, 'Two', 'Do two.'],
        [3, 'Three', 'Do three.'],
      ],
      Ideas: [
        [
          'idea_id',
          'title',
          'category',
          'unit',
          'objective',
          'standard_codes',
          'requires',
          'media_url',
          'explanation',
        ],
        ...Array.from({ length: 2000 }, (_, i): XCell[] => [
          id(i),
          `Idea ${i}`,
          'Process',
          (i % 3) + 1,
          `I can explain idea ${i}.`,
          'MS-ESS2-4, MS-PS1-4',
          i > 0 ? id(i - 1) : null,
          i % 2 ? `idea-${i}.mp4` : null,
          `Idea ${i} explained for students.`,
        ]),
      ],
      Links: [
        ['from_id', 'to_id', 'relation', 'importance'],
        ...Array.from({ length: 6000 }, (_, i): XCell[] => [
          id(i % 2000),
          id((i * 7 + 1) % 2000),
          'leads to',
          (i % 5) + 1,
        ]),
      ],
      Categories: [
        ['category', 'icon'],
        ['Process', 'drop'],
      ],
      Assessment: [
        ['unit', 'idea_id', 'question', 'key_points'],
        ...Array.from({ length: 2000 }, (_, i): XCell[] => [
          (i % 3) + 1,
          id(i),
          `What is idea ${i}?`,
          'one point, another point',
        ]),
      ],
    };
    const workbook = file('big.xlsx', xlsx(sheets, { shared: true }));
    const before = process.memoryUsage().heapUsed;
    const { result, ms, timing, label } = await timed(() => importPack(workbook));
    const grew = process.memoryUsage().heapUsed - before;
    expect(result.ok).toBe(true);
    expect(result.pack!.ideas).toHaveLength(2000);
    expect(result.pack!.links).toHaveLength(6000);
    expect(result.pack!.assessment).toHaveLength(2000);
    expectTimingUnder(label, 3000, ms, timing, 'best');
    expect(grew).toBeLessThan(256 * 1024 * 1024);
  }, 30_000);
});
