import { sql, type Transaction } from 'kysely';
import { actAs, json, withOrg, type Db } from './client.js';
import type { ExportStore } from './export-store.js';
import { SECRET_KEY_PATTERN } from './migrations/0012_privacy.js';
import type { Database } from './schema.js';

// Privacy baseline (ARCHITECTURE.md §8.2, §10; task F6): audit writes, typed-text
// lookups that survive retention, and FERPA export and delete. What each table holds
// and how long is in docs/privacy/data-inventory.md.

type Trx = Transaction<Database>;

// ---------------------------------------------------------------------------------
// Audit

/** Keys whose values are never written to the audit log (same pattern as the triggers). */
export const SECRET_KEY = new RegExp(SECRET_KEY_PATTERN, 'i');
export const REDACTED = '[redacted]';

/** A copy of `value` with every secret-looking key's value replaced by `[redacted]`. */
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SECRET_KEY.test(k) ? REDACTED : redactSecrets(v)]),
    );
  }
  return value;
}

export interface AuditEntry {
  action: string;
  targetType: string;
  targetId?: string | null;
  classId?: string | null;
  curriculumId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  detail?: Record<string, unknown>;
}

/**
 * Write an audit row for something no trigger sees (an export, a deletion). The
 * actor is the user set with `actAs`. Config changes, approvals, library settings
 * and publishes are audited by triggers (0012) and need no call.
 */
export async function writeAudit(trx: Trx, orgId: string, entry: AuditEntry): Promise<void> {
  const obj = (v: Record<string, unknown> | null | undefined) =>
    v ? json(redactSecrets(v) as Record<string, unknown>) : null;
  await trx
    .insertInto('audit_event')
    .values({
      org_id: orgId,
      actor_id: sql<string | null>`app.current_actor_id()`,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId ?? null,
      class_id: entry.classId ?? null,
      curriculum_id: entry.curriculumId ?? null,
      before: obj(entry.before),
      after: obj(entry.after),
      detail: json(redactSecrets(entry.detail ?? {}) as Record<string, unknown>),
    })
    .execute();
}

