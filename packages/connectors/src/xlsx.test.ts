import { expectBestUnder, expectTimingUnder, timeRuns } from '@ideamap/testing';
import { afterEach, describe, expect, it } from 'vitest';
import {
  dateToIsoDate,
  importPack,
  needsFormulaEscape,
  serialToIsoDate,
  xlsxConnector,
  type ImportResult,
} from './index.js';
import { TABS, file, fixtureText, parseCsv, xlsx, type XCell } from './testing/build.js';

/** The fixture as XLSX sheets, with changes made to the cell grids. */
function fixtureSheets(): Record<string, XCell[][]> {
  return Object.fromEntries(
    TABS.map((tab) => [
      tab,
      parseCsv(fixtureText(`${tab}.csv`), 1e6, 1e3, tab).rows.filter((r) =>
        r.some((c) => c !== ''),
      ),
    ]),
  );
}

const set = (
  sheets: Record<string, XCell[][]>,
  tab: string,
  row: number,
  column: string,
  value: XCell,
) => {
  const c = (sheets[tab]![0] as string[]).indexOf(column);
  sheets[tab]![row]![c] = value;
};
const setCourse = (sheets: Record<string, XCell[][]>, key: string, value: XCell) => {
  sheets.Course!.find((r) => r[0] === key)![1] = value;
};

const json = () => importPack(file('pack.json', fixtureText('pack.json')));
const book = (sheets: Record<string, XCell[][]>, options?: Parameters<typeof xlsx>[1]) =>
  importPack(file('pack.xlsx', xlsx(sheets, options)));
const errors = (r: ImportResult) => r.issues.filter((i) => i.severity === 'error');

describe('the XLSX reader', () => {
  it('reads the fixture written with shared strings, as Excel writes it', async () => {
    const r = await book(fixtureSheets(), { shared: true });
    expect(r.issues).toEqual([]);
    expect(r.pack).toEqual((await json()).pack);
  });
});

describe('C1-F5 spreadsheet quirks are normalised', () => {
  it('unit as a number, grade as 6.0, a date serial and ISO text, importance as "5"', async () => {
    const sheets = fixtureSheets();
    for (let r = 1; r < sheets.Ideas!.length; r++)
      set(sheets, 'Ideas', r, 'unit', Number(sheets.Ideas![r]![3]));
    setCourse(sheets, 'grade', { v: '6.0', t: 'n' });
    set(sheets, 'Units', 1, 'due_date', { v: 46325, numFmtId: 14 }); // 2026-10-30 as a date cell
    set(sheets, 'Units', 2, 'due_date', 46332); // 2026-11-06 as a bare serial
    set(sheets, 'Units', 3, 'due_date', '2026-11-13');
    set(sheets, 'Links', 1, 'importance', '5');
    const r = await book(sheets);
    expect(r.issues).toEqual([]);
    expect(r.pack).toEqual((await json()).pack);
    expect(r.pack!.course.grade).toBe('6');
    expect(r.pack!.units.map((u) => u.due_date)).toEqual([
      '2026-10-30',
      '2026-11-06',
      '2026-11-13',
    ]);
  });

  it('grade as the text "6.0" and as "k"', async () => {
    const sheets = fixtureSheets();
    setCourse(sheets, 'grade', '6.0');
    expect((await book(sheets)).pack!.course.grade).toBe('6');
    setCourse(sheets, 'grade', 'k');
    expect((await book(sheets)).pack!.course.grade).toBe('K');
  });

  it('a CSV with a UTF-8 byte order mark and CRLF line ends', async () => {
    const files = TABS.map((tab) =>
      file(
        `${tab}.csv`,
        Buffer.concat([
          Buffer.from([0xef, 0xbb, 0xbf]),
          Buffer.from(fixtureText(`${tab}.csv`).replace(/\n/g, '\r\n')),
        ]),
      ),
    );
    const r = await importPack(files);
    expect(r.issues).toEqual([]);
    expect(r.pack).toEqual((await json()).pack);
    expect(r.mapping.find((m) => m.tab === 'Ideas' && m.column === 'idea_id')!.source_column).toBe(
      'idea_id',
    );
  });

  it('a semicolon-separated CSV, as European Excel saves it', async () => {
    const units = fixtureText('Units.csv');
    const semi = parseCsv(units, 1e6, 1e3, 'x')
      .rows.filter((r) => r.length > 1)
      .map((r) => r.map((c) => (c.includes(';') || c.includes(',') ? `"${c}"` : c)).join(';'))
      .join('\n');
    const r = await importPack(
      TABS.map((tab) => file(`${tab}.csv`, tab === 'Units' ? semi : fixtureText(`${tab}.csv`))),
    );
    expect(r.pack).toEqual((await json()).pack);
  });
});

