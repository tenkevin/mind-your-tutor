import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fromVector } from './client.js';
import { librarySources, searchLibrary } from './library.js';
import {
  asApp,
  errorCode,
  freshDatabase,
  hasDatabase,
  PG,
  type TestDatabase,
} from './test/harness.js';
import { embedding, seedOrg, type SeededOrg } from './test/seed.js';

// A3: library search for a class (D11). Settings, uploads, isolation, and k results
// under a selective filter (F4 QA finding 3), with the HNSW index in place.

const vec = (seed: number) => fromVector(embedding(seed));

describe.skipIf(!hasDatabase)('library search (A3)', () => {
  let t: TestDatabase;
  let a: SeededOrg;
  let b: SeededOrg;
  let classA: string;
  let classB: string;
  let docX: string; // default agent
  let docY: string; // default both
  let docZ: string; // default tutor
  let uploadA: string;

  const search = (
    org: SeededOrg,
    classId: string,
    audience: 'agent' | 'tutor',
    seed: number,
    k = 10,
  ) =>
    asApp(t.db, org.orgId, (trx) =>
      searchLibrary(trx, { classId, audience, embedding: vec(seed), k }),
    );
  const titles = (rows: { documentTitle: string }[]) => rows.map((r) => r.documentTitle).sort();

  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedOrg(t.db, 'a');
    b = await seedOrg(t.db, 'b');
    classA = a.classId;
    const klass = await t.db
      .insertInto('class')
      .values({
        org_id: a.orgId,
        curriculum_id: a.curriculumId,
        pinned_version_id: a.publishedId,
        teacher_id: a.teacherId,
        name: 'Class B',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    classB = klass.id;

    // The seed's own document and upload are pending, so searches skip them. Replace
    // them with three indexed shared documents and one upload.
    await t.db.deleteFrom('class_library_setting').where('class_id', '=', classA).execute();
    await t.db.deleteFrom('library_doc').where('curriculum_id', '=', a.curriculumId).execute();
    await t.db.deleteFrom('class_library_doc').where('class_id', '=', classA).execute();
    const docs = await t.db
      .insertInto('library_doc')
      .values(
        (
          [
            ['X', 'agent', 1],
            ['Y', 'both', 2],
            ['Z', 'tutor', 3],
          ] as const
        ).map(([title, use_for]) => ({
          org_id: a.orgId,
          curriculum_id: a.curriculumId,
          title,
          file_url: `${title}.pdf`,
          use_for,
          index_status: 'indexed' as const,
        })),
      )
      .returning(['id', 'title'])
      .execute();
    const id = (title: string) => docs.find((d) => d.title === title)!.id;
    [docX, docY, docZ] = [id('X'), id('Y'), id('Z')];
    const chunk = (doc: string, seed: number, content: string, extra = {}) => ({
      org_id: a.orgId,
      curriculum_id: a.curriculumId,
      library_doc_id: doc,
      ordinal: 0,
      content,
      embedding: embedding(seed),
      ...extra,
    });
    await t.db
      .insertInto('chunk')
      .values([
        chunk(docX, 1, 'X passage', { page: 4 }),
        chunk(docY, 2, 'Y passage', { section: 'Evaporation' }),
        chunk(docZ, 3, 'Z passage'),
      ])
      .execute();
    const upload = await t.db
      .insertInto('class_library_doc')
      .values({
        org_id: a.orgId,
        class_id: classA,
        title: 'Lab sheet',
        file_url: 'lab.pdf',
        use_for: 'both',
        index_status: 'indexed',
        uploaded_by: a.teacherId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    uploadA = upload.id;
    await t.db
      .insertInto('class_chunk')
      .values({
        org_id: a.orgId,
        class_id: classA,
        class_library_doc_id: uploadA,
        ordinal: 0,
        content: 'Lab passage',
        embedding: embedding(4),
        page: 1,
      })
      .execute();
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
  });

  it('ranks passages by similarity, with document, page or section and text (A3-F2)', async () => {
    const rows = await search(a, classB, 'tutor', 2);
    expect(rows.map((r) => r.text)).toEqual(['Y passage', 'Z passage']);
    expect(rows[0]).toMatchObject({
      documentId: docY,
      documentTitle: 'Y',
      source: 'shared',
      section: 'Evaporation',
      page: null,
    });
    expect(rows[0]!.distance).toBeCloseTo(0, 5);
    expect(rows[1]!.distance).toBeGreaterThan(rows[0]!.distance);
    const agent = await search(a, classB, 'agent', 1);
    expect(agent[0]).toMatchObject({ text: 'X passage', page: 4 });
  });

  it('uses the curriculum defaults when a class sets nothing (A3-F3)', async () => {
    expect(titles(await search(a, classB, 'agent', 1))).toEqual(['X', 'Y']);
    expect(titles(await search(a, classB, 'tutor', 1))).toEqual(['Y', 'Z']);
  });

  it("applies a class's settings, for that class only (A3-F3, D11)", async () => {
    // Class A: X → tutor, Y → off.
    await t.db
      .insertInto('class_library_setting')
      .values([
        {
          org_id: a.orgId,
          class_id: classA,
          curriculum_id: a.curriculumId,
          library_doc_id: docX,
          use_for: 'tutor',
        },
        {
          org_id: a.orgId,
          class_id: classA,
          curriculum_id: a.curriculumId,
          library_doc_id: docY,
          use_for: 'off',
        },
      ])
      .execute();
    const atlas = await search(a, classA, 'agent', 1);
    const ivy = await search(a, classA, 'tutor', 1);
    // Atlas never gets X or Y; Ms. Ivy gets X, not Y.
    expect(titles(atlas)).toEqual(['Lab sheet']);
    expect(titles(ivy)).toEqual(['Lab sheet', 'X', 'Z']);
    // Class B keeps the defaults.
    expect(titles(await search(a, classB, 'agent', 1))).toEqual(['X', 'Y']);
    expect(titles(await search(a, classB, 'tutor', 1))).toEqual(['Y', 'Z']);
  });

  it('includes the class upload for that class, for either persona, and never for another (A3-F4)', async () => {
    expect(titles(await search(a, classA, 'agent', 4))).toContain('Lab sheet');
    expect(titles(await search(a, classA, 'tutor', 4))).toContain('Lab sheet');
    for (const audience of ['agent', 'tutor'] as const) {
      expect(titles(await search(a, classB, audience, 4))).not.toContain('Lab sheet');
    }
    const found = (await search(a, classA, 'agent', 4))[0]!;
    expect(found).toMatchObject({ source: 'class', documentTitle: 'Lab sheet', page: 1 });
  });

  it("does not search documents that aren't indexed", async () => {
    await t.db
      .updateTable('class_library_doc')
      .set({ index_status: 'indexing' })
      .where('id', '=', uploadA)
      .execute();
    expect(titles(await search(a, classA, 'agent', 4))).not.toContain('Lab sheet');
    await t.db
      .updateTable('class_library_doc')
      .set({ index_status: 'indexed' })
      .where('id', '=', uploadA)
      .execute();
  });

  it('never crosses organizations, or reaches a class the transaction is not for (A3-S1)', async () => {
    expect(await search(b, classA, 'agent', 1)).toEqual([]);
    expect(await search(a, b.classId, 'agent', 1)).toEqual([]);
  });

  it('describes each document in plain words (A3-U1)', async () => {
    const sources = await asApp(t.db, a.orgId, (trx) => librarySources(trx, classA));
    const byTitle = Object.fromEntries(sources.map((s) => [s.title, s]));
    expect(byTitle.X).toMatchObject({
      source: 'shared',
      sourceLabel: 'Shared library',
      defaultUseFor: 'agent',
      useFor: 'tutor',
      useForLabel: 'Ms. Ivy only',
    });
    expect(byTitle.Y).toMatchObject({ useFor: 'off', useForLabel: 'Hidden from both' });
    expect(byTitle['Lab sheet']).toMatchObject({
      source: 'class',
      sourceLabel: 'Uploaded for this class',
      defaultUseFor: null,
      useFor: 'both',
    });
  });

  it('skips archived documents and brings them back when restored (A3-S3, D31)', async () => {
    await t.db
      .updateTable('library_doc')
      .set({ archived_at: new Date() })
      .where('id', '=', docZ)
      .execute();
    await t.db
      .updateTable('class_library_doc')
      .set({ archived_at: new Date() })
      .where('id', '=', uploadA)
      .execute();
    expect(titles(await search(a, classB, 'tutor', 3))).not.toContain('Z');
    expect(titles(await search(a, classA, 'tutor', 4))).not.toContain('Lab sheet');
    const sources = await asApp(t.db, a.orgId, (trx) => librarySources(trx, classA));
    expect(sources.find((s) => s.title === 'Z')).toMatchObject({
      archived: true,
      useForLabel: 'Out of use (kept)',
    });
    // Out of use is not gone: the passages are still stored.
    const kept = await t.db
      .selectFrom('chunk')
      .select('id')
      .where('library_doc_id', '=', docZ)
      .execute();
    expect(kept).toHaveLength(1);
    await t.db
      .updateTable('library_doc')
      .set({ archived_at: null })
      .where('id', '=', docZ)
      .execute();
    await t.db
      .updateTable('class_library_doc')
      .set({ archived_at: null })
      .where('id', '=', uploadA)
      .execute();
    expect(titles(await search(a, classB, 'tutor', 3))).toContain('Z');
  });

  it('never lets the app role delete a vault document, but may delete a class upload with its passages (A3-S3, D31)', async () => {
    const code = await errorCode(() =>
      asApp(t.db, a.orgId, (trx) => sql`DELETE FROM library_doc`.execute(trx), classA),
    );
    expect(code).toBe(PG.insufficientPrivilege);

    const doc = await t.db
      .insertInto('class_library_doc')
      .values({
        org_id: a.orgId,
        class_id: classA,
        title: 'Disposable',
        file_url: 'disposable.pdf',
        index_status: 'indexed',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await t.db
      .insertInto('class_chunk')
      .values({
        org_id: a.orgId,
        class_id: classA,
        class_library_doc_id: doc.id,
        ordinal: 0,
        content: 'Throwaway.',
        embedding: embedding(9),
      })
      .execute();
    // A newer version names it; deleting the old one clears that link, not the new row.
    const next = await t.db
      .insertInto('class_library_doc')
      .values({
        org_id: a.orgId,
        class_id: classA,
        title: 'Disposable',
        file_url: 'disposable-2.pdf',
        version: 2,
        replaces_id: doc.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    // Another class cannot delete it (row-level security), its own can.
    await asApp(
      t.db,
      a.orgId,
      (trx) => sql`DELETE FROM class_library_doc WHERE id = ${doc.id}`.execute(trx),
      classB,
    );
    expect(
      await t.db.selectFrom('class_library_doc').select('id').where('id', '=', doc.id).execute(),
    ).toHaveLength(1);
    await asApp(
      t.db,
      a.orgId,
      (trx) => sql`DELETE FROM class_library_doc WHERE id = ${doc.id}`.execute(trx),
      classA,
    );
    expect(
      await t.db.selectFrom('class_library_doc').select('id').where('id', '=', doc.id).execute(),
    ).toHaveLength(0);
    expect(
      await t.db
        .selectFrom('class_chunk')
        .select('id')
        .where('class_library_doc_id', '=', doc.id)
        .execute(),
    ).toHaveLength(0);
    const survivor = await t.db
      .selectFrom('class_library_doc')
      .select(['replaces_id', 'class_id'])
      .where('id', '=', next.id)
      .executeTakeFirstOrThrow();
    expect(survivor).toEqual({ replaces_id: null, class_id: classA });
  });

  it('rejects a bad k', async () => {
    await expect(search(a, classA, 'agent', 1, 0)).rejects.toThrow(RangeError);
  });
});

// A3-F5 and A3-P1: 10,000 chunks across 5 curricula and 20 classes. A class that uses
// one small document among a curriculum's many must still get k results, however
// selective its filter, and the search must be fast with the HNSW index in place.
const CHUNKS = Number(process.env.IDEAMAP_PERF_CHUNKS ?? 10_000);
const CURRICULA = 5;
const CLASSES_PER = 4;
const DOCS_PER = 10;

describe.skipIf(!hasDatabase)('library search at scale (A3-F5, A3-P1)', () => {
  let t: TestDatabase;
  let a: SeededOrg;
  let classes: { id: string; curriculum_id: string }[] = [];
  let tiny: { classId: string; docId: string; chunks: number };

  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedOrg(t.db, 'scale');
    const org = sql.lit(a.orgId);
    await t.db.deleteFrom('class_library_setting').execute();
    await t.db.deleteFrom('library_doc').execute();
    await t.db.deleteFrom('class_library_doc').execute();
    await sql`
      INSERT INTO curriculum (org_id, title) SELECT ${org}, 'Curriculum ' || n FROM generate_series(2, ${sql.lit(CURRICULA)}) n
    `.execute(t.db);
    await sql`
      INSERT INTO curriculum_version (org_id, curriculum_id, number, status, pack, source, published_at)
      SELECT ${org}, c.id, 1, 'published', '{}', '{}', now() FROM curriculum c WHERE c.id <> ${sql.lit(a.curriculumId)}
    `.execute(t.db);
    await sql`
      INSERT INTO class (org_id, curriculum_id, pinned_version_id, teacher_id, name)
      SELECT ${org}, v.curriculum_id, v.id, ${sql.lit(a.teacherId)}, 'Class ' || v.curriculum_id || n
      FROM curriculum_version v CROSS JOIN generate_series(1, ${sql.lit(CLASSES_PER)}) n
      WHERE v.curriculum_id <> ${sql.lit(a.curriculumId)} AND v.number = 1
    `.execute(t.db);
    await sql`
      INSERT INTO class (org_id, curriculum_id, pinned_version_id, teacher_id, name)
      SELECT ${org}, ${sql.lit(a.curriculumId)}, ${sql.lit(a.publishedId)}, ${sql.lit(a.teacherId)}, 'Seed class ' || n
      FROM generate_series(1, ${sql.lit(CLASSES_PER - 1)}) n
    `.execute(t.db);
    await sql`
      INSERT INTO library_doc (org_id, curriculum_id, title, file_url, use_for, index_status)
      SELECT ${org}, c.id, 'Doc ' || d, 'doc' || d || '.pdf', 'both', 'indexed'
      FROM curriculum c CROSS JOIN generate_series(1, ${sql.lit(DOCS_PER)}) d
    `.execute(t.db);
    // The first doc of each curriculum gets 3 chunks; the rest share the other chunks.
    const perDoc = Math.ceil(CHUNKS / (CURRICULA * DOCS_PER));
    await sql`
      INSERT INTO chunk (org_id, curriculum_id, library_doc_id, ordinal, content, embedding)
      SELECT ${org}, d.curriculum_id, d.id, n, 'Passage ' || n,
        (SELECT array_agg(sin(n * 31 + i + (ascii(substr(d.title, 5)) * 7)) / 10)::vector FROM generate_series(0, 1023) i)
      FROM library_doc d
      CROSS JOIN generate_series(1, ${sql.lit(perDoc)}) n
    `.execute(t.db);
    await sql`ANALYZE`.execute(t.db);

    classes = (
      await sql<{ id: string; curriculum_id: string }>`SELECT id, curriculum_id FROM class`.execute(
        t.db,
      )
    ).rows;
    // One class hides nine of its curriculum's ten documents: the filter keeps ~10% of
    // that curriculum's chunks, and an unfiltered index scan would find few of them.
    const target = classes[0]!;
    const docs = await t.db
      .selectFrom('library_doc')
      .select(['id', 'title'])
      .where('curriculum_id', '=', target.curriculum_id)
      .orderBy('title')
      .execute();
    await t.db
      .insertInto('class_library_setting')
      .values(
        docs.slice(1).map((d) => ({
          org_id: a.orgId,
          class_id: target.id,
          curriculum_id: target.curriculum_id,
          library_doc_id: d.id,
          use_for: 'off' as const,
        })),
      )
      .execute();
    const count = await t.db
      .selectFrom('chunk')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('library_doc_id', '=', docs[0]!.id)
      .executeTakeFirstOrThrow();
    tiny = { classId: target.id, docId: docs[0]!.id, chunks: Number(count.n) };
  }, 600_000);

  afterAll(async () => {
    await t?.drop();
  });

  it(`seeds ${CHUNKS.toLocaleString('en')} chunks over ${CURRICULA} curricula and ${CURRICULA * CLASSES_PER} classes`, async () => {
    const { rows } = await sql<{ chunks: number; classes: number; curricula: number }>`
      SELECT (SELECT count(*) FROM chunk)::int AS chunks, (SELECT count(*) FROM class)::int AS classes,
        (SELECT count(DISTINCT curriculum_id) FROM chunk)::int AS curricula
    `.execute(t.db);
    expect(rows[0]!.chunks).toBeGreaterThanOrEqual(CHUNKS);
    expect(rows[0]!.classes).toBe(CURRICULA * CLASSES_PER);
    expect(rows[0]!.curricula).toBe(CURRICULA);
  });

  it('returns k results for every class and seed when k exist in scope (A3-F5)', async () => {
    for (const klass of classes) {
      for (const seed of [3, 77, 1234]) {
        const rows = await asApp(t.db, a.orgId, (trx) =>
          searchLibrary(trx, { classId: klass.id, audience: 'agent', embedding: vec(seed), k: 10 }),
        );
        const hidden = klass.id === tiny.classId;
        // The restricted class has `tiny.chunks` passages in scope; others have far more.
        expect(rows).toHaveLength(hidden ? Math.min(10, tiny.chunks) : 10);
        expect(new Set(rows.map((r) => r.chunkId)).size).toBe(rows.length);
        const sorted = [...rows].sort((x, y) => x.distance - y.distance);
        expect(rows.map((r) => r.chunkId)).toEqual(sorted.map((r) => r.chunkId));
      }
    }
  });

  it('keeps k results when the filter keeps about a tenth of a curriculum (A3-F5)', async () => {
    const rows = await asApp(t.db, a.orgId, (trx) =>
      searchLibrary(trx, {
        classId: tiny.classId,
        audience: 'tutor',
        embedding: vec(5),
        k: tiny.chunks,
      }),
    );
    expect(rows).toHaveLength(tiny.chunks);
    expect(new Set(rows.map((r) => r.documentId))).toEqual(new Set([tiny.docId]));
  });

  it('matches an exact scan of the same scope (A3-F2)', async () => {
    const seed = 91;
    const rows = await asApp(t.db, a.orgId, (trx) =>
      searchLibrary(trx, {
        classId: classes[5]!.id,
        audience: 'agent',
        embedding: vec(seed),
        k: 10,
      }),
    );
    const exact = await sql<{ id: string }>`
      SELECT id FROM chunk WHERE curriculum_id = ${classes[5]!.curriculum_id}
      ORDER BY (embedding <=> ${embedding(seed)}::vector) + 0, id LIMIT 10
    `.execute(t.db);
    expect(rows.map((r) => r.chunkId)).toEqual(exact.rows.map((r) => r.id));
  });

  it('searches in under 150 ms at the 95th percentile (A3-P1)', async () => {
    const times: number[] = [];
    for (let i = 0; i < 60; i++) {
      const klass = classes[i % classes.length]!;
      const started = performance.now();
      await asApp(t.db, a.orgId, (trx) =>
        searchLibrary(trx, { classId: klass.id, audience: 'agent', embedding: vec(100 + i), k: 5 }),
      );
      times.push(performance.now() - started);
    }
    times.sort((x, y) => x - y);
    const p95 = times[Math.floor(times.length * 0.95)]!;
    console.log(
      `A3-P1 report: search p95 ${p95.toFixed(1)} ms over ${times.length} searches, ${CHUNKS} chunks`,
    );
    expect(p95).toBeLessThan(150);
  });

  it('plans the vector search on the HNSW index (A3-P1)', async () => {
    const klass = classes[5]!;
    const docs = await t.db
      .selectFrom('library_doc')
      .select('id')
      .where('curriculum_id', '=', klass.curriculum_id)
      .execute();
    const ids = sql`ARRAY[${sql.join(docs.map((d) => sql`${d.id}::uuid`))}]`;
    const plan = await asApp(t.db, a.orgId, (trx) =>
      sql<{ 'QUERY PLAN': string }>`
        EXPLAIN SELECT id FROM chunk
        WHERE curriculum_id = ${klass.curriculum_id}::uuid AND library_doc_id = ANY(${ids})
        ORDER BY embedding <=> ${embedding(5)}::vector LIMIT 5
      `.execute(trx),
    );
    const text = plan.rows.map((r) => r['QUERY PLAN']).join('\n');
    if (process.env.IDEAMAP_PERF_VERBOSE) console.log(text);
    expect(text).toContain('chunk_embedding');
  });
});