export interface HistoryEntry {
  at: Date;
  actorId: string | null;
  actorName: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  /** Changed fields, such as `config.units` for a due date. */
  changed: string[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

/**
 * Who changed what in a class, newest first: its own settings and library choices,
 * plus changes to its curriculum (defaults, approved explanations, publishes). For
 * Teacher Settings' "History" view.
 */
export async function classHistory(
  trx: Trx,
  classId: string,
  options: { limit?: number; before?: Date } = {},
): Promise<HistoryEntry[]> {
  const rows = await trx
    .selectFrom('audit_event as a')
    .leftJoin('app_user as u', 'u.id', 'a.actor_id')
    .select([
      'a.at',
      'a.actor_id',
      'u.name as actor_name',
      'a.action',
      'a.target_type',
      'a.target_id',
      'a.detail',
      'a.before',
      'a.after',
    ])
    .where((eb) =>
      eb.or([
        eb('a.class_id', '=', classId),
        eb.and([
          eb('a.class_id', 'is', null),
          eb(
            'a.curriculum_id',
            '=',
            eb.selectFrom('class').select('curriculum_id').where('id', '=', classId),
          ),
        ]),
      ]),
    )
    .$if(options.before !== undefined, (q) => q.where('a.at', '<', options.before!))
    .orderBy('a.at', 'desc')
    .orderBy('a.id')
    .limit(options.limit ?? 100)
    .execute();
  return rows.map((r) => ({
    at: r.at,
    actorId: r.actor_id,
    actorName: r.actor_name,
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    changed: Array.isArray(r.detail.changed) ? (r.detail.changed as string[]) : [],
    before: r.before,
    after: r.after,
  }));
}

// ---------------------------------------------------------------------------------
// Typed text references (§8.2)

/** What an event's text reference resolves to once retention or a deletion took it. */
export const REMOVED_TEXT = { status: 'removed' } as const;

export type ResolvedText =
  { status: 'present'; kind: string; body: string; createdAt: Date } | typeof REMOVED_TEXT;

/**
 * Look up the typed text that events refer to. Text deleted by retention or a FERPA
 * delete resolves to `REMOVED_TEXT`, so a replay or timeline never fails on it.
 */
export async function resolveTexts(
  trx: Trx,
  ids: readonly string[],
): Promise<Map<string, ResolvedText>> {
  const out = new Map<string, ResolvedText>(ids.map((id) => [id, REMOVED_TEXT]));
  const uuids = ids.filter((id) => UUID.test(id));
  if (uuids.length === 0) return out;
  const rows = await trx
    .selectFrom('interaction_text')
    .select(['id', 'kind', 'body', 'created_at'])
    .where('id', 'in', uuids)
    .execute();
  for (const r of rows) {
    out.set(r.id, { status: 'present', kind: r.kind, body: r.body, createdAt: r.created_at });
  }
  return out;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------------
// FERPA export and delete (§10: the district owns the data; export and delete on request)

export type PrivacyErrorCode = 'forbidden' | 'not_found';

export class PrivacyError extends Error {
  readonly code: PrivacyErrorCode;
  constructor(code: PrivacyErrorCode, message: string) {
    super(message);
    this.name = 'PrivacyError';
    this.code = code;
  }
}

export interface StudentRequest {
  /** The organization the caller belongs to; never taken from the request path. */
  orgId: string;
  /** The signed-in user making the request. Must be an admin of `orgId`. */
  actorId: string;
  studentId: string;
}

/** The name a deleted student's account keeps: their pseudonymous id stays. */
export const REMOVED_STUDENT_NAME = 'Removed student';

async function authorize(trx: Trx, { actorId, studentId }: StudentRequest): Promise<void> {
  // Row-level security limits both lookups to the caller's organization, so an admin
  // of another organization finds no student.
  const actor = await trx
    .selectFrom('app_user')
    .select('role')
    .where('id', '=', actorId)
    .executeTakeFirst();
  if (actor?.role !== 'admin') {
    throw new PrivacyError(
      'forbidden',
      'Only an organization admin can export or delete a student.',
    );
  }
  const student = await trx
    .selectFrom('app_user')
    .select('role')
    .where('id', '=', studentId)
    .executeTakeFirst();
  if (student?.role !== 'student') {
    throw new PrivacyError('not_found', 'No such student in this organization.');
  }
}

/** Everything held about one student, as one readable JSON document. */
export interface StudentRecord {
  format: 'ideamap.student-record';
  version: 1;
  exported_at: string;
  org_id: string;
  student: Record<string, unknown>;
  enrollments: Record<string, unknown>[];
  interaction_events: Record<string, unknown>[];
  interaction_text: Record<string, unknown>[];
  generated_map_views: Record<string, unknown>[];
  ai_outputs: Record<string, unknown>[];
  ai_interactions: Record<string, unknown>[];
  progress_snapshots: Record<string, unknown>[];
}

/** Collect a student's record. Runs inside `withOrg` for the student's organization. */
export async function collectStudentRecord(
  trx: Trx,
  orgId: string,
  studentId: string,
): Promise<StudentRecord> {
  const student = await trx
    .selectFrom('app_user')
    .select([
      'id',
      'role',
      'name',
      'email',
      'sso_provider',
      'sso_subject',
      'roster_source_id',
      'created_at',
      'updated_at',
    ])
    .where('id', '=', studentId)
    .executeTakeFirstOrThrow();
  const enrollments = await trx
    .selectFrom('enrollment as e')
    .innerJoin('class as c', 'c.id', 'e.class_id')
    .select(['e.class_id', 'c.name as class_name', 'e.created_at'])
    .where('e.student_id', '=', studentId)
    .orderBy('e.created_at')
    .execute();
  const interaction_events = await trx
    .selectFrom('interaction_event')
    .select(['id', 'class_id', 'version_id', 'seq', 'at', 'type', 'payload', 'recorded_at'])
    .where('student_id', '=', studentId)
    .orderBy('seq')
    .execute();
  const interaction_text = await trx
    .selectFrom('interaction_text')
    .select(['id', 'class_id', 'kind', 'body', 'redacted_at', 'created_at'])
    .where('student_id', '=', studentId)
    .orderBy('created_at')
    .execute();
  const generated_map_views = await trx
    .selectFrom('generated_map_view')
    .select(['id', 'class_id', 'version_id', 'generator', 'view', 'created_at'])
    .where('student_id', '=', studentId)
    .orderBy('created_at')
    .execute();
  const ai_outputs = await trx
    .selectFrom('ai_output')
    .select(['id', 'class_id', 'version_id', 'persona', 'kind', 'content', 'model', 'created_at'])
    .where('student_id', '=', studentId)
    .orderBy('created_at')
    .execute();
  const ai_interactions = await trx
    .selectFrom('ai_interaction')
    .select(['id', 'class_id', 'persona', 'model', 'request', 'response', 'flagged', 'created_at'])
    .where('user_id', '=', studentId)
    .orderBy('created_at')
    .execute();
  const progress_snapshots = await trx
    .selectFrom('progress_snapshot')
    .select(['class_id', 'rules_version', 'state', 'last_seq', 'updated_at'])
    .where('student_id', '=', studentId)
    .execute();
  return {
    format: 'ideamap.student-record',
    version: 1,
    exported_at: new Date().toISOString(),
    org_id: orgId,
    student,
    enrollments,
    interaction_events,
    interaction_text,
    generated_map_views,
    ai_outputs,
    ai_interactions,
    progress_snapshots,
  };
}

export interface StudentExport {
  exportJobId: string;
  /** The file's key in the export store. */
  ref: string;
  /** The file's contents: the record as indented JSON. */
  body: string;
}

/**
 * FERPA export: write one JSON file with all of a student's records to the export
 * store, record it as an export job, and audit it. Only an admin of the student's
 * organization may do this. The file expires with the organization's export
 * retention, and is removed at once if the student is deleted.
 */
export async function exportStudent(
  db: Db,
  request: StudentRequest,
  store: ExportStore,
): Promise<StudentExport> {
  let written: string | null = null;
  try {
    return await withOrg(db, request.orgId, async (trx) => {
      await authorize(trx, request);
      await actAs(trx, request.actorId);
      const record = await collectStudentRecord(trx, request.orgId, request.studentId);
      const job = await trx
        .insertInto('export_job')
        .values({
          org_id: request.orgId,
          kind: 'student_record',
          status: 'succeeded',
          params: json({ student_id: request.studentId }),
          created_by: request.actorId,
          finished_at: new Date(),
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const ref = `student-records/${request.orgId}/${job.id}.json`;
      const body = `${JSON.stringify(record, null, 2)}\n`;
      await store.put(ref, body);
      written = ref;
      await trx
        .updateTable('export_job')
        .set({ result_ref: ref })
        .where('id', '=', job.id)
        .execute();
      await writeAudit(trx, request.orgId, {
        action: 'student.exported',
        targetType: 'student',
        targetId: request.studentId,
        after: { export_job_id: job.id },
      });
      return { exportJobId: job.id, ref, body };
    });
  } catch (error) {
    // The transaction rolled back, so no job points at the file: remove it.
    if (written) await store.remove(written);
    throw error;
  }
}

export interface StudentDeletion {
  interactionText: number;
  aiInteractions: number;
  progressSnapshots: number;
  enrollments: number;
  exportFiles: number;
}

/**
 * FERPA delete. Removes the student's personal data and everything they typed, and
 * leaves their tracker events in place under their pseudonymous id (§8.2, §10):
 * the account keeps only its random id, role and organization, so nothing left
 * identifies them. Removes export files that could hold their name. Audited with the
 * pseudonymous id only. Safe to repeat.
 */
export async function deleteStudent(
  db: Db,
  request: StudentRequest,
  store: ExportStore,
): Promise<StudentDeletion> {
  const { orgId, studentId } = request;
  return withOrg(db, orgId, async (trx) => {
    await authorize(trx, request);
    await actAs(trx, request.actorId);

    // Export files first: this student's records, and class progress exports of
    // their classes, which list students by name. Files are removed before the
    // commit, so a failure leaves at worst a reference to a missing file.
    const classIds = trx
      .selectFrom('enrollment')
      .select('class_id')
      .where('student_id', '=', studentId);
    const exports = await trx
      .selectFrom('export_job')
      .select(['id', 'result_ref'])
      .where('result_ref', 'is not', null)
      .where((eb) =>
        eb.or([
          eb.and([
            eb('kind', '=', 'student_record'),
            eb(sql`params ->> 'student_id'`, '=', studentId),
          ]),
          eb.and([eb('kind', '=', 'class_progress'), eb('class_id', 'in', classIds)]),
        ]),
      )
      .execute();
    for (const e of exports) await store.remove(e.result_ref!);
    if (exports.length > 0) {
      await trx
        .updateTable('export_job')
        .set({ result_ref: null })
        .where(
          'id',
          'in',
          exports.map((e) => e.id),
        )
        .execute();
    }

    const count = (r: { numDeletedRows: bigint }) => Number(r.numDeletedRows);
    const result: StudentDeletion = {
      interactionText: count(
        await trx
          .deleteFrom('interaction_text')
          .where('student_id', '=', studentId)
          .executeTakeFirst(),
      ),
      aiInteractions: count(
        await trx.deleteFrom('ai_interaction').where('user_id', '=', studentId).executeTakeFirst(),
      ),
      progressSnapshots: count(
        await trx
          .deleteFrom('progress_snapshot')
          .where('student_id', '=', studentId)
          .executeTakeFirst(),
      ),
      enrollments: count(
        await trx.deleteFrom('enrollment').where('student_id', '=', studentId).executeTakeFirst(),
      ),
      exportFiles: exports.length,
    };
    await trx
      .updateTable('app_user')
      .set({
        name: REMOVED_STUDENT_NAME,
        email: null,
        sso_provider: null,
        sso_subject: null,
        roster_source_id: null,
      })
      .where('id', '=', studentId)
      .execute();
    await writeAudit(trx, orgId, {
      action: 'student.deleted',
      targetType: 'student',
      targetId: studentId,
      after: { ...result },
    });
    return result;
  });
}
