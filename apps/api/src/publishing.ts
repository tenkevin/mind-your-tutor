import { createHash } from 'node:crypto';
import {
  BlockingIssueSchema,
  DiffResponseSchema,
  IdempotencyKeySchema,
  PublishPreviewRequestSchema,
  PublishPreviewSchema,
  PublishRequestSchema,
  PublishResultSchema,
  RepinRequestSchema,
  RepinResultSchema,
  STUDENTS_RECEIVING_LABEL,
  canPublishIssues,
  type BlockingIssue,
  type DiffResponse,
  type PinMove,
  type PublishPreview,
  type PublishResult,
  type RepinResult,
  type StudentsReceiving,
  type VersionIssue,
} from '@ideamap/contracts';
import { actAs, json, type Database, type UserRole } from '@ideamap/db';
import { diffPacks } from '@ideamap/domain';
import type { Caller, OrgScope } from '@ideamap/worker';
import type { Selectable, Transaction } from 'kysely';
import { z } from 'zod';

// Reviewing and publishing a draft (ARCHITECTURE.md §7, task C5).
//
// - The diff compares a version with the curriculum's latest published version, or
//   with nothing when none is published yet (first publish).
// - The preview adds whether the version can be published, what blocks it, and
//   "Students receiving this update" for the selected classes (D14).
// - Publishing marks a draft published and moves the selected classes' pinned
//   version to it, all in one transaction, with one audit event (D2, D3). Other
//   classes on the curriculum keep their pin.
// - Rollback is re-pinning a class to an earlier published version.
//
// None of this touches progress or interaction events: migrating progress across
// versions is a tracker rule (C7). Every query acts for the caller's organization
// through `scope` (F4 row-level security), so another organization's rows are never
// visible, and an id from one is refused with 403, as F5's policies refuse it.
//
// Who may do what (the routes' F5 policies check it first, and these checks repeat
// it for each selected class): admins, authors and teachers of the organization may read a diff; only an
// organization admin or the class's own teacher may preview for, publish to or
// re-pin a class.

type Trx = Transaction<Database>;

export interface PublishDeps {
  scope: OrgScope;
}

/** A request the API refuses, with the HTTP status and a message for the teacher. */
export class PublishRequestError extends Error {
  constructor(
    readonly status: 400 | 403 | 409 | 422,
    message: string,
    readonly blocking?: BlockingIssue[],
  ) {
    super(message);
    this.name = 'PublishRequestError';
  }
}

const REVIEW_ROLES: readonly UserRole[] = ['admin', 'author', 'teacher'];
const PUBLISH_ROLES: readonly UserRole[] = ['admin', 'teacher'];
const Uuid = z.uuid();

// Like F5's policies, an id that can't be seen is refused the same way whether it is
// missing, another organization's, or one the caller may not use, so nothing leaks.
const NO_VERSION = 'You can’t use this curriculum version.';
const NO_CLASS = 'You can only change the version of classes you teach.';
const NOT_YOUR_CLASSES = 'You can only publish to classes you teach. Nothing was published.';

function mayReview(caller: Caller): void {
  if (!REVIEW_ROLES.includes(caller.role)) {
    throw new PublishRequestError(
      403,
      'Only teachers, authors and admins can review a curriculum.',
    );
  }
}

function mayPublish(caller: Caller): void {
  if (!PUBLISH_ROLES.includes(caller.role)) {
    throw new PublishRequestError(403, 'Only teachers and admins can publish to a class.');
  }
}

function uuid(id: string, notFound: string): string {
  if (!Uuid.safeParse(id).success) throw new PublishRequestError(403, notFound);
  return id;
}

function body<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const parsed = schema.safeParse(value ?? {});
  if (!parsed.success) {
    throw new PublishRequestError(
      400,
      'Send class_ids as a list of class ids, each once (and version_id to re-pin).',
    );
  }
  return parsed.data;
}

type VersionRow = Pick<
  Selectable<Database['curriculum_version']>,
  'id' | 'curriculum_id' | 'number' | 'status' | 'published_at'
>;
type ClassRow = Pick<
  Selectable<Database['class']>,
  'id' | 'curriculum_id' | 'pinned_version_id' | 'teacher_id'
>;

const versionRef = (v: VersionRow) => ({
  id: v.id,
  number: v.number,
  status: v.status,
  published_at: v.published_at ? v.published_at.toISOString() : null,
});

