import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerWorkers } from './index.js';
import { getImportJob, startImport, type ImportDeps } from './imports.js';
import {
  appScope,
  fixture,
  freshDatabase,
  hasDatabase,
  seedOrg,
  startBoss,
  store,
  type TestDatabase,
} from './testing/db.js';

// A6-P1: drafting 200 empty explanations runs as its own background job; the import
// that queued it finishes first and never waits for a model.

async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean, ms = 30_000) {
  const until = Date.now() + ms;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > until) throw new Error(`Timed out; last value: ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe.skipIf(!hasDatabase)('bulk drafting after import (A6-P1)', () => {
  let t: TestDatabase;
  let boss: PgBoss;
  let deps: ImportDeps;
  let release: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let writes = 0;

  beforeAll(async () => {
    t = await freshDatabase();
    boss = await startBoss(t.url);
    deps = { scope: appScope(t.db), boss, store: store() };
    await registerWorkers({
      ...deps,
      boss,
      pollingIntervalSeconds: 0.5,
      draftWriter: async () => {
        await gate;
        writes += 1;
        return { text: 'A drafted explanation.', model: 'mock-model-1' };
      },
    });
  });
  afterAll(async () => {
    release();
    await boss?.stop({ graceful: false, timeout: 1000 });
    await t?.drop();
  });

  it('imports first; the 200 drafts follow in the background', async () => {
    const org = await seedOrg(t.db, 'A');
    const raw = JSON.parse(fixture('pack.json').toString('utf8'));
    const template = raw.ideas[0];
    raw.ideas = Array.from({ length: 200 }, (_, n) => ({
      ...template,
      idea_id: `idea-${n}`,
      title: `Idea ${n}`,
      requires: [],
      explanation: null,
    }));
    raw.links = [];
    raw.assessment = [];
    const { job } = await startImport(deps, org.teacher, {
      curriculumId: org.curriculumId,
      file: new File([JSON.stringify(raw)], 'pack.json'),
    });
    const done = await waitFor(
      () => getImportJob(deps, org.teacher, job.id),
      (j) => j.status === 'succeeded' || j.status === 'failed',
    );
    expect(done.status).toBe('succeeded');
    // The model is still blocked, so nothing is drafted yet: the import didn't wait.
    expect(writes).toBe(0);
    release();
    const count = () =>
      t.db
        .selectFrom('content_draft')
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .where('curriculum_id', '=', org.curriculumId)
        .where('kind', '=', 'idea_explanation')
        .executeTakeFirstOrThrow()
        .then((r) => Number(r.n));
    await waitFor(count, (n) => n === 200);
    const row = await t.db
      .selectFrom('content_draft')
      .selectAll()
      .where('curriculum_id', '=', org.curriculumId)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({ status: 'pending', approved_text: null, model: 'mock-model-1' });
    expect(row.source_version_id).toBe(done.version!.id);
  });
});
