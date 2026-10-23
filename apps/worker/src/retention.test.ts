import { randomBytes } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  APP_ROLE,
  DirectoryExportStore,
  json,
  REMOVED_TEXT,
  resolveTexts,
  RETENTION_ROLE,
  withOrg,
  type Db,
} from '@ideamap/db';
import {
  freshDatabase,
  hasDatabase,
  seedOrg,
  testUlid,
  type SeededOrg,
  type TestDatabase,
} from '@ideamap/db/testing';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RETENTION_CRON, RETENTION_QUEUE, runRetention, scheduleRetention } from './retention.js';

// F6-F3, F6-F4 and F6-P1: the retention job.

const AGES = [29, 30, 31, 89, 90, 91] as const;

/** Text and an AI transcript per age, plus an event referring to each text. */
async function seedAged(db: Db, org: SeededOrg): Promise<Map<number, string>> {
  const texts = new Map<number, string>();
  const version = await db
    .selectFrom('class')
    .select('pinned_version_id')
    .where('id', '=', org.classId)
    .executeTakeFirstOrThrow();
  const maxSeq = await db
    .selectFrom('interaction_event')
    .select(sql<number>`coalesce(max(seq), 0)::int`.as('n'))
    .where('student_id', '=', org.studentId)
    .executeTakeFirstOrThrow();
  let seq = maxSeq.n;
  for (const days of AGES) {
    const created_at = sql<Date>`now() - make_interval(days => ${days})`;
    const text = await db
      .insertInto('interaction_text')
      .values({
        org_id: org.orgId,
        class_id: org.classId,
        student_id: org.studentId,
        kind: 'chat',
        body: `Typed ${days} days ago`,
        created_at,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    texts.set(days, text.id);
    await db
      .insertInto('ai_interaction')
      .values({
        org_id: org.orgId,
        class_id: org.classId,
        user_id: org.studentId,
        persona: 'tutor',
        model: `aged-${days}`,
        request: json({ messages: [] }),
        created_at,
      })
      .execute();
    await db
      .insertInto('interaction_event')
      .values({
        id: testUlid(),
        org_id: org.orgId,
        class_id: org.classId,
        student_id: org.studentId,
        version_id: version.pinned_version_id!,
        seq: ++seq,
        at: new Date(),
        type: 'chat.turn',
        payload: json({ persona: 'tutor', text_ref: text.id }),
      })
      .execute();
  }
  return texts;
}

/** Sign-in sessions in each state, tagged by provider name. */
const SESSIONS = {
  's-active': { expires: 1, revoked: null },
  's-expired29': { expires: -29, revoked: null },
  's-expired31': { expires: -31, revoked: null },
  's-revoked40': { expires: 1, revoked: -40 },
} as const;

async function seedSessions(db: Db, org: SeededOrg): Promise<void> {
  const day = 86_400_000;
  const now = Date.now();
  for (const [provider, s] of Object.entries(SESSIONS)) {
    await db
      .insertInto('auth_session')
      .values({
        org_id: org.orgId,
        user_id: org.studentId,
        token_hash: randomBytes(32),
        provider,
        created_at: new Date(now - 60 * day),
        last_seen_at: new Date(now - 30 * day),
        expires_at: new Date(now + s.expires * day),
        revoked_at: s.revoked === null ? null : new Date(now + s.revoked * day),
      })
      .execute();
  }
}

async function remainingSessions(db: Db, orgId: string): Promise<string[]> {
  const rows = await db
    .selectFrom('auth_session')
    .select('provider')
    .where('org_id', '=', orgId)
    .where('provider', 'like', 's-%')
    .orderBy('provider')
    .execute();
  return rows.map((r) => r.provider);
}

async function remainingAges(db: Db, orgId: string) {
  const text = await db
    .selectFrom('interaction_text')
    .select('body')
    .where('org_id', '=', orgId)
    .where('body', 'like', 'Typed %')
    .execute();
  const ai = await db
    .selectFrom('ai_interaction')
    .select('model')
    .where('org_id', '=', orgId)
    .where('model', 'like', 'aged-%')
    .execute();
  const age = (s: string) => Number(/(\d+)/.exec(s)![1]);
  return {
    text: text.map((r) => age(r.body)).sort((x, y) => x - y),
    ai: ai.map((r) => age(r.model)).sort((x, y) => x - y),
  };
}

describe.skipIf(!hasDatabase)('retention job (F6-F3, F6-F4)', () => {
  let t: TestDatabase;
  let retention: Db;
  let a: SeededOrg;
  let b: SeededOrg;
  let textsA: Map<number, string>;
  let textsB: Map<number, string>;
  let dir: string;

  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedOrg(t.db, 'a');
    b = await seedOrg(t.db, 'b');
    // A keeps the defaults (90 days, sessions 30); B keeps text 30 days, transcripts
    // 60 and ended sessions 7.
    await t.db
      .updateTable('organization')
      .set({ text_retention_days: 30, ai_retention_days: 60, session_retention_days: 7 })
      .where('id', '=', b.orgId)
      .execute();
    textsA = await seedAged(t.db, a);
    textsB = await seedAged(t.db, b);
    await seedSessions(t.db, a);
    await seedSessions(t.db, b);
    retention = await t.loginAs(RETENTION_ROLE);
    dir = await mkdtemp(join(tmpdir(), 'ideamap-retention-'));
  });
  afterAll(async () => {
    await t?.drop();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("deletes only rows past each org's limit", async () => {
    const eventsBefore = await t.db
      .selectFrom('interaction_event')
      .selectAll()
      .orderBy('id')
      .execute();
    const result = await runRetention(retention, { batchSize: 2 });
    expect(result).toEqual({
      interaction_text: 1 + 4,
      ai_interaction: 1 + 3,
      auth_session: 2 + 3,
      export_files: 0,
      aborted: false,
    });

    expect(await remainingAges(t.db, a.orgId)).toEqual({
      text: [29, 30, 31, 89, 90],
      ai: [29, 30, 31, 89, 90],
    });
    expect(await remainingAges(t.db, b.orgId)).toEqual({ text: [29, 30], ai: [29, 30, 31] });
    // Sessions: kept while active, then for the org's period after they end.
    expect(await remainingSessions(t.db, a.orgId)).toEqual(['s-active', 's-expired29']);
    expect(await remainingSessions(t.db, b.orgId)).toEqual(['s-active']);
    // Seeded text from today is kept.
    expect(
      await t.db
        .selectFrom('interaction_text')
        .select('id')
        .where('id', 'in', [a.textId, b.textId])
        .execute(),
    ).toHaveLength(2);

    // Events are untouched and their references still resolve.
    expect(await t.db.selectFrom('interaction_event').selectAll().orderBy('id').execute()).toEqual(
      eventsBefore,
    );
    const app = await t.loginAs(APP_ROLE);
    const refs = await withOrg(app, a.orgId, async (trx) => {
      const events = await trx
        .selectFrom('interaction_event')
        .select('payload')
        .where('type', '=', 'chat.turn')
        .orderBy('seq')
        .execute();
      const ids = events.map((e) => (e.payload as { text_ref: string }).text_ref);
      return resolveTexts(trx, ids);
    });
    expect(refs.get(textsA.get(91)!)).toEqual(REMOVED_TEXT);
    expect(refs.get(textsA.get(90)!)).toMatchObject({
      status: 'present',
      body: 'Typed 90 days ago',
    });
    expect(refs.get(textsA.get(89)!)).toMatchObject({ status: 'present' });
    expect(textsB.size).toBe(AGES.length);
  });

  it('does nothing more when run again', async () => {
    const before = { a: await remainingAges(t.db, a.orgId), b: await remainingAges(t.db, b.orgId) };
    expect(await runRetention(retention)).toEqual({
      interaction_text: 0,
      ai_interaction: 0,
      auth_session: 0,
      export_files: 0,
      aborted: false,
    });
    expect({
      a: await remainingAges(t.db, a.orgId),
      b: await remainingAges(t.db, b.orgId),
    }).toEqual(before);
  });

  it('removes expired export files and keeps recent ones', async () => {
    const store = new DirectoryExportStore(dir);
    const keys = {
      old: `student-records/${a.orgId}/old.json`,
      recent: `student-records/${a.orgId}/recent.json`,
    };
    await mkdir(join(dir, 'student-records', a.orgId), { recursive: true });
    for (const key of Object.values(keys)) await writeFile(join(dir, key), '{}');
    await t.db
      .insertInto('export_job')
      .values([
        {
          org_id: a.orgId,
          kind: 'student_record',
          status: 'succeeded',
          result_ref: keys.old,
          created_at: sql<Date>`now() - interval '9 days'`,
          finished_at: sql<Date>`now() - interval '9 days'`,
        },
        {
          org_id: a.orgId,
          kind: 'student_record',
          status: 'succeeded',
          result_ref: keys.recent,
          finished_at: new Date(),
        },
      ])
      .execute();
    const result = await runRetention(retention, { store });
    expect(result.export_files).toBe(1);
    expect(await readdir(join(dir, 'student-records', a.orgId))).toEqual(['recent.json']);
    const refs = await t.db
      .selectFrom('export_job')
      .select('result_ref')
      .where('org_id', '=', a.orgId)
      .execute();
    expect(refs.map((r) => r.result_ref).filter(Boolean)).toEqual([keys.recent]);
  });
});

describe.skipIf(!hasDatabase)('retention job interrupted (F6-F4)', () => {
  let t: TestDatabase;
  let a: SeededOrg;

  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedOrg(t.db, 'a');
    await t.db.executeQuery(
      sql`
        INSERT INTO interaction_text (org_id, class_id, student_id, kind, body, created_at)
        SELECT ${a.orgId}, ${a.classId}, ${a.studentId}, 'chat', 'old ' || n, now() - interval '200 days' - make_interval(secs => n)
        FROM generate_series(1, 1000) AS n
      `.compile(t.db),
    );
  });
  afterAll(async () => {
    await t?.drop();
  });

  const due = async () =>
    (
      await t.db
        .selectFrom('interaction_text')
        .select(sql<number>`count(*)::int`.as('n'))
        .where('body', 'like', 'old %')
        .executeTakeFirstOrThrow()
    ).n;

  it('stops cleanly between batches when aborted, and a rerun finishes', async () => {
    const retention = await t.loginAs(RETENTION_ROLE);
    const controller = new AbortController();
    const first = await runRetention(retention, {
      batchSize: 100,
      signal: controller.signal,
      onBatch: (b) => {
        if (b.rows > 0) controller.abort();
      },
    });
    expect(first).toMatchObject({ interaction_text: 100, aborted: true });
    expect(await due()).toBe(900);
    const second = await runRetention(retention, { batchSize: 100 });
    expect(second.interaction_text).toBe(900);
    expect(await due()).toBe(0);
  });

  it('loses only the batch in flight when its connection is killed', async () => {
    await t.db.executeQuery(
      sql`
        INSERT INTO interaction_text (org_id, class_id, student_id, kind, body, created_at)
        SELECT ${a.orgId}, ${a.classId}, ${a.studentId}, 'chat', 'old ' || n, now() - interval '200 days' - make_interval(secs => n)
        FROM generate_series(1, 300) AS n
      `.compile(t.db),
    );
    const retention = await t.loginAs(RETENTION_ROLE);
    // Hold a lock on one row of the second batch, so the job blocks mid-batch.
    const oldest = await t.db
      .selectFrom('interaction_text')
      .select('id')
      .where('body', 'like', 'old %')
      .orderBy('created_at')
      .offset(150)
      .limit(1)
      .executeTakeFirstOrThrow();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let locked!: () => void;
    const isLocked = new Promise<void>((resolve) => (locked = resolve));
    const holder = t.db.transaction().execute(async (trx) => {
      await sql`SELECT 1 FROM interaction_text WHERE id = ${oldest.id} FOR UPDATE`.execute(trx);
      locked();
      await held;
    });
    await isLocked;

    const run = runRetention(retention, { batchSize: 100 }).catch((e: unknown) => e);
    // Wait until the job is blocked inside its second batch, then kill its backend.
    const deadline = Date.now() + 30_000;
    for (;;) {
      if (Date.now() > deadline) throw new Error('the job never blocked on the held row');
      const { rows } = await sql<{ pid: number }>`
        SELECT pid FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ~ '^\\s*DELETE FROM'
      `.execute(t.db);
      if (rows[0]) {
        await sql`SELECT pg_terminate_backend(${rows[0].pid})`.execute(t.db);
        break;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    const failed = await run;
    expect(failed).toBeInstanceOf(Error);
    release();
    await holder;

    // The first batch committed; the killed one left every row in place.
    expect(await due()).toBe(200);
    const again = await runRetention(retention, { batchSize: 100 });
    expect(again).toMatchObject({ interaction_text: 200, aborted: false });
    expect(await due()).toBe(0);
  });
});

/** Seeding 1,000,000 rows and the 5-minute bar need more than the default timeout. */
const SCALE_TIMEOUT = 600_000;

describe.skipIf(!hasDatabase)('retention at scale (F6-P1)', () => {
  const ROWS = Number(process.env.IDEAMAP_PERF_TEXT_ROWS ?? 1_000_000);
  let t: TestDatabase;
  let a: SeededOrg;

  beforeAll(async () => {
    t = await freshDatabase();
    a = await seedOrg(t.db, 'a');
    // Half due (100 days old), half not (10 days old), across the 90-day default.
    await t.db.executeQuery(
      sql`
        INSERT INTO interaction_text (org_id, class_id, student_id, kind, body, created_at)
        SELECT ${a.orgId}, ${a.classId}, ${a.studentId}, 'chat', 'Message number ' || n,
          now() - CASE WHEN n % 2 = 0 THEN interval '100 days' ELSE interval '10 days' END
            - make_interval(secs => n % 86400)
        FROM generate_series(1, ${ROWS}) AS n
      `.compile(t.db),
    );
    await sql`ANALYZE interaction_text`.execute(t.db);
  }, SCALE_TIMEOUT);
  afterAll(async () => {
    await t?.drop();
  });

  it(
    'deletes half of 1,000,000 rows in batches in under 5 minutes, without blocking inserts',
    async () => {
      const retention = await t.loginAs(RETENTION_ROLE);
      const app = await t.loginAs(APP_ROLE);
      let running = true;
      const insertTimes: number[] = [];
      const inserts = (async () => {
        while (running) {
          const started = performance.now();
          await withOrg(app, a.orgId, (trx) =>
            trx
              .insertInto('interaction_text')
              .values({
                org_id: a.orgId,
                class_id: a.classId,
                student_id: a.studentId,
                kind: 'chat',
                body: 'live',
              })
              .execute(),
          );
          insertTimes.push(performance.now() - started);
          await new Promise((r) => setTimeout(r, 10));
        }
      })();

      let batches = 0;
      const started = performance.now();
      const result = await runRetention(retention, { onBatch: () => batches++ });
      const elapsed = performance.now() - started;
      running = false;
      await inserts;

      expect(result.interaction_text).toBe(Math.floor(ROWS / 2));
      expect(batches).toBeGreaterThanOrEqual(Math.floor(ROWS / 2 / 5000));
      expect(elapsed).toBeLessThan(5 * 60_000);
      expect(insertTimes.length).toBeGreaterThan(0);
      insertTimes.sort((x, y) => x - y);
      const worst = insertTimes[insertTimes.length - 1]!;
      if (process.env.IDEAMAP_PERF_VERBOSE) {
        console.log({
          rows: ROWS,
          elapsedMs: Math.round(elapsed),
          batches,
          inserts: insertTimes.length,
          worstInsertMs: worst,
        });
      }
      // Inserts kept going: none waited on the job for long.
      expect(worst).toBeLessThan(1000);
    },
    SCALE_TIMEOUT,
  );
});

describe('retention schedule', () => {
  it('runs daily through pg-boss', async () => {
    const calls: unknown[][] = [];
    let handler: (() => Promise<unknown>) | undefined;
    const boss = {
      createQueue: async (...args: unknown[]) => void calls.push(['createQueue', ...args]),
      schedule: async (...args: unknown[]) => void calls.push(['schedule', ...args]),
      work: async (name: string, fn: () => Promise<unknown>) => {
        calls.push(['work', name]);
        handler = fn;
        return 'worker-id';
      },
    };
    let ran = 0;
    await scheduleRetention(boss, async () => {
      ran++;
      return {
        interaction_text: 0,
        ai_interaction: 0,
        auth_session: 0,
        export_files: 0,
        aborted: false,
      };
    });
    expect(calls).toEqual([
      ['createQueue', RETENTION_QUEUE],
      ['schedule', RETENTION_QUEUE, RETENTION_CRON, null, { tz: 'UTC' }],
      ['work', RETENTION_QUEUE],
    ]);
    await handler!();
    expect(ran).toBe(1);
  });
});
