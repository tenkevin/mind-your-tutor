import { parsePack, type ColumnMapping, type ImportIssue } from '@ideamap/contracts';
import { describe, expect, it } from 'vitest';
import { resolveEffectivePersonas } from '../../ai/src/personas.js';
import {
  CONNECTORS,
  formatImportIssue,
  groupIssuesByTab,
  importPack,
  type ImportResult,
} from './index.js';
import {
  TABS,
  file,
  fixtureBytes,
  fixtureCsvFiles,
  fixtureText,
  parseCsv,
  xlsx,
  zip,
} from './testing/build.js';

const json = () => file('pack.json', fixtureText('pack.json'));
const workbook = () => file('water-cycle.xlsx', fixtureBytes('water-cycle.xlsx'));

/** The fixture CSVs with some files changed or left out. */
function csvFiles(change: Partial<Record<string, ((text: string) => string) | null>> = {}): File[] {
  return TABS.flatMap((tab) => {
    const edit = change[tab];
    if (edit === null) return [];
    const text = fixtureText(`${tab}.csv`);
    return [file(`${tab}.csv`, edit ? edit(text) : text)];
  });
}

const renameHeader = (from: string, to: string) => (text: string) => {
  const [header, ...rest] = text.split('\n');
  return [
    header!
      .split(',')
      .map((h) => (h === from ? to : h))
      .join(','),
    ...rest,
  ].join('\n');
};

/** Edits one cell of a CSV, by data row (0 = first row after the header) and column name. */
const setCell = (row: number, column: string, value: string) => (text: string) => {
  const grid = parseCsv(text, 1e6, 1e3, 'x').rows;
  const c = grid[0]!.indexOf(column);
  grid[row + 1]![c] = value;
  return grid
    .map((cells) =>
      cells.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(','),
    )
    .join('\n');
};

const errors = (r: ImportResult) => r.issues.filter((i) => i.severity === 'error');
const codes = (r: ImportResult) => r.issues.map((i) => i.code);

describe('C1-F1 all three forms give the same pack', () => {
  it('eight CSVs, the workbook and pack.json give deep-equal packs with no issues', async () => {
    const [csv, xl, js] = await Promise.all([
      importPack(fixtureCsvFiles()),
      importPack(workbook()),
      importPack(json()),
    ]);
    for (const r of [csv, xl, js]) {
      expect(r.issues).toEqual([]);
      expect(r.ok).toBe(true);
    }
    expect(csv.pack).toEqual(js.pack);
    expect(xl.pack).toEqual(js.pack);
    expect([csv.kind, xl.kind, js.kind]).toEqual(['csv', 'xlsx', 'json']);
  });

  it('has the fixture counts and Course values', async () => {
    const { pack } = await importPack(workbook());
    expect(pack!.ideas).toHaveLength(23);
    expect(pack!.links).toHaveLength(43);
    expect(pack!.units).toHaveLength(3);
    expect(pack!.categories).toHaveLength(3);
    expect(pack!.assessment).toHaveLength(23);
    expect(pack!.personas).toHaveLength(3);
    expect(pack!.library).toHaveLength(5);
    expect(pack!.course).toEqual({
      subject: 'Science',
      topic: 'The water cycle',
      grade: '6',
      framework: 'NGSS',
      map_objective:
        'Explain how water moves around the Earth in a never-ending cycle, and what powers it.',
      pass_mark: 70,
    });
  });

  it('matches what the F3 contracts give for pack.json', async () => {
    const { pack } = await importPack(fixtureCsvFiles());
    expect(pack).toEqual(parsePack(JSON.parse(fixtureText('pack.json'))).value);
  });

  it('retains blank unit objectives and assessment rows across CSV, XLSX and JSON', async () => {
    const input = JSON.parse(fixtureText('pack.json')) as {
      units: { objective: string | null }[];
      assessment: { question: string | null }[];
    };
    input.units[0]!.objective = null;
    input.assessment[0]!.question = null;
    input.assessment[1]!.question = null;
    const sheets = Object.fromEntries(
      TABS.map((tab) => {
        const rows = parseCsv(fixtureText(`${tab}.csv`), 100_000, 100, tab).rows;
        const header = rows[0]!;
        if (tab === 'Units') rows[1]![header.indexOf('objective')] = '';
        if (tab === 'Assessment') {
          rows[1]![header.indexOf('question')] = '';
          rows[2]![header.indexOf('question')] = '';
        }
        return [tab, rows];
      }),
    );
    const [csv, xl, js] = await Promise.all([
      importPack(
        TABS.map((tab) => {
          let text = fixtureText(`${tab}.csv`);
          if (tab === 'Units') text = setCell(0, 'objective', '')(text);
          if (tab === 'Assessment') {
            text = setCell(0, 'question', '')(text);
            text = setCell(1, 'question', '')(text);
          }
          return file(`${tab}.csv`, text);
        }),
      ),
      importPack(file('water-cycle.xlsx', xlsx(sheets))),
      importPack(file('pack.json', JSON.stringify(input))),
    ]);
    for (const result of [csv, xl, js]) {
      expect(result.ok).toBe(true);
      expect(result.pack!.units[0]!.objective).toBeNull();
      expect(result.pack!.assessment[0]!.question).toBeNull();
      expect(result.pack!.assessment[1]!.question).toBeNull();
    }
    expect(csv.pack).toEqual(js.pack);
    expect(xl.pack).toEqual(js.pack);
  });

  it('keeps the deliberate data problems for C2', async () => {
    const { pack } = await importPack(fixtureCsvFiles());
    const ground = pack!.ideas.find((i) => i.idea_id === 'ground');
    expect(ground!.requires).toContain('aquifer');
    expect(pack!.ideas.find((i) => i.idea_id === 'rain')!.standard_codes).toEqual([]);
    expect(pack!.ideas.filter((i) => i.media_url === null)).toHaveLength(11);
  });

  it('records the mapping it applied', async () => {
    const r = await importPack(fixtureCsvFiles());
    expect(r.mapping).toContainEqual({ tab: 'Ideas', column: 'idea_id', source_column: 'idea_id' });
    expect(r.mapping).toContainEqual({
      tab: 'Course',
      column: 'pass_mark',
      source_column: 'pass_mark',
    });
  });
});