async function loadVersion(trx: Trx, versionId: string): Promise<VersionRow> {
  const version = await trx
    .selectFrom('curriculum_version')
    .select(['id', 'curriculum_id', 'number', 'status', 'published_at'])
    .where('id', '=', versionId)
    .executeTakeFirst();
  if (!version) throw new PublishRequestError(403, NO_VERSION);
  return version;
}

/** The curriculum's latest published version, or null before its first publish. */
async function latestPublished(trx: Trx, curriculumId: string) {
  return (
    (await trx
      .selectFrom('curriculum_version')
      .select(['id', 'number', 'pack'])
      .where('curriculum_id', '=', curriculumId)
      .where('status', '=', 'published')
      .orderBy('number', 'desc')
      .limit(1)
      .executeTakeFirst()) ?? null
  );
}

async function diffFor(trx: Trx, version: VersionRow, againstId?: string): Promise<DiffResponse> {
  const { pack } = await trx
    .selectFrom('curriculum_version')
    .select('pack')
    .where('id', '=', version.id)
    .executeTakeFirstOrThrow();
  let base: { id: string; number: number; pack: typeof pack } | null;
  if (againstId === undefined) {
    base = await latestPublished(trx, version.curriculum_id);
  } else {
    // Another version of the same curriculum; anything else reads as missing.
    base =
      (await trx
        .selectFrom('curriculum_version')
        .select(['id', 'number', 'pack'])
        .where('id', '=', uuid(againstId, NO_VERSION))
        .where('curriculum_id', '=', version.curriculum_id)
        .executeTakeFirst()) ?? null;
    if (!base) throw new PublishRequestError(403, NO_VERSION);
  }
  return DiffResponseSchema.parse({
    from_version: base && { id: base.id, number: base.number },
    to_version: { id: version.id, number: version.number },
    diff: diffPacks(base?.pack ?? null, pack),
  });
}

/** What blocks publishing, each with where to fix it in the sheet (§7, C2 `fix`). */
export function blockingIssues(issues: readonly VersionIssue[]): BlockingIssue[] {
  if (canPublishIssues(issues)) return [];
  return issues.flatMap((issue): BlockingIssue[] => {
    if (issue.origin === 'import') {
      if (issue.severity !== 'error' || issue.effect !== 'blocks_import') return [];
      return [
        BlockingIssueSchema.parse({
          message: issue.message,
          tab: issue.tab,
          column: issue.column,
          row: issue.row,
          items: [],
        }),
      ];
    }
    if (issue.level !== 'error') return [];
    return [
      BlockingIssueSchema.parse({
        message: issue.message,
        tab: issue.fix.tab,
        column: issue.fix.column,
        row: null,
        items: issue.items,
      }),
    ];
  });
}

/**
 * The selected classes, locked when `lock` is set. Refuses, in one way, ids that
 * can't be seen (another organization's, or missing) and classes the caller doesn't
 * teach unless they are an admin; then classes on another curriculum.
 */
async function loadClasses(
  trx: Trx,
  caller: Caller,
  version: VersionRow,
  classIds: readonly string[],
  lock: boolean,
): Promise<ClassRow[]> {
  if (classIds.length === 0) return [];
  let query = trx
    .selectFrom('class')
    .select(['id', 'curriculum_id', 'pinned_version_id', 'teacher_id'])
    .where('id', 'in', classIds)
    .orderBy('id');
  if (lock) query = query.forUpdate();
  const classes = await query.execute();
  if (classes.length !== classIds.length) {
    throw new PublishRequestError(403, NOT_YOUR_CLASSES);
  }
  if (caller.role !== 'admin' && classes.some((c) => c.teacher_id !== caller.userId)) {
    throw new PublishRequestError(403, NOT_YOUR_CLASSES);
  }
  if (classes.some((c) => c.curriculum_id !== version.curriculum_id)) {
    throw new PublishRequestError(
      422,
      'A selected class uses a different curriculum, so this version can’t be published to it.',
    );
  }
  return classes;
}

/**
 * "Students receiving this update" (D14): unique students enrolled in the selected
 * classes, whether or not their progress changes. One query; row-level security
 * keeps it to the caller's organization.
 */
export async function studentsReceiving(
  trx: Trx,
  classIds: readonly string[],
): Promise<StudentsReceiving> {
  const sorted = [...classIds].sort();
  let count = 0;
  if (sorted.length > 0) {
    const row = await trx
      .selectFrom('enrollment')
      .select((eb) => eb.fn.count<string>('student_id').distinct().as('n'))
      .where('class_id', 'in', sorted)
      .executeTakeFirstOrThrow();
    count = Number(row.n);
  }
  return { label: STUDENTS_RECEIVING_LABEL, count, class_ids: sorted };
}

