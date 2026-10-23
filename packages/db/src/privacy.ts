import { sql, type Transaction } from 'kysely';
import { actAs, json, withOrg, type Db } from './client.js';
import type { ExportStore } from './export-store.js';
import { SECRET_KEY_PATTERN } from './migrations/0015_privacy.js';
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

/**
 * Whether a key names a secret. Audit rows key changed fields by path (`config.token`),
 * so the last segment of a dotted key is checked too, as the SQL does.
 */
export function isSecretKey(key: string): boolean {
  return SECRET_KEY.test(key) || SECRET_KEY.test(key.slice(key.lastIndexOf('.') + 1));
}

/** A copy of `value` with every secret-looking key's value replaced by `[redacted]`. */
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, isSecretKey(k) ? REDACTED : redactSecrets(v)]),
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
 * and publishes are audited by triggers (0015) and need no call.
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
  auth_sessions: Record<string, unknown>[];
}

/**
 * Columns a student record leaves out, per section: the organization (stated once at
 * the top) and the student's own id (the record is about them). A session's
 * `token_hash` is left out too: it is a credential (the hash of the sign-in cookie),
 * not information about the student. Everything else stored about the student is
 * exported; `privacy.test.ts` checks this list.
 */
export const RECORD_OMITS = {
  student: ['org_id'],
  enrollments: ['org_id', 'student_id'],
  interaction_events: ['org_id', 'student_id'],
  interaction_text: ['org_id', 'student_id'],
  generated_map_views: ['org_id', 'student_id'],
  ai_outputs: ['org_id', 'student_id'],
  ai_interactions: ['org_id', 'user_id'],
  progress_snapshots: ['org_id', 'student_id'],
  auth_sessions: ['org_id', 'user_id', 'token_hash'],
} as const;

function omit<T extends object>(row: T, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)));
}

function omitAll<T extends object>(rows: T[], keys: readonly string[]) {
  return rows.map((r) => omit(r, keys));
}

/** Collect a student's record. Runs inside `withOrg` for the student's organization. */
export async function collectStudentRecord(
  trx: Trx,
  orgId: string,
  studentId: string,
): Promise<StudentRecord> {
  const student = await trx
    .selectFrom('app_user')
    .selectAll()
    .where('id', '=', studentId)
    .executeTakeFirstOrThrow();
  const enrollments = await trx
    .selectFrom('enrollment as e')
    .innerJoin('class as c', 'c.id', 'e.class_id')
    .selectAll('e')
    .select('c.name as class_name')
    .where('e.student_id', '=', studentId)
    .orderBy('e.created_at')
    .execute();
  const interaction_events = await trx
    .selectFrom('interaction_event')
    .selectAll()
    .where('student_id', '=', studentId)
    .orderBy('seq')
    .execute();
  const interaction_text = await trx
    .selectFrom('interaction_text')
    .selectAll()
    .where('student_id', '=', studentId)
    .orderBy('created_at')
    .execute();
  const generated_map_views = await trx
    .selectFrom('generated_map_view')
    .selectAll()
    .where('student_id', '=', studentId)
    .orderBy('created_at')
    .execute();
  const ai_outputs = await trx
    .selectFrom('ai_output')
    .selectAll()
    .where('student_id', '=', studentId)
    .orderBy('created_at')
    .execute();
  const ai_interactions = await trx
    .selectFrom('ai_interaction')
    .selectAll()
    .where('user_id', '=', studentId)
    .orderBy('created_at')
    .execute();
  const progress_snapshots = await trx
    .selectFrom('progress_snapshot')
    .selectAll()
    .where('student_id', '=', studentId)
    .execute();
  const auth_sessions = await trx
    .selectFrom('auth_session')
    .selectAll()
    .where('user_id', '=', studentId)
    .orderBy('created_at')
    .execute();
  return {
    format: 'ideamap.student-record',
    version: 1,
    exported_at: new Date().toISOString(),
    org_id: orgId,
    student: omit(student, RECORD_OMITS.student),
    enrollments: omitAll(enrollments, RECORD_OMITS.enrollments),
    interaction_events: omitAll(interaction_events, RECORD_OMITS.interaction_events),
    interaction_text: omitAll(interaction_text, RECORD_OMITS.interaction_text),
    generated_map_views: omitAll(generated_map_views, RECORD_OMITS.generated_map_views),
    ai_outputs: omitAll(ai_outputs, RECORD_OMITS.ai_outputs),
    ai_interactions: omitAll(ai_interactions, RECORD_OMITS.ai_interactions),
    progress_snapshots: omitAll(progress_snapshots, RECORD_OMITS.progress_snapshots),
    auth_sessions: omitAll(auth_sessions, RECORD_OMITS.auth_sessions),
  };
}