describe('C1-F2 column mapping renames headers', () => {
  const renamed = () =>
    csvFiles({
      Ideas: (t) =>
        renameHeader(
          'idea_id',
          'id',
        )(renameHeader('requires', 'prereqs')(renameHeader('standard_codes', 'ngss')(t))),
    });
  const mapping: ColumnMapping = [
    { tab: 'Ideas', column: 'requires', source_column: 'prereqs' },
    { tab: 'Ideas', column: 'standard_codes', source_column: 'ngss' },
    { tab: 'Ideas', column: 'idea_id', source_column: 'id' },
  ];

  it('gives the same pack with a mapping for the renamed columns', async () => {
    const [mapped, reference] = await Promise.all([
      importPack(renamed(), { mapping }),
      importPack(json()),
    ]);
    expect(errors(mapped)).toEqual([]);
    expect(mapped.pack).toEqual(reference.pack);
    expect(mapped.mapping).toContainEqual({
      tab: 'Ideas',
      column: 'requires',
      source_column: 'prereqs',
    });
  });

  it('applies the mapping to an XLSX sheet and to JSON keys too', async () => {
    const pack = JSON.parse(fixtureText('pack.json')) as { ideas: Record<string, unknown>[] };
    pack.ideas = pack.ideas.map(({ requires, ...rest }) => ({ ...rest, prereqs: requires }));
    const r = await importPack(file('pack.json', JSON.stringify(pack)), {
      mapping: [{ tab: 'Ideas', column: 'requires', source_column: 'prereqs' }],
    });
    expect(r.pack).toEqual((await importPack(json())).pack);
  });

  it('without a mapping, names the missing required column and its tab', async () => {
    const r = await importPack(renamed());
    expect(r.ok).toBe(false);
    expect(r.pack).toBeNull();
    const missing = errors(r).filter((i) => i.code === 'column_missing');
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ tab: 'Ideas', column: 'idea_id', source: 'Ideas.csv' });
    expect(missing[0]!.message).toMatch(/Ideas tab has no idea_id column/);
  });

  it('reports a mapping to a column that is not there', async () => {
    const r = await importPack(fixtureCsvFiles(), {
      mapping: [{ tab: 'Ideas', column: 'requires', source_column: 'prereqs' }],
    });
    expect(r.ok).toBe(true);
    expect(r.issues.find((i) => i.code === 'mapping_invalid')!.message).toMatch(
      /no column called that/,
    );
  });

  it('refuses a mapping that gives two sources for one column', async () => {
    const r = await importPack(fixtureCsvFiles(), {
      mapping: [
        { tab: 'Ideas', column: 'title', source_column: 'title' },
        { tab: 'Ideas', column: 'title', source_column: 'notes' },
      ],
    });
    expect(r.ok).toBe(false);
    expect(errors(r)[0]!.code).toBe('mapping_invalid');
  });
});

