import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PackStrictSchema, parsePack, parsePackTables, type Pack } from './index.js';
import { readCsvTables, readPackJson, readXlsxTables } from './testing/fixtures.js';

describe('the water-cycle pack parses in every form (F3-F3)', () => {
  it('JSON, CSV and XLSX parse with no issues to deep-equal packs', async () => {
    const json = parsePack(readPackJson());
    const csvTables = readCsvTables();
    const csv = parsePackTables(csvTables.tables, { rowNumbers: csvTables.rowNumbers });
    const xlsxTables = await readXlsxTables();
    const xlsx = parsePackTables(xlsxTables.tables, { rowNumbers: xlsxTables.rowNumbers });

    for (const result of [json, csv, xlsx]) {
      expect(result.issues).toEqual([]);
      expect(result.ok).toBe(true);
    }
    expect(csv.value).toEqual(json.value);
    expect(xlsx.value).toEqual(json.value);
  });

  it('has the counts the fixture README gives', () => {
    const pack = parsePack(readPackJson()).value as Pack;
    expect(pack.ideas).toHaveLength(18);
    expect(pack.links).toHaveLength(31);
    expect(pack.units).toHaveLength(3);
    expect(pack.categories).toHaveLength(3);
    expect(pack.assessment).toHaveLength(18);
    expect(pack.personas).toHaveLength(3);
    expect(pack.library).toHaveLength(5);
    expect(pack.practice).toHaveLength(5);
  });

  it('keeps the deliberate data problems for C2', () => {
    const pack = parsePack(readPackJson()).value as Pack;
    const byId = new Map(pack.ideas.map((i) => [i.idea_id, i]));
    expect(byId.get('ground')?.requires).toContain('aquifer');
    expect(byId.get('rain')?.standard_codes).toEqual([]);
    expect(pack.ideas.filter((i) => i.media_url === null)).toHaveLength(11);
    // pack.json writes empty notes as "", which comes out as null like an empty cell.
    expect(pack.ideas.every((i) => i.notes === null)).toBe(true);
  });
});

describe('generated JSON Schema (F3-F11)', () => {
  const jsonSchema = z.toJSONSchema(PackStrictSchema, { io: 'input', target: 'draft-2020-12' });

  it('validates pack.json', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(jsonSchema);
    const valid = validate(readPackJson());
    expect(validate.errors ?? []).toEqual([]);
    expect(valid).toBe(true);
  });

  it('rejects a pack with a bad slug', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(jsonSchema);
    const pack = readPackJson() as { ideas: { idea_id: string }[] };
    pack.ideas[0]!.idea_id = 'Not A Slug';
    expect(validate(pack)).toBe(false);
  });
});

// Packs for the performance checks.
function syntheticPack(ideas: number, links: number, questions: number) {
  const pack = readPackJson() as Record<string, unknown>;
  const id = (i: number) => `idea-${i}`;
  pack.ideas = Array.from({ length: ideas }, (_, i) => ({
    idea_id: id(i),
    title: `Idea ${i}`,
    category: 'Process',
    unit: (i % 3) + 1,
    objective: `I can explain idea ${i}.`,
    standard_codes: 'MS-ESS2-4, MS-PS1-4',
    requires: i > 0 ? id(i - 1) : '',
    media_url: i % 2 ? `idea-${i}.mp4` : '',
    rarity: 'auto',
    notes: '',
    explanation: `Idea ${i} explained for students.`,
  }));
  pack.links = Array.from({ length: links }, (_, i) => ({
    from_id: id(i % ideas),
    to_id: id((i * 7 + 1) % ideas),
    relation: 'leads to',
    importance: String((i % 5) + 1),
    media_url: '',
  }));
  pack.assessment = Array.from({ length: questions }, (_, i) => ({
    unit: (i % 3) + 1,
    idea_id: id(i % ideas),
    question: `What do you know about idea ${i}?`,
    key_points: 'one point, another point',
  }));
  return pack;
}

describe('performance', () => {
  it('parses pack.json in well under 20 ms (median of 100) (F3-P1)', () => {
    const input = readPackJson();
    parsePack(input);
    const times: number[] = [];
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      const result = parsePack(input);
      times.push(performance.now() - start);
      expect(result.ok).toBe(true);
    }
    times.sort((a, b) => a - b);
    expect(times[50]).toBeLessThan(20);
  });

  it('parses 2,000 ideas, 6,000 links and 2,000 questions in under a second (F3-P2)', () => {
    const input = syntheticPack(2000, 6000, 2000);
    const start = performance.now();
    const result = parsePack(input);
    const elapsed = performance.now() - start;
    expect(result.issues).toEqual([]);
    expect(result.value?.links).toHaveLength(6000);
    expect(elapsed).toBeLessThan(1000);
  });
});