/** Export kinds whose files can name students. */
export const STUDENT_EXPORT_KINDS = ['student_record', 'class_progress'] as const;

/**
 * Hold each student's privacy lock until the transaction ends. Exporting and deleting
 * a student take it, so a delete never misses an export still being written: it
 * waits for the export to commit, then removes its file.
 */
export async function lockStudents(trx: Trx, studentIds: readonly string[]): Promise<void> {
  for (const id of [...new Set(studentIds)].sort()) {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`student:${id}`}, 0))`.execute(trx);
  }
}

/**
 * Record which students an export file holds. Every export of a kind in
 * `STUDENT_EXPORT_KINDS` must call this, in the transaction that creates the job and
 * before writing the file: deleting a student removes every file listed for them.
 * (A file of those kinds with no subjects recorded is removed by any student's
 * deletion in its organization, since nothing proves the student isn't in it.)
 */
export async function recordExportSubjects(
  trx: Trx,
  orgId: string,
  exportJobId: string,
  studentIds: readonly string[],
): Promise<void> {
  await lockStudents(trx, studentIds);
  if (studentIds.length === 0) return;
  await trx
    .insertInto('export_subject')
    .values(
      [...new Set(studentIds)].map((id) => ({
        org_id: orgId,
        export_job_id: exportJobId,
        student_id: id,
      })),
    )
    .execute();
}

/** Runs `fn` in one transaction acting for the request's organization, as the app role. */
export type OrgRun = <T>(fn: (trx: Trx) => Promise<T>) => Promise<T>;

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
export function exportStudent(
  db: Db,
  request: StudentRequest,
  store: ExportStore,
): Promise<StudentExport> {
  return exportStudentIn((fn) => withOrg(db, request.orgId, fn), request, store);
}

/** As `exportStudent`, in a transaction the caller provides (the API's `req.withOrg`). */
export async function exportStudentIn(
  run: OrgRun,
  request: StudentRequest,
  store: ExportStore,
): Promise<StudentExport> {
  let written: string | null = null;
  try {
    return await run(async (trx) => {
      await authorize(trx, request);
      await actAs(trx, request.actorId);
      await lockStudents(trx, [request.studentId]);
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
      await recordExportSubjects(trx, request.orgId, job.id, [request.studentId]);
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
  authSessions: number;
  exportFiles: number;
}

/**
 * FERPA delete. Removes the student's personal data and everything they typed, and
 * leaves their tracker events in place under their pseudonymous id (§8.2, §10):
 * the account keeps only its random id, role and organization, so nothing left
 * identifies them. Removes every export file that holds them (`export_subject`), and
 * any student-naming file whose contents weren't recorded, and signs them out
 * everywhere. Audited with the pseudonymous id only. Safe to repeat.
 */
export function deleteStudent(
  db: Db,
  request: StudentRequest,
  store: ExportStore,
): Promise<StudentDeletion> {
  return deleteStudentIn((fn) => withOrg(db, request.orgId, fn), request, store);
}

/** As `deleteStudent`, in a transaction the caller provides (the API's `req.withOrg`). */
export async function deleteStudentIn(
  run: OrgRun,
  request: StudentRequest,
  store: ExportStore,
): Promise<StudentDeletion> {
  const { orgId, studentId } = request;
  return run(async (trx) => {
    await authorize(trx, request);
    await actAs(trx, request.actorId);

    // Wait for any export of this student still being written, and hold off new ones.
    await lockStudents(trx, [studentId]);

    // Export files first: every file recorded as holding this student, whatever
    // classes they are in now, and any student-naming file whose contents were never
    // recorded. Files are removed before the commit, so a failure leaves at worst a
    // reference to a missing file.
    const exports = await trx
      .selectFrom('export_job as j')
      .select(['j.id', 'j.result_ref'])
      .where('j.result_ref', 'is not', null)
      .where((eb) =>
        eb.or([
          eb.exists(
            eb
              .selectFrom('export_subject as s')
              .select('s.student_id')
              .whereRef('s.export_job_id', '=', 'j.id')
              .where('s.student_id', '=', studentId),
          ),
          eb.and([
            eb('j.kind', 'in', STUDENT_EXPORT_KINDS),
            eb.not(
              eb.exists(
                eb
                  .selectFrom('export_subject as s')
                  .select('s.student_id')
                  .whereRef('s.export_job_id', '=', 'j.id'),
              ),
            ),
          ]),
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
      // Ends every sign-in session at once, and removes when and how they signed in.
      authSessions: count(
        await trx.deleteFrom('auth_session').where('user_id', '=', studentId).executeTakeFirst(),
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