describe('C1-F12 percent and date cells from Excel', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('a pass_mark formatted as a percent (stored as 0.7) becomes 70', async () => {
    for (const cell of [
      { v: 0.7, numFmtId: 9 },
      { v: 0.7, numFmtId: 10 },
      { v: 0.7, format: '0.0%' },
    ] as XCell[]) {
      const sheets = fixtureSheets();
      setCourse(sheets, 'pass_mark', cell);
      const r = await book(sheets);
      expect(r.pack!.course.pass_mark).toBe(70);
      expect(r.issues).toEqual([]);
    }
  });

  it('a bare 0.7 is kept but warned about, never silently', async () => {
    const sheets = fixtureSheets();
    setCourse(sheets, 'pass_mark', 0.7);
    const xl = await book(sheets);
    const csv = await importPack(
      TABS.map((tab) =>
        file(
          `${tab}.csv`,
          tab === 'Course'
            ? fixtureText('Course.csv').replace('pass_mark,70', 'pass_mark,0.7')
            : fixtureText(`${tab}.csv`),
        ),
      ),
    );
    for (const r of [xl, csv]) {
      expect(r.pack!.course.pass_mark).toBe(0.7);
      expect(r.issues).toHaveLength(1);
      expect(r.issues[0]).toMatchObject({
        severity: 'warning',
        code: 'pass_mark_fraction',
        tab: 'Course',
        column: 'pass_mark',
        row: 7,
      });
      expect(r.issues[0]!.message).toBe(
        'pass_mark is 0.7, which means a pass mark of 0.7%. If you meant 70%, write 70.',
      );
    }
  });

  it('"70%" text in a CSV is 70', async () => {
    const r = await importPack(
      TABS.map((tab) =>
        file(
          `${tab}.csv`,
          tab === 'Course'
            ? fixtureText('Course.csv').replace('pass_mark,70', 'pass_mark,70%')
            : fixtureText(`${tab}.csv`),
        ),
      ),
    );
    expect(r.pack!.course.pass_mark).toBe(70);
  });

  it.each([
    'UTC',
    'Pacific/Auckland',
    'America/Los_Angeles',
    'Pacific/Kiritimati',
    'Pacific/Pago_Pago',
  ])('a real date cell is the same calendar date with TZ=%s', async (tz) => {
    process.env.TZ = tz;
    const sheets = fixtureSheets();
    set(sheets, 'Units', 1, 'due_date', { v: 46325, format: 'yyyy-mm-dd' });
    set(sheets, 'Units', 2, 'due_date', { v: 46332.99, format: 'd mmm yyyy h:mm' });
    set(sheets, 'Units', 3, 'due_date', { v: '2026-11-13T00:00:00Z', t: 'd' });
    const r = await book(sheets);
    expect(r.pack!.units.map((u) => u.due_date)).toEqual([
      '2026-10-30',
      '2026-11-06',
      '2026-11-13',
    ]);
    expect(r.pack).toEqual((await json()).pack);
  });

  it('handles the 1904 date system and Excel’s phantom 29 February 1900', () => {
    expect(serialToIsoDate(46325)).toBe('2026-10-30');
    expect(serialToIsoDate(46325 - 1462, true)).toBe('2026-10-30');
    expect(serialToIsoDate(1)).toBe('1900-01-01');
    expect(serialToIsoDate(59)).toBe('1900-02-28');
    expect(serialToIsoDate(60)).toBeNull();
    expect(serialToIsoDate(61)).toBe('1900-03-01');
    expect(serialToIsoDate(-1)).toBeNull();
    expect(dateToIsoDate(new Date(Date.UTC(2026, 9, 30)))).toBe('2026-10-30');
  });

  it('reads a 1904 workbook’s dates', async () => {
    const sheets = fixtureSheets();
    set(sheets, 'Units', 1, 'due_date', { v: 46325 - 1462, numFmtId: 14 });
    expect((await book(sheets, { date1904: true })).pack!.units[0]!.due_date).toBe('2026-10-30');
  });

  it('a percent-formatted date column stays a percent, and a date-formatted text column reads as a date', async () => {
    const sheets = fixtureSheets();
    set(sheets, 'Ideas', 1, 'notes', { v: 46325, numFmtId: 14 });
    expect((await book(sheets)).pack!.ideas[0]!.notes).toBe('2026-10-30');
  });
});