describe('C1-F3 header matching is forgiving', () => {
  it('matches Idea ID, " TITLE " and Standard Codes', async () => {
    const r = await importPack(
      csvFiles({
        Ideas: (t) =>
          renameHeader(
            'standard_codes',
            'Standard Codes',
          )(renameHeader('title', ' TITLE ')(renameHeader('idea_id', 'Idea ID')(t))),
      }),
    );
    expect(r.issues).toEqual([]);
    expect(r.pack).toEqual((await importPack(json())).pack);
    expect(r.mapping).toContainEqual({ tab: 'Ideas', column: 'idea_id', source_column: 'Idea ID' });
    expect(r.mapping).toContainEqual({ tab: 'Ideas', column: 'title', source_column: 'TITLE' });
  });

  it('reports an ambiguous match and never guesses', async () => {
    const r = await importPack(
      csvFiles({
        Ideas: (t) =>
          t
            .split('\n')
            .map((line, i) => (line === '' ? line : `${line},${i === 0 ? 'Idea ID' : 'x'}`))
            .join('\n'),
      }),
    );
    expect(r.ok).toBe(false);
    const ambiguous = errors(r).filter((i) => i.code === 'column_ambiguous');
    expect(ambiguous).toHaveLength(1);
    expect(ambiguous[0]).toMatchObject({ tab: 'Ideas', column: 'idea_id' });
    expect(ambiguous[0]!.message).toMatch(/'idea_id' \(column A\) and 'Idea ID' \(column M\)/);
    // The ambiguity is the only error: it isn't also reported as missing.
    expect(errors(r)).toHaveLength(1);
  });
});

describe('C1-F4 Course is read as key/value', () => {
  const shuffled =
    'key,value\npass_mark,70\ngrade,6\n,\nmap_objective,"Explain how water moves around the Earth in a never-ending cycle, and what powers it."\nframework,NGSS\ntopic,The water cycle\nsubject,Science\nteacher,Ms. Lee\n';

  it('gives the same Course with keys in another order and a blank row; unknown keys warn', async () => {
    const reference = (await importPack(json())).pack!.course;
    const csv = await importPack(csvFiles({ Course: () => shuffled }));
    const sheet = await importPack(
      file(
        'course.xlsx',
        xlsx({
          Course: [
            ['key', 'value'],
            ['grade', 6],
            [null, null],
            ['Subject', 'Science'],
            ['topic', 'The water cycle'],
            ['teacher', 'Ms. Lee'],
          ],
        }),
      ),
    );
    expect(csv.pack!.course).toEqual(reference);
    const unknown = csv.issues.filter((i) => i.severity === 'warning' && i.tab === 'Course');
    expect(unknown).toHaveLength(1);
    expect(unknown[0]).toMatchObject({ row: 9, value: 'teacher' });
    // The workbook has only Course, so it fails for other tabs, but Course is read the same way.
    expect(sheet.issues.some((i) => i.tab === 'Course' && i.severity === 'error')).toBe(false);
    expect(sheet.issues.find((i) => i.tab === 'Course' && i.severity === 'warning')).toMatchObject({
      row: 6,
      value: 'teacher',
    });
  });

  it('also reads key/value rows with no header, and one row of keys over values', async () => {
    const reference = (await importPack(json())).pack!.course;
    const noHeader = await importPack(
      csvFiles({ Course: (t) => t.split('\n').slice(1).join('\n') }),
    );
    expect(noHeader.pack!.course).toEqual(reference);
    const wide = await importPack(
      csvFiles({
        Course: () =>
          'subject,topic,grade,framework,map_objective,pass_mark\nScience,The water cycle,6,NGSS,"Explain how water moves around the Earth in a never-ending cycle, and what powers it.",70\n',
      }),
    );
    expect(wide.pack!.course).toEqual(reference);
  });

  it('maps Course keys through the column mapping', async () => {
    const r = await importPack(
      csvFiles({ Course: (t) => t.replace('pass_mark,70', 'Passing score,70') }),
      {
        mapping: [{ tab: 'Course', column: 'pass_mark', source_column: 'Passing score' }],
      },
    );
    expect(r.issues).toEqual([]);
    expect(r.pack!.course.pass_mark).toBe(70);
  });
});

