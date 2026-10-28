import { hashEmbedder } from '@ideamap/ai';
import { QUEUES } from '@ideamap/contracts';
import { indexLibrary } from '@ideamap/worker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { docx, pdf } from '../../../packages/connectors/src/testing/build.js';
import { hasDatabase } from '../../../packages/db/src/test/harness.js';
import { scoped } from './db.js';
import { as, sessionFor, startApi, type Signed, type TestApi } from './test/harness.js';

// A3 over HTTP: uploads, indexing, search, settings, isolation and upload safety.

const OCTET = { 'content-type': 'application/octet-stream' };
const embedder = hashEmbedder();

describe.skipIf(!hasDatabase)('library routes (A3)', () => {
  let api: TestApi;
  let teacherA1: Signed;
  let teacherA2: Signed;
  let author: Signed;
  let student: Signed;
  let teacherB: Signed;
  let a1: string;
  let a2: string;
  let b1: string;
  let curriculumA: string;

  /** Runs every queued indexing job, as the worker would. */
  async function runJobs() {
    const jobs = api.library!.jobs.splice(0);
    for (const job of jobs) {
      expect(job.name).toBe(QUEUES.indexLibrary);
      await indexLibrary(
        {
          scope: (orgId, fn) => scoped(api.t.db, { orgId }, fn),
          store: api.library!.store,
          embedder,
        },
        job.data,
      );
    }
    return jobs.length;
  }

  const upload = (
    who: Signed,
    url: string,
    bytes: Uint8Array,
    name: string,
    extra: Record<string, string> = {},
  ) =>
    as(api, who)('POST', url, Buffer.from(bytes), {
      ...OCTET,
      'x-file-name': encodeURIComponent(name),
      ...extra,
    });
  const search = (
    who: Signed,
    classId: string,
    audience: 'agent' | 'tutor',
    query: string,
    k?: number,
  ) => as(api, who)('POST', `/api/classes/${classId}/library/search`, { query, audience, k });
  const titles = (res: { json(): { passages: { documentTitle: string }[] } }) =>
    res.json().passages.map((p) => p.documentTitle);

  beforeAll(async () => {
    api = await startApi({}, { library: true });
    const { users, orgs, classes, curricula } = api.sample;
    teacherA1 = await sessionFor(api, users['teacher-a1'], orgs.a);
    teacherA2 = await sessionFor(api, users['teacher-a2'], orgs.a);
    author = await sessionFor(api, users['author-a'], orgs.a);
    student = await sessionFor(api, users['student-a1'], orgs.a);
    teacherB = await sessionFor(api, users['teacher-b1'], orgs.b);
    ({ a1, a2, b1 } = classes);
    curriculumA = curricula.a;
    // The sample's own documents were never indexed; keep them out of the way.
    await api.t.db.deleteFrom('class_library_doc').execute();
    await api.t.db.deleteFrom('library_doc').execute();
  }, 120_000);

  afterAll(async () => {
    await api?.close();
  });

  it('accepts a class upload, queues its indexing job and shows its status (A3-F1, F4)', async () => {
    const res = await upload(
      teacherA1,
      `/api/classes/${a1}/library/uploads`,
      docx(['heading:Materials', 'Bring a beaker, ice and a heat lamp for the evaporation lab.']),
      'Evaporation lab.docx',
      { 'x-use-for': 'both' },
    );
    expect(res.statusCode, res.body).toBe(202);
    expect(res.json().doc).toMatchObject({
      title: 'Evaporation lab',
      useFor: 'both',
      indexStatus: 'pending',
    });
    expect(api.library!.jobs).toHaveLength(1);
    expect(api.library!.store.objects.size).toBe(1);

    const before = await as(api, teacherA1)('GET', `/api/classes/${a1}/library`);
    expect(before.json().sources).toEqual([
      expect.objectContaining({
        title: 'Evaporation lab',
        source: 'class',
        sourceLabel: 'Uploaded for this class',
        useFor: 'both',
        useForLabel: 'Atlas and Ms. Ivy',
        indexStatus: 'pending',
      }),
    ]);

    expect(await runJobs()).toBe(1);
    const after = await as(api, teacherA1)('GET', `/api/classes/${a1}/library`);
    expect(after.json().sources[0].indexStatus).toBe('indexed');
    // The original file is gone once its passages are stored.
    expect(api.library!.store.objects.size).toBe(0);
  });

  it("searches a class's uploads for Atlas and Ms. Ivy, and never shows them to another class (A3-F2, F4, S1)", async () => {
    for (const audience of ['agent', 'tutor'] as const) {
      const mine = await search(teacherA1, a1, audience, 'why does water evaporate');
      expect(mine.statusCode, mine.body).toBe(200);
      expect(mine.json().passages[0]).toMatchObject({
        documentTitle: 'Evaporation lab',
        source: 'class',
        section: 'Materials',
      });
      expect(titles(await search(teacherA2, a2, audience, 'why does water evaporate'))).toEqual([]);
    }
    // Reaching for another class's search is refused, not empty.
    expect((await search(teacherA2, a1, 'agent', 'evaporate')).statusCode).toBe(403);
    expect((await search(teacherB, a1, 'agent', 'evaporate')).statusCode).toBe(403);
    expect((await search(teacherB, b1, 'agent', 'evaporate')).json().passages).toEqual([]);
  });

  it('uploads to the shared library, and each class sets its own use (A3-F3, D11)', async () => {
    const res = await upload(
      author,
      `/api/curricula/${curriculumA}/library`,
      pdf([
        'Evaporation turns liquid water into vapor when heat is added.',
        'Condensation forms clouds.',
      ]),
      'Water cycle.pdf',
      { 'x-use-for': 'agent' },
    );
    expect(res.statusCode, res.body).toBe(202);
    const docId = res.json().doc.id as string;
    expect(await runJobs()).toBe(1);

    const listed = await as(api, author)('GET', `/api/curricula/${curriculumA}/library`);
    expect(listed.json().docs).toEqual([
      expect.objectContaining({ id: docId, title: 'Water cycle', indexStatus: 'indexed' }),
    ]);

    // Defaults: Atlas has it in both classes; Ms. Ivy in neither.
    for (const [who, klass] of [
      [teacherA1, a1],
      [teacherA2, a2],
    ] as const) {
      expect(titles(await search(who, klass, 'agent', 'water vapor heat'))).toContain(
        'Water cycle',
      );
      expect(titles(await search(who, klass, 'tutor', 'water vapor heat'))).not.toContain(
        'Water cycle',
      );
    }

    // Class A1 sets it to "tutor": Ms. Ivy gets it, Atlas no longer does. A2 is unaffected.
    const set = await as(api, teacherA1)('PUT', `/api/classes/${a1}/library/${docId}`, {
      use_for: 'tutor',
    });
    expect(set.statusCode, set.body).toBe(200);
    expect(titles(await search(teacherA1, a1, 'agent', 'water vapor heat'))).not.toContain(
      'Water cycle',
    );
    const ivy = await search(teacherA1, a1, 'tutor', 'water vapor heat');
    expect(ivy.json().passages[0]).toMatchObject({
      documentTitle: 'Water cycle',
      page: 1,
      source: 'shared',
    });
    expect(titles(await search(teacherA2, a2, 'agent', 'water vapor heat'))).toContain(
      'Water cycle',
    );
    expect(titles(await search(teacherA2, a2, 'tutor', 'water vapor heat'))).not.toContain(
      'Water cycle',
    );

    // "off" hides it from both.
    await as(api, teacherA1)('PUT', `/api/classes/${a1}/library/${docId}`, { use_for: 'off' });
    for (const audience of ['agent', 'tutor'] as const) {
      expect(titles(await search(teacherA1, a1, audience, 'water vapor heat'))).not.toContain(
        'Water cycle',
      );
    }
    const sources = await as(api, teacherA1)('GET', `/api/classes/${a1}/library`);
    expect(sources.json().sources).toContainEqual(
      expect.objectContaining({
        title: 'Water cycle',
        source: 'shared',
        sourceLabel: 'Shared library',
        defaultUseFor: 'agent',
        useFor: 'off',
        useForLabel: 'Hidden from both',
      }),
    );
  });

  it('limits who may upload, search or edit (A3-S1)', async () => {
    const file = Buffer.from('hello');
    expect(
      (await upload(student, `/api/classes/${a1}/library/uploads`, file, 'a.txt')).statusCode,
    ).toBe(403);
    expect((await search(student, a1, 'tutor', 'water')).statusCode).toBe(403);
    // A teacher is not a curriculum author.
    expect(
      (await upload(teacherA1, `/api/curricula/${curriculumA}/library`, file, 'a.txt')).statusCode,
    ).toBe(403);
    expect(
      (await upload(teacherB, `/api/curricula/${curriculumA}/library`, file, 'a.txt')).statusCode,
    ).toBe(403);
    expect(
      (await upload(teacherA2, `/api/classes/${a1}/library/uploads`, file, 'a.txt')).statusCode,
    ).toBe(403);
    expect(
      (await as(api, null)('POST', `/api/classes/${a1}/library/uploads`, file, OCTET)).statusCode,
    ).toBe(401);
  });

  it('refuses unsafe uploads and neutralises a PDF with a script (A3-S2)', async () => {
    const url = `/api/classes/${a1}/library/uploads`;
    const before = api.library!.store.objects.size;
    // Over the limit.
    const big = await upload(teacherA1, url, new Uint8Array(21 * 1024 * 1024).fill(97), 'big.txt');
    expect(big.statusCode).toBe(413);
    expect(big.json().error).toContain('the most a library document can be');
    // A program, whatever its name.
    const exe = Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0]);
    for (const name of ['lab.pdf', 'lab.docx', 'lab.txt']) {
      const res = await upload(teacherA1, url, exe, name);
      expect(res.statusCode, name).toBe(400);
    }
    // A script, a mislabelled file, no name, an empty file, an odd type.
    expect(
      (await upload(teacherA1, url, Buffer.from('#!/bin/sh\necho hi'), 'run.txt')).statusCode,
    ).toBe(400);
    expect((await upload(teacherA1, url, Buffer.from('text'), 'fake.pdf')).statusCode).toBe(400);
    expect((await upload(teacherA1, url, Buffer.from('text'), 'pic.png')).statusCode).toBe(400);
    expect((await upload(teacherA1, url, Buffer.alloc(0), 'empty.txt')).statusCode).toBe(400);
    const nameless = await as(api, teacherA1)('POST', url, Buffer.from('text'), OCTET);
    expect(nameless.statusCode).toBe(400);
    const badUse = await upload(teacherA1, url, Buffer.from('text'), 'a.txt', {
      'x-use-for': 'everyone',
    });
    expect(badUse.statusCode).toBe(400);
    const json = await as(api, teacherA1)('POST', url, { not: 'a file' });
    expect(json.statusCode).toBeGreaterThanOrEqual(400);
    expect(json.statusCode).toBeLessThan(500);
    // Nothing refused was stored or queued.
    expect(api.library!.store.objects.size).toBe(before);
    expect(api.library!.jobs).toHaveLength(0);

    // A PDF with an embedded script is accepted, but only its text is kept.
    const evil = pdf(
      ['Lab safety: wear goggles.'],
      '/OpenAction << /S /JavaScript /JS (app.alert\\(1\\)) >> /AA << /O << /S /Launch /F (cmd.exe) >> >>',
    );
    const res = await upload(teacherA1, url, evil, 'safety.pdf');
    expect(res.statusCode, res.body).toBe(202);
    await runJobs();
    const stored = await api.t.db
      .selectFrom('class_chunk')
      .select(['content'])
      .where('class_library_doc_id', '=', res.json().doc.id)
      .execute();
    expect(stored.map((c) => c.content)).toEqual(['Lab safety: wear goggles.']);
  });

  it('shows a file that cannot be read as failed, in plain words (A3-F1)', async () => {
    const res = await upload(
      teacherA1,
      `/api/classes/${a1}/library/uploads`,
      pdf(['']),
      'scan.pdf',
    );
    expect(res.statusCode).toBe(202);
    await runJobs();
    const sources = await as(api, teacherA1)('GET', `/api/classes/${a1}/library`);
    expect(sources.json().sources).toContainEqual(
      expect.objectContaining({ title: 'scan', indexStatus: 'failed' }),
    );
    // A failed document is never searched.
    expect(titles(await search(teacherA1, a1, 'agent', 'scan'))).not.toContain('scan');
  });

  it('removes an upload with its passages and embeddings (A3-S3)', async () => {
    const res = await upload(
      teacherA1,
      `/api/classes/${a1}/library/uploads`,
      Buffer.from('Short lived note about rivers.'),
      'rivers.txt',
    );
    const id = res.json().doc.id as string;
    await runJobs();
    const count = () =>
      api.t.db
        .selectFrom('class_chunk')
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .where('class_library_doc_id', '=', id)
        .executeTakeFirstOrThrow()
        .then((r) => Number(r.n));
    expect(await count()).toBe(1);

    // Another teacher, even of the same curriculum, cannot remove it.
    expect(
      (await as(api, teacherA2)('DELETE', `/api/classes/${a2}/library/uploads/${id}`)).statusCode,
    ).toBe(404);
    expect(
      (await as(api, teacherA2)('DELETE', `/api/classes/${a1}/library/uploads/${id}`)).statusCode,
    ).toBe(403);
    expect(await count()).toBe(1);

    expect(
      (await as(api, teacherA1)('DELETE', `/api/classes/${a1}/library/uploads/${id}`)).statusCode,
    ).toBe(204);
    expect(await count()).toBe(0);
    expect(
      (await as(api, teacherA1)('DELETE', `/api/classes/${a1}/library/uploads/${id}`)).statusCode,
    ).toBe(404);
  });

  it("removes a queued upload's file when its row is removed, and everything when the class goes (A3-S3)", async () => {
    const res = await upload(
      teacherA1,
      `/api/classes/${a1}/library/uploads`,
      Buffer.from('queued only'),
      'queued.txt',
    );
    const id = res.json().doc.id as string;
    api.library!.jobs.length = 0;
    const stored = api.library!.store.objects.size;
    await as(api, teacherA1)('DELETE', `/api/classes/${a1}/library/uploads/${id}`);
    expect(api.library!.store.objects.size).toBe(stored - 1);

    // Deleting a class takes its uploads' passages with it.
    const klass = await api.t.db
      .insertInto('class')
      .values({
        org_id: api.sample.orgs.a,
        curriculum_id: curriculumA,
        teacher_id: api.sample.users['teacher-a1'],
        name: 'Short-lived class',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const keep = await upload(
      teacherA1,
      `/api/classes/${klass.id}/library/uploads`,
      Buffer.from('class gone soon'),
      'gone.txt',
    );
    expect(keep.statusCode, keep.body).toBe(202);
    await runJobs();
    const total = () =>
      api.t.db
        .selectFrom('class_chunk')
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .where('class_id', '=', klass.id)
        .executeTakeFirstOrThrow()
        .then((r) => Number(r.n));
    expect(await total()).toBe(1);
    await api.t.db.deleteFrom('class').where('id', '=', klass.id).execute();
    expect(await total()).toBe(0);
  });

  it('validates search requests and rate limits them', async () => {
    for (const body of [
      {},
      { query: '', audience: 'agent' },
      { query: 'x', audience: 'milo' },
      { query: 'x', audience: 'agent', k: 99 },
    ]) {
      const res = await as(api, teacherA2)('POST', `/api/classes/${a2}/library/search`, body);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
    }
  });
});

