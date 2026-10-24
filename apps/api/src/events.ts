import { backstopText, totalMisses, type BackstopMisses } from '@ideamap/ai/backstop';
import {
  EventBatchSchema,
  eventTextRef,
  judgeClientEvent,
  TEXT_EVENT_KINDS,
  type ClientEvent,
  type EventBatchResponse,
  type EventRejection,
  type EventText,
} from '@ideamap/contracts';
import { REMOVED_STUDENT_NAME } from '@ideamap/db';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import type { Trx } from './db.js';
import type { PolicyDeps, RoutePolicy } from './policy.js';

// Event ingest (ARCHITECTURE.md §8.5, D19, D22, D24, D26; task M2).
//
// `POST /events` takes a batch from a student's app. Each event is checked against
// M1's catalogue on its own, so one bad event never costs the rest of its batch. The
// server sets `seq` (per student, no gaps for accepted events) and the level (from
// the type, in the database), drops ids it already has, and refuses events from a
// version the class isn't pinned to, except the version it was pinned to until a
// publish within the grace period. Typed text goes to interaction_text after the D26
// backstop. Events of an opted-out student (D24) are stored with the opt-out mark.
//
// What a student can post: only for themselves (the server takes the student from
// the session; a client `studentId` is refused) and only in classes they're enrolled
// in. A batch naming another student or another class is refused whole (403).
//
// Nothing about the device or connection is stored with an event, and the route
// logs at warn and above only, so request logs (which carry the client address) are
// never written for it (D19, M2-S4).

/** Students only: teachers' actions and model verdicts are recorded by the server. */
export const EVENTS_POLICY: RoutePolicy = { roles: ['student'], scope: { kind: 'org' } };

/**
 * How long after a publish re-pins a class the version it replaced is still accepted,
 * so events queued offline on the old version aren't lost (§8.5).
 */
export const VERSION_GRACE_MS = 24 * 60 * 60 * 1000;

/** Room for a full batch: 200 events and 20 texts of 20,000 characters (as UTF-8). */
const BODY_LIMIT = 2 * 1024 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface EventRoutesOptions {
  /** Defaults to VERSION_GRACE_MS. */
  graceMs?: number;
}

interface IngestContext {
  orgId: string;
  studentId: string;
  now: Date;
  graceMs: number;
}

type Outcome = { forbidden: true } | { forbidden: false; response: EventBatchResponse };

export function eventRoutes(
  app: FastifyInstance,
  deps: PolicyDeps,
  options: EventRoutesOptions = {},
): void {
  app.post(
    '/events',
    {
      config: { policy: EVENTS_POLICY },
      bodyLimit: BODY_LIMIT,
      logLevel: 'warn',
    },
    async (req, reply) => {
      const batch = EventBatchSchema.safeParse(req.body);
      if (!batch.success) return reply.code(400).send({ error: 'Invalid batch' });
      const { orgId, userId } = req.session!;
      if (namesSomeoneElse(batch.data.events, userId)) {
        return reply.code(403).send({ error: 'Forbidden' });
      }
      const outcome = await req.withOrg((trx) =>
        ingest(trx, batch.data.events, batch.data.texts, {
          orgId,
          studentId: userId,
          now: deps.now(),
          graceMs: options.graceMs ?? VERSION_GRACE_MS,
        }),
      );
      if (outcome.forbidden) return reply.code(403).send({ error: 'Forbidden' });
      return reply.code(200).header('cache-control', 'no-store').send(outcome.response);
    },
  );
}

/** True if some event claims to be for a student other than the caller. */
function namesSomeoneElse(events: readonly unknown[], studentId: string): boolean {
  return events.some(
    (e) =>
      e !== null &&
      typeof e === 'object' &&
      'studentId' in e &&
      (e as { studentId: unknown }).studentId !== studentId,
  );
}

/** The class ids a batch names, where they look like ids at all. */
function classIdsOf(events: readonly unknown[]): string[] {
  const ids = new Set<string>();
  for (const e of events) {
    const id = e !== null && typeof e === 'object' ? (e as { classId?: unknown }).classId : null;
    if (typeof id === 'string' && UUID.test(id)) ids.add(id.toLowerCase());
  }
  return [...ids];
}

interface Candidate {
  index: number;
  event: ClientEvent;
}

