import { createHash } from 'node:crypto';
import {
  canPublishIssues,
  CurriculumDataResponseSchema,
  groupVersionIssues,
  rowLocator,
  IdempotencyKeySchema,
  ImportJobPayloadSchema,
  ImportJobViewSchema,
  pendingSteps,
  QUEUES,
  TAB_NAMES,
  VersionIssuesSchema,
  VersionSourceSchema,
  type CurriculumDataResponse,
  type ImportFailure,
  type ImportIssue,
  type ImportJobView,
  type ImportStep,
  type ImportStepName,
  type LibraryIndexPayload,
  type Pack,
  type TabName,
  type VersionSource,
  type PracticeSourcePolicy,
} from '@ideamap/contracts';
import {
  DEFAULT_LIMITS,
  formatImportIssue,
  importPack,
  isUploadKeyFor,
  screenUpload,
  uploadKey,
  type ImportLimits,
  type ObjectStore,
} from '@ideamap/connectors';
import { json, type Database, type UserRole } from '@ideamap/db';
import { checkPack, derive, layOut, rankLinks } from '@ideamap/domain';
import { sql, type Selectable, type Transaction } from 'kysely';
import { z } from 'zod';
import { inTransaction, type Sender } from './queue.js';

// Importing a curriculum file (ARCHITECTURE.md §7, task C4). The API screens and
// stores the upload, then queues an ImportJob; a worker parses it (C1), checks it
// (C2), derives the map (C3) and stores a draft CurriculumVersion. Publishing is a
// separate step (D2), so a draft is stored even when its data checks find errors.
//
// Every database call acts for one organization through `scope` (F4 row-level
// security), so a bug can't read or write another organization's rows.

type Trx = Transaction<Database>;

/** Runs `fn` in a transaction acting for one organization (`withOrg` in production). */
export type OrgScope = <T>(orgId: string, fn: (trx: Trx) => Promise<T>) => Promise<T>;

/** Who is asking. Until F5's sign-in lands, the API's `authenticate` supplies this. */
export interface Caller {
  orgId: string;
  userId: string;
  role: UserRole;
}

export interface ImportDeps {
  scope: OrgScope;
  boss: Sender;
  store: ObjectStore;
  limits?: Partial<ImportLimits>;
  /** The banks and licences Practice rows may name; production's allow-list when omitted. */
  practiceSources?: PracticeSourcePolicy;
}

/** A request the API refuses, with the HTTP status and a message for the teacher. */
export class ImportRequestError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 413 | 422,
    message: string,
  ) {
    super(message);
    this.name = 'ImportRequestError';
  }
}

const IMPORT_ROLES: readonly UserRole[] = ['admin', 'author', 'teacher'];
const Uuid = z.uuid();

function mayImport(caller: Caller): void {
  if (!IMPORT_ROLES.includes(caller.role)) {
    throw new ImportRequestError(403, 'Only teachers, authors and admins can import a curriculum.');
  }
}

type JobRow = Selectable<Database['import_job']>;
type VersionRow = Pick<
  Selectable<Database['curriculum_version']>,
  'id' | 'number' | 'status' | 'issues'
>;

const iso = (date: Date | null) => (date === null ? null : date.toISOString());

function view(job: JobRow, version: VersionRow | null): ImportJobView {
  return ImportJobViewSchema.parse({
    id: job.id,
    curriculum_id: job.curriculum_id,
    status: job.status,
    steps: job.steps,
    source: {
      kind: job.source.kind,
      file_name: job.source.file_name,
      checksum: job.source.checksum,
    },
    error: job.error ?? null,
    version: version && {
      id: version.id,
      number: version.number,
      status: version.status,
      can_publish: canPublishIssues(version.issues),
    },
    created_at: job.created_at.toISOString(),
    started_at: iso(job.started_at),
    finished_at: iso(job.finished_at),
  });
}

async function loadView(trx: Trx, jobId: string): Promise<ImportJobView | null> {
  const job = await trx
    .selectFrom('import_job')
    .selectAll()
    .where('id', '=', jobId)
    .executeTakeFirst();
  if (!job) return null;
  const version = job.version_id
    ? await trx
        .selectFrom('curriculum_version')
        .select(['id', 'number', 'status', 'issues'])
        .where('id', '=', job.version_id)
        .executeTakeFirstOrThrow()
    : null;
  return view(job, version);
}

