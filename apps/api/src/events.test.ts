import { Writable } from 'node:stream';
import { BLURRED } from '@ideamap/ai/backstop';
import { CSRF_HEADER, EventBatchResponseSchema, type EventBatchResponse } from '@ideamap/contracts';
import { json, type ExportStore } from '@ideamap/db';
import { errorCode, hasDatabase, PG } from '@ideamap/db/testing';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scoped } from './db.js';
import { buildServer } from './index.js';
import { SESSION_COOKIE } from './policy.js';
import {
  as,
  fromApp,
  ORIGIN,
  sessionFor,
  startApi,
  type Signed,
  type TestApi,
} from './test/harness.js';

// M2: POST /events (M2-F1 to F4, F6, S1, S3, S4, P1) and D22 deletion through the
// privacy routes (M2-F7). The client queue (M2-F5, U1) is tested in apps/student.

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

const uuid = () => crypto.randomUUID();
const NO_FILES: ExportStore = { put: async () => {}, remove: async () => {} };

describe.skipIf(!hasDatabase)('POST /events (M2)', () => {
  let api: TestApi;
  let sam: Signed;
  let sky: Signed;
  let admin: Signed;
  let v1 = '';
  let v2 = '';

  beforeAll(async () => {
    api = await startApi({}, { privacy: NO_FILES });
    const { orgs, users, classes, curricula } = api.sample;
    const version = await api.t.db
      .selectFrom('curriculum_version')
      .select('id')
      .where('curriculum_id', '=', curricula.a)
      .executeTakeFirstOrThrow();
    v1 = version.id;
    await api.t.db
      .updateTable('class')
      .set({ pinned_version_id: v1 })
      .where('id', 'in', [classes.a1, classes.a2])
      .execute();
    sam = await sessionFor(api, users['student-a1'], orgs.a);
    sky = await sessionFor(api, users['student-a2'], orgs.a);
    admin = await sessionFor(api, users['admin-a'], orgs.a);
  });
  afterAll(async () => {
    await api?.close();
  });

  const student = (who: Signed) => (body: unknown) => as(api, who)('POST', '/events', body);

  function event(type: string, payload: unknown, extra: Record<string, unknown> = {}) {
    return {
      id: ulid(),
      classId: api.sample.classes.a1,
      versionId: v1,
      at: new Date().toISOString(),
      type,
      payload,
      ...extra,
    };
  }

  /** A mix of valid participating events, as the student app sends them. */
  function mixed(n: number) {
    const attemptId = uuid();
    const makers = [
      () => event('idea.opened', { ideaId: 'evaporation' }),
      () => event('idea.active_time', { ideaId: 'evaporation', seconds: 47 }),
      () =>
        event('quiz.started', {
          ideaId: 'evaporation',
          attemptId,
          questionIds: ['evaporation/mcq/a>b'],
        }),
      () =>
        event('quiz.answered', {
          attemptId,
          questionId: 'evaporation/mcq/a>b',
          choice: 1,
          correct: true,
          attemptNumber: 1,
          secondsToAnswer: 12,
        }),
      () => event('quiz.finished', { attemptId, score: 1, of: 1 }),
      () => event('hint.requested', { ideaId: 'evaporation' }),
      () =>
        event('review.link_rebuilt', { ideaId: 'evaporation', linkId: 'evaporation>condensation' }),
      () => event('feedback.shown', { feedbackId: uuid(), source: 'ai', reasonRef: uuid() }),
      () => event('mission.completed', { missionId: 1 }),
      () => event('map.shown', { mapViewId: uuid() }),
      () => event('ai.output_shown', { aiOutputId: uuid() }),
    ];
    return Array.from({ length: n }, (_, i) => makers[i % makers.length]!());
  }

  const body = (res: { statusCode: number; body: string; json: () => unknown }) => {
    expect(res.statusCode, res.body).toBe(200);
    return EventBatchResponseSchema.parse(res.json());
  };

  async function storedFor(studentId: string) {
    return api.t.db
      .selectFrom('interaction_event')
      .selectAll()
      .where('student_id', '=', studentId)
      .orderBy('seq')
      .execute();
  }

  it('stores a batch of 50 mixed events once each, with seq and level (M2-F1)', async () => {
    const events = mixed(50);
    const res = await student(sam)({ events });
    expect(res.statusCode, res.body).toBe(200);
    const out = body(res);
    expect(out.rejected).toEqual([]);
    expect(out.duplicates).toEqual([]);
    expect(out.accepted.map((a) => a.id)).toEqual(events.map((e) => e.id));
    expect(out.accepted.map((a) => a.seq)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));

    const rows = await storedFor(api.sample.users['student-a1']);
    expect(rows.map((r) => r.id)).toEqual(events.map((e) => e.id));
    expect(rows.map((r) => Number(r.seq))).toEqual(out.accepted.map((a) => a.seq));
    for (const r of rows) {
      expect(r.level).toBe(
        r.type === 'map.shown' || r.type === 'ai.output_shown' ? 'other' : 'participating',
      );
      expect(r.org_id).toBe(api.sample.orgs.a);
      expect(r.tracing_opted_out).toBe(false);
    }
    // Durations are stored on their D19 grid.
    const active = rows.find((r) => r.type === 'idea.active_time')!;
    expect(active.payload).toEqual({ ideaId: 'evaporation', seconds: 60 });
    const answered = rows.find((r) => r.type === 'quiz.answered')!;
    expect((answered.payload as { secondsToAnswer: number }).secondsToAnswer).toBe(10);
    // Each in a monthly partition.
    const { rows: parts } = await sql<{ part: string }>`
      SELECT DISTINCT tableoid::regclass::text AS part FROM interaction_event
    `.execute(api.t.db);
    expect(parts.map((p) => p.part)).toEqual([
      expect.stringMatching(/^interaction_event_y\d{4}m\d{2}$/),
    ]);
  });

  it('drops resent ids without error and continues seq with no gaps (M2-F2)', async () => {
    const first = mixed(5).map((e) => ({ ...e, classId: api.sample.classes.a2 }));
    const a = body(await student(sky)({ events: first }));
    expect(a.accepted.map((x) => x.seq)).toEqual([1, 2, 3, 4, 5]);

    const again = await student(sky)({ events: first });
    expect(again.statusCode).toBe(200);
    expect(body(again)).toEqual({ accepted: [], duplicates: first.map((e) => e.id), rejected: [] });

    const fresh = mixed(3).map((e) => ({ ...e, classId: api.sample.classes.a2 }));
    const mix = [first[0]!, fresh[0]!, first[3]!, fresh[1]!, fresh[1]!, fresh[2]!];
    const out = body(await student(sky)({ events: mix }));
    expect(out.accepted).toEqual([
      { id: fresh[0]!.id, seq: 6 },
      { id: fresh[1]!.id, seq: 7 },
      { id: fresh[2]!.id, seq: 8 },
    ]);
    expect(out.duplicates.sort()).toEqual([first[0]!.id, first[3]!.id, fresh[1]!.id].sort());
    const seqs = (await storedFor(api.sample.users['student-a2'])).map((r) => Number(r.seq));
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('numbers concurrent batches from one student with no gaps or repeats (M2-F2)', async () => {
    const studentId = api.sample.users['student-a2'];
    const before = (await storedFor(studentId)).length;
    const batches = Array.from({ length: 6 }, () =>
      mixed(10).map((e) => ({ ...e, classId: api.sample.classes.a2 })),
    );
    // The first batch is also resent while it is in flight, as a retrying tab would.
    const sends = [...batches, batches[0]!].map((events) => student(sky)({ events }));
    const answers = (await Promise.all(sends)).map(body);

    const accepted = answers.flatMap((a) => a.accepted);
    expect(accepted).toHaveLength(60);
    expect(new Set(accepted.map((a) => a.id)).size).toBe(60);
    expect(answers.flatMap((a) => a.duplicates)).toHaveLength(10);
    expect(answers.flatMap((a) => a.rejected)).toEqual([]);
    const seqs = accepted.map((a) => a.seq).sort((x, y) => x - y);
    expect(seqs).toEqual(Array.from({ length: 60 }, (_, i) => before + i + 1));
    const stored = (await storedFor(studentId)).map((r) => Number(r.seq));
    expect(stored).toEqual(Array.from({ length: before + 60 }, (_, i) => i + 1));
  });

  it('rejects bad events with a reason each and stores the valid ones (M2-F3)', async () => {
    const ok1 = event('idea.opened', { ideaId: 'rain' });
    const ok2 = event('hint.requested', { questionId: 'rain/mcq/a>b' });
    const batch = [
      event('page.scrolled', { y: 400 }),
      ok1,
      event('idea.opened', { ideaId: 'rain' }, { ip: '10.0.0.9' }),
      event('idea.opened', { ideaId: 'rain', device: 'iPad' }),
      event('idea.opened', { ideaId: 'rain' }, { level: 'teaching' }),
      event('idea.opened', { ideaId: 'rain' }, { versionId: api.sample.curricula.a }),
      event('teachback.judged', {
        unitId: 1,
        verdict: 'pass',
        keyPointsHit: [0],
        aiOutputId: uuid(),
      }),
      event('feedback.ruled', { feedbackId: uuid(), ruling: 'upheld' }),
      event('quiz.finished', { attemptId: uuid(), score: 9, of: 8 }),
      ok2,
    ];
    const res = await student(sam)({ events: batch });
    expect(res.statusCode).toBe(200);
    const out = body(res);
    expect(out.accepted.map((a) => a.id)).toEqual([ok1.id, ok2.id]);
    expect(out.rejected.map((r) => [r.index, r.code])).toEqual([
      [0, 'unknown_type'],
      [2, 'forbidden_field'],
      [3, 'forbidden_field'],
      [4, 'forbidden_field'],
      [5, 'version_not_pinned'],
      [6, 'server_only'],
      [7, 'server_only'],
      [8, 'invalid'],
    ]);
    for (const r of out.rejected) expect(r.message.length).toBeGreaterThan(5);
    // Rejection messages name a field, never echo its value.
    expect(JSON.stringify(out.rejected)).not.toContain('10.0.0.9');
    expect(JSON.stringify(out.rejected)).not.toContain('iPad');
  });

  it('accepts the replaced version inside the grace period after a publish, not after (M2-F3)', async () => {
    const { classes, curricula, orgs } = api.sample;
    const pack = await api.t.db
      .selectFrom('curriculum_version')
      .select(['pack', 'source'])
      .where('id', '=', v1)
      .executeTakeFirstOrThrow();
    const created = await api.t.db
      .insertInto('curriculum_version')
      .values({
        org_id: orgs.a,
        curriculum_id: curricula.a,
        number: 2,
        status: 'published',
        pack: json(pack.pack),
        source: json(pack.source),
        published_at: new Date(),
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    v2 = created.id;
    // The publish re-pins class A1 only.
    await api.t.db
      .updateTable('class')
      .set({ pinned_version_id: v2 })
      .where('id', '=', classes.a1)
      .execute();

    const onNew = event('idea.opened', { ideaId: 'rain' }, { versionId: v2 });
    const onOld = event('idea.opened', { ideaId: 'rain' });
    const inGrace = body(await student(sam)({ events: [onNew, onOld] }));
    expect(inGrace.accepted.map((a) => a.id)).toEqual([onNew.id, onOld.id]);

    // A2 was never re-pinned: v2 isn't its version.
    const a2 = body(
      await student(sky)({
        events: [event('idea.opened', { ideaId: 'rain' }, { classId: classes.a2, versionId: v2 })],
      }),
    );
    expect(a2.rejected.map((r) => r.code)).toEqual(['version_not_pinned']);

    // Past the grace period: the same server code with a grace that has run out.
    const strict = buildServer({ db: api.t.db, config: api.config, events: { graceMs: 1 } });
    await strict.ready();
    try {
      const late = event('idea.opened', { ideaId: 'rain' });
      const res = await strict.inject({
        method: 'POST',
        url: '/events',
        headers: { ...fromApp(), origin: ORIGIN, [CSRF_HEADER]: sam.csrf },
        cookies: { [SESSION_COOKIE]: sam.cookie },
        payload: { events: [late, event('idea.opened', { ideaId: 'rain' }, { versionId: v2 })] },
      });
      const out = body(res);
      expect(out.rejected).toEqual([
        { index: 0, id: late.id, code: 'version_not_pinned', message: expect.any(String) },
      ]);
      expect(out.accepted).toHaveLength(1);
    } finally {
      await strict.close();
    }
  });

  it('stores typed text anonymised; the backstop blurs and counts a real roster name (M2-F4)', async () => {
    const versionId = v2;
    const labelled = {
      id: uuid(),
      body: 'Person A said rain comes from clouds; Place B gets most of it.',
    };
    const leaked = {
      id: uuid(),
      body: 'Riley Rostered and I think evaporation is first. Ask Terry or mail sam.student@district-a.example.org',
    };
    const challenge = { id: uuid(), body: 'I disagree: Person A showed me the key point.' };
    const events = [
      event('teachback.done', { unitId: 1, textRef: labelled.id }, { versionId }),
      event('teachback.done', { unitId: 1, textRef: leaked.id }, { versionId }),
      event('feedback.challenged', { feedbackId: uuid(), textRef: challenge.id }, { versionId }),
      event('teachback.done', { unitId: 1, textRef: uuid() }, { versionId }),
    ];
    const missesBefore = await api.t.db.selectFrom('privacy_miss').select('id').execute();
    const out = body(await student(sam)({ events, texts: [labelled, leaked, challenge] }));
    expect(out.accepted.map((a) => a.id)).toEqual(events.slice(0, 3).map((e) => e.id));
    expect(out.rejected).toEqual([
      { index: 3, id: events[3]!.id, code: 'text_missing', message: expect.any(String) },
    ]);

    const texts = await api.t.db
      .selectFrom('interaction_text')
      .selectAll()
      .where('id', 'in', [labelled.id, leaked.id, challenge.id])
      .execute();
    const byId = new Map(texts.map((t) => [t.id, t]));
    expect(byId.get(labelled.id)).toMatchObject({ body: labelled.body, kind: 'teachback' });
    expect(byId.get(challenge.id)).toMatchObject({ body: challenge.body, kind: 'challenge' });
    const blurred = byId.get(leaked.id)!;
    expect(blurred.body).toBe(
      `${BLURRED} and I think evaporation is first. Ask ${BLURRED} or mail ${BLURRED}`,
    );
    expect(blurred.redacted_at).not.toBeNull();
    for (const t of texts) {
      expect(t.student_id).toBe(api.sample.users['student-a1']);
      expect(t.class_id).toBe(api.sample.classes.a1);
    }

    // The raw text is nowhere in the database.
    const { rows } = await sql<{ n: number }>`
      SELECT count(*)::int AS n FROM interaction_text WHERE body ILIKE '%Riley%' OR body ILIKE '%Terry%'
    `.execute(api.t.db);
    expect(rows[0]!.n).toBe(0);
    const misses = await api.t.db
      .selectFrom('privacy_miss')
      .selectAll()
      .where('id', 'not in', missesBefore.length ? missesBefore.map((m) => m.id) : [uuid()])
      .execute();
    expect(misses).toEqual([
      expect.objectContaining({
        org_id: api.sample.orgs.a,
        class_id: api.sample.classes.a1,
        source: 'event_ingest',
        names: 2,
        emails: 1,
        phones: 0,
      }),
    ]);

    // A resend stores nothing twice and counts no new miss.
    const resent = body(
      await student(sam)({ events: events.slice(0, 3), texts: [labelled, leaked, challenge] }),
    );
    expect(resent.duplicates).toHaveLength(3);
    expect(await api.t.db.selectFrom('privacy_miss').select('id').execute()).toHaveLength(
      missesBefore.length + 1,
    );

    // A new event may refer to text this student stored earlier, never to someone else's.
    const reuse = body(
      await student(sam)({
        events: [
          event(
            'feedback.challenged',
            { feedbackId: uuid(), textRef: challenge.id },
            { versionId },
          ),
        ],
      }),
    );
    expect(reuse.accepted).toHaveLength(1);
    const theft = body(
      await student(sky)({
        events: [
          event(
            'feedback.challenged',
            { feedbackId: uuid(), textRef: challenge.id },
            { classId: api.sample.classes.a2 },
          ),
        ],
        texts: [{ id: challenge.id, body: 'Overwrite attempt' }],
      }),
    );
    expect(theft.rejected.map((r) => r.code)).toEqual(['text_missing']);
    expect(
      (
        await api.t.db
          .selectFrom('interaction_text')
          .select('body')
          .where('id', '=', challenge.id)
          .executeTakeFirstOrThrow()
      ).body,
    ).toBe(challenge.body);
  });

  it('stores an opted-out student’s events with the opt-out mark (M2-F6)', async () => {
    const studentId = api.sample.users['student-a2'];
    const set = await as(api, admin)('PUT', `/api/privacy/students/${studentId}/tracing`, {
      optedOut: true,
    });
    expect(set.statusCode, set.body).toBe(200);
    expect(set.json()).toEqual({ optedOut: true });

    const events = mixed(3).map((e) => ({ ...e, classId: api.sample.classes.a2 }));
    const out = body(await student(sky)({ events }));
    expect(out.accepted).toHaveLength(3);
    const rows = await storedFor(studentId);
    const marked = rows.filter((r) => events.some((e) => e.id === r.id));
    expect(marked.map((r) => r.tracing_opted_out)).toEqual([true, true, true]);
    // Earlier events keep the state they were stored with; the app still has them all.
    expect(rows.filter((r) => !r.tracing_opted_out).length).toBeGreaterThan(0);

    // Back in: new events are unmarked again.
    await as(api, admin)('PUT', `/api/privacy/students/${studentId}/tracing`, { optedOut: false });
    const next = mixed(1).map((e) => ({ ...e, classId: api.sample.classes.a2 }));
    body(await student(sky)({ events: next }));
    const last = (await storedFor(studentId)).at(-1)!;
    expect(last.id).toBe(next[0]!.id);
    expect(last.tracing_opted_out).toBe(false);
  });

  it('answers 401 signed out, 403 to staff, and 403 for another student or class (M2-S1)', async () => {
    const one = { events: [event('idea.opened', { ideaId: 'rain' }, { versionId: v2 })] };
    expect((await as(api, null)('POST', '/events', one)).statusCode).toBe(401);
    const { users, orgs, classes } = api.sample;
    for (const key of ['teacher-a1', 'admin-a', 'author-a'] as const) {
      const staff = await sessionFor(api, users[key], orgs.a);
      expect((await student(staff)(one)).statusCode, key).toBe(403);
    }
    // Sam names Sky as the student: the whole batch is refused.
    const forOther = await student(sam)({
      events: [
        one.events[0],
        { ...event('idea.opened', { ideaId: 'rain' }), studentId: users['student-a2'] },
      ],
    });
    expect(forOther.statusCode).toBe(403);
    // Sam isn't enrolled in A2, and B1 is another org's class.
    for (const classId of [classes.a2, classes.b1]) {
      const res = await student(sam)({
        events: [one.events[0], event('idea.opened', { ideaId: 'rain' }, { classId })],
      });
      expect(res.statusCode, classId).toBe(403);
    }
    // None of those stored anything.
    const stored = await api.t.db
      .selectFrom('interaction_event')
      .select('id')
      .where('id', '=', one.events[0]!.id)
      .execute();
    expect(stored).toEqual([]);
    // Without the CSRF token, or from a foreign origin.
    const noToken = await api.app.inject({
      method: 'POST',
      url: '/events',
      headers: { ...fromApp(), origin: ORIGIN },
      cookies: { [SESSION_COOKIE]: sam.cookie },
      payload: one,
    });
    expect(noToken.statusCode).toBe(403);
    const foreign = await api.app.inject({
      method: 'POST',
      url: '/events',
      headers: { ...fromApp(), origin: 'https://evil.example', [CSRF_HEADER]: sam.csrf },
      cookies: { [SESSION_COOKIE]: sam.cookie },
      payload: one,
    });
    expect(foreign.statusCode).toBe(403);
    // A malformed batch.
    for (const bad of [{}, { events: [] }, { events: [{}], extra: 1 }, { events: 'x' }]) {
      expect((await student(sam)(bad)).statusCode, JSON.stringify(bad)).toBe(400);
    }
  });

  it('keeps refusing duplicates when the ingest session has temp tables shadowing the ledger (M2-S3)', async () => {
    const studentId = api.sample.users['student-a1'];
    const [existing] = await storedFor(studentId);
    // The app role has no TEMP (F4cx1), so a shadow can't even be created on its path.
    const code = await errorCode(() =>
      scoped(api.t.db, { orgId: api.sample.orgs.a }, (trx) =>
        sql`CREATE TEMP TABLE interaction_event_key (id text, student_id uuid, seq bigint)`.execute(
          trx,
        ),
      ),
    );
    expect(code).toBe(PG.insufficientPrivilege);
    // And with a shadow made by a privileged session on the same connection pool's
    // database, a direct duplicate insert is still refused by the ledger.
    const dup = await errorCode(() =>
      api.t.db.transaction().execute(async (trx) => {
        await sql`CREATE TEMP TABLE interaction_event_key (id text PRIMARY KEY, org_id uuid, student_id uuid, seq bigint, recorded_at timestamptz)`.execute(
          trx,
        );
        await sql`SET LOCAL search_path = pg_temp, public`.execute(trx);
        await sql`
          INSERT INTO public.interaction_event (id, org_id, student_id, class_id, version_id, seq, at, type, payload)
          VALUES (${existing!.id}, ${existing!.org_id}, ${studentId}, ${existing!.class_id}, ${existing!.version_id}, 9999, now(), 'idea.opened', '{"ideaId":"rain"}')
        `.execute(trx);
      }),
    );
    expect(dup).toBe(PG.unique);
    // Through the API, the same id is dropped as a resend.
    const resend = body(
      await student(sam)({
        events: [
          {
            ...event('idea.opened', { ideaId: 'rain' }, { versionId: existing!.version_id }),
            id: existing!.id,
          },
        ],
      }),
    );
    expect(resend.duplicates).toEqual([existing!.id]);
  });

  it('deletes events and text on unenrolment and FERPA delete, leaving others and partitions (M2-F7)', async () => {
    const { users } = api.sample;
    const partitions = async () =>
      (
        await sql<{
          n: number;
        }>`SELECT count(*)::int AS n FROM pg_inherits WHERE inhparent = 'interaction_event'::regclass`.execute(
          api.t.db,
        )
      ).rows[0]!.n;
    const before = await partitions();
    const samBefore = (await storedFor(users['student-a1'])).length;
    expect(samBefore).toBeGreaterThan(50);

    const unenrol = await as(api, admin)(
      'POST',
      `/api/privacy/students/${users['student-a2']}/unenrol`,
    );
    expect(unenrol.statusCode, unenrol.body).toBe(200);
    expect(unenrol.json().deleted.interactionEvents).toBeGreaterThan(0);
    expect(await storedFor(users['student-a2'])).toEqual([]);

    const del = await as(api, admin)('DELETE', `/api/privacy/students/${users['student-a1']}`);
    expect(del.statusCode, del.body).toBe(200);
    expect(del.json().deleted).toMatchObject({ interactionEvents: samBefore, interactionText: 3 });
    expect(await storedFor(users['student-a1'])).toEqual([]);
    expect(
      await api.t.db
        .selectFrom('interaction_text')
        .select('id')
        .where('student_id', 'in', [users['student-a1'], users['student-a2']])
        .execute(),
    ).toEqual([]);
    expect(
      await api.t.db
        .selectFrom('interaction_event_key')
        .select('id')
        .where('student_id', 'in', [users['student-a1'], users['student-a2']])
        .execute(),
    ).toEqual([]);
    expect(await partitions()).toBe(before);
    // Privacy misses are counts, not personal data: they stay.
    expect(
      (await api.t.db.selectFrom('privacy_miss').select('id').execute()).length,
    ).toBeGreaterThan(0);
  });
});

describe.skipIf(!hasDatabase)('nothing extra recorded (M2-S4, D19)', () => {
  let api: TestApi;
  beforeAll(async () => {
    api = await startApi();
  });
  afterAll(async () => {
    await api?.close();
  });

  it('stores and logs no IP address, user agent or device with events', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _enc, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const app = buildServer({
      db: api.t.db,
      config: api.config,
      logger: { level: 'trace', stream },
    });
    await app.ready();
    try {
      const { orgs, users, classes, curricula } = api.sample;
      const version = await api.t.db
        .selectFrom('curriculum_version')
        .select('id')
        .where('curriculum_id', '=', curricula.a)
        .executeTakeFirstOrThrow();
      await api.t.db
        .updateTable('class')
        .set({ pinned_version_id: version.id })
        .where('id', '=', classes.a1)
        .execute();
      const sam = await sessionFor(api, users['student-a1'], orgs.a);
      const id = ulid();
      const res = await app.inject({
        method: 'POST',
        url: '/events',
        headers: {
          ...fromApp(ORIGIN, '203.0.113.77'),
          origin: ORIGIN,
          [CSRF_HEADER]: sam.csrf,
          'user-agent': 'Mozilla/5.0 (iPad; CPU OS 17_0) TestDevice/1.0',
        },
        cookies: { [SESSION_COOKIE]: sam.cookie },
        payload: {
          events: [
            {
              id,
              classId: classes.a1,
              versionId: version.id,
              at: new Date().toISOString(),
              type: 'idea.opened',
              payload: { ideaId: 'rain' },
            },
          ],
        },
      });
      expect(res.statusCode, res.body).toBe(200);
      expect((res.json() as EventBatchResponse).accepted).toHaveLength(1);
      const log = lines.join('');
      expect(log).not.toContain('203.0.113.77');
      expect(log).not.toContain('127.0.0.1');
      expect(log).not.toContain('TestDevice');
      expect(log).not.toContain('remoteAddress');

      const row = await api.t.db
        .selectFrom('interaction_event')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      expect(Object.keys(row).sort()).toEqual([
        'at',
        'class_id',
        'id',
        'level',
        'org_id',
        'payload',
        'recorded_at',
        'seq',
        'student_id',
        'tracing_opted_out',
        'type',
        'version_id',
      ]);
      expect(JSON.stringify(row)).not.toMatch(/203\.0\.113\.77|TestDevice|iPad/);
    } finally {
      await app.close();
    }
  });
});
