import { hashEmbedder, type Embedder } from '@ideamap/ai';
import { QUEUES } from '@ideamap/contracts';
import { MemoryObjectStore, uploadKey } from '@ideamap/connectors';
import { searchLibrary } from '@ideamap/db';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { docx, pdf } from '../../../packages/connectors/src/testing/build.js';
import { abandonLibraryIndex, indexLibrary, registerWorkers, type IndexDeps } from './index.js';
import {
  appScope,
  freshDatabase,
  hasDatabase,
  seedOrg,
  startBoss,
  type Org,
  type TestDatabase,
} from './testing/db.js';

// A3-F1, F2, S2, S3, P2: library documents are indexed by their own job.

const embedder = hashEmbedder();

describe.skipIf(!hasDatabase)('library indexing (A3)', () => {
  let t: TestDatabase;
  let boss: PgBoss;
  let a: Org;
  let b: Org;
  let classA: string;
  const objects = new MemoryObjectStore();
  const deps = (over: Partial<IndexDeps> = {}): IndexDeps => ({
    scope: appScope(t.db),
    store: objects,
    embedder,
    ...over,
  });

  async function sharedDoc(org: Org, title: string, bytes: Uint8Array | null, fileUrl?: string) {
    const key = fileUrl ?? uploadKey(org.orgId);
    if (bytes) await objects.put(key, bytes);
    const row = await t.db
      .insertInto('library_doc')
      .values({ org_id: org.orgId, curriculum_id: org.curriculumId, title, file_url: key })
      .returning('id')
      .executeTakeFirstOrThrow();
    return { id: row.id, key };
  }

  async function classDoc(title: string, bytes: Uint8Array) {
    const key = uploadKey(a.orgId);
    await objects.put(key, bytes);
    const row = await t.db
      .insertInto('class_library_doc')
      .values({
        org_id: a.orgId,
        class_id: classA,
        title,
        file_url: key,
        use_for: 'both',
        uploaded_by: a.teacher.userId,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return { id: row.id, key };
  }

  const status = async (table: 'library_doc' | 'class_library_doc', id: string) =>
    t.db
      .selectFrom(table)
      .select(['index_status', 'checksum', 'indexed_at'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

  beforeAll(async () => {
    t = await freshDatabase();
    boss = await startBoss(t.url);
    a = await seedOrg(t.db, 'A');
    b = await seedOrg(t.db, 'B');
    const version = await t.db
      .insertInto('curriculum_version')
      .values({
        org_id: a.orgId,
        curriculum_id: a.curriculumId,
        number: 1,
        status: 'published',
        pack: '{}' as never,
        source: '{}' as never,
        published_at: new Date(),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const klass = await t.db
      .insertInto('class')
      .values({
        org_id: a.orgId,
        curriculum_id: a.curriculumId,
        pinned_version_id: version.id,
        teacher_id: a.teacher.userId,
        name: 'Class A',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    classA = klass.id;
  });

  afterAll(async () => {
    await boss?.stop({ graceful: false });
    await t?.drop();
  });

  it('chunks and embeds a shared PDF, keeping pages, and searchLibrary ranks them (A3-F1, F2)', async () => {
    const doc = await sharedDoc(
      a,
      'Water cycle',
      pdf([
        'Evaporation happens when heat turns liquid water into vapor.',
        'Condensation happens when vapor cools and forms clouds.',
      ]),
    );
    expect((await status('library_doc', doc.id)).index_status).toBe('pending');
    const result = await indexLibrary(deps(), {
      org_id: a.orgId,
      curriculum_id: a.curriculumId,
      library_doc_id: doc.id,
    });
    expect(result).toEqual({ indexed: 1, failed: 0 });
    const after = await status('library_doc', doc.id);
    expect(after.index_status).toBe('indexed');
    expect(after.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(after.indexed_at).not.toBeNull();
    // The original file is kept as well as the passages (A3-S3, D31).
    expect(await objects.get(doc.key)).not.toBeNull();

    const chunks = await t.db
      .selectFrom('chunk')
      .select(['ordinal', 'page', 'content'])
      .where('library_doc_id', '=', doc.id)
      .orderBy('ordinal')
      .execute();
    expect(chunks.map((c) => c.page)).toEqual([1, 2]);

    const [query] = await embedder.embed(['why does water evaporate']);
    const hits = await appScope(t.db)(a.orgId, (trx) =>
      searchLibrary(trx, { classId: classA, audience: 'agent', embedding: query!, k: 2 }),
    );
    expect(hits.map((h) => [h.documentTitle, h.page])).toEqual([
      ['Water cycle', 1],
      ['Water cycle', 2],
    ]);
    expect(hits[0]!.text).toContain('Evaporation');
  });

  it('indexes a class upload in its class only, with sections (A3-F4)', async () => {
    const doc = await classDoc(
      'Lab sheet',
      docx([
        'heading:Materials',
        'Bring a beaker and ice.',
        'heading:Method',
        'Heat the beaker slowly.',
      ]),
    );
    const result = await indexLibrary(deps(), {
      org_id: a.orgId,
      class_id: classA,
      class_library_doc_id: doc.id,
    });
    expect(result.indexed).toBe(1);
    expect((await status('class_library_doc', doc.id)).index_status).toBe('indexed');
    const chunks = await t.db
      .selectFrom('class_chunk')
      .select(['class_id', 'section', 'content'])
      .where('class_library_doc_id', '=', doc.id)
      .orderBy('ordinal')
      .execute();
    expect(chunks.map((c) => [c.class_id, c.section])).toEqual([
      [classA, 'Materials'],
      [classA, 'Method'],
    ]);
  });

  it('runs as its own queued job and shows its status (A3-F1)', async () => {
    await registerWorkers({
      ...deps(),
      boss,
      pollingIntervalSeconds: 0.5,
      limits: undefined,
    });
    const doc = await classDoc('Notes', docx(['Clouds are made of tiny droplets.']));
    await boss.send(QUEUES.indexLibrary, {
      org_id: a.orgId,
      class_id: classA,
      class_library_doc_id: doc.id,
    });
    await expect
      .poll(async () => (await status('class_library_doc', doc.id)).index_status, {
        timeout: 20_000,
        interval: 250,
      })
      .toBe('indexed');
  });

  it('archives the version a new one replaces only once it is indexed, keeping both (A3-S3, D31)', async () => {
    const v1 = await sharedDoc(a, 'Short', pdf(['One page only.']));
    const payload = (id: string) => ({
      org_id: a.orgId,
      curriculum_id: a.curriculumId,
      library_doc_id: id,
    });
    await indexLibrary(deps(), payload(v1.id));

    const key = uploadKey(a.orgId);
    await objects.put(key, pdf(['Now two pages.', 'Second page.']));
    const v2 = await t.db
      .insertInto('library_doc')
      .values({
        org_id: a.orgId,
        curriculum_id: a.curriculumId,
        title: 'Short',
        file_url: key,
        version: 2,
        replaces_id: v1.id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const archivedAt = async (id: string) =>
      (
        await t.db
          .selectFrom('library_doc')
          .select('archived_at')
          .where('id', '=', id)
          .executeTakeFirstOrThrow()
      ).archived_at;
    // Not yet indexed: the old version is still in use.
    expect(await archivedAt(v1.id)).toBeNull();
    expect((await indexLibrary(deps(), payload(v2.id))).indexed).toBe(1);
    expect(await archivedAt(v1.id)).not.toBeNull();
    expect(await archivedAt(v2.id)).toBeNull();

    const contents = async (id: string) =>
      (
        await t.db
          .selectFrom('chunk')
          .select('content')
          .where('library_doc_id', '=', id)
          .orderBy('ordinal')
          .execute()
      ).map((c) => c.content);
    expect(await contents(v1.id)).toEqual(['One page only.']);
    expect(await contents(v2.id)).toEqual(['Now two pages.', 'Second page.']);
    expect(await objects.get(v1.key)).not.toBeNull();
    expect(await objects.get(key)).not.toBeNull();
  });

  it('keeps the original of a file it could not read (D31)', async () => {
    const doc = await sharedDoc(a, 'Kept scan', pdf(['']));
    const result = await indexLibrary(deps(), {
      org_id: a.orgId,
      curriculum_id: a.curriculumId,
      library_doc_id: doc.id,
    });
    expect(result.failed).toBe(1);
    expect(await objects.get(doc.key)).not.toBeNull();
  });

  it('marks a file it cannot read as failed, without a retry loop (A3-S2)', async () => {
    const cases: [string, Uint8Array | null, string?][] = [
      ['Corrupt', new Uint8Array([0x4d, 0x5a, 0x90, 0]) as Uint8Array],
      ['Scanned', pdf([''])],
      ['Missing', null],
      ['Remote', null, 'https://example.org/notes.pdf'],
    ];
    for (const [title, bytes, url] of cases) {
      const doc = await sharedDoc(a, title, bytes, url);
      const result = await indexLibrary(deps(), {
        org_id: a.orgId,
        curriculum_id: a.curriculumId,
        library_doc_id: doc.id,
      });
      expect(result, title).toEqual({ indexed: 0, failed: 1 });
      expect((await status('library_doc', doc.id)).index_status, title).toBe('failed');
    }
  });

  it("does not read another organization's file", async () => {
    const key = uploadKey(b.orgId);
    await objects.put(key, pdf(['Secret of org B.']));
    const doc = await sharedDoc(a, 'Stolen', null, key);
    const result = await indexLibrary(deps(), {
      org_id: a.orgId,
      curriculum_id: a.curriculumId,
      library_doc_id: doc.id,
    });
    expect(result.failed).toBe(1);
    expect(await objects.get(key)).not.toBeNull();
  });

  it('indexes the pending shared documents named by an import (A3-F1)', async () => {
    const one = await sharedDoc(a, 'Pending one', pdf(['First pending document.']));
    const two = await sharedDoc(a, 'Pending two', pdf(['Second pending document.']));
    const result = await indexLibrary(deps(), {
      org_id: a.orgId,
      curriculum_id: a.curriculumId,
      version_id: '00000000-0000-4000-8000-000000000001',
    });
    expect(result.indexed).toBeGreaterThanOrEqual(2);
    expect((await status('library_doc', one.id)).index_status).toBe('indexed');
    expect((await status('library_doc', two.id)).index_status).toBe('indexed');
  });

  it('retries when the embedder fails, and marks the document failed after the last retry', async () => {
    const flaky: Embedder = {
      dimensions: embedder.dimensions,
      embed: () => Promise.reject(new Error('model unavailable')),
    };
    const doc = await sharedDoc(a, 'Flaky', pdf(['Some text to embed.']));
    const payload = { org_id: a.orgId, curriculum_id: a.curriculumId, library_doc_id: doc.id };
    await expect(indexLibrary(deps({ embedder: flaky }), payload)).rejects.toThrow(
      'model unavailable',
    );
    expect((await status('library_doc', doc.id)).index_status).toBe('indexing');
    await abandonLibraryIndex(deps(), payload);
    expect((await status('library_doc', doc.id)).index_status).toBe('failed');
    // A later run (a retry, or an author's re-upload) still works.
    expect((await indexLibrary(deps(), payload)).indexed).toBe(1);
  });

  it('rejects a payload that names nothing', async () => {
    await expect(indexLibrary(deps(), { org_id: 'x' })).rejects.toThrow();
  });

  it('indexes a 50-page PDF in under 60 seconds (A3-P2)', async () => {
    const pages = Array.from({ length: 50 }, (_, i) =>
      Array.from(
        { length: 12 },
        (_, j) => `Page ${i + 1} line ${j + 1} about the water cycle and weather.`,
      ).join('\n'),
    );
    const doc = await sharedDoc(a, 'Long', pdf(pages));
    const started = performance.now();
    const result = await indexLibrary(deps(), {
      org_id: a.orgId,
      curriculum_id: a.curriculumId,
      library_doc_id: doc.id,
    });
    const seconds = (performance.now() - started) / 1000;
    console.log(`A3-P2 report: 50-page PDF indexed in ${seconds.toFixed(2)} s`);
    expect(result.indexed).toBe(1);
    expect(seconds).toBeLessThan(60);
  });
});