describe('C1-F6 missing-value behaviour follows the spec', () => {
  it('a missing required Ideas column blocks the import with a clear error', async () => {
    const r = await importPack(
      csvFiles({
        Ideas: (t) =>
          t
            .split('\n')
            .map((line) => line.split(',').slice(1).join(','))
            .join('\n'),
      }),
    );
    expect(r.ok).toBe(false);
    expect(errors(r)).toHaveLength(1);
    expect(formatImportIssue(errors(r)[0]!)).toBe(
      "Ideas.csv · Ideas, row 1, idea_id: The Ideas tab has no idea_id column, and the import can't go ahead without it. Add the column, or map one of your columns to idea_id in Column mapping.",
    );
  });

  it('skips a Links row with a blank relation, with a warning naming its row; blank importance becomes 3', async () => {
    const r = await importPack(
      csvFiles({ Links: (t) => setCell(4, 'importance', '')(setCell(2, 'relation', '')(t)) }),
    );
    expect(r.ok).toBe(true);
    expect(r.pack!.links).toHaveLength(42);
    const skipped = r.issues.filter((i) => i.effect === 'skips_row');
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({
      severity: 'warning',
      tab: 'Links',
      row: 4,
      column: 'relation',
      source: 'Links.csv',
    });
    expect(skipped[0]!.message).toBe('relation is missing, so this row will be skipped.');
    const fifth = parseCsv(fixtureText('Links.csv'), 1e6, 1e3, 'x').rows[5]!;
    expect(
      r.pack!.links.find((l) => l.from_id === fifth[0] && l.to_id === fifth[1])!.importance,
    ).toBe(3);
  });

  it('an invalid optional value warns and uses the spec default', async () => {
    const r = await importPack(csvFiles({ Ideas: setCell(0, 'rarity', 'Epic') }));
    expect(r.ok).toBe(true);
    expect(r.pack!.ideas[0]!.rarity).toBe('auto');
    expect(r.issues[0]).toMatchObject({
      severity: 'warning',
      effect: 'uses_fallback',
      row: 2,
      column: 'rarity',
      value: 'Epic',
    });
    expect(r.issues[0]!.message).toMatch(/The import uses the default instead: auto\./);
  });

  it('a blank category uses the first category; a blank unit name shows "Unit n"', async () => {
    const r = await importPack(
      csvFiles({ Ideas: setCell(0, 'category', ''), Units: setCell(1, 'name', '') }),
    );
    expect(r.ok).toBe(true);
    expect(r.pack!.ideas[0]!.category).toBe('Process');
    expect(r.pack!.units[1]!.name).toBe('Unit 2');
    expect(r.issues.map((i) => i.severity)).toEqual(['warning', 'warning']);
  });

  it('blank optional questions and objectives are retained; title and persona defaults are reported', async () => {
    const r = await importPack(
      csvFiles({
        Assessment: setCell(0, 'question', ''),
        Library: setCell(0, 'title', ''),
        Personas: setCell(1, 'name', ''),
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.pack!.assessment).toHaveLength(23);
    expect(r.pack!.assessment[0]!.question).toBeNull();
    expect(r.pack!.library[0]!.title).toBe('Water cycle unit plan');
    expect(r.pack!.personas).toHaveLength(3);
    expect(r.pack!.personas[1]).toMatchObject({ persona_id: 'peer', name: null });
    expect(r.issues.map((i) => [i.tab, i.effect])).toEqual([
      ['Personas', 'uses_fallback'],
      ['Library', 'uses_fallback'],
    ]);
    const blankObjective = await importPack(csvFiles({ Units: setCell(0, 'objective', '') }));
    expect(blankObjective.ok).toBe(true);
    expect(blankObjective.pack!.units[0]!.objective).toBeNull();
  });

  it('imports partial persona overrides for AI resolution without dropping their explicit values', async () => {
    const edit = setCell(
      1,
      'name',
      '',
    )(
      setCell(
        1,
        'role',
        '',
      )(
        setCell(
          1,
          'tone',
          'socratic',
        )(setCell(1, 'prompt_template', '')(fixtureText('Personas.csv'))),
      ),
    );
    const result = await importPack(csvFiles({ Personas: () => edit }));
    expect(result.ok).toBe(true);
    const peer = result.pack!.personas.find((persona) => persona.persona_id === 'peer')!;
    expect(peer).toMatchObject({ name: null, role: null, tone: 'socratic', prompt_template: null });

    const resolved = resolveEffectivePersonas(result.pack!.personas).find(
      (persona) => persona.persona_id === 'peer',
    );
    expect(resolved).toMatchObject({
      name: 'Milo',
      role: 'Virtual classmate',
      tone: 'socratic',
      prompt_template: expect.stringContaining('{peerAge}'),
    });
  });

  it('imports a peer-only Personas tab and resolves the remaining built-ins', async () => {
    const rows = parseCsv(fixtureText('Personas.csv'), 1000, 20, 'Personas').rows;
    const header = rows[0]!;
    const peer = rows.find((row) => row[header.indexOf('persona_id')] === 'peer')!;
    peer[header.indexOf('name')] = 'Mia';
    const csv = [header, peer]
      .map((row) =>
        row.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(','),
      )
      .join('\n');
    const result = await importPack(csvFiles({ Personas: () => csv }));
    expect(result.ok).toBe(true);
    expect(resolveEffectivePersonas(result.pack!.personas).map((persona) => persona.name)).toEqual([
      'Ms. Ivy',
      'Mia',
      'Atlas',
    ]);
  });

  it('an invalid pass_mark warns and uses 70', async () => {
    const r = await importPack(
      csvFiles({ Course: (t) => t.replace('pass_mark,70', 'pass_mark,150') }),
    );
    expect(r.pack!.course.pass_mark).toBe(70);
    expect(r.issues[0]).toMatchObject({
      severity: 'warning',
      tab: 'Course',
      row: 7,
      column: 'pass_mark',
    });
  });
});

describe('C1-F7 missing optional tabs do not block', () => {
  it('without Personas, Library and Categories: empty personas, empty library, one category "Idea"', async () => {
    const r = await importPack(csvFiles({ Personas: null, Library: null, Categories: null }));
    expect(r.ok).toBe(true);
    expect(r.pack!.personas).toEqual([]);
    expect(r.pack!.library).toEqual([]);
    expect(r.pack!.categories).toEqual([{ category: 'Idea', icon: null, description: null }]);
    const notes = r.issues.filter((i) => i.code === 'tab_default');
    expect(notes.map((i) => [i.severity, i.tab])).toEqual([
      ['info', 'Categories'],
      ['info', 'Personas'],
      ['info', 'Library'],
    ]);
    expect(r.issues.every((i) => i.severity === 'info')).toBe(true);
    expect(notes.find((i) => i.tab === 'Personas')!.message).toContain(
      'Using the built-in personas',
    );
  });

  it('a missing core tab blocks', async () => {
    const r = await importPack(csvFiles({ Links: null }));
    expect(r.ok).toBe(false);
    expect(errors(r).map((i) => [i.code, i.tab])).toEqual([['tab_missing', 'Links']]);
  });
});

describe('C1-F8 CSV upload as a zip and as separate files', () => {
  it('a zip of the eight CSVs gives the same pack; names match ignoring case', async () => {
    const zipped = zip(
      TABS.map((tab) => ({
        name: `pack/${tab.toUpperCase()}.CSV`,
        data: fixtureText(`${tab}.csv`),
      })),
    );
    const [z, reference] = await Promise.all([
      importPack(file('pack.zip', zipped)),
      importPack(json()),
    ]);
    expect(z.issues).toEqual([]);
    expect(z.pack).toEqual(reference.pack);
    expect(z.kind).toBe('csv');
  });

  it('separate files match by name ignoring case, including Google Sheets names', async () => {
    const files = TABS.map((tab, i) =>
      file(
        i % 2 ? `${tab.toLowerCase()}.csv` : `Water cycle - ${tab}.csv`,
        fixtureText(`${tab}.csv`),
      ),
    );
    expect((await importPack(files)).pack).toEqual((await importPack(json())).pack);
  });

  it('two files for one tab are reported', async () => {
    const r = await importPack([
      ...fixtureCsvFiles(),
      file('ideas (1).csv', fixtureText('Ideas.csv')),
    ]);
    expect(errors(r).map((i) => i.code)).toEqual(['tab_duplicate']);
  });
});

describe('C1-F9 extra columns are kept out of the pack', () => {
  it('teacher_scribbles is not in the pack and is reported once', async () => {
    const r = await importPack(
      csvFiles({
        Ideas: (t) =>
          t
            .split('\n')
            .map((line, i) =>
              line === '' ? line : `${line},${i === 0 ? 'teacher_scribbles' : 'remember to check'}`,
            )
            .join('\n'),
      }),
    );
    expect(r.pack).toEqual((await importPack(json())).pack);
    expect(r.pack!.ideas.some((i) => 'teacher_scribbles' in i)).toBe(false);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({
      severity: 'info',
      code: 'column_ignored',
      column: 'teacher_scribbles',
      tab: 'Ideas',
    });
    expect(r.issues[0]!.message).toMatch(/left out of the pack/);
  });

  it('a __proto__ header never reaches the pack or the prototype', async () => {
    const r = await importPack(
      csvFiles({
        Ideas: (t) =>
          t.replace('idea_id,', '__proto__,idea_id,').replace(/\n(?=.)/g, '\n{"polluted":1},'),
      }),
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(r.pack!.ideas[0]).not.toHaveProperty('__proto__', expect.anything());
    expect(Object.keys(r.pack!.ideas[0]!)).not.toContain('__proto__');
  });
});

describe('C1-F10 connector interface matches §7', () => {
  it('each connector has kind, accepts and parse(file)', async () => {
    expect(CONNECTORS.map((c) => c.kind)).toEqual(['xlsx', 'csv', 'json']);
    const raw = await CONNECTORS[0]!.parse(workbook());
    expect(raw.kind).toBe('xlsx');
    expect(raw.sheets.map((s) => s.tab)).toEqual(TABS);
    expect(CONNECTORS[0]!.accepts(fixtureBytes('water-cycle.xlsx'))).toBe(true);
    expect(CONNECTORS[1]!.accepts(fixtureBytes('Ideas.csv'))).toBe(true);
    expect(CONNECTORS[2]!.accepts(fixtureBytes('pack.json'))).toBe(true);
  });
});

describe('C1-U1 problems point to the cell', () => {
  it('names the file or sheet, tab, row, column and value in plain English', async () => {
    const r = await importPack(
      file(
        'water-cycle.xlsx',
        xlsx({
          Course: [
            ['key', 'value'],
            ['subject', 'Science'],
            ['topic', 'Water'],
            ['grade', 6],
          ],
          Units: [
            ['unit', 'name', 'objective'],
            ['one', 'Water goes up', 'Describe evaporation.'],
          ],
          Ideas: [
            ['idea_id', 'title', 'category', 'unit'],
            ['evap', 'Evaporation', 'Process', 1],
          ],
          Links: [
            ['from_id', 'to_id', 'relation'],
            ['evap', 'vap', ''],
          ],
        }),
      ),
    );
    const unit = r.issues.find((i) => i.column === 'unit')!;
    expect(formatImportIssue(unit)).toBe(
      "water-cycle.xlsx › Units · Units, row 2, unit: unit must be a whole number of 1 or more, like 1 (got 'one').",
    );
    const relation = r.issues.find((i) => i.column === 'relation')!;
    expect(formatImportIssue(relation)).toBe(
      'water-cycle.xlsx › Links · Links, row 2, relation: relation is missing, so this row will be skipped.',
    );
    for (const issue of r.issues)
      expect(issue.message).not.toMatch(/Invalid input|expected .* received/);
  });
});

describe('C1-U2 a wrong file says what was expected', () => {
  it('a spreadsheet with no matching tabs gives one message listing the eight tabs', async () => {
    const r = await importPack(
      file(
        'budget.xlsx',
        xlsx({
          Sheet1: [
            ['item', 'cost'],
            ['pens', 3],
          ],
          Expenses: [['a']],
        }),
      ),
    );
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]!.code).toBe('no_tabs');
    expect(r.issues[0]!.message).toContain(
      'Course, Units, Ideas, Links, Categories, Assessment, Personas, Library',
    );
    expect(r.issues[0]!.message).toMatch(/Curriculum Pack template/);
  });

  it('a JSON file with none of the tabs gives the same single message', async () => {
    const r = await importPack(file('data.json', '{"rows":[1,2,3]}'));
    expect(r.issues.map((i) => i.code)).toEqual(['no_tabs']);
  });

  it('a random CSV gives the same single message', async () => {
    const r = await importPack(file('grades.csv', 'name,score\nAva,9\n'));
    expect(r.issues.map((i) => i.code)).toEqual(['no_tabs']);
  });
});

describe('C1-U3 all problems are returned together', () => {
  it('5 problems across 3 tabs come back at once, grouped by tab, blocking first', async () => {
    const r = await importPack(
      csvFiles({
        Ideas: (t) => setCell(3, 'rarity', 'Epic')(setCell(1, 'unit', 'two')(t)),
        Links: (t) => setCell(0, 'importance', '9')(setCell(5, 'relation', '')(t)),
        Personas: setCell(0, 'tone', 'angry'),
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.issues).toHaveLength(5);
    expect(r.issues[0]).toMatchObject({ severity: 'error', tab: 'Ideas', row: 3, column: 'unit' });
    const ranks = r.issues.map((i) => ({ error: 0, warning: 1, info: 2 })[i.severity]);
    expect(ranks).toEqual([...ranks].sort());
    const groups = groupIssuesByTab(r.issues);
    expect(groups.map((g) => [g.tab, g.issues.length])).toEqual([
      ['Ideas', 2],
      ['Links', 2],
      ['Personas', 1],
    ]);
    expect(groups[0]!.issues[0]!.severity).toBe('error');
  });
});

describe('C1-U4 mapping suggestions', () => {
  it('near-miss headers get a suggested mapping that is not applied', async () => {
    const r = await importPack(
      csvFiles({
        Ideas: (t) =>
          renameHeader('standard_codes', 'standard')(renameHeader('requires', 'requirement')(t)),
      }),
    );
    expect(r.suggestions).toEqual(
      expect.arrayContaining([
        { tab: 'Ideas', column: 'requires', source_column: 'requirement' },
        { tab: 'Ideas', column: 'standard_codes', source_column: 'standard' },
      ]),
    );
    // Not applied: the pack has no prerequisites until the teacher confirms.
    expect(r.pack!.ideas.every((i) => i.requires.length === 0)).toBe(true);
    const suggestion = r.issues.find((i: ImportIssue) => i.code === 'mapping_suggestion')!;
    expect(suggestion.severity).toBe('info');
    expect(suggestion.message).toMatch(/confirm it in Column mapping/);
    // Confirming the suggestions gives the original pack.
    const confirmed = await importPack(
      csvFiles({
        Ideas: (t) =>
          renameHeader('standard_codes', 'standard')(renameHeader('requires', 'requirement')(t)),
      }),
      { mapping: r.suggestions },
    );
    expect(confirmed.pack).toEqual((await importPack(json())).pack);
  });

  it('suggests idea_id for an "id" header', async () => {
    const r = await importPack(csvFiles({ Ideas: renameHeader('idea_id', 'id') }));
    expect(r.suggestions).toContainEqual({ tab: 'Ideas', column: 'idea_id', source_column: 'id' });
    expect(codes(r)).toContain('column_missing');
  });
});