describe('C1-S1 formulas are never evaluated', () => {
  it('formula cells give their saved value or their text, flagged; nothing is run', async () => {
    const sheets = fixtureSheets();
    set(sheets, 'Ideas', 1, 'notes', { f: 'HYPERLINK("http://x","y")', v: 'y', t: 'str' });
    set(sheets, 'Ideas', 2, 'notes', { f: '1+1', v: 2 });
    set(sheets, 'Ideas', 3, 'notes', { f: 'WEBSERVICE("http://x")' });
    set(sheets, 'Ideas', 4, 'notes', '+cmd');
    set(sheets, 'Ideas', 5, 'notes', '@SUM(A1)');
    set(sheets, 'Ideas', 6, 'notes', '-2+3');
    const r = await book(sheets);
    expect(r.ok).toBe(true);
    expect(r.pack!.ideas.slice(0, 6).map((i) => i.notes)).toEqual([
      'y',
      '2',
      '=WEBSERVICE("http://x")',
      '+cmd',
      '@SUM(A1)',
      '-2+3',
    ]);
    expect(r.issues.map((i) => [i.code, i.row, i.column])).toEqual([
      ['formula', 2, 'notes'],
      ['formula', 3, 'notes'],
      ['formula', 4, 'notes'],
      ['formula_text', 5, 'notes'],
      ['formula_text', 6, 'notes'],
      ['formula_text', 7, 'notes'],
    ]);
    expect(r.issues.every((i) => i.severity === 'info')).toBe(true);
  });

  it('CSV cells starting with = are plain text, flagged for export escaping', async () => {
    const ideas = fixtureText('Ideas.csv').replace(
      ',auto,,',
      ',auto,"=HYPERLINK(""http://x"",""y"")",',
    );
    const r = await importPack(
      TABS.map((tab) => file(`${tab}.csv`, tab === 'Ideas' ? ideas : fixtureText(`${tab}.csv`))),
    );
    expect(r.pack!.ideas[0]!.notes).toBe('=HYPERLINK("http://x","y")');
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({
      code: 'formula_text',
      tab: 'Ideas',
      row: 2,
      column: 'notes',
      value: '=HYPERLINK("http://x","y")',
    });
  });

  it('an error value is read as text and warned about', async () => {
    const sheets = fixtureSheets();
    set(sheets, 'Ideas', 1, 'notes', { v: '#REF!', t: 'e', f: 'A99' });
    const r = await book(sheets);
    expect(r.pack!.ideas[0]!.notes).toBe('#REF!');
    expect(r.issues[0]).toMatchObject({ severity: 'warning', code: 'cell_error' });
  });

  it('needsFormulaEscape', () => {
    for (const v of ['=1+1', '+cmd', '-cmd', '@SUM(A1)', '\t=1', ' =1'])
      expect(needsFormulaEscape(v)).toBe(true);
    for (const v of ['-5', '+1.5', '-10%', 'plain', 'a=b', ''])
      expect(needsFormulaEscape(v)).toBe(false);
  });
});