async function ingest(
  trx: Trx,
  raw: readonly unknown[],
  texts: readonly EventText[],
  ctx: IngestContext,
): Promise<Outcome> {
  const classIds = classIdsOf(raw);
  const { enrolled, allowed, optedOut } = await batchContext(trx, classIds, ctx);
  // Enrolled in every class the batch names, or the whole batch is refused.
  if (!enrolled) return { forbidden: true };

  const rejected: EventRejection[] = [];
  const duplicates: string[] = [];
  const reject = (
    index: number,
    id: string | null,
    code: EventRejection['code'],
    message: string,
  ) => rejected.push({ index, id, code, message });

  // 1. Each event on its own: catalogue, client allowance, pinned version.
  const seen = new Set<string>();
  let candidates: Candidate[] = [];
  raw.forEach((input, index) => {
    const verdict = judgeClientEvent(input);
    if (!verdict.ok) {
      const id = (input as { id?: unknown } | null)?.id;
      reject(index, typeof id === 'string' ? id.slice(0, 26) : null, verdict.code, verdict.message);
      return;
    }
    const { event } = verdict;
    if (!allowed.get(event.classId.toLowerCase())?.has(event.versionId.toLowerCase())) {
      reject(index, event.id, 'version_not_pinned', 'The class is not on this curriculum version.');
      return;
    }
    // The same id twice in one batch is a resend too.
    if (seen.has(event.id)) {
      duplicates.push(event.id);
      return;
    }
    seen.add(event.id);
    candidates.push({ index, event });
  });

  // 2. Ids already recorded: resends of this student's are dropped without error. The
  // batch's lock (taken in batchContext) holds until commit, so this read and the seq
  // below see every earlier batch of this student's.
  let last = 0;
  if (candidates.length > 0) {
    const ids = candidates.map((c) => c.event.id);
    const { rows } = await sql<{ last: string | null; known: { id: string; student: string }[] }>`
      SELECT
        (SELECT max(k.seq) FROM interaction_event_key AS k WHERE k.student_id = ${ctx.studentId}) AS last,
        (SELECT coalesce(json_agg(json_build_object('id', k.id, 'student', k.student_id)), '[]')
           FROM interaction_event_key AS k WHERE k.id = ANY(${ids}::text[])) AS known
    `.execute(trx);
    last = Number(rows[0]?.last ?? 0);
    const owner = new Map((rows[0]?.known ?? []).map((k) => [k.id, k.student]));
    candidates = candidates.filter(({ index, event }) => {
      const by = owner.get(event.id);
      if (by === undefined) return true;
      if (by === ctx.studentId) duplicates.push(event.id);
      else reject(index, event.id, 'id_taken', 'This event id is already in use.');
      return false;
    });
  }

  // 3. Typed text for the new events, through the D26 backstop, then every reference
  // checked against what this student has stored.
  candidates = await storeTexts(trx, candidates, texts, ctx, reject);

  // 4. Sequence numbers continue from this student's last one.
  const accepted: EventBatchResponse['accepted'] = [];
  if (candidates.length > 0) {
    let seq = last;
    const rows = candidates.map(({ event }) => {
      seq += 1;
      accepted.push({ id: event.id, seq });
      return {
        id: event.id,
        class_id: event.classId,
        version_id: event.versionId,
        seq,
        at: event.at,
        type: event.type,
        payload: event.payload,
      };
    });
    // One parameter for the whole batch: the hot path's cheapest insert (M2-P1).
    await sql`
      INSERT INTO interaction_event
        (id, org_id, student_id, class_id, version_id, seq, at, type, payload, tracing_opted_out)
      SELECT r.id, ${ctx.orgId}::uuid, ${ctx.studentId}::uuid, r.class_id, r.version_id, r.seq,
        r.at, r.type, r.payload, ${optedOut}
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS r(
        id text, class_id uuid, version_id uuid, seq bigint, at timestamptz, type text,
        payload jsonb)
      ORDER BY r.seq
    `.execute(trx);
  }

  rejected.sort((a, b) => a.index - b.index);
  return { forbidden: false, response: { accepted, duplicates, rejected } };
}

interface BatchContext {
  /** The student is enrolled in every class the batch names. */
  enrolled: boolean;
  /**
   * The versions each class accepts events from: its pinned version, and any version
   * it was pinned to until a re-pin less than the grace period ago. Re-pins are read
   * from the audit log, which a trigger writes for every change to a class (F6).
   */
  allowed: Map<string, Set<string>>;
  /** D24: the student is opted out of tracing now. */
  optedOut: boolean;
}

/**
 * Take the student's batch lock and read everything the batch is judged against, in
 * one statement: ingest is the hot path (M2-P1), so each round trip counts. The lock
 * (one batch per student at a time, so seq has no gaps and ids are checked once)
 * holds until the transaction ends.
 */