export interface UploadRequest {
  curriculumId: string;
  /** The uploaded file; a File's name is kept as data, never used as a storage key. */
  file: Blob;
  idempotencyKey?: string | null;
}

/**
 * Screens, stores and queues an upload (C4-S1, S2, S3). Returns the job, and whether
 * this call made it: the same Idempotency-Key returns the first job instead.
 */
export async function startImport(
  deps: ImportDeps,
  caller: Caller,
  request: UploadRequest,
): Promise<{ job: ImportJobView; created: boolean }> {
  mayImport(caller);
  const { curriculumId } = request;
  if (!Uuid.safeParse(curriculumId).success) {
    throw new ImportRequestError(404, 'There is no such curriculum.');
  }
  let key: string | null = null;
  if (request.idempotencyKey !== undefined && request.idempotencyKey !== null) {
    const parsed = IdempotencyKeySchema.safeParse(request.idempotencyKey);
    if (!parsed.success) {
      throw new ImportRequestError(
        400,
        'The Idempotency-Key must be 1 to 200 printable characters.',
      );
    }
    key = parsed.data;
  }

  // Row-level security hides other organizations' curricula, so one that can't be
  // seen is refused the same way whether or not it exists.
  const found = await deps.scope(caller.orgId, async (trx) => {
    const curriculum = await trx
      .selectFrom('curriculum')
      .select('id')
      .where('id', '=', curriculumId)
      .executeTakeFirst();
    if (!curriculum) return null;
    const mapping = await trx
      .selectFrom('curriculum_defaults')
      .select('column_mapping')
      .where('curriculum_id', '=', curriculumId)
      .executeTakeFirst();
    const earlier = key ? await existingJob(trx, curriculumId, key) : null;
    return { mapping: mapping?.column_mapping ?? [], earlier };
  });
  if (!found) throw new ImportRequestError(403, "You can't import into this curriculum.");
  if (found.earlier) return { job: found.earlier, created: false };

  const limits: ImportLimits = { ...DEFAULT_LIMITS, ...deps.limits };
  const screened = await screenUpload(request.file, limits);
  if (!screened.ok) {
    throw new ImportRequestError(
      request.file.size > limits.maxFileBytes ? 413 : 422,
      `${screened.message} Nothing was imported.`,
    );
  }

  const fileRef = uploadKey(caller.orgId);
  const parsed = VersionSourceSchema.safeParse({
    kind: screened.kind,
    file_ref: fileRef,
    file_name: screened.name,
    checksum: screened.checksum,
    column_mapping: found.mapping,
  });
  if (!parsed.success) {
    throw new ImportRequestError(
      422,
      "The saved column mapping can't be read, so nothing was imported. Check Column mapping in Teacher Settings.",
    );
  }
  const source: VersionSource = parsed.data;
  await deps.store.put(fileRef, screened.bytes);
  try {
    const result = await deps.scope(caller.orgId, async (trx) => {
      const inserted = await trx
        .insertInto('import_job')
        .values({
          org_id: caller.orgId,
          curriculum_id: curriculumId,
          source: json(source),
          steps: json(pendingSteps()),
          idempotency_key: key,
          created_by: caller.userId,
        })
        .onConflict((oc) =>
          oc
            .columns(['org_id', 'curriculum_id', 'idempotency_key'])
            .where('idempotency_key', 'is not', null)
            .doNothing(),
        )
        .returning('id')
        .executeTakeFirst();
      if (!inserted) return { job: await existingJob(trx, curriculumId, key!), created: false };
      await deps.boss.send(
        QUEUES.import,
        { org_id: caller.orgId, import_job_id: inserted.id },
        { singletonKey: inserted.id, db: inTransaction(trx) },
      );
      return { job: (await loadView(trx, inserted.id))!, created: true };
    });
    if (!result.created) await deps.store.delete(fileRef);
    return { job: result.job!, created: result.created };
  } catch (cause) {
    await deps.store.delete(fileRef);
    throw cause;
  }
}

async function existingJob(trx: Trx, curriculumId: string, key: string) {
  const row = await trx
    .selectFrom('import_job')
    .select('id')
    .where('curriculum_id', '=', curriculumId)
    .where('idempotency_key', '=', key)
    .executeTakeFirst();
  return row ? loadView(trx, row.id) : null;
}