describe.skipIf(!hasDatabase)('library limits (A3)', () => {
  let api: TestApi;
  let teacher: Signed;
  let klass: string;

  beforeAll(async () => {
    api = await startApi({}, { library: { maxUploadsPerClass: 1, searchesPerMinute: 2 } });
    teacher = await sessionFor(api, api.sample.users['teacher-a1'], api.sample.orgs.a);
    klass = api.sample.classes.a1;
    await api.t.db.deleteFrom('class_library_doc').execute();
  });
  afterAll(async () => {
    await api?.close();
  });

  it('caps the uploads in a class and the searches a user makes', async () => {
    const send = () =>
      as(api, teacher)('POST', `/api/classes/${klass}/library/uploads`, Buffer.from('note'), {
        ...OCTET,
        'x-file-name': 'note.txt',
      });
    expect((await send()).statusCode).toBe(202);
    const second = await send();
    expect(second.statusCode).toBe(409);
    // The refused file was not kept.
    expect(api.library!.store.objects.size).toBe(1);
    const ask = () =>
      as(api, teacher)('POST', `/api/classes/${klass}/library/search`, {
        query: 'note',
        audience: 'agent',
      });
    expect((await ask()).statusCode).toBe(200);
    expect((await ask()).statusCode).toBe(200);
    expect((await ask()).statusCode).toBe(429);
  });
});
