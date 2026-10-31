import { readFileSync } from 'node:fs';
import { importPack } from '@ideamap/connectors';
import {
  ColumnMappingResponseSchema,
  DataTabPageSchema,
  PackSchema,
  VersionListResponseSchema,
} from '@ideamap/contracts';
import { hasDatabase } from '@ideamap/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dataTabPage, sourceHeaders } from './data-tabs.js';
import { as, signIn, startApi, type Signed, type TestApi } from './test/harness.js';

// T6 (docs/qa/T6.md): the read-only data views and the curriculum's column mapping.

const pack = PackSchema.parse(
  JSON.parse(
    readFileSync(new URL('../../../fixtures/water-cycle/pack.json', import.meta.url), 'utf8'),
  ),
);
const version = { id: '00000000-0000-4000-8000-000000000001', number: 1, status: 'draft' as const };
const all = { offset: 0, limit: 200 };

describe('the data views of the water-cycle pack (T6-F1)', () => {
  it('lists every idea with its prerequisites, unknown ones marked, those with none last', () => {
    const page = dataTabPage(pack, 'prerequisites', version, all);
    expect(page.tab === 'prerequisites' && page.total).toBe(pack.ideas.length);
    if (page.tab !== 'prerequisites') throw new Error('wrong tab');
    const ground = page.rows.find((r) => r.idea_id === 'ground')!;
    expect(ground.status).toBe('unknown');
    expect(ground.requires.find((r) => r.idea_id === 'aquifer')?.title).toBeNull();
    const firstNone = page.rows.findIndex((r) => r.status === 'none');
    expect(page.rows.slice(firstNone).every((r) => r.status === 'none')).toBe(true);
  });

  it('counts ideas in each category', () => {
    const page = dataTabPage(pack, 'categories', version, all);
    if (page.tab !== 'categories') throw new Error('wrong tab');
    expect(page.rows).toHaveLength(pack.categories.length);
    expect(page.rows.reduce((n, r) => n + r.ideas, 0)).toBe(pack.ideas.length);
  });

  it('summarises codes across pages and filters by one', () => {
    const page = dataTabPage(pack, 'standards', version, { offset: 0, limit: 2 });
    if (page.tab !== 'standards') throw new Error('wrong tab');
    expect(page.rows).toHaveLength(2);
    expect(page.total).toBe(pack.ideas.length);
    const code = page.codes[0]!;
    const filtered = dataTabPage(pack, 'standards', version, { ...all, code: code.code });
    expect(filtered.total).toBe(code.count);
    // rain has no codes: it is listed, with an empty list, unfiltered.
    const every = dataTabPage(pack, 'standards', version, all);
    if (every.tab !== 'standards') throw new Error('wrong tab');
    expect(every.rows.find((r) => r.idea_id === 'rain')?.codes).toEqual([]);
  });

  it('shows media as text with what students see, placeholders for none', () => {
    const page = dataTabPage(pack, 'media', version, all);
    if (page.tab !== 'media') throw new Error('wrong tab');
    expect(page.rows.filter((r) => r.tab === 'Ideas')).toHaveLength(pack.ideas.length);
    expect(page.rows.filter((r) => r.tab === 'Ideas' && r.shows === 'Placeholder')).toHaveLength(
      11,
    );
  });

  it('marks media references the app will not use (T6-S2)', () => {
    const bad = {
      ...pack,
      ideas: [
        { ...pack.ideas[0]!, media_url: 'javascript:alert(1)' },
        { ...pack.ideas[1]!, media_url: 'http://example.com/a.mp4' },
        { ...pack.ideas[2]!, media_url: 'https://example.com/a.png' },
      ],
      links: [],
    };
    const page = dataTabPage(bad, 'media', version, all);
    if (page.tab !== 'media') throw new Error('wrong tab');
    expect(page.rows.map((r) => [r.usable, r.shows])).toEqual([
      [false, 'Link'],
      [false, 'Video'],
      [true, 'Image'],
    ]);
  });

  it('counts questions against ideas for each unit', () => {
    const page = dataTabPage(pack, 'assessment', version, all);
    if (page.tab !== 'assessment') throw new Error('wrong tab');
    expect(page.rows.reduce((n, r) => n + r.questions, 0)).toBe(pack.assessment.length);
    expect(page.rows.reduce((n, r) => n + r.ideas, 0)).toBe(pack.ideas.length);
  });

  it('pages 2,000 ideas and 6,000 links quickly (T6-P1)', () => {
    const idea = pack.ideas[0]!;
    const big = {
      ...pack,
      ideas: Array.from({ length: 2000 }, (_, i) => ({
        ...idea,
        idea_id: `idea-${i}`,
        requires: i > 0 ? [`idea-${i - 1}`] : [],
      })),
      links: Array.from({ length: 6000 }, (_, i) => ({
        ...pack.links[0]!,
        from_id: `idea-${i % 2000}`,
        to_id: `idea-${(i + 1) % 2000}`,
        media_url: 'https://example.com/a.png',
      })),
    };
    const started = performance.now();
    for (const tab of [
      'prerequisites',
      'categories',
      'standards',
      'media',
      'assessment',
    ] as const) {
      DataTabPageSchema.parse(dataTabPage(big, tab, version, { offset: 1900, limit: 100 }));
    }
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe('source headers for the mapping pickers', () => {
  it('collects ignored columns and saved sources by tab', () => {
    const headers = sourceHeaders(
      [
        {
          origin: 'import',
          level: 'info',
          severity: 'info',
          code: 'column_ignored',
          tab: 'Ideas',
          column: 'Prereqs',
          row: 1,
          message: 'x',
          effect: 'continues',
        } as never,
      ],
      [{ tab: 'Ideas', source_column: 'Topic' }],
    );
    expect(headers).toEqual({ Ideas: ['Prereqs', 'Topic'] });
  });
});

describe.skipIf(!hasDatabase)('the data routes (T6-S1, T6-F4, T6-F5)', () => {
  let api: TestApi;
  let author: Signed;
  let teacher: Signed;
  let otherTeacher: Signed;
  let student: Signed;
  let otherOrg: Signed;
  let url = '';
  let versionId = '';
  beforeAll(async () => {
    api = await startApi();
    author = await signIn(api, 'google', 'author-a');
    teacher = await signIn(api, 'google', 'teacher-a1');
    otherTeacher = await signIn(api, 'clever', 'teacher-a2');
    student = await signIn(api, 'google', 'student-a1');
    otherOrg = await signIn(api, 'google', 'teacher-b1');
    url = `/api/curricula/${api.sample.curricula.a}`;
    versionId = (
      await api.t.db
        .selectFrom('curriculum_version')
        .select('id')
        .where('curriculum_id', '=', api.sample.curricula.a)
        .executeTakeFirstOrThrow()
    ).id;
  });
  afterAll(async () => {
    await api?.close();
  });

  it('lists versions and serves each view as a page', async () => {
    const list = await as(api, teacher)('GET', `${url}/versions`);
    expect(VersionListResponseSchema.parse(list.json()).versions[0]?.id).toBe(versionId);
    for (const tab of ['prerequisites', 'categories', 'standards', 'media', 'assessment']) {
      const res = await as(api, teacher)('GET', `${url}/versions/${versionId}/data/${tab}?limit=5`);
      expect(res.statusCode, tab).toBe(200);
      const page = DataTabPageSchema.parse(res.json());
      expect(page.rows.length).toBeLessThanOrEqual(5);
      expect(page.version.id).toBe(versionId);
    }
  });

  it('refuses a bad tab, page or version, and a version of another curriculum', async () => {
    const get = (path: string) => as(api, teacher)('GET', `${url}${path}`);
    expect((await get(`/versions/${versionId}/data/personas`)).statusCode).toBe(404);
    expect((await get(`/versions/${versionId}/data/media?limit=0`)).statusCode).toBe(400);
    expect((await get(`/versions/${versionId}/data/media?limit=9999`)).statusCode).toBe(400);
    expect((await get(`/versions/${versionId}/data/media?offset=-1`)).statusCode).toBe(400);
    expect((await get(`/versions/not-an-id/data/media`)).statusCode).toBe(404);
    const other = await api.t.db
      .selectFrom('curriculum_version')
      .select('id')
      .where('curriculum_id', '=', api.sample.curricula.b)
      .executeTakeFirstOrThrow();
    expect((await get(`/versions/${other.id}/data/media`)).statusCode).toBe(404);
  });

  it('is read-only: no write route exists for the views (D4)', async () => {
    for (const method of ['PUT', 'POST', 'DELETE'] as const) {
      const res = await as(api, author)(method, `${url}/versions/${versionId}/data/media`, {});
      expect(res.statusCode, method).toBe(404);
    }
  });

  it('refuses another org, a student and a signed-out caller (T6-S1)', async () => {
    const paths = [
      `${url}/versions`,
      `${url}/versions/${versionId}/data/media`,
      `${url}/column-mapping`,
    ];
    for (const path of paths) {
      expect((await as(api, otherOrg)('GET', path)).statusCode, path).toBe(403);
      expect((await as(api, student)('GET', path)).statusCode, path).toBe(403);
      expect((await as(api, null)('GET', path)).statusCode, path).toBe(401);
    }
    const put = (who: Signed | null) =>
      as(api, who)('PUT', `${url}/column-mapping`, { mapping: [] });
    expect((await put(otherOrg)).statusCode).toBe(403);
    expect((await put(student)).statusCode).toBe(403);
    expect((await put(null)).statusCode).toBe(401);
  });

  it('saves the mapping on the curriculum for everyone who uses it, and the author alone edits it', async () => {
    const mapping = [{ tab: 'Ideas', column: 'requires', source_column: 'Prereqs' }];
    const put = await as(api, author)('PUT', `${url}/column-mapping`, { mapping });
    expect(put.statusCode, put.body).toBe(200);
    expect(ColumnMappingResponseSchema.parse(put.json()).can_edit).toBe(true);
    // Two teachers of classes sharing the curriculum see the same mapping, read-only.
    for (const who of [teacher, otherTeacher]) {
      const res = ColumnMappingResponseSchema.parse(
        (await as(api, who)('GET', `${url}/column-mapping`)).json(),
      );
      expect(res.mapping).toEqual(mapping);
      expect(res.can_edit).toBe(false);
      expect(res.headers.Ideas).toContain('Prereqs');
    }
    expect(
      (await as(api, teacher)('PUT', `${url}/column-mapping`, { mapping: [] })).statusCode,
    ).toBe(403);
    // Defaults other than the mapping are untouched.
    const defaults = await as(api, teacher)('GET', `${url}/defaults`);
    expect(defaults.json().config.course.grade).toBe('6');
  });

  it('applies the saved mapping to the next import and not to versions already made', async () => {
    const saved = ColumnMappingResponseSchema.parse(
      (await as(api, teacher)('GET', `${url}/column-mapping`)).json(),
    );
    const csv = (header: string) =>
      new File(
        [`idea_id,title,category,unit,${header}\nsun,Sun,Energy,1,\nrain,Rain,Water,1,sun\n`],
        'Ideas.csv',
      );
    const without = await importPack(csv('Prereqs'));
    expect(without.mapping.find((m) => m.column === 'requires')).toBeUndefined();
    const withMapping = await importPack(csv('Prereqs'), { mapping: saved.mapping });
    expect(withMapping.mapping).toContainEqual(saved.mapping[0]);
    // The version already made keeps the mapping it was made with.
    const row = await api.t.db
      .selectFrom('curriculum_version')
      .select('source')
      .where('id', '=', versionId)
      .executeTakeFirstOrThrow();
    expect(row.source.column_mapping).toEqual([]);
  });

  it('refuses a mapping that names no real column, or a column twice', async () => {
    const send = (mapping: unknown) => as(api, author)('PUT', `${url}/column-mapping`, { mapping });
    expect((await send([{ tab: 'Ideas', column: 'nope', source_column: 'x' }])).statusCode).toBe(
      400,
    );
    expect((await send([{ tab: 'Nope', column: 'requires', source_column: 'x' }])).statusCode).toBe(
      400,
    );
    expect(
      (
        await send([
          { tab: 'Ideas', column: 'requires', source_column: 'a' },
          { tab: 'Ideas', column: 'requires', source_column: 'b' },
        ])
      ).statusCode,
    ).toBe(400);
    expect((await as(api, author)('PUT', `${url}/column-mapping`, { nope: 1 })).statusCode).toBe(
      400,
    );
  });

  it('clears the mapping with an empty list', async () => {
    const res = await as(api, author)('PUT', `${url}/column-mapping`, { mapping: [] });
    expect(res.json().mapping).toEqual([]);
  });
});