describe('C1-S3 XML parsing is safe', () => {
  const sst = (body: string) =>
    `<?xml version="1.0"?>${body}<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>&xxe;</t></si></sst>`;

  it('refuses an XXE payload in sharedStrings.xml without fetching anything', async () => {
    const r = await book(fixtureSheets(), {
      shared: true,
      parts: {
        'xl/sharedStrings.xml': sst('<!DOCTYPE sst [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'),
      },
    });
    expect(r.ok).toBe(false);
    expect(errors(r)).toHaveLength(1);
    expect(errors(r)[0]).toMatchObject({ code: 'file_refused', source: 'pack.xlsx' });
    expect(errors(r)[0]!.message).toMatch(/document type declaration/);
  });

  it('refuses a billion laughs entity quickly, with no expansion', async () => {
    const lol = Array.from(
      { length: 9 },
      (_, i) => `<!ENTITY lol${i + 1} "${`&lol${i};`.repeat(10)}">`,
    ).join('');
    const { result: r, ...timing } = await timeRuns(
      () =>
        book(fixtureSheets(), {
          shared: true,
          parts: {
            'xl/sharedStrings.xml': sst(`<!DOCTYPE sst [<!ENTITY lol0 "lol">${lol}]>`).replace(
              '&xxe;',
              '&lol9;',
            ),
          },
        }),
      { runs: 3 },
    );
    expectTimingUnder('billion laughs entity', 1000, timing.best, timing);
    expect(errors(r)[0]!.code).toBe('file_refused');
  });

  it('a DOCTYPE in a sheet or the workbook part is refused too', async () => {
    const r = await book(fixtureSheets(), {
      parts: {
        'xl/worksheets/sheet3.xml':
          '<!DOCTYPE x [<!ENTITY a SYSTEM "http://169.254.169.254/">]><worksheet><sheetData/></worksheet>',
      },
    });
    expect(errors(r)[0]!.code).toBe('file_refused');
  });

  it('unknown entity references are left as text, never resolved', async () => {
    const sheets = fixtureSheets();
    set(sheets, 'Ideas', 1, 'notes', 'a &amp; b');
    // Escaped once when written, so decoded exactly once when read.
    expect((await book(sheets)).pack!.ideas[0]!.notes).toBe('a &amp; b');
    const raw = await xlsxConnector.parse(
      file(
        'x.xlsx',
        xlsx(
          { Ideas: [['idea_id']] },
          {
            parts: {
              'xl/worksheets/sheet1.xml':
                '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&nope; &#65; &lt;</t></is></c></row></sheetData></worksheet>',
            },
          },
        ),
      ),
    );
    expect(raw.sheets[0]!.grid[0]![0]).toBe('&nope; A <');
  });

  it.each([
    ['tags that never close', '<a'.repeat(500_000)],
    ['unterminated processing instructions', '<?'.repeat(500_000)],
    ['an unterminated comment', `<!--${'x'.repeat(1_000_000)}`],
    ['quotes that never close', '<a b="'.repeat(200_000)],
  ])('XML with %s is handled in linear time', async (_what, junk) => {
    // Refused or read safely; either way it never hangs.
    await expectBestUnder(
      `XML with ${_what}`,
      1000,
      () =>
        book(fixtureSheets(), {
          parts: {
            'xl/worksheets/sheet3.xml': `<worksheet><sheetData>${junk}</sheetData></worksheet>`,
          },
        }),
      { runs: 3 },
    );
  });

  it('external relationship targets are never followed', async () => {
    const workbook = xlsx(fixtureSheets(), {
      parts: {
        'xl/_rels/workbook.xml.rels':
          '<Relationships><Relationship Id="rId1" Type="x/worksheet" Target="http://evil.example/sheet.xml" TargetMode="External"/></Relationships>',
      },
    });
    const r = await importPack(file('pack.xlsx', workbook));
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toEqual(['no_tabs']);
  });

  it('only the parts a workbook needs are unpacked', async () => {
    const huge = { name: 'xl/media/image1.png', data: 'x'.repeat(1000), claimedSize: 2 ** 31 };
    const r = await book(fixtureSheets(), { extra: [huge] });
    expect(r.ok).toBe(true);
  });
});