/** An import job as Teacher Settings shows it (C4-F3, U1). */
export async function getImportJob(
  deps: Pick<ImportDeps, 'scope'>,
  caller: Caller,
  jobId: string,
): Promise<ImportJobView> {
  mayImport(caller);
  const job = Uuid.safeParse(jobId).success
    ? await deps.scope(caller.orgId, (trx) => loadView(trx, jobId))
    : null;
  if (!job) throw new ImportRequestError(404, 'There is no such import.');
  return job;
}

/**
 * Teacher Settings → Curriculum data (T2): the newest import job and the newest
 * version, with its issues grouped by cause. A curriculum the caller's org can't see
 * is refused like one that doesn't exist.
 */
export async function getCurriculumData(
  deps: Pick<ImportDeps, 'scope'>,
  caller: Caller,
  curriculumId: string,
): Promise<CurriculumDataResponse> {
  mayImport(caller);
  const data = Uuid.safeParse(curriculumId).success
    ? await deps.scope(caller.orgId, async (trx) => {
        const curriculum = await trx
          .selectFrom('curriculum')
          .select('id')
          .where('id', '=', curriculumId)
          .executeTakeFirst();
        if (!curriculum) return null;
        const latest = await trx
          .selectFrom('import_job')
          .select(['id', 'source', 'version_id', 'created_at'])
          .where('curriculum_id', '=', curriculumId)
          .orderBy('created_at', 'desc')
          .orderBy('id', 'desc')
          .limit(1)
          .executeTakeFirst();
        const version = await trx
          .selectFrom('curriculum_version')
          .select(['id', 'number', 'status', 'issues', 'pack', 'source', 'created_at'])
          .where('curriculum_id', '=', curriculumId)
          .orderBy('number', 'desc')
          .limit(1)
          .executeTakeFirst();
        // "Unchanged since last import": the same bytes as the version before this job.
        let unchanged = false;
        if (latest) {
          let before = trx
            .selectFrom('curriculum_version')
            .select(sql<string>`source->>'checksum'`.as('checksum'))
            .where('curriculum_id', '=', curriculumId)
            .where('created_at', '<', latest.created_at);
          if (latest.version_id) before = before.where('id', '!=', latest.version_id);
          const previous = await before.orderBy('number', 'desc').limit(1).executeTakeFirst();
          unchanged = previous?.checksum === latest.source.checksum;
        }
        return {
          job: latest ? await loadView(trx, latest.id) : null,
          unchanged,
          version,
        };
      })
    : null;
  if (!data) throw new ImportRequestError(404, 'There is no such curriculum.');
  const { version } = data;
  return CurriculumDataResponseSchema.parse({
    job: data.job,
    unchanged: data.unchanged,
    version: version
      ? {
          id: version.id,
          number: version.number,
          status: version.status,
          can_publish: canPublishIssues(version.issues),
          created_at: version.created_at.toISOString(),
          source: {
            kind: version.source.kind,
            file_name: version.source.file_name,
            checksum: version.source.checksum,
          },
          tabs: TAB_NAMES.map((tab) => ({ tab, rows: tabRows(version.pack, tab) })),
          groups: groupVersionIssues(version.issues, rowLocator(version.pack, version.source.rows)),
        }
      : null,
  });
}

/** Rows in one tab of a pack, as the sheet has them (Course is key/value rows). */
function tabRows(pack: Pack, tab: TabName): number {
  switch (tab) {
    case 'Course':
      return Object.values(pack.course).filter((v) => v !== null && v !== undefined).length;
    case 'Units':
      return pack.units.length;
    case 'Ideas':
      return pack.ideas.length;
    case 'Links':
      return pack.links.length;
    case 'Categories':
      return pack.categories.length;
    case 'Assessment':
      return pack.assessment.length;
    case 'Personas':
      return pack.personas.length;
    case 'Library':
      return pack.library.length;
    case 'Practice':
      return pack.practice.length;
  }
}

// ---------------------------------------------------------------------------
// The job

export interface RunDeps extends ImportDeps {
  /** Called after each step finishes; tests use it to stop a job part-way. */
  afterStep?: (step: ImportStepName) => void | Promise<void>;
}

export type RunOutcome = 'succeeded' | 'failed' | 'skipped';

