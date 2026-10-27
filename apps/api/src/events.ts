import { backstopText } from '@ideamap/ai/backstop';
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

/** Postgres: unique_violation. */
const UNIQUE_VIOLATION = '23505';

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
      const run = () =>
        req.withOrg((trx) =>
          ingest(trx, batch.data.events, batch.data.texts, {
            orgId,
            studentId: userId,
            now: deps.now(),
            graceMs: options.graceMs ?? VERSION_GRACE_MS,
          }),
        );
      // Two batches of the same student's events in flight at once (a resend racing
      // the first send) can both find an id new; the second then fails on the ledger's
      // unique key and is judged again, finding it recorded.
      const outcome = await run().catch((error: unknown) => {
        if ((error as { code?: unknown }).code === UNIQUE_VIOLATION) return run();
        throw error;
      });
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
  const rejected: EventRejection[] = [];
  const duplicates: string[] = [];

  // 1. Each event on its own against M1 and the client allowance (no database). The
  // same id twice in one batch is a resend too.
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  raw.forEach((input, index) => {
    const verdict = judgeClientEvent(input);
    if (!verdict.ok) {
      const id = (input as { id?: unknown } | null)?.id;
      rejected.push({
        index,
        id: typeof id === 'string' ? id.slice(0, 26) : null,
        code: verdict.code,
        message: verdict.message,
      });
      return;
    }
    if (seen.has(verdict.event.id)) {
      duplicates.push(verdict.event.id);
      return;
    }
    seen.add(verdict.event.id);
    candidates.push({ index, event: verdict.event });
  });

  // 2. Typed text through the D26 backstop before it goes anywhere (a roster read, only
  // for batches with text).
  const checked = await backstopTexts(trx, candidates, texts, ctx);

  // 3. Everything else in one statement: ingest is the hot path (M2-P1), and each
  // round trip to the database counts.
  const result = await judgeAndStore(trx, classIdsOf(raw), candidates, checked, ctx);
  if (!result.enrolled) return { forbidden: true };
  for (const other of result.others) {
    if (other.status === 'duplicate') duplicates.push(other.id);
    else {
      rejected.push({
        index: other.i,
        id: other.id,
        code: other.status,
        message: MESSAGES[other.status],
      });
    }
  }
  rejected.sort((a, b) => a.index - b.index);
  const seqOf = new Map(result.accepted.map((r) => [r.id, r.seq]));
  const accepted = candidates
    .filter(({ event }) => seqOf.has(event.id))
    .map(({ event }) => ({ id: event.id, seq: seqOf.get(event.id)! }));
  return { forbidden: false, response: { accepted, duplicates, rejected } };
}

/** What happened to each event the statement didn't store. */
type Other = 'duplicate' | 'id_taken' | 'version_not_pinned' | 'text_missing';

const MESSAGES: Record<Exclude<Other, 'duplicate'>, string> = {
  version_not_pinned: 'The class is not on this curriculum version.',
  id_taken: 'This event id is already in use.',
  text_missing: 'The typed text this event refers to was not sent.',
};

interface CheckedText {
  id: string;
  class_id: string;
  kind: 'teachback' | 'challenge';
  body: string;
  names: number;
  emails: number;
  phones: number;
}

/**
 * The batch, judged and stored in one statement:
 * - the student must be enrolled in every class the batch names, or nothing is stored;
 * - each class accepts its pinned version, and a version it was pinned to until a re-pin
 *   inside the grace period (re-pins are read from the class's audit log, F6);
 * - ids already recorded are resends of this student's (duplicates) or someone else's;
 * - typed text is stored for the new events that refer to it (a resent text stays as it
 *   was, and counts no second privacy miss), and an event must refer to this student's
 *   own text, sent now or stored earlier;
 * - the new events take the next numbers from student_event_seq: one upsert, constant
 *   time whatever the history, whose row lock puts a student's batches one after
 *   another until commit, so numbers are never shared and never skipped.
 */
