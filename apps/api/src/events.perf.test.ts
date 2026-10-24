import { CSRF_HEADER, type EventBatchResponse } from '@ideamap/contracts';
import { createDb, type Db } from '@ideamap/db';
import { hasDatabase } from '@ideamap/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from './index.js';
import { SESSION_COOKIE } from './policy.js';
import { fromApp, ORIGIN, sessionFor, startApi, type TestApi } from './test/harness.js';

// M2-P1: event ingest throughput. A timing test, so it runs in the `perf` project
// (vitest.config.ts): after the other test files, one file at a time, with the
// runner to itself.

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let ulidCount = 0;
/** A ULID: 10 characters of time, 16 of counter, unique within the run. */
function ulid(): string {
  let time = Date.now();
  let head = '';
  for (let i = 0; i < 10; i++) {
    head = CROCKFORD[time % 32]! + head;
    time = Math.floor(time / 32);
  }
  let n = ++ulidCount;
  let tail = '';
  for (let i = 0; i < 16; i++) {
    tail = CROCKFORD[n % 32]! + tail;
    n = Math.floor(n / 32);
  }
  return head + tail;
}

describe.skipIf(!hasDatabase)('throughput (M2-P1)', () => {
  let api: TestApi;
  // The API as deployed: its own pool at pg's default size (10, as `createDb(url)` in
  // index.ts), not the 4 connections the harness gives test files running in parallel.
  let db: Db;
  let server: ReturnType<typeof buildServer>;
  beforeAll(async () => {
    api = await startApi();
    db = createDb(api.t.url);
    server = buildServer({ db, config: api.config });
    await server.ready();
  }, 120_000);
  afterAll(async () => {
    await server?.close();
    await db?.destroy();
    await api?.close();
  });

  it('sustains over 5,000 events/s from 30 classes × 30 students, p95 batch under 200 ms', async () => {
    const { orgs, curricula, users } = api.sample;
    // Seeded as the owner, like the harness's sample.
    const owner = api.t.db;
    const version = await owner
      .selectFrom('curriculum_version')
      .select('id')
      .where('curriculum_id', '=', curricula.a)
      .executeTakeFirstOrThrow();
    // 30 classes of 30 students each, all on curriculum A.
    const students: { userId: string; classId: string }[] = [];
    for (let c = 0; c < 30; c++) {
      const klass = await owner
        .insertInto('class')
        .values({
          org_id: orgs.a,
          curriculum_id: curricula.a,
          teacher_id: users['teacher-a1'],
          name: `Load ${c}`,
          pinned_version_id: version.id,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const created = await owner
        .insertInto('app_user')
        .values(
          Array.from({ length: 30 }, (_, s) => ({
            org_id: orgs.a,
            role: 'student' as const,
            name: `Load Student ${c}-${s}`,
          })),
        )
        .returning('id')
        .execute();
      await owner
        .insertInto('enrollment')
        .values(created.map((u) => ({ org_id: orgs.a, class_id: klass.id, student_id: u.id })))
        .execute();
      for (const u of created) students.push({ userId: u.id, classId: klass.id });
    }
    const sessions = await Promise.all(students.map((s) => sessionFor(api, s.userId, orgs.a)));

    // Each of the 900 students sends one batch every 5 s, arriving evenly across the
    // tick: 180 batches/s. At 31 events a batch (a busy quiz) that offers 5,580
    // events/s, so the run must sustain more than the 5,000/s bar.
    const PER_BATCH = 31;
    const TICKS = 3;
    const RATE = students.length / 5; // batches per second
    const batch = (classId: string) => ({
      events: Array.from({ length: PER_BATCH }, (_, i) => ({
        id: ulid(),
        classId,
        versionId: version.id,
        at: new Date().toISOString(),
        type: i % 2 ? 'idea.opened' : 'hint.requested',
        payload: { ideaId: 'evaporation' },
      })),
    });
    // The simulated clients' work (making and serialising batches) is done before the
    // clock starts, so the run measures the server.
    const plan = Array.from({ length: TICKS }, () =>
      students.map((s, i) => ({ who: sessions[i]!, body: JSON.stringify(batch(s.classId)) })),
    ).flat();
    const latencies: number[] = [];
    let events = 0;
    const started = performance.now();
    await Promise.all(
      plan.map(async ({ who, body }, i) => {
        const due = started + (i / RATE) * 1000;
        const wait = due - performance.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        const t0 = performance.now();
        const res = await server.inject({
          method: 'POST',
          url: '/events',
          headers: {
            ...fromApp(),
            origin: ORIGIN,
            [CSRF_HEADER]: who.csrf,
            'content-type': 'application/json',
          },
          cookies: { [SESSION_COOKIE]: who.cookie },
          payload: body,
        });
        latencies.push(performance.now() - t0);
        expect(res.statusCode).toBe(200);
        events += (res.json() as EventBatchResponse).accepted.length;
      }),
    );
    const seconds = (performance.now() - started) / 1000;
    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)]!;
    const rate = events / seconds;
    if (process.env.IDEAMAP_PERF_VERBOSE) {
      console.log(`ingest ${rate.toFixed(0)} events/s, p95 ${p95.toFixed(1)} ms, ${events} events`);
    }
    expect(events).toBe(students.length * PER_BATCH * TICKS);
    expect(rate).toBeGreaterThan(5000);
    expect(p95).toBeLessThan(200);
  }, 300_000);
});
