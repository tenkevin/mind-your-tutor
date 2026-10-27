import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSRF_HEADER } from '@ideamap/contracts';
import { createDb, type Db } from '@ideamap/db';
import { hasDatabase } from '@ideamap/db/testing';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from './index.js';
import { SESSION_COOKIE } from './policy.js';
import { fromApp, ORIGIN, sessionFor, startApi, type TestApi } from './test/harness.js';

// M2-P1: event ingest throughput. A timing test, so it runs in the `perf` project
// (vitest.config.ts): after the other test files, one file at a time. Two seconds of
// the same load warm the API first and aren't measured.
//
// The API listens on a real port and a separate process (test/load-generator.mjs)
// sends the load, so the generator's CPU work can't stall the API's event loop. Each
// batch is timed twice: by the generator (what a client sees, the bar) and by the API
// (from request to response, which leaves out the generator's own delays).
//
// For benchmarking: IDEAMAP_PERF_POOL sets the API's pool size (default pg's 10, as
// deployed) and IDEAMAP_PERF_OUT names a file for a JSON summary of the run.

const GENERATOR = fileURLToPath(new URL('./test/load-generator.mjs', import.meta.url));

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

const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)]!;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const p99 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.99)]!;

function runGenerator(planPath: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [GENERATOR, planPath, outPath], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`load generator exited with ${code}`)),
    );
  });
}

describe.skipIf(!hasDatabase)('throughput (M2-P1)', () => {
  let api: TestApi;
  // The API as deployed: its own pool at pg's default size (10, as `createDb(url)` in
  // index.ts), not the 4 connections the harness gives test files running in parallel.
  let db: Db;
  let server: ReturnType<typeof buildServer>;
  const serverMs: number[] = [];
  /** When each batch finished, for a timeline of slow batches (IDEAMAP_PERF_OUT). */
  const serverAt: number[] = [];
  beforeAll(async () => {
    api = await startApi();
    db = createDb(api.t.url, { max: Number(process.env.IDEAMAP_PERF_POOL ?? 10) });
    server = buildServer({ db, config: api.config });
    server.addHook('onResponse', async (req, reply) => {
      if (req.url === '/events') {
        serverMs.push(reply.elapsedTime);
        serverAt.push(Date.now());
      }
    });
    await server.listen({ host: '127.0.0.1', port: 0 });
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
    // A deployed database has planner statistics. The seed above just loaded about
    // 27,000 rows, and autovacuum's analyze would land mid-run: until it does, the
    // planner works from defaults for a table it thinks is empty.
    await sql`ANALYZE`.execute(owner);
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
    // The whole plan is made before the clock starts.
    const port = (server.server.address() as { port: number }).port;
    const plan = {
      port,
      ratePerSecond: RATE,
      headers: { ...fromApp(), origin: ORIGIN, 'content-type': 'application/json' },
      requests: Array.from({ length: TICKS }, () =>
        students.map((s, i) => ({
          headers: {
            [CSRF_HEADER]: sessions[i]!.csrf,
            cookie: `${SESSION_COOKIE}=${sessions[i]!.cookie}`,
          },
          body: JSON.stringify(batch(s.classId)),
        })),
      ).flat(),
    };
    // A deployed API is warm: its pool's connections are open and the code and
    // database caches are loaded. Two seconds of the same load first, not measured.
    const warmup = {
      ...plan,
      requests: students.slice(0, RATE * 2).map((s, i) => ({
        headers: plan.requests[i]!.headers,
        body: JSON.stringify(batch(s.classId)),
      })),
    };
    const dir = await mkdtemp(join(tmpdir(), 'ideamap-load-'));
    try {
      await writeFile(join(dir, 'warmup.json'), JSON.stringify(warmup));
      await runGenerator(join(dir, 'warmup.json'), join(dir, 'warmup-out.json'));
      await writeFile(join(dir, 'plan.json'), JSON.stringify(plan));
      serverMs.length = 0;
      serverAt.length = 0;
      await runGenerator(join(dir, 'plan.json'), join(dir, 'out.json'));
      const out = JSON.parse(await readFile(join(dir, 'out.json'), 'utf8')) as {
        seconds: number;
        results: { ms: number; status: number; accepted: number }[];
      };
      const clientMs = out.results.map((r) => r.ms);
      const events = out.results.reduce((sum, r) => sum + r.accepted, 0);
      const summary = {
        rate: events / out.seconds,
        events,
        clientP95: p95(clientMs),
        clientMedian: median(clientMs),
        serverP95: p95(serverMs),
        serverMedian: median(serverMs),
        pool: Number(process.env.IDEAMAP_PERF_POOL ?? 10),
        timeline: serverAt.map((at, i) => [at, Math.round(serverMs[i]!)]),
      };
      if (process.env.IDEAMAP_PERF_OUT) {
        await writeFile(process.env.IDEAMAP_PERF_OUT, JSON.stringify(summary));
      }
      // Always printed, so a CI log shows the numbers and where any tail comes from.
      // Requests are in plan order and due at i / RATE seconds, so request i belongs
      // to second floor(i / RATE) of the run.
      const f = (n: number) => n.toFixed(1).padStart(6);
      const lines = [
        `ingest ${summary.rate.toFixed(0)} events/s over ${out.seconds.toFixed(1)} s, ${out.results.length} batches`,
        `client ms p50 ${f(summary.clientMedian)} p95 ${f(summary.clientP95)} p99 ${f(p99(clientMs))} max ${f(Math.max(...clientMs))}`,
        `server ms p50 ${f(summary.serverMedian)} p95 ${f(summary.serverP95)} p99 ${f(p99(serverMs))} max ${f(Math.max(...serverMs))}`,
        'timeline (client ms per second of the run):',
      ];
      const seconds = Math.ceil(out.results.length / RATE);
      for (let s = 0; s < seconds; s++) {
        const xs = clientMs.slice(Math.round(s * RATE), Math.round((s + 1) * RATE));
        if (xs.length === 0) continue;
        lines.push(
          `  s${String(s).padStart(2)}  n ${String(xs.length).padStart(3)}  p50 ${f(median(xs))}  p95 ${f(p95(xs))}  max ${f(Math.max(...xs))}`,
        );
      }
      console.log(lines.join('\n'));
      // For CI to publish as an annotation (the job log can't always be fetched).
      if (process.env.IDEAMAP_PERF_REPORT) {
        await writeFile(process.env.IDEAMAP_PERF_REPORT, lines.join('\n') + '\n');
      }
      expect(out.results.every((r) => r.status === 200)).toBe(true);
      expect(events).toBe(students.length * PER_BATCH * TICKS);
      expect(summary.rate).toBeGreaterThan(5000);
      expect(summary.clientP95).toBeLessThan(200);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 300_000);
});
