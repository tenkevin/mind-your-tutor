import { describe, expect, it } from 'vitest';
import {
  PackIssueSchema,
  PROMPT_VARIABLES,
  isSafeMediaRef,
  parsePack,
  parseTabRow,
  tableFromGrid,
  unknownPromptVariables,
} from './index.js';
import { readPackJson } from './testing/fixtures.js';

const idea = { idea_id: 'evap', title: 'Evaporation', category: 'Process', unit: 1 };

describe('unknown keys are stripped (F3-S1)', () => {
  it('drops extra keys, including __proto__, constructor and prototype', () => {
    const row = JSON.parse(
      '{"idea_id":"evap","title":"Evaporation","category":"Process","unit":1,' +
        '"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},' +
        '"prototype":{"polluted":true},"extra":"x"}',
    );
    const result = parseTabRow('Ideas', row);
    expect(result.ok).toBe(true);
    const value = result.value as object;
    for (const key of ['__proto__', 'constructor', 'prototype', 'extra']) {
      expect(Object.hasOwn(value, key), key).toBe(false);
    }
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('does the same for a whole pack and for sheet headers', () => {
    const pack = readPackJson() as Record<string, unknown>;
    const polluted = JSON.parse(
      JSON.stringify(pack).replace('{"version":1,', '{"version":1,"__proto__":{"polluted":true},'),
    );
    const result = parsePack(polluted);
    expect(result.ok).toBe(true);
    expect(Object.hasOwn(result.value!, '__proto__')).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    const table = tableFromGrid([
      ['idea_id', 'title', 'category', 'unit', '__proto__'],
      ['evap', 'Evaporation', 'Process', 1, 'x'],
    ]);
    expect(Object.getPrototypeOf(table.rows[0])).toBe(Object.prototype);
    const parsed = parseTabRow('Ideas', table.rows[0]);
    expect(parsed.ok).toBe(true);
    expect(Object.hasOwn(parsed.value!, '__proto__')).toBe(false);
  });
});

describe('text length limits (F3-S2)', () => {
  const huge = 'x'.repeat(1024 * 1024);
  it.each([
    ['Ideas', 'title', 200],
    ['Ideas', 'explanation', 2000],
    ['Assessment', 'question', 1000],
    ['Personas', 'prompt_template', 8000],
    ['Units', 'objective', 1000],
    ['Ideas', 'objective', 1000],
  ] as const)('%s.%s is capped at %i characters', (tab, column, max) => {
    const base = {
      Ideas: idea,
      Assessment: { unit: 1, idea_id: 'evap', question: 'Why?' },
      Personas: { persona_id: 'tutor', name: 'Ms. Ivy' },
      Units: { unit: 1, name: 'Water goes up', objective: 'Describe.' },
    }[tab];
    expect(parseTabRow(tab, { ...base, [column]: 'x'.repeat(max) }).ok).toBe(true);
    const result = parseTabRow(tab, { ...base, [column]: huge }, 3);
    expect(result.ok).toBe(false);
    expect(result.issues[0]!.message).toBe(
      `${column} is too long: it can have at most ${max.toLocaleString('en')} characters (got 1,048,576).`,
    );
    // The issue keeps a short excerpt, not the megabyte.
    expect(String(result.issues[0]!.value).length).toBeLessThan(300);
  });
});

describe('URL fields refuse dangerous schemes (F3-S3)', () => {
  const unsafe = [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'javascript: alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'http://ok.example/v.mp4',
    'ftp://example.com/x',
    '//evil.example/x.mp4',
    '/etc/passwd',
    '../secret.mp4',
    'media/../../x.mp4',
    'C:\\media\\x.mp4',
    'https://',
  ];
  const safe = [
    'https://ok.example/v.mp4',
    'evaporation.mp4',
    'Water cycle unit plan.pdf',
    'Lab: evaporation in a jar.docx',
    'media/evaporation.mp4',
  ];
  it.each(unsafe)('refuses %j', (value) => {
    expect(isSafeMediaRef(value.trim())).toBe(false);
    expect(parseTabRow('Ideas', { ...idea, media_url: value }).ok).toBe(false);
    expect(
      parseTabRow('Links', { from_id: 'a', to_id: 'b', relation: 'r', media_url: value }).ok,
    ).toBe(false);
    expect(parseTabRow('Library', { title: 'Plan', file_url: value }).ok).toBe(false);
  });
  it.each(safe)('accepts %j', (value) => {
    expect(parseTabRow('Ideas', { ...idea, media_url: value }).ok).toBe(true);
    expect(parseTabRow('Library', { title: 'Plan', file_url: value }).ok).toBe(true);
  });
});

describe('ids are safe slugs (F3-S4)', () => {
  it.each(['evap', 'water-cycle', 'a', '2nd-law', 'x'.repeat(64)])('accepts %j', (id) => {
    expect(parseTabRow('Ideas', { ...idea, idea_id: id }).ok).toBe(true);
  });
  it.each(['Evap', 'a b', '../x', '<script>', 'x'.repeat(65), 'x'.repeat(101), '-x', 'é', 'a_b'])(
    'refuses %j',
    (id) => {
      expect(parseTabRow('Ideas', { ...idea, idea_id: id }).ok).toBe(false);
      expect(parseTabRow('Links', { from_id: id, to_id: 'evap', relation: 'r' }).ok).toBe(false);
      expect(parseTabRow('Assessment', { unit: 1, idea_id: id, question: 'Q?' }).ok).toBe(false);
      expect(parseTabRow('Ideas', { ...idea, requires: ['evap', id] }).ok).toBe(false);
    },
  );
});

describe('prompt templates use known variables (F3-S5)', () => {
  const persona = { persona_id: 'tutor', name: 'Ms. Ivy' };
  it('accepts the spec variables', () => {
    const template = PROMPT_VARIABLES.map((v) => `{${v}}`).join(' ');
    const result = parseTabRow('Personas', { ...persona, prompt_template: template });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });
  it('warns about an unknown variable without failing the row', () => {
    const result = parseTabRow(
      'Personas',
      { ...persona, prompt_template: 'Hi {name}, tell me your {password}.' },
      4,
    );
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([
      expect.objectContaining({
        severity: 'warning',
        effect: 'none',
        tab: 'Personas',
        row: 4,
        column: 'prompt_template',
        value: '{password}',
      }),
    ]);
    expect(result.issues[0]!.message).toContain('{password}');
    expect(unknownPromptVariables('{ name } {Name} {}')).toEqual(['Name', '']);
  });
  it('keeps the warning short enough to store with a version', () => {
    const template = Array.from({ length: 500 }, (_, i) => `{var${i}}`).join(' ');
    const result = parseTabRow('Personas', { ...persona, prompt_template: template });
    expect(result.issues).toHaveLength(1);
    expect(PackIssueSchema.safeParse(result.issues[0]).success).toBe(true);
    expect(result.issues[0]!.message).toContain('and 495 more');
  });
  it('reports prompt warnings from a whole pack', () => {
    const pack = readPackJson() as { personas: { prompt_template: string }[] };
    pack.personas[1]!.prompt_template += ' {secret}';
    const result = parsePack(pack);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([
      expect.objectContaining({ severity: 'warning', tab: 'Personas', row: 3, value: '{secret}' }),
    ]);
  });
});

describe('parsing is synchronous (F3-P3)', () => {
  it('parse() returns a value, not a promise', () => {
    const result = parsePack(readPackJson());
    expect(result).not.toBeInstanceOf(Promise);
    expect(result.ok).toBe(true);
  });
});