async function batchContext(
  trx: Trx,
  classIds: readonly string[],
  ctx: IngestContext,
): Promise<BatchContext> {
  const since = new Date(ctx.now.getTime() - ctx.graceMs);
  const { rows } = await sql<{
    classes: { id: string; pinned: string | null; enrolled: boolean }[];
    repins: { classId: string; versionId: string | null }[];
    opted_out: boolean;
  }>`
    SELECT
      pg_advisory_xact_lock(hashtextextended(${`events:${ctx.studentId}`}, 0)) AS locked,
      (SELECT coalesce(json_agg(json_build_object(
                'id', c.id, 'pinned', c.pinned_version_id, 'enrolled', e.student_id IS NOT NULL)), '[]')
         FROM class AS c
         LEFT JOIN enrollment AS e ON e.class_id = c.id AND e.student_id = ${ctx.studentId}
         WHERE c.id = ANY(${classIds}::uuid[])) AS classes,
      (SELECT coalesce(json_agg(json_build_object(
                'classId', a.class_id, 'versionId', a.before ->> 'pinned_version_id')), '[]')
         FROM audit_event AS a
         WHERE a.target_type = 'class' AND a.class_id = ANY(${classIds}::uuid[])
           AND a.at > ${since} AND a.before ? 'pinned_version_id') AS repins,
      EXISTS (SELECT 1 FROM tracing_opt_out AS o WHERE o.student_id = ${ctx.studentId}) AS opted_out
  `.execute(trx);
  const row = rows[0]!;
  const allowed = new Map<string, Set<string>>(classIds.map((id) => [id, new Set()]));
  let enrolledIn = 0;
  for (const c of row.classes) {
    if (c.enrolled) enrolledIn++;
    if (c.pinned) allowed.get(c.id)?.add(c.pinned);
  }
  for (const r of row.repins) {
    if (r.versionId) allowed.get(r.classId)?.add(r.versionId);
  }
  return { enrolled: enrolledIn === classIds.length, allowed, optedOut: row.opted_out };
}

async function storeTexts(
  trx: Trx,
  candidates: Candidate[],
  texts: readonly EventText[],
  ctx: IngestContext,
  reject: (index: number, id: string | null, code: 'text_missing', message: string) => void,
): Promise<Candidate[]> {
  const refs = candidates.flatMap(({ event }) => {
    const ref = eventTextRef(event);
    return ref ? [{ ref: ref.toLowerCase(), event }] : [];
  });
  if (refs.length === 0) return candidates;

  const sent = new Map(texts.map((t) => [t.id.toLowerCase(), t.body]));
  const toStore = new Map<
    string,
    { classId: string; kind: 'teachback' | 'challenge'; body: string }
  >();
  for (const { ref, event } of refs) {
    const body = sent.get(ref);
    if (body !== undefined && !toStore.has(ref)) {
      const kind = TEXT_EVENT_KINDS[event.type as keyof typeof TEXT_EVENT_KINDS];
      toStore.set(ref, { classId: event.classId, kind, body });
    }
  }

  if (toStore.size > 0) {
    const names = await rosterNames(
      trx,
      [...new Set([...toStore.values()].map((t) => t.classId))],
      ctx,
    );
    const misses = new Map<string, { classId: string; misses: BackstopMisses }>();
    const rows = [...toStore].map(([id, t]) => {
      const checked = backstopText(t.body, names);
      if (totalMisses(checked.misses) > 0)
        misses.set(id, { classId: t.classId, misses: checked.misses });
      return {
        id,
        org_id: ctx.orgId,
        class_id: t.classId,
        student_id: ctx.studentId,
        kind: t.kind,
        body: checked.text,
        redacted_at: ctx.now,
      };
    });
    // A text already stored (a resend) is kept as it was.
    const inserted = await trx
      .insertInto('interaction_text')
      .values(rows)
      .onConflict((oc) => oc.column('id').doNothing())
      .returning('id')
      .execute();
    const missRows = inserted.flatMap(({ id }) => {
      const m = misses.get(id);
      return m
        ? [{ org_id: ctx.orgId, class_id: m.classId, source: 'event_ingest' as const, ...m.misses }]
        : [];
    });
    if (missRows.length > 0) await trx.insertInto('privacy_miss').values(missRows).execute();
  }

  // Every reference must name this student's own text, sent now or stored earlier;
  // an id that clashed with someone else's text is never pointed at.
  const own = await trx
    .selectFrom('interaction_text')
    .select('id')
    .where(
      'id',
      'in',
      refs.map((r) => r.ref),
    )
    .where('student_id', '=', ctx.studentId)
    .execute();
  const mine = new Set(own.map((r) => r.id));
  return candidates.filter(({ index, event }) => {
    const ref = eventTextRef(event)?.toLowerCase();
    if (!ref || mine.has(ref)) return true;
    reject(index, event.id, 'text_missing', 'The typed text this event refers to was not sent.');
    return false;
  });
}

/**
 * The real names typed text must not hold (D26): the writer, everyone enrolled in the
 * classes, and their teachers. A deleted student's placeholder name isn't one.
 */
async function rosterNames(
  trx: Trx,
  classIds: readonly string[],
  ctx: IngestContext,
): Promise<string[]> {
  const rows = await trx
    .selectFrom('app_user')
    .select('name')
    .where((eb) =>
      eb.or([
        eb('id', '=', ctx.studentId),
        eb(
          'id',
          'in',
          eb.selectFrom('enrollment').select('student_id').where('class_id', 'in', classIds),
        ),
        eb('id', 'in', eb.selectFrom('class').select('teacher_id').where('id', 'in', classIds)),
      ]),
    )
    .execute();
  return rows.map((r) => r.name).filter((n) => n !== REMOVED_STUDENT_NAME);
}