/** GET /versions/:versionId/diff (C5-F1–F3). */
export async function getDiff(
  deps: PublishDeps,
  caller: Caller,
  versionId: string,
  againstId?: string,
): Promise<DiffResponse> {
  mayReview(caller);
  uuid(versionId, NO_VERSION);
  return deps.scope(caller.orgId, async (trx) =>
    diffFor(trx, await loadVersion(trx, versionId), againstId),
  );
}

/** POST /versions/:versionId/preview: what the teacher reviews before publishing. */
export async function previewPublish(
  deps: PublishDeps,
  caller: Caller,
  versionId: string,
  request: unknown,
): Promise<PublishPreview> {
  mayPublish(caller);
  uuid(versionId, NO_VERSION);
  const { class_ids: classIds } = body(PublishPreviewRequestSchema, request);
  return deps.scope(caller.orgId, async (trx) => {
    const version = await loadVersion(trx, versionId);
    await loadClasses(trx, caller, version, classIds, false);
    const { issues } = await trx
      .selectFrom('curriculum_version')
      .select('issues')
      .where('id', '=', version.id)
      .executeTakeFirstOrThrow();
    const blocking = version.status === 'draft' ? blockingIssues(issues) : [];
    const { from_version, diff } = await diffFor(trx, version);
    return PublishPreviewSchema.parse({
      version: versionRef(version),
      from_version,
      diff,
      can_publish: version.status !== 'archived' && blocking.length === 0,
      blocking,
      students_receiving_this_update: await studentsReceiving(trx, classIds),
    });
  });
}

const PUBLISH_ACTION = 'curriculum_version.publish';
const REPIN_ACTION = 'class.repin';

/** Idempotency keys are kept as a hash, so the audit log holds no client tokens. */
const keyHash = (key: string) => createHash('sha256').update(key).digest('hex');

/**
 * POST /versions/:versionId/publish (C5-F4–F9). All or nothing: on any refusal or
 * failure no pin moves and the version stays as it was. With an Idempotency-Key, a
 * repeat of a publish that succeeded returns its result again and changes nothing.
 */
