import { hashEmbedder } from '@ideamap/ai';
import { QUEUES, type ImportJobView, type ImportStepName } from '@ideamap/contracts';
import { sql } from 'kysely';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  TABS,
  fixtureText,
  xlsx,
  zip,
  type XCell,
} from '../../../packages/connectors/src/testing/build.js';
import { registerWorkers } from './index.js';
import {
  getCurriculumData,
  getImportJob,
  runImport,
  startImport,
  type Caller,
  type ImportDeps,
  type RunDeps,
} from './imports.js';
import {
  appScope,
  fixture,
  freshDatabase,
  hasDatabase,
  seedOrg,
  startBoss,
  store,
  type Org,
  type TestDatabase,
} from './testing/db.js';
import type { MemoryObjectStore } from '@ideamap/connectors';

// C4: uploading a file runs a pg-boss job that stores a draft CurriculumVersion with
// derived data and issues. Everything here runs as the app role (row-level security
// on), through a real pg-boss worker polling the test database.

const file = (name: string, bytes: Uint8Array | string) =>
  new File([typeof bytes === 'string' ? bytes : Buffer.from(bytes)], name);
const xlsxFile = () => file('water-cycle.xlsx', fixture('water-cycle.xlsx'));
const csvZip = () =>
  file(
    'water-cycle.zip',
    zip(TABS.map((tab) => ({ name: `${tab}.csv`, data: fixtureText(`${tab}.csv`) }))),
  );
const jsonFile = () => file('pack.json', fixture('pack.json'));

