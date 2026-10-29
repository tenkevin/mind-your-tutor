import { describe, expect, it } from 'vitest';
import { importPack, looseName, matchTab, parseCsv, similarity } from './index.js';
import { TABS, file, fixtureText } from './testing/build.js';

describe('parseCsv', () => {
  it('reads quoted cells, doubled quotes and both line ends', () => {
    const grid = parseCsv('a,b\r\n"x, y","say ""hi"""\n"two\nlines",z', 100, 10, 'x');
    expect(grid.rows).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['two\nlines', 'z'],
    ]);
    expect(grid.rowNumbers).toEqual([1, 2, 3]);
    expect(grid.unclosedQuoteAt).toBeNull();
  });

  it('numbers rows as records, so a multi-line cell does not shift later rows', () => {
    expect(parseCsv('h\n"a\nb"\nc\n', 100, 10, 'x').rowNumbers).toEqual([1, 2, 3]);
  });

  it('reads a quote in the middle of a cell literally', () => {
    expect(parseCsv('a\n5" ruler\n', 100, 10, 'x').rows[1]).toEqual(['5" ruler']);
  });

  it('notes an unclosed quote', () => {
    expect(parseCsv('a\n"open\nmore', 100, 10, 'x').unclosedQuoteAt).toBe(2);
  });

  it('refuses too many columns', () => {
    expect(() => parseCsv(`${'a,'.repeat(300)}a\n`, 100, 200, 'Ideas.csv')).toThrow(
      /more than 200 columns/,
    );
  });

  it('bounds headers and quoted or unquoted data cells before keeping their text', () => {
    expect(() =>
      parseCsv(`${'h'.repeat(5)}\n`, 100, 10, 'Ideas.csv', { maxHeaderChars: 4 }),
    ).toThrow(/Ideas\.csv has a header longer than 4 characters/);
    expect(() => parseCsv('h\n123456\n', 100, 10, 'Ideas.csv', { maxCellChars: 5 })).toThrow(
      /Ideas\.csv has a cell longer than 5 characters/,
    );
    expect(() => parseCsv('h\n"123456"\n', 100, 10, 'Ideas.csv', { maxCellChars: 5 })).toThrow(
      /Ideas\.csv has a cell longer than 5 characters/,
    );
    expect(parseCsv('h\n"ab""cd"\n', 100, 10, 'Ideas.csv', { maxCellChars: 5 }).rows[1]).toEqual([
      'ab"cd',
    ]);
  });

  it('caps the first nonblank logical header and does not treat headerless Course values as headers', async () => {
    expect(() =>
      parseCsv(`\n\n${'h'.repeat(5)}\n`, 100, 10, 'Ideas.csv', { maxHeaderChars: 4 }),
    ).toThrow(/Ideas\.csv has a header longer than 4 characters/);

    const files = TABS.map((tab) => {
      let text = fixtureText(`${tab}.csv`);
      if (tab === 'Course') text = text.replace('key,value\n', '');
      if (tab === 'Units') text = `\n\n${text}`;
      return file(`${tab}.csv`, text);
    });
    const result = await importPack(files);
    expect(result.ok).toBe(true);
    expect(result.pack!.course.subject).toBe('Science');
  });

  it('an unclosed quote in an upload is a warning on its row', async () => {
    const ideas = `${fixtureText('Ideas.csv').trimEnd()}\nbroken,"Broken,Process,1\n`;
    const r = await importPack(
      TABS.map((tab) => file(`${tab}.csv`, tab === 'Ideas' ? ideas : fixtureText(`${tab}.csv`))),
    );
    expect(r.issues.find((i) => i.code === 'csv_quote')).toMatchObject({
      severity: 'warning',
      tab: 'Ideas',
      row: 25,
    });
  });
});

describe('names', () => {
  it('looseName ignores case, spaces, underscores, hyphens and invisible characters', () => {
    expect(looseName(' Idea ID ')).toBe('ideaid');
    expect(looseName('idea_id')).toBe('ideaid');
    expect(looseName('\ufeffIdea-Id\u200b')).toBe('ideaid');
  });

  it('matchTab takes the tab from file and sheet names', () => {
    expect(matchTab('Ideas.csv')).toBe('Ideas');
    expect(matchTab('IDEAS')).toBe('Ideas');
    expect(matchTab('Water cycle - Links.csv')).toBe('Links');
    expect(matchTab('pack_assessment.csv')).toBe('Assessment');
    expect(matchTab('Course (2).csv')).toBe('Course');
    expect(matchTab('folder/Units.CSV')).toBe('Units');
    expect(matchTab('Sheet1')).toBeNull();
    expect(matchTab('Ideas backup.csv')).toBeNull();
  });

  it('similarity scores near misses but not unrelated headers', () => {
    expect(similarity('requirement', 'requires')).toBeGreaterThan(0);
    expect(similarity('standard', 'standard_codes')).toBeGreaterThan(0);
    expect(similarity('prereqs', 'requires')).toBe(3);
    expect(similarity('titel', 'title')).toBeGreaterThan(0);
    expect(similarity('teacher_scribbles', 'requires')).toBe(0);
    expect(similarity('colour', 'category')).toBe(0);
  });
});