export async function publish(
  deps: PublishDeps,
  caller: Caller,
  versionId: string,
  request: unknown,
  idempotencyKey?: string | null,
): Promise<{ result: PublishResult; repeated: boolean }> {
  mayPublish(caller);
  uuid(versionId, NO_VERSION);
  const { class_ids: classIds } = body(PublishRequestSchema, request);
  let key: string | null = null;
  if (idempotencyKey !== undefined && idempotencyKey !== null) {
    const parsed = IdempotencyKeySchema.safeParse(idempotencyKey);
    if (!parsed.success) {
      throw new PublishRequestError(
        400,
        'The Idempotency-Key must be 1 to 200 printable characters.',
      );
    }
    key = keyHash(parsed.data);
  }
  const sortedIds = [...classIds].sort();

  return deps.scope(caller.orgId, async (trx) => {
    // F6's audit triggers record the caller as the actor of the pin and status changes.
    await actAs(trx, caller.userId);
    const version = await loadVersion(trx, versionId);
    // One publish at a time per curriculum: locking it orders concurrent publishes
    // and makes the idempotency check below race-free.
    await trx
      .selectFrom('curriculum')
      .select('id')
      .where('id', '=', version.curriculum_id)
      .forUpdate()
      .executeTakeFirstOrThrow();
    // Checked before a repeat is answered, so a key never stands in for permission.
    const classes = await loadClasses(trx, caller, version, sortedIds, true);

    if (key) {
      const earlier = await trx
        .selectFrom('audit_event')
        .select('detail')
        .where('target_type', '=', 'curriculum_version')
        .where('target_id', '=', version.id)
        .where('action', '=', PUBLISH_ACTION)
        .where((eb) => eb(eb.ref('detail', '->>').key('idempotency_key_sha256'), '=', key))
        .executeTakeFirst();
      if (earlier) {
        const result = PublishResultSchema.parse(earlier.detail.result);
        const same = result.classes.map((c) => c.class_id).join() === sortedIds.join();
        if (!same) {
          throw new PublishRequestError(
            409,
            'This Idempotency-Key was already used to publish to other classes. Use a new key.',
          );
        }
        return { result, repeated: true };
      }
    }

    if (version.status === 'archived') {
      throw new PublishRequestError(
        422,
        `Version ${version.number} is archived, so it can’t be published. Nothing was published.`,
      );
    }
    let published = version;
    if (version.status === 'draft') {
      const { issues } = await trx
        .selectFrom('curriculum_version')
        .select('issues')
        .where('id', '=', version.id)
        .executeTakeFirstOrThrow();
      const blocking = blockingIssues(issues);
      if (blocking.length > 0) {
        const first = blocking[0]!;
        const where = [first.tab, first.column].filter(Boolean).join(' → ');
        throw new PublishRequestError(
          422,
          `Version ${version.number} can’t be published until ${blocking.length === 1 ? 'this error is' : `these ${blocking.length} errors are`} fixed in the sheet${where ? `, starting with ${where}` : ''}. Fix the sheet, import it again, then publish. Nothing was published.`,
          blocking,
        );
      }
      published = await trx
        .updateTable('curriculum_version')
        .set({ status: 'published', published_at: new Date() })
        .where('id', '=', version.id)
        .where('status', '=', 'draft')
        .returning(['id', 'curriculum_id', 'number', 'status', 'published_at'])
        .executeTakeFirstOrThrow();
    }

    await trx
      .updateTable('class')
      .set({ pinned_version_id: version.id })
      .where('id', 'in', sortedIds)
      .execute();

    const moves: PinMove[] = classes.map((c) => ({
      class_id: c.id,
      from_version_id: c.pinned_version_id,
      to_version_id: version.id,
    }));
    const result = PublishResultSchema.parse({
      version: versionRef(published),
      classes: moves,
      students_receiving_this_update: await studentsReceiving(trx, sortedIds),
    });
    await trx
      .insertInto('audit_event')
      .values({
        org_id: caller.orgId,
        actor_id: caller.userId,
        action: PUBLISH_ACTION,
        target_type: 'curriculum_version',
        target_id: version.id,
        curriculum_id: version.curriculum_id,
        detail: json({
          curriculum_id: version.curriculum_id,
          version_number: version.number,
          first_time: version.status === 'draft',
          idempotency_key_sha256: key,
          result,
        }),
      })
      .execute();
    return { result, repeated: false };
  });
}

/**
 * POST /classes/:classId/pin (C5-F7): rollback, by re-pinning an earlier published
 * version of the class's curriculum. Drafts and archived versions are refused.
 */
export async function repin(
  deps: PublishDeps,
  caller: Caller,
  classId: string,
  request: unknown,
): Promise<RepinResult> {
  mayPublish(caller);
  uuid(classId, NO_CLASS);
  const { version_id: versionId } = body(RepinRequestSchema, request);
  return deps.scope(caller.orgId, async (trx) => {
    await actAs(trx, caller.userId);
    const cls = await trx
      .selectFrom('class')
      .select(['id', 'curriculum_id', 'pinned_version_id', 'teacher_id'])
      .where('id', '=', classId)
      .forUpdate()
      .executeTakeFirst();
    if (!cls) throw new PublishRequestError(403, NO_CLASS);
    if (caller.role !== 'admin' && cls.teacher_id !== caller.userId) {
      throw new PublishRequestError(403, NO_CLASS);
    }
    const version = await loadVersion(trx, versionId);
    if (version.curriculum_id !== cls.curriculum_id) {
      throw new PublishRequestError(422, 'That version belongs to a different curriculum.');
    }
    if (version.status !== 'published') {
      throw new PublishRequestError(
        422,
        `Version ${version.number} is ${version.status === 'draft' ? 'a draft' : 'archived'}; a class can only go back to a published version.`,
      );
    }
    const move: PinMove = {
      class_id: cls.id,
      from_version_id: cls.pinned_version_id,
      to_version_id: version.id,
    };
    if (cls.pinned_version_id !== version.id) {
      await trx
        .updateTable('class')
        .set({ pinned_version_id: version.id })
        .where('id', '=', cls.id)
        .execute();
      await trx
        .insertInto('audit_event')
        .values({
          org_id: caller.orgId,
          actor_id: caller.userId,
          action: REPIN_ACTION,
          target_type: 'class',
          target_id: cls.id,
          class_id: cls.id,
          curriculum_id: cls.curriculum_id,
          detail: json({ curriculum_id: cls.curriculum_id, classes: [move] }),
        })
        .execute();
    }
    return RepinResultSchema.parse({ version: versionRef(version), class: move });
  });
}