async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean, ms = 20_000) {
  const until = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > until) throw new Error(`Timed out; last value: ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe.skipIf(!hasDatabase)('import jobs (C4)', () => {
  let t: TestDatabase;
  let boss: PgBoss;
  let objects: MemoryObjectStore;
  let deps: ImportDeps;
  let hook: RunDeps['afterStep'];
  let a: Org;
  let b: Org;

  const finished = (caller: Caller, id: string) =>
    waitFor(
      () => getImportJob(deps, caller, id),
      (job) => job.status === 'succeeded' || job.status === 'failed',
    );
  const upload = async (org: Org, f: File, key?: string) =>
    (
      await startImport(deps, org.teacher, {
        curriculumId: org.curriculumId,
        file: f,
        idempotencyKey: key,
      })
    ).job;
  const versions = (curriculumId: string) =>
    t.db
      .selectFrom('curriculum_version')
      .selectAll()
      .where('curriculum_id', '=', curriculumId)
      .orderBy('number')
      .execute();
  const queued = async (name: string) =>
    Number(
      (
        await sql<{ n: string }>`SELECT count(*) AS n FROM pgboss.job WHERE name = ${name}`.execute(
          t.db,
        )
      ).rows[0]!.n,
    );

  beforeAll(async () => {
    t = await freshDatabase();
    boss = await startBoss(t.url);
    objects = store();
    deps = { scope: appScope(t.db), boss, store: objects };
    await registerWorkers({
      ...deps,
      boss,
      embedder: hashEmbedder(),
      pollingIntervalSeconds: 0.5,
      afterStep: (step) => hook?.(step),
    });
    a = await seedOrg(t.db, 'A');
    b = await seedOrg(t.db, 'B');
  });
  afterAll(async () => {
    await boss?.stop({ graceful: false, timeout: 1000 });
    await t?.drop();
  });
  beforeEach(async () => {
    hook = undefined;
    a = await seedOrg(t.db, 'A');
  });

  it('C4-F1, F5, F3: an XLSX upload becomes a draft with derived data and issues', async () => {
    const seen: ImportJobView[] = [];
    hook = async (step: ImportStepName) => {
      if (step === 'Check data') seen.push(await getImportJob(deps, a.teacher, job.id));
    };
    const job = await upload(a, xlsxFile());
    expect(job.status).toBe('queued');
    expect(job.steps.map((s) => [s.name, s.status])).toEqual([
      ['Read sheet', 'pending'],
      ['Check data', 'pending'],
      ['Rank links', 'pending'],
      ['Lay out map', 'pending'],
      ['Make quizzes', 'pending'],
      ['Index library', 'pending'],
    ]);

    const done = await finished(a.teacher, job.id);
    expect(done.status).toBe('succeeded');
    // Running, part-way through the pipeline.
    expect(seen[0]!.status).toBe('running');
    expect(seen[0]!.started_at).not.toBeNull();
    expect(seen[0]!.steps[0]).toMatchObject({ status: 'done', result: '18 ideas, 31 links' });
    expect(seen[0]!.steps[1]!.status).toBe('running');
    expect(seen[0]!.steps[2]!.status).toBe('pending');

    // C4-U1: each step has a short result and timestamps.
    expect(done.steps.map((s) => [s.name, s.status, s.result])).toEqual([
      ['Read sheet', 'done', '18 ideas, 31 links'],
      ['Check data', 'done', '3 notes'],
      ['Rank links', 'done', 'Top 3 in and out per idea'],
      ['Lay out map', 'done', 'Most connected in the centre'],
      ['Make quizzes', 'done', '8 per idea from links'],
      ['Index library', 'done', '5 documents for RAG'],
    ]);
    for (const s of done.steps) {
      expect(Date.parse(s.finished_at!)).toBeGreaterThanOrEqual(Date.parse(s.started_at!));
    }
    expect(done.finished_at).not.toBeNull();

    const [version] = await versions(a.curriculumId);
    expect(version).toMatchObject({ id: done.version!.id, number: 1, status: 'draft' });
    expect(version!.pack.ideas).toHaveLength(18);
    expect(version!.derived!.ranked_links.kept).toHaveLength(27);
    expect(version!.derived!.layout.centre).toBe('evap');
    const checks = version!.issues.filter((i) => i.origin === 'data_check');
    expect(checks.map((i) => i.level).sort()).toEqual(['error', 'info', 'warning']);
    // D2: the draft is stored, but its error blocks publishing.
    expect(done.version).toMatchObject({ status: 'draft', can_publish: false });
  });

  it('C4-F2: zipped CSVs and pack JSON give the same pack and derived data', async () => {
    const results = [];
    for (const f of [xlsxFile(), csvZip(), jsonFile()]) {
      const org = await seedOrg(t.db, f.name);
      const done = await finished(org.teacher, (await upload(org, f)).id);
      expect(done.status).toBe('succeeded');
      const [version] = await versions(org.curriculumId);
      results.push(version!);
    }
    expect(results.map((v) => v.source.kind)).toEqual(['xlsx', 'csv', 'json']);
    expect(results[1]!.pack).toEqual(results[0]!.pack);
    expect(results[2]!.pack).toEqual(results[0]!.pack);
    expect(results[1]!.derived).toEqual(results[0]!.derived);
    expect(results[2]!.derived).toEqual(results[0]!.derived);
  });

  it('C4-F4, U2: a file the importer refuses fails the job with its problems; no version', async () => {
    const ideas = fixtureText('Ideas.csv').replace(/^idea_id,title,/, 'idea_id,heading,');
    const broken = zip(
      TABS.map((tab) => ({
        name: `${tab}.csv`,
        data: tab === 'Ideas' ? ideas : fixtureText(`${tab}.csv`),
      })),
    );
    const done = await finished(a.teacher, (await upload(a, file('broken.zip', broken))).id);
    expect(done.status).toBe('failed');
    expect(done.version).toBeNull();
    expect(await versions(a.curriculumId)).toHaveLength(0);
    expect(done.steps[0]).toMatchObject({ name: 'Read sheet', status: 'failed' });
    expect(done.steps.slice(1).every((s) => s.status === 'pending')).toBe(true);
    const error = done.error!;
    expect(error.next_action).toBe('Fix the sheet and upload again.');
    const blocking = error.problems.filter((p) => p.severity === 'error');
    expect(blocking.length).toBeGreaterThan(0);
    expect(blocking.some((p) => p.tab === 'Ideas' && /title/.test(p.message))).toBe(true);
    expect(error.message).toMatch(
      /^The file couldn't be imported: \d+ problems? must be fixed first\. /,
    );
    expect(error.message).toContain('Ideas');
  });

  it('C4-F6: each import makes a new numbered draft; earlier ones are unchanged', async () => {
    const first = await finished(a.teacher, (await upload(a, xlsxFile())).id);
    const [before] = await versions(a.curriculumId);
    const second = await finished(a.teacher, (await upload(a, jsonFile())).id);
    const all = await versions(a.curriculumId);
    expect(all.map((v) => [v.id, v.number, v.status])).toEqual([
      [first.version!.id, 1, 'draft'],
      [second.version!.id, 2, 'draft'],
    ]);
    expect(all[0]).toEqual(before);
    for (const [v, name] of [
      [all[0]!, 'water-cycle.xlsx'],
      [all[1]!, 'pack.json'],
    ] as const) {
      expect(v.source.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(v.source.file_name).toBe(name);
    }
    expect(all[0]!.source.checksum).not.toBe(all[1]!.source.checksum);
    expect(all[0]!.source.column_mapping.length).toBeGreaterThan(0);
  });

  it('C4-F6: the saved column mapping is applied and stored on the version', async () => {
    const mapping = [{ tab: 'Ideas', column: 'title', source_column: 'heading' }];
    await t.db
      .insertInto('curriculum_defaults')
      .values({
        curriculum_id: a.curriculumId,
        org_id: a.orgId,
        column_mapping: JSON.stringify(mapping) as never,
      })
      .execute();
    const ideas = fixtureText('Ideas.csv').replace(/^idea_id,title,/, 'idea_id,heading,');
    const renamed = zip(
      TABS.map((tab) => ({
        name: `${tab}.csv`,
        data: tab === 'Ideas' ? ideas : fixtureText(`${tab}.csv`),
      })),
    );
    const done = await finished(a.teacher, (await upload(a, file('renamed.zip', renamed))).id);
    expect(done.status).toBe('succeeded');
    const [version] = await versions(a.curriculumId);
    expect(version!.source.column_mapping).toContainEqual(expect.objectContaining(mapping[0]));
  });

  it('C4-F7: the same upload with the same idempotency key makes one job and one draft', async () => {
    const first = await upload(a, xlsxFile(), 'upload-1');
    const again = await startImport(deps, a.teacher, {
      curriculumId: a.curriculumId,
      file: xlsxFile(),
      idempotencyKey: 'upload-1',
    });
    expect(again).toMatchObject({ created: false, job: { id: first.id } });
    await finished(a.teacher, first.id);
    expect(await versions(a.curriculumId)).toHaveLength(1);
    const jobs = await t.db
      .selectFrom('import_job')
      .select('id')
      .where('curriculum_id', '=', a.curriculumId)
      .execute();
    expect(jobs).toHaveLength(1);
    const keys = [...objects.objects.keys()].filter((k) => k.startsWith(`orgs/${a.orgId}/`));
    expect(keys).toHaveLength(1);
  });

  it('C4-F7: a worker that dies mid-job is retried, and the retry makes one draft', async () => {
    let crashes = 0;
    hook = (step) => {
      if (step === 'Lay out map' && crashes === 0) {
        crashes++;
        throw new Error('worker killed');
      }
    };
    const job = await upload(a, xlsxFile());
    const done = await waitFor(
      () => getImportJob(deps, a.teacher, job.id),
      (j) => j.status === 'succeeded',
      30_000,
    );
    expect(crashes).toBe(1);
    expect(done.steps.every((s) => s.status === 'done')).toBe(true);
    expect(await versions(a.curriculumId)).toHaveLength(1);
    // Delivered again after it finished: nothing happens.
    const payload = { org_id: a.orgId, import_job_id: job.id };
    expect(await runImport(deps, payload)).toBe('skipped');
    expect(await versions(a.curriculumId)).toHaveLength(1);
  });

  // F1e-F9: Teacher Settings → Curriculum data reads the newest job, its version and the
  // newest version as separate statements. A worker commit can land between any two of
  // them; the answer must still agree (a succeeded job always comes with its version).
  it.each([
    [1, false],
    [2, false],
    [3, false],
    [4, false],
    [5, false],
    [6, false],
    [1, true],
    [3, true],
  ])(
    'F1e-F9: a worker commit after read %i of the curriculum data gives a consistent answer (job already running: %s)',
    async (after, running) => {
      const stopped = { ...deps, boss: { send: () => Promise.resolve(null) } } as ImportDeps;
      const job = await startImport(stopped, a.teacher, {
        curriculumId: a.curriculumId,
        file: xlsxFile(),
      });
      const payload = { org_id: a.orgId, import_job_id: job.job.id };
      if (running) {
        const killed: RunDeps = {
          ...deps,
          afterStep: (step) => {
            if (step === 'Check data') throw new Error('SIGKILL');
          },
        };
        await expect(runImport(killed, payload)).rejects.toThrow('SIGKILL');
      }
      let reads = 0;
      let committed = false;
      const commit = async () => {
        committed = true;
        expect(await runImport(deps, payload)).toBe('succeeded');
      };
      const interleaved: ImportDeps = {
        ...deps,
        scope: (orgId, fn, options) =>
          deps.scope(
            orgId,
            (trx) =>
              fn(
                trx.withPlugin({
                  transformQuery: ({ node }) => node,
                  transformResult: async ({ result }) => {
                    if (++reads === after && !committed) await commit();
                    return result;
                  },
                }),
              ),
            options,
          ),
      };
      const data = await getCurriculumData(interleaved, a.teacher, a.curriculumId);
      if (!committed) await commit();
      // One snapshot: the commit landed after it was taken, so none of it shows, and the
      // job and the version agree whichever read the commit came after.
      expect(data.job?.status).toBe(running ? 'running' : 'queued');
      expect(data.job?.version ?? null).toBeNull();
      expect(data.version).toBeNull();
      expect(data.unchanged).toBe(false);
    },
  );

  it('C4-F7: a job left running by a killed worker completes on its next delivery', async () => {
    const stopped = { ...deps, boss: { send: () => Promise.resolve(null) } } as ImportDeps;
    const job = await startImport(stopped, a.teacher, {
      curriculumId: a.curriculumId,
      file: xlsxFile(),
    });
    const payload = { org_id: a.orgId, import_job_id: job.job.id };
    // The worker stops after two steps; nothing after that line runs.
    const killed: RunDeps = {
      ...deps,
      afterStep: (step) => {
        if (step === 'Check data') throw new Error('SIGKILL');
      },
    };
    await expect(runImport(killed, payload)).rejects.toThrow('SIGKILL');
    const left = await getImportJob(deps, a.teacher, job.job.id);
    expect(left.status).toBe('running');
    expect(left.steps.map((s) => s.status)).toEqual([
      'done',
      'running',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
    expect(await versions(a.curriculumId)).toHaveLength(0);
    // The restarted worker gets the job again (pg-boss redelivers it once it expires).
    expect(await runImport(deps, payload)).toBe('succeeded');
    const done = await getImportJob(deps, a.teacher, job.job.id);
    expect(done.status).toBe('succeeded');
    expect(done.steps.every((s) => s.status === 'done')).toBe(true);
    expect(await versions(a.curriculumId)).toHaveLength(1);
  });

  it('C4-F7: two attempts of the same job at once still make one draft', async () => {
    const stopped = { ...deps, boss: { send: () => Promise.resolve(null) } } as ImportDeps;
    // Queue a job that the running worker won't see, then run it twice in parallel.
    const job = await startImport(stopped, a.teacher, {
      curriculumId: a.curriculumId,
      file: jsonFile(),
    });
    const payload = { org_id: a.orgId, import_job_id: job.job.id };
    const outcomes = await Promise.all([runImport(deps, payload), runImport(deps, payload)]);
    expect(outcomes.filter((o) => o === 'succeeded')).toHaveLength(1);
    expect(await versions(a.curriculumId)).toHaveLength(1);
  });

  it('C4-F8: library indexing is queued as its own job, after the draft commits', async () => {
    const done = await finished(a.teacher, (await upload(a, xlsxFile())).id);
    const rows = await sql<{ data: { version_id: string } }>`
      SELECT data FROM pgboss.job WHERE name = ${QUEUES.indexLibrary}
    `.execute(t.db);
    expect(rows.rows.map((r) => r.data.version_id)).toContain(done.version!.id);
  });

  it('C4-S1: students, and teachers of another organization, are refused', async () => {
    const before = await queued(QUEUES.import);
    await expect(
      startImport(deps, a.student, { curriculumId: a.curriculumId, file: xlsxFile() }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      startImport(deps, b.teacher, { curriculumId: a.curriculumId, file: xlsxFile() }),
    ).rejects.toMatchObject({ status: 403, message: "You can't import into this curriculum." });
    const job = await upload(a, jsonFile());
    await expect(getImportJob(deps, b.teacher, job.id)).rejects.toMatchObject({ status: 404 });
    await expect(getImportJob(deps, a.student, job.id)).rejects.toMatchObject({ status: 403 });
    expect(await queued(QUEUES.import)).toBe(before + 1);
  });

  it('C4-S2: oversized files and zip bombs are refused before anything is stored or queued', async () => {
    const before = { jobs: await queued(QUEUES.import), objects: objects.objects.size };
    const big = new File([Buffer.alloc(60 * 1024 * 1024, 'a,b\n')], 'Ideas.csv');
    await expect(
      startImport(deps, a.teacher, { curriculumId: a.curriculumId, file: big }),
    ).rejects.toMatchObject({
      status: 413,
      message:
        'Ideas.csv is 60 MB; the most an import accepts is 10 MB per file. Nothing was imported.',
    });
    const bomb = zip([{ name: 'Ideas.csv', data: Buffer.alloc(120 * 1024 * 1024) }]);
    expect(bomb.length).toBeLessThan(1024 * 1024);
    await expect(
      startImport(deps, a.teacher, { curriculumId: a.curriculumId, file: file('bomb.zip', bomb) }),
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/unpack.*100 MB/) });
    expect(await queued(QUEUES.import)).toBe(before.jobs);
    expect(objects.objects.size).toBe(before.objects);
    const jobs = await t.db
      .selectFrom('import_job')
      .select('id')
      .where('curriculum_id', '=', a.curriculumId)
      .execute();
    expect(jobs).toHaveLength(0);
  });

  it('C4-S3: uploads are stored under a random key in the organization prefix', async () => {
    const job = await upload(
      a,
      file('../../etc/passwd water-cycle.xlsx', fixture('water-cycle.xlsx')),
    );
    const row = await t.db
      .selectFrom('import_job')
      .select('source')
      .where('id', '=', job.id)
      .executeTakeFirstOrThrow();
    expect(row.source.file_ref).toMatch(
      new RegExp(
        `^orgs/${a.orgId}/uploads/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`,
      ),
    );
    expect(row.source.file_ref).not.toContain('water');
    expect(row.source.file_name).toBe('passwd water-cycle.xlsx');
    expect(objects.objects.has(row.source.file_ref!)).toBe(true);
    await finished(a.teacher, job.id);
  });

  it("C4-S4: the job acts for its own organization, so it can't touch another's rows", async () => {
    const stopped = { ...deps, boss: { send: () => Promise.resolve(null) } } as ImportDeps;
    const job = await startImport(stopped, a.teacher, {
      curriculumId: a.curriculumId,
      file: jsonFile(),
    });
    // A payload naming the wrong organization sees no job, so does nothing.
    expect(await runImport(deps, { org_id: b.orgId, import_job_id: job.job.id })).toBe('skipped');
    expect(await versions(a.curriculumId)).toHaveLength(0);
    const row = await t.db
      .selectFrom('import_job')
      .select('status')
      .where('id', '=', job.job.id)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('queued');
    // Acting for no organization at all, the app role sees nothing either.
    const none = await appScope(t.db)('00000000-0000-4000-8000-000000000000', (trx) =>
      trx.selectFrom('import_job').select('id').execute(),
    );
    expect(none).toHaveLength(0);
  });

  it('C4-P1: the sample imports in under 5 seconds, upload to draft', async () => {
    const started = performance.now();
    const done = await finished(a.teacher, (await upload(a, xlsxFile())).id);
    const ms = performance.now() - started;
    expect(done.status).toBe('succeeded');
    expect(ms, `C4-P1 sample import took ${ms.toFixed(0)} ms, budget 5000 ms`).toBeLessThan(5000);
  });

  it('C4-P3: five organizations importing at once each get their own draft', async () => {
    const orgs = await Promise.all([1, 2, 3, 4, 5].map((n) => seedOrg(t.db, `P${n}`)));
    const single = performance.now();
    await finished(orgs[0]!.teacher, (await upload(orgs[0]!, xlsxFile())).id);
    const one = performance.now() - single;
    const started = performance.now();
    const jobs = await Promise.all(
      orgs.map(async (org) => [org, await upload(org, xlsxFile())] as const),
    );
    const done = await Promise.all(jobs.map(([org, job]) => finished(org.teacher, job.id)));
    const all = performance.now() - started;
    expect(done.every((j) => j.status === 'succeeded')).toBe(true);
    for (const [org] of jobs) {
      const vs = await versions(org.curriculumId);
      expect(vs.every((v) => v.org_id === org.orgId)).toBe(true);
    }
    // One worker takes jobs one at a time; with polling, five take about five singles.
    expect(
      all,
      `C4-P3 five imports took ${all.toFixed(0)} ms, one took ${one.toFixed(0)} ms, budget ${Math.max(2 * one, 5 * one + 2000).toFixed(0)} ms`,
    ).toBeLessThan(Math.max(2 * one, 5 * one + 2000));
  });
});

/** A pack with `n` ideas in the XLSX form, from the sample's other tabs. */
function bigWorkbook(n: number): Uint8Array {
  const rows = (tab: string): XCell[][] =>
    fixtureText(`${tab}.csv`)
      .trim()
      .split('\n')
      .map((line) => line.split(','));
  const ids = Array.from({ length: n }, (_, i) => `idea-${i}`);
  const ideas: XCell[][] = [
    [
      'idea_id',
      'title',
      'category',
      'unit',
      'objective',
      'standard_codes',
      'requires',
      'media_url',
      'rarity',
      'notes',
      'explanation',
    ],
    ...ids.map((id, i) => [
      id,
      `Idea ${i}`,
      'Process',
      (i % 3) + 1,
      `I can explain idea ${i}.`,
      'MS-ESS2-4',
      i > 0 && i % 4 === 0 ? ids[i - 1]! : '',
      `idea-${i}.mp4`,
      'auto',
      '',
      `Idea ${i} is part of the water cycle.`,
    ]),
  ];
  const links: XCell[][] = [
    ['from_id', 'to_id', 'relation', 'importance', 'media_url'],
    ...ids.flatMap((id, i) => [
      [id, ids[(i + 1) % n]!, 'leads to', (i % 5) + 1, ''],
      [id, ids[(i + 7) % n]!, 'relates to', ((i + 2) % 5) + 1, ''],
    ]),
  ];
  const assessment: XCell[][] = [
    ['unit', 'idea_id', 'question', 'key_points'],
    ...ids.map((id, i) => [(i % 3) + 1, id, `What is idea ${i}?`, `Idea ${i}`]),
  ];
  return xlsx({
    Course: rows('Course'),
    Units: rows('Units'),
    Ideas: ideas,
    Links: links,
    Categories: rows('Categories'),
    Assessment: assessment,
    Personas: [['persona_id', 'name', 'role', 'audience', 'tone', 'prompt_template']],
    Library: rows('Library'),
  });
}

describe.skipIf(!hasDatabase)('large imports (C4-P2)', () => {
  let t: TestDatabase;
  let boss: PgBoss;

  beforeAll(async () => {
    t = await freshDatabase();
    boss = await startBoss(t.url);
  });
  afterAll(async () => {
    await boss?.stop({ graceful: false, timeout: 1000 });
    await t?.drop();
  });

  it('a 2,000-idea XLSX imports in under 30 seconds, under 512 MB', async () => {
    const deps: ImportDeps = { scope: appScope(t.db), boss, store: store() };
    await registerWorkers({ ...deps, boss, embedder: hashEmbedder(), pollingIntervalSeconds: 0.5 });
    const org = await seedOrg(t.db, 'large');
    const bytes = bigWorkbook(2000);
    let peak = process.memoryUsage().rss;
    const sampler = setInterval(() => {
      peak = Math.max(peak, process.memoryUsage().rss);
    }, 25);
    try {
      const started = performance.now();
      const job = await startImport(deps, org.teacher, {
        curriculumId: org.curriculumId,
        file: file('large.xlsx', bytes),
      });
      const done = await waitFor(
        () => getImportJob(deps, org.teacher, job.job.id),
        (j) => j.status !== 'queued' && j.status !== 'running',
        60_000,
      );
      const ms = performance.now() - started;
      expect(done.error).toBeNull();
      expect(done.status).toBe('succeeded');
      expect(done.steps[0]!.result).toBe('2,000 ideas, 4,000 links');
      expect(ms, `scale import took ${ms.toFixed(0)} ms, budget 30000 ms`).toBeLessThan(30_000);
      expect(peak).toBeLessThan(512 * 1024 * 1024);
    } finally {
      clearInterval(sampler);
    }
  });
});