const NEXT_ACTION = 'Fix the sheet and upload again.';
const now = () => new Date().toISOString();
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en')} ${n === 1 ? one : many}`;

/** JSON with object keys sorted, so equal packs give equal text whatever their source. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * The quiz seed (D6): from the pack's content, so the same curriculum gives the same
 * quizzes whether it came as XLSX, CSV or JSON, and re-importing it changes nothing.
 */
export function packSeed(pack: Pack): number {
  return createHash('sha256').update(canonical(pack)).digest().readInt32BE(0);
}

/** The teacher's summary of why an import stopped (C4-U2). */
export function importFailure(issues: readonly ImportIssue[]): ImportFailure {
  const blocking = issues.filter((i) => i.severity === 'error');
  const shown = blocking.slice(0, 3).map(formatImportIssue);
  const more = blocking.length - shown.length;
  const message = [
    `The file couldn't be imported: ${plural(blocking.length, 'problem')} must be fixed first.`,
    ...shown,
    ...(more > 0 ? [`…and ${plural(more, 'more problem')}.`] : []),
  ].join(' ');
  return {
    message: message.length > 2000 ? `${message.slice(0, 1999)}…` : message,
    next_action: NEXT_ACTION,
    problems: issues.slice(0, 1000),
  };
}

/**
 * Runs one queued import (C4-F1–F8). Safe to run again for the same job: a job that
 * has finished is skipped, and the draft and the job's success commit together, so
 * a retry after a crash can't make a second version.
 */
export async function runImport(deps: RunDeps, data: unknown): Promise<RunOutcome> {
  const { org_id: orgId, import_job_id: jobId } = ImportJobPayloadSchema.parse(data);
  const steps = pendingSteps();
  const job = await deps.scope(orgId, (trx) =>
    trx
      .updateTable('import_job')
      .set({
        status: 'running',
        started_at: sql<Date>`coalesce(started_at, now())`,
        finished_at: null,
        steps: json(steps),
      })
      .where('id', '=', jobId)
      .where('status', 'in', ['queued', 'running'])
      .returningAll()
      .executeTakeFirst(),
  );
  if (!job) return 'skipped';

  const save = () =>
    deps.scope(orgId, (trx) =>
      trx
        .updateTable('import_job')
        .set({ steps: json(steps) })
        .where('id', '=', jobId)
        .where('status', '=', 'running')
        .execute(),
    );
  const step = async <T>(
    name: ImportStepName,
    work: () => T | Promise<T>,
    result: (value: T) => string,
  ): Promise<T> => {
    const entry = steps.find((s) => s.name === name)!;
    entry.status = 'running';
    entry.started_at = now();
    await save();
    const value = await work();
    entry.status = 'done';
    entry.result = result(value);
    entry.finished_at = now();
    await deps.afterStep?.(name);
    return value;
  };

  const source = job.source;
  const imported = await step(
    'Read sheet',
    async () => {
      const bytes =
        source.file_ref && isUploadKeyFor(orgId, source.file_ref)
          ? await deps.store.get(source.file_ref)
          : null;
      if (!bytes) return null;
      const file = new File([bytes], source.file_name ?? 'upload');
      return importPack(file, { mapping: source.column_mapping, limits: deps.limits });
    },
    (r) =>
      r?.pack
        ? `${plural(r.pack.ideas.length, 'idea')}, ${plural(r.pack.links.length, 'link')}`
        : 'Stopped',
  );
  if (!imported || !imported.ok || !imported.pack) {
    const failure: ImportFailure = imported
      ? importFailure(imported.issues)
      : {
          message: "The uploaded file couldn't be found, so nothing was imported.",
          next_action: 'Upload the file again.',
          problems: [],
        };
    const read = steps[0]!;
    read.status = 'failed';
    read.result = imported
      ? plural(failure.problems.filter((p) => p.severity === 'error').length, 'problem')
      : 'File missing';
    return finish(deps, orgId, jobId, steps, { failure });
  }
  const pack = imported.pack;

  const checks = await step(
    'Check data',
    () => checkPack(pack, { practiceSources: deps.practiceSources }),
    (c) => plural(c.length, 'note'),
  );
  const ranked = await step(
    'Rank links',
    () => rankLinks(pack, 3),
    () => 'Top 3 in and out per idea',
  );
  await step(
    'Lay out map',
    () => layOut(pack, ranked.kept),
    () => 'Most connected in the centre',
  );
  const derived = await step(
    'Make quizzes',
    () => derive(pack, { seed: packSeed(pack) }),
    (d) => `${d.quizzes.quiz_length} per idea from links`,
  );
  await step(
    'Index library',
    () => pack.library.length,
    (n) => `${plural(n, 'document')} for RAG`,
  );

  const versionSource = VersionSourceSchema.parse({
    ...source,
    kind: imported.kind ?? source.kind,
    column_mapping: imported.mapping,
    rows: imported.rows,
  });
  const issues = VersionIssuesSchema.parse([...imported.issues, ...checks]);
  return finish(deps, orgId, jobId, steps, {
    version: { pack, derived, issues, source: versionSource, curriculumId: job.curriculum_id },
    createdBy: job.created_by,
  });
}