async function judgeAndStore(
  trx: Trx,
  classIds: readonly string[],
  candidates: readonly Candidate[],
  texts: readonly CheckedText[],
  ctx: IngestContext,
): Promise<{
  enrolled: boolean;
  accepted: { id: string; seq: number }[];
  others: { i: number; id: string; status: Other }[];
}> {
  const events = candidates.map(({ index, event }) => ({
    i: index,
    id: event.id,
    class_id: event.classId,
    version_id: event.versionId,
    at: event.at,
    type: event.type,
    payload: event.payload,
    text_ref: eventTextRef(event),
  }));
  const since = new Date(ctx.now.getTime() - ctx.graceMs);
  const s = sql`${ctx.studentId}::uuid`;
  const org = sql`${ctx.orgId}::uuid`;
  const classes = sql`${classIds}::uuid[]`;
  const { rows } = await sql<{
    enrolled: boolean;
    accepted: { id: string; seq: number }[];
    others: { i: number; id: string; status: Other }[];
  }>`
    WITH ev AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(events)}::jsonb) AS r(
        i integer, id text, class_id uuid, version_id uuid, at timestamptz, type text,
        payload jsonb, text_ref uuid)
    ), cls AS (
      SELECT c.id, c.pinned_version_id,
        EXISTS (SELECT 1 FROM enrollment AS e WHERE e.class_id = c.id AND e.student_id = ${s})
          AS enrolled
      FROM class AS c WHERE c.id = ANY(${classes})
    ), gate AS (
      SELECT (SELECT count(*) FROM cls WHERE cls.enrolled) = cardinality(${classes}) AS ok
    ), allowed AS (
      SELECT cls.id AS class_id, cls.pinned_version_id AS version_id
        FROM cls WHERE cls.pinned_version_id IS NOT NULL
      UNION
      SELECT a.class_id, (a.before ->> 'pinned_version_id')::uuid
        FROM audit_event AS a
        WHERE a.target_type = 'class' AND a.before ? 'pinned_version_id'
          AND a.class_id = ANY(${classes}) AND a.at > ${since}
    ), known AS (
      SELECT k.id, k.student_id FROM interaction_event_key AS k
        WHERE k.id = ANY(ARRAY(SELECT ev.id FROM ev))
    ), judged AS (
      SELECT ev.*, CASE
          WHEN NOT EXISTS (SELECT 1 FROM allowed AS w
                             WHERE w.class_id = ev.class_id AND w.version_id = ev.version_id)
            THEN 'version_not_pinned'
          WHEN known.student_id = ${s} THEN 'duplicate'
          WHEN known.id IS NOT NULL THEN 'id_taken'
          ELSE 'new' END AS status
      FROM ev LEFT JOIN known ON known.id = ev.id
    ), tx AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(texts)}::jsonb) AS t(
        id uuid, class_id uuid, kind text, body text, names integer, emails integer,
        phones integer)
      WHERE (SELECT ok FROM gate)
        AND t.id IN (SELECT j.text_ref FROM judged AS j WHERE j.status = 'new')
    ), stored AS (
      INSERT INTO interaction_text (id, org_id, class_id, student_id, kind, body, redacted_at)
        SELECT tx.id, ${org}, tx.class_id, ${s}, tx.kind, tx.body, now() FROM tx
        ON CONFLICT (id) DO NOTHING
        RETURNING id
    ), missed AS (
      INSERT INTO privacy_miss (org_id, class_id, source, names, emails, phones)
        SELECT ${org}, tx.class_id, 'event_ingest', tx.names, tx.emails, tx.phones
        FROM tx JOIN stored ON stored.id = tx.id
        WHERE tx.names + tx.emails + tx.phones > 0
    ), owned AS (
      SELECT t.id FROM interaction_text AS t
        WHERE t.id IN (SELECT j.text_ref FROM judged AS j) AND t.student_id = ${s}
      UNION SELECT stored.id FROM stored
    ), checked AS (
      SELECT j.*, CASE
          WHEN j.status = 'new' AND j.text_ref IS NOT NULL
           AND j.text_ref NOT IN (SELECT owned.id FROM owned) THEN 'text_missing'
          ELSE j.status END AS outcome
      FROM judged AS j
    ), fresh AS (
      SELECT c.*, row_number() OVER (ORDER BY c.i) AS k
        FROM checked AS c WHERE c.outcome = 'new' AND (SELECT ok FROM gate)
    ), n AS (
      SELECT count(*)::integer AS n FROM fresh
    ), alloc AS (
      INSERT INTO student_event_seq AS q (student_id, org_id, last_seq)
        SELECT ${s}, ${org}, n.n FROM n WHERE n.n > 0
        ON CONFLICT (student_id) DO UPDATE SET last_seq = q.last_seq + excluded.last_seq
        RETURNING q.last_seq
    ), ins AS (
      INSERT INTO interaction_event
          (id, org_id, student_id, class_id, version_id, seq, at, type, payload, tracing_opted_out)
        SELECT f.id, ${org}, ${s}, f.class_id, f.version_id, alloc.last_seq - n.n + f.k, f.at,
          f.type, f.payload,
          EXISTS (SELECT 1 FROM tracing_opt_out AS o WHERE o.student_id = ${s})
        FROM fresh AS f CROSS JOIN alloc CROSS JOIN n
        RETURNING id, seq
    )
    SELECT (SELECT ok FROM gate) AS enrolled,
      (SELECT coalesce(json_agg(json_build_object('id', ins.id, 'seq', ins.seq)), '[]')
         FROM ins) AS accepted,
      (SELECT coalesce(json_agg(json_build_object('i', c.i, 'id', c.id, 'status', c.outcome)), '[]')
         FROM checked AS c WHERE c.outcome <> 'new') AS others
  `.execute(trx);
  const row = rows[0]!;
  return {
    enrolled: row.enrolled,
    accepted: row.accepted.map((r) => ({ id: r.id, seq: Number(r.seq) })),
    others: row.others,
  };
}

/**
 * The batch's typed texts that its events refer to, with real roster names and contact
 * details blurred and counted (D26). Only the blurred body ever reaches the database.
 */
async function backstopTexts(
  trx: Trx,
  candidates: readonly Candidate[],
  texts: readonly EventText[],
  ctx: IngestContext,
): Promise<CheckedText[]> {
  if (texts.length === 0) return [];
  const sent = new Map(texts.map((t) => [t.id.toLowerCase(), t.body]));
  const wanted = new Map<
    string,
    { classId: string; kind: 'teachback' | 'challenge'; body: string }
  >();
  for (const { event } of candidates) {
    const ref = eventTextRef(event)?.toLowerCase();
    const body = ref ? sent.get(ref) : undefined;
    if (ref && body !== undefined && !wanted.has(ref)) {
      const kind = TEXT_EVENT_KINDS[event.type as keyof typeof TEXT_EVENT_KINDS];
      wanted.set(ref, { classId: event.classId, kind, body });
    }
  }
  if (wanted.size === 0) return [];
  const names = await rosterNames(
    trx,
    [...new Set([...wanted.values()].map((t) => t.classId))],
    ctx,
  );
  return [...wanted].map(([id, t]) => {
    const { text, misses } = backstopText(t.body, names);
    return { id, class_id: t.classId, kind: t.kind, body: text, ...misses };
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
