import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PACK_SPEC, TAB_NAMES, TAB_SCHEMAS, packageName } from './index.js';

const fieldsJson = JSON.parse(
  readFileSync(new URL('../../../docs/spec/curriculum-pack.fields.json', import.meta.url), 'utf8'),
) as {
  tab: string;
  kind: string;
  desc: string;
  cols: { name: string; type: string; req: boolean; edit: string; missing: string; note: string }[];
}[];

describe('PACK_SPEC mirrors docs/spec/curriculum-pack.fields.json', () => {
  it('is the published package', () => {
    expect(packageName).toBe('@ideamap/contracts');
  });

  it('has the same tabs in the same order', () => {
    expect(PACK_SPEC.map((t) => t.tab)).toEqual(fieldsJson.map((t) => t.tab));
    expect([...TAB_NAMES]).toEqual(fieldsJson.map((t) => t.tab));
  });

  it.each(fieldsJson.map((t) => [t.tab, t] as const))('%s matches field for field', (_, tab) => {
    const spec = PACK_SPEC.find((t) => t.tab === tab.tab)!;
    expect(spec.kind).toBe(tab.kind);
    expect(spec.desc).toBe(tab.desc);
    const ours = spec.cols.map(({ name, type, req, edit, missing, note }) => ({
      name,
      type,
      req,
      edit,
      missing,
      note,
    }));
    const theirs = tab.cols.map(({ name, type, req, edit, missing, note }) => ({
      name,
      type,
      req,
      edit,
      missing,
      note,
    }));
    expect(ours).toEqual(theirs);
  });
});

describe('tab schemas follow the spec (F3-F1, F3-U4)', () => {
  for (const tab of PACK_SPEC) {
    const schema = TAB_SCHEMAS[tab.tab];

    it(`${tab.tab} has exactly the spec's columns`, () => {
      expect(Object.keys(schema.shape).sort()).toEqual(tab.cols.map((c) => c.name).sort());
    });

    it(`${tab.tab} requires exactly the req: true columns`, () => {
      for (const column of tab.cols) {
        const field = (schema.shape as Record<string, z.ZodType>)[column.name]!;
        expect(field.safeParse(undefined).success, column.name).toBe(!column.req);
      }
    });

    it(`${tab.tab} describes each column with the spec's note`, () => {
      for (const column of tab.cols) {
        const field = (schema.shape as Record<string, z.ZodType>)[column.name]!;
        expect(field.description, column.name).toBe(column.note || undefined);
      }
    });
  }
});