interface Draft {
  pack: Pack;
  derived: ReturnType<typeof derive>;
  issues: z.output<typeof VersionIssuesSchema>;
  source: VersionSource;
  curriculumId: string;
}

/**
 * Ends a running job in one transaction: on success the draft version, the job's
 * success and the library indexing job commit together (C4-F7, F8).
 */
async function finish(
  deps: ImportDeps,
  orgId: string,
  jobId: string,
  steps: ImportStep[],
  end: { failure: ImportFailure } | { version: Draft; createdBy: string | null },
): Promise<RunOutcome> {
  return deps.scope(orgId, async (trx) => {
    const job = await trx
      .selectFrom('import_job')
      .select('status')
      .where('id', '=', jobId)
      .forUpdate()
      .executeTakeFirst();
    // Another attempt finished it first.
    if (job?.status !== 'running') return 'skipped';

    if ('failure' in end) {
      await trx
        .updateTable('import_job')
        .set({
          status: 'failed',
          error: json(end.failure),
          steps: json(steps),
          finished_at: sql<Date>`now()`,
        })
        .where('id', '=', jobId)
        .execute();
      return 'failed';
    }

    const draft = end.version;
    // Locking the curriculum numbers its versions one at a time.
    await trx
      .selectFrom('curriculum')
      .select('id')
      .where('id', '=', draft.curriculumId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    const last = await trx
      .selectFrom('curriculum_version')
      .select((eb) => eb.fn.max<number>('number').as('number'))
      .where('curriculum_id', '=', draft.curriculumId)
      .executeTakeFirst();
    const version = await trx
      .insertInto('curriculum_version')
      .values({
        org_id: orgId,
        curriculum_id: draft.curriculumId,
        number: (last?.number ?? 0) + 1,
        status: 'draft',
        pack: json(draft.pack),
        derived: json(draft.derived),
        issues: json(draft.issues),
        source: json(draft.source),
        created_by: end.createdBy,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    await trx
      .updateTable('import_job')
      .set({
        status: 'succeeded',
        version_id: version.id,
        error: null,
        steps: json(steps),
        finished_at: sql<Date>`now()`,
      })
      .where('id', '=', jobId)
      .execute();
    const payload: LibraryIndexPayload = {
      org_id: orgId,
      curriculum_id: draft.curriculumId,
      version_id: version.id,
    };
    await deps.boss.send(QUEUES.indexLibrary, payload, {
      singletonKey: version.id,
      db: inTransaction(trx),
    });
    return 'succeeded';
  });
}

/**
 * Marks a job failed after its last retry ran out on an unexpected error, so the
 * teacher isn't left watching a job that will never finish.
 */
export async function abandonImport(deps: Pick<ImportDeps, 'scope'>, data: unknown): Promise<void> {
  const parsed = ImportJobPayloadSchema.safeParse(data);
  if (!parsed.success) return;
  const { org_id: orgId, import_job_id: jobId } = parsed.data;
  const failure: ImportFailure = {
    message: 'The import stopped unexpectedly, so nothing was imported.',
    next_action: 'Upload the file again. If it stops again, contact support.',
    problems: [],
  };
  await deps.scope(orgId, (trx) =>
    trx
      .updateTable('import_job')
      .set({ status: 'failed', error: json(failure), finished_at: sql<Date>`now()` })
      .where('id', '=', jobId)
      .where('status', 'in', ['queued', 'running'])
      .execute(),
  );
}
